/**
 * Dog API endpoints: breeds (paginated) and groups.
 *
 * `fetchAllBreeds` merges every page into one de-duplicated dataset and
 * returns successfully even when some pages failed, reporting which ones.
 * Losing page 4 should cost the user 48 breeds, not all 283.
 */

import { requestJson, API_CONFIG, ApiError, toApiError } from '@/api/client';
import {
  parseBreed,
  parseCollection,
  parsePagination,
  parseSingle,
  parseGroup,
} from '@/api/parsers';
import type { Breed, BreedGroup } from '@/types';

export interface BreedPageResult {
  pageNumber: number;
  breeds: Breed[];
  /** Total breeds the API says exist, if it says. */
  totalRecords: number | null;
  /** Last page number the API reports, if it says. */
  lastPage: number | null;
}

export interface PageFailure {
  pageNumber: number;
  error: ApiError;
}

export interface AllBreedsResult {
  /** Breeds from every page that loaded, without duplicates. */
  breeds: Breed[];
  pagesRequested: number;
  failures: PageFailure[];
  /** True when some pages failed but at least page 1 loaded. */
  partial: boolean;
}

export interface FetchOptions {
  signal?: AbortSignal;
  /** Overrides the retry backoff base delay (tests use a tiny value). */
  retryBaseDelayMs?: number;
}

/** Fetches and parses a single page of breeds. */
export async function fetchBreedPage(
  pageNumber: number,
  options: FetchOptions = {},
): Promise<BreedPageResult> {
  const payload = await requestJson('/breeds', {
    query: { 'page[number]': pageNumber, 'page[size]': API_CONFIG.pageSize },
    signal: options.signal,
    retryBaseDelayMs: options.retryBaseDelayMs,
  });

  const pagination = parsePagination(payload);
  return {
    pageNumber,
    breeds: parseCollection(payload, parseBreed).items,
    totalRecords: pagination.records ?? null,
    lastPage: pagination.last ?? null,
  };
}

/** Fetches one breed by id, for detail refresh/enrichment. */
export async function fetchBreedById(id: string, options: FetchOptions = {}): Promise<Breed> {
  const payload = await requestJson(`/breeds/${encodeURIComponent(id)}`, {
    signal: options.signal,
    retryBaseDelayMs: options.retryBaseDelayMs,
  });
  const breed = parseSingle(payload, parseBreed);
  if (breed === null) {
    throw new ApiError('parse', `Breed ${id} was missing or malformed in the response`);
  }
  return breed;
}

/**
 * Fetches every page of breeds and merges them into one list.
 *
 *  1. Fetch page 1 to learn how many pages there are.
 *  2. Fetch the other pages in parallel (much faster than one by one).
 *  3. Merge them, dropping any breed that appears on two pages.
 */
export async function fetchAllBreeds(options: FetchOptions = {}): Promise<AllBreedsResult> {
  // Page 1 tells us how many pages exist. If it fails, the whole call fails.
  const firstPage = await fetchBreedPage(1, options);
  const pageCount = resolvePageCount(firstPage);

  const otherPageNumbers: number[] = [];
  for (let page = 2; page <= pageCount; page++) otherPageNumbers.push(page);

  // `allSettled`, not `all`: one failed page must not throw away the others.
  const results = await Promise.allSettled(
    otherPageNumbers.map((pageNumber) => fetchBreedPage(pageNumber, options)),
  );

  const pages = [firstPage];
  const failures: PageFailure[] = [];
  results.forEach((result, index) => {
    const pageNumber = otherPageNumbers[index];
    if (result.status === 'fulfilled') {
      pages.push(result.value);
      return;
    }
    const error = toApiError(result.reason, null);
    // Cancelled by the caller: stop the whole sync rather than save half the data.
    if (error.kind === 'aborted') throw error;
    failures.push({ pageNumber, error });
  });

  return {
    breeds: mergeBreedPages(pages),
    pagesRequested: pageCount,
    failures,
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
export function mergeBreedPages(pages: BreedPageResult[]): Breed[] {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const byId = new Map<string, Breed>();
  for (const page of ordered) {
    for (const breed of page.breeds) {
      if (!byId.has(breed.id)) byId.set(breed.id, breed);
    }
  }
  return [...byId.values()];
}

export async function fetchGroups(options: FetchOptions = {}): Promise<BreedGroup[]> {
  const payload = await requestJson('/groups', {
    signal: options.signal,
    retryBaseDelayMs: options.retryBaseDelayMs,
  });
  return parseCollection(payload, parseGroup).items;
}
