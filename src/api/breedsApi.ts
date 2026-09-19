/**
 * Breeds endpoints, including assembly of the paginated collection.
 *
 * The important behaviour lives in `fetchAllBreeds`: it merges every page into
 * one de-duplicated dataset and — critically — returns successfully even when
 * some pages failed, reporting which ones. Losing page 4 should cost the user
 * 48 breeds, not all 283.
 */

import { requestJson } from '@/api/client';
import { API_CONFIG } from '@/api/config';
import { ApiError, toApiError } from '@/api/errors';
import { parseBreed, parseCollection, parsePagination, parseSingle } from '@/api/parsers';
import type { Breed } from '@/types/domain';

export interface BreedPageResult {
  readonly pageNumber: number;
  readonly breeds: readonly Breed[];
  /** Records present in the payload that failed to parse. */
  readonly skipped: number;
  /** Total record count the API reports, when it reports one. */
  readonly totalRecords: number | null;
  /** Last page number the API reports; absent on the final page. */
  readonly lastPage: number | null;
  readonly hasNextPage: boolean;
}

export interface PageFailure {
  readonly pageNumber: number;
  readonly error: ApiError;
}

export interface AllBreedsResult {
  /** De-duplicated breeds from every page that succeeded. */
  readonly breeds: readonly Breed[];
  readonly pagesRequested: number;
  readonly pagesSucceeded: number;
  readonly failures: readonly PageFailure[];
  /** Duplicate ids dropped while merging. */
  readonly duplicatesDropped: number;
  /** Records that failed to parse across all pages. */
  readonly recordsSkipped: number;
  /** `meta.pagination.records` — the count the API claims exists. */
  readonly expectedTotal: number | null;
  /** True when at least one page failed but others succeeded. */
  readonly partial: boolean;
}

export interface FetchOptions {
  readonly signal?: AbortSignal;
}

/** Fetches and parses a single page of breeds. */
export async function fetchBreedPage(
  pageNumber: number,
  options: FetchOptions = {},
): Promise<BreedPageResult> {
  const payload = await requestJson('/breeds', {
    query: { 'page[number]': pageNumber, 'page[size]': API_CONFIG.pageSize },
    signal: options.signal,
  });

  const { items, skipped } = parseCollection(payload, parseBreed);
  const pagination = parsePagination(payload);

  return {
    pageNumber,
    breeds: items,
    skipped,
    totalRecords: pagination.records ?? null,
    lastPage: pagination.last ?? null,
    // `next` is absent on the final page — this is how we know to stop.
    hasNextPage: pagination.next !== undefined,
  };
}

/** Fetches one breed by id, for detail refresh/enrichment. */
export async function fetchBreedById(id: string, options: FetchOptions = {}): Promise<Breed> {
  const payload = await requestJson(`/breeds/${encodeURIComponent(id)}`, {
    signal: options.signal,
  });
  const breed = parseSingle(payload, parseBreed);
  if (breed === null) {
    throw new ApiError('parse', `Breed ${id} was missing or malformed in the response`);
  }
  return breed;
}

/**
 * Fetches every page of breeds and merges them into one dataset.
 *
 * Strategy:
 *  1. Fetch page 1 to learn the page count (`meta.pagination.last`).
 *  2. Fetch the remaining pages concurrently — they are independent, and
 *     6 parallel requests finish far faster than 6 sequential ones.
 *  3. Merge with an id-keyed Map so duplicates across page boundaries
 *     collapse instead of producing repeated rows.
 *
 * Page 1 failing is fatal (we cannot even learn the page count). Any later
 * page failing is survivable and reported via `failures`.
 */
export async function fetchAllBreeds(options: FetchOptions = {}): Promise<AllBreedsResult> {
  const firstPage = await fetchBreedPage(1, options);

  const failures: PageFailure[] = [];
  const pages: BreedPageResult[] = [firstPage];

  const lastPage = resolvePageCount(firstPage);

  if (lastPage > 1) {
    const pageNumbers: number[] = [];
    for (let page = 2; page <= lastPage; page += 1) pageNumbers.push(page);

    // `allSettled`, not `all`: one rejected page must not discard the rest.
    const settled = await Promise.allSettled(
      pageNumbers.map(async (pageNumber) => fetchBreedPage(pageNumber, options)),
    );

    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      const pageNumber = pageNumbers[index];
      if (outcome === undefined || pageNumber === undefined) continue;

      if (outcome.status === 'fulfilled') {
        pages.push(outcome.value);
      } else {
        const error = toApiError(outcome.reason, null);
        // A caller-initiated cancellation is not a data failure: propagate it
        // so sync can abandon the run rather than persist a truncated dataset.
        if (error.kind === 'aborted') throw error;
        failures.push({ pageNumber, error });
      }
    }
  }

  const merged = mergeBreedPages(pages);

  return {
    breeds: merged.breeds,
    pagesRequested: lastPage,
    pagesSucceeded: pages.length,
    failures,
    duplicatesDropped: merged.duplicatesDropped,
    recordsSkipped: pages.reduce((sum, page) => sum + page.skipped, 0),
    expectedTotal: firstPage.totalRecords,
    partial: failures.length > 0,
  };
}

/**
 * Determines how many pages to fetch.
 *
 * Prefers the API's own `last`. Falls back to deriving it from the record
 * count, and finally to "just page 1" — never to an unbounded loop. Clamped
 * by `maxPages` so a malformed `last` cannot spawn thousands of requests.
 */
export function resolvePageCount(firstPage: BreedPageResult): number {
  if (firstPage.lastPage !== null && firstPage.lastPage > 0) {
    return Math.min(firstPage.lastPage, API_CONFIG.maxPages);
  }

  if (firstPage.totalRecords !== null && firstPage.breeds.length > 0) {
    const perPage = firstPage.breeds.length;
    return Math.min(Math.ceil(firstPage.totalRecords / perPage), API_CONFIG.maxPages);
  }

  return 1;
}

/**
 * Merges pages into a single ordered, de-duplicated list.
 *
 * Pages are sorted by page number first so the merged order is stable
 * regardless of which concurrent request resolved first. On a duplicate id the
 * first occurrence wins — later pages shifting during pagination should not
 * overwrite a record already shown to the user.
 */
export function mergeBreedPages(pages: readonly BreedPageResult[]): {
  readonly breeds: readonly Breed[];
  readonly duplicatesDropped: number;
} {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const byId = new Map<string, Breed>();
  let duplicatesDropped = 0;

  for (const page of ordered) {
    for (const breed of page.breeds) {
      if (byId.has(breed.id)) {
        duplicatesDropped += 1;
        continue;
      }
      byId.set(breed.id, breed);
    }
  }

  return { breeds: [...byId.values()], duplicatesDropped };
}
