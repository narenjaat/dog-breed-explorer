/**
 * API configuration.
 *
 * Values come from EXPO_PUBLIC_* env vars when present, with working defaults
 * so the app runs with no .env at all (the Dog API needs no key). Env values
 * are validated, not trusted: a malformed number falls back to the default
 * rather than producing NaN timeouts.
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
  baseUrl: readUrl(process.env['EXPO_PUBLIC_DOG_API_BASE_URL'], 'https://dogapi.dog/api/v2'),
  timeoutMs: readPositiveInt(process.env['EXPO_PUBLIC_API_TIMEOUT_MS'], 15_000),
  maxRetries: readNonNegativeInt(process.env['EXPO_PUBLIC_API_MAX_RETRIES'], 3),
  /**
   * The API defaults to 30 records/page (10 pages). Requesting 48 yields the
   * 6 pages the brief describes, and fewer round trips for the same 283 rows.
   */
  pageSize: readPositiveInt(process.env['EXPO_PUBLIC_API_PAGE_SIZE'], 48),
  /** Base delay for exponential backoff: 400ms, 800ms, 1600ms (+ jitter). */
  retryBaseDelayMs: 400,
  retryMaxDelayMs: 8_000,
  /** Hard ceiling on pagination, guarding against a runaway `next` cursor. */
  maxPages: 50,
} as const;
