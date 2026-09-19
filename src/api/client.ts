/**
 * HTTP client: timeout, typed errors, and retry with exponential backoff.
 *
 * Returns `unknown` on purpose — narrowing is the parsers' job, so no caller
 * can accidentally trust an unvalidated payload.
 */

import { API_CONFIG } from '@/api/config';
import { ApiError, toApiError } from '@/api/errors';

export interface RequestOptions {
  /** Query parameters; undefined values are omitted. */
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  /** Caller-owned cancellation (screen unmount, superseded sync). */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /** Overrides the backoff base delay. Used by tests to avoid real waiting. */
  readonly retryBaseDelayMs?: number;
}

/** Sleep that rejects immediately if the caller aborts mid-backoff. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new ApiError('aborted', 'Request was cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ApiError('aborted', 'Request was cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Full jitter backoff: random in [0, base * 2^attempt], capped.
 *
 * Jitter matters here because sync fires up to 6 page requests together; a
 * fixed schedule would retry them in lockstep and re-create the burst that
 * likely caused the failure.
 */
export function backoffDelayMs(
  attempt: number,
  baseMs: number = API_CONFIG.retryBaseDelayMs,
  maxMs: number = API_CONFIG.retryMaxDelayMs,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(random() * exponential);
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const base = `${API_CONFIG.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (query === undefined) return base;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `${base}?${parts.join('&')}` : base;
}

/** One attempt: no retries, but with its own timeout and error typing. */
async function requestOnce(url: string, options: RequestOptions): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? API_CONFIG.timeoutMs;
  const controller = new AbortController();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = (): void => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError('http', `Request failed with status ${String(response.status)}`, {
        status: response.status,
        url,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch (cause) {
      throw new ApiError('parse', 'Response body was not valid JSON', { url, cause });
    }
  } catch (error) {
    // Our own deadline fired: report as a timeout, which IS retryable,
    // rather than as a caller cancellation, which is not.
    if (timedOut) {
      throw new ApiError('timeout', `Request timed out after ${String(timeoutMs)}ms`, { url });
    }
    if (options.signal?.aborted === true) {
      throw new ApiError('aborted', 'Request was cancelled', { url });
    }
    throw toApiError(error, url);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * GETs `path`, retrying retryable failures with exponential backoff.
 * Throws the final `ApiError` once attempts are exhausted.
 */
export async function requestJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  const url = buildUrl(path, options.query);
  const maxRetries = options.maxRetries ?? API_CONFIG.maxRetries;

  let lastError: ApiError = new ApiError('network', 'Request was never attempted', { url });

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await requestOnce(url, options);
    } catch (error) {
      const apiError = toApiError(error, url);
      lastError = apiError;

      if (!apiError.retryable || attempt === maxRetries) break;

      await delay(backoffDelayMs(attempt, options.retryBaseDelayMs), options.signal);
    }
  }

  throw lastError;
}
