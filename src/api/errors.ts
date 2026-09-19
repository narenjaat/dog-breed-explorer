/**
 * Typed API errors.
 *
 * The distinction that matters to the rest of the app is `retryable`: sync
 * retries transient failures with backoff, but fails fast on a 404 or a
 * malformed payload, which no amount of retrying will fix.
 */

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
