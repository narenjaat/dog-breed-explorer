/**
 * HTTP client: config, typed errors, timeout, and retry with backoff.
 *
 * Returns `unknown` on purpose; narrowing is the parsers' job, so no caller
 * can accidentally trust an unvalidated payload.
 */

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function readUrl(raw: string | undefined, fallback: string): string {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim().replace(/\/+$/u, '');
  return trimmed.length > 0 ? trimmed : fallback;
}

export const API_CONFIG = {
  baseUrl: readUrl(process.env['DOG_API_BASE_URL'], 'https://dogapi.dog/api/v2'),
  timeoutMs: readPositiveInt(process.env['DOG_API_TIMEOUT_MS'], 15_000),
  maxRetries: readNonNegativeInt(process.env['DOG_API_MAX_RETRIES'], 3),
  /**
   * The API defaults to 30 records/page (10 pages). Requesting 48 yields the
   * 6 pages the brief describes, and fewer round trips for the same 283 rows.
   */
  pageSize: readPositiveInt(process.env['DOG_API_PAGE_SIZE'], 48),
  /** Base delay for exponential backoff: 400ms, 800ms, 1600ms (+ jitter). */
  retryBaseDelayMs: 400,
  retryMaxDelayMs: 8_000,
  /** Hard ceiling on pagination, guarding against a runaway `next` cursor. */
  maxPages: 50,
} as const;

export type ApiErrorKind =
  | 'network' // request never completed (offline, DNS, TLS)
  | 'timeout' // aborted by our own deadline
  | 'http' // completed with a non-2xx status
  | 'parse' // 2xx but the body was not usable JSON / wrong shape
  | 'aborted'; // cancelled by the caller (screen unmounted, sync superseded)

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly url: string | null;
  override readonly cause: unknown;

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
    // Required for `instanceof` to work when targeting ES5-era output.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Whether retrying with backoff could plausibly succeed.
   *
   * 408 (timeout) and 429 (rate limited) are retryable; so is any 5xx.
   * Other 4xx are caller errors and are not.
   */
  get retryable(): boolean {
    switch (this.kind) {
      case 'network':
      case 'timeout':
        return true;
      case 'http': {
        const status = this.status;
        if (status === null) return true;
        if (status === 408 || status === 429) return true;
        return status >= 500 && status < 600;
      }
      case 'parse':
      case 'aborted':
        return false;
      default:
        return false;
    }
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
        : `The Dog API returned HTTP ${String(error.status)}.`;
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
