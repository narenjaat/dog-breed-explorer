/**
 * HTTP client: config, typed errors, timeout, and retry with backoff.
 *
 * Returns `unknown` on purpose; narrowing is the parsers' job, so no caller
 * can accidentally trust an unvalidated payload.
 */

// ---- Config -----------------------------------------------------------------
// Values can be overridden from .env (see babel.config.js). A missing or
// invalid value falls back to the default instead of producing NaN.

function envNumber(raw: string | undefined, fallback: number, min: number): number {
  const parsed = Number(raw);
  return raw !== undefined && Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

export const API_CONFIG = {
  baseUrl: (process.env.DOG_API_BASE_URL ?? 'https://dogapi.dog/api/v2').replace(/\/+$/, ''),
  timeoutMs: envNumber(process.env.DOG_API_TIMEOUT_MS, 15000, 1),
  maxRetries: envNumber(process.env.DOG_API_MAX_RETRIES, 3, 0),
  // The API defaults to 30 per page (10 pages). 48 gives 6 pages for 283 breeds.
  pageSize: envNumber(process.env.DOG_API_PAGE_SIZE, 48, 1),
  // Backoff: up to 400ms, 800ms, 1600ms... (random within that), max 8s.
  retryBaseDelayMs: 400,
  retryMaxDelayMs: 8000,
  // Safety limit so a broken `last` page number cannot start 1000s of requests.
  maxPages: 50,
};

// ---- Errors -----------------------------------------------------------------

export type ApiErrorKind =
  | 'network' // request never completed (offline, DNS, TLS)
  | 'timeout' // aborted by our own deadline
  | 'http' // completed with a non-2xx status
  | 'parse' // 2xx but the body was not usable JSON / wrong shape
  | 'aborted'; // cancelled by the caller (screen unmounted, sync superseded)

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  url: string | null;
  cause: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number | null; url?: string | null; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.url = options.url ?? null;
    this.cause = options.cause;
  }

  /**
   * Can trying again help? Yes for no-connection, timeouts, 5xx, 408 and 429.
   * No for other 4xx, bad JSON, or a cancelled request.
   */
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind !== 'http') return false;
    const status = this.status ?? 500;
    return status === 408 || status === 429 || status >= 500;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Wraps an unknown thrown value into an ApiError for uniform handling. */
export function toApiError(value: unknown, url: string | null): ApiError {
  if (isApiError(value)) return value;
  if (value instanceof Error) {
    if (value.name === 'AbortError') {
      return new ApiError('aborted', 'Request was cancelled', { url, cause: value });
    }
    return new ApiError('network', value.message, { url, cause: value });
  }
  return new ApiError('network', 'Unknown network failure', { url, cause: value });
}

/** A short, user-facing description. Never leaks a stack trace into the UI. */
export function describeApiError(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return 'No connection to the Dog API.';
    case 'timeout':
      return 'The request took too long to respond.';
    case 'http':
      return error.status === null
        ? 'The Dog API returned an error.'
        : `The Dog API returned HTTP ${error.status}.`;
    case 'parse':
      return 'The Dog API returned data in an unexpected format.';
    case 'aborted':
      return 'The request was cancelled.';
    default:
      return 'Something went wrong talking to the Dog API.';
  }
}

export interface RequestOptions {
  /** Query parameters; undefined values are omitted. */
  query?: Record<string, string | number | undefined>;
  /** Caller-owned cancellation (screen unmount, superseded sync). */
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** Overrides the backoff base delay. Used by tests to avoid real waiting. */
  retryBaseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** `/breeds` + `{ 'page[number]': 2 }` -> `https://.../breeds?page%5Bnumber%5D=2` */
function buildUrl(path: string, query: RequestOptions['query'] = {}): string {
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  const url = API_CONFIG.baseUrl + path;
  return params.length > 0 ? `${url}?${params.join('&')}` : url;
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

  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError('http', `Request failed with status ${response.status}`, {
        status: response.status,
        url,
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new ApiError('parse', 'Response body was not valid JSON', { url, cause });
    }
  } catch (error) {
    // Our own deadline fired: report as a timeout, which IS retryable,
    // rather than as a caller cancellation, which is not.
    if (timedOut) {
      throw new ApiError('timeout', `Request timed out after ${timeoutMs}ms`, { url });
    }
    if (options.signal?.aborted) {
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

  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(url, options);
    } catch (error) {
      const apiError = toApiError(error, url);
      const isLastAttempt = attempt >= maxRetries;
      if (!apiError.retryable || isLastAttempt) throw apiError;

      await sleep(backoffDelayMs(attempt, options.retryBaseDelayMs));
      if (options.signal?.aborted) {
        throw new ApiError('aborted', 'Request was cancelled', { url });
      }
    }
  }
}
