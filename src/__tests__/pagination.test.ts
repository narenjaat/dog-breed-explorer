/**
 * Pagination tests: assembling 6 pages into one dataset, and surviving the
 * cases where that assembly goes wrong.
 */

import { fetchAllBreeds, mergeBreedPages, resolvePageCount } from '@/api/breedsApi';
import type { BreedPageResult } from '@/api/breedsApi';
import { parseBreed } from '@/api/parsers';
import type { Breed } from '@/types/domain';
import {
  makeBreedWithWeight,
  makeCollectionResponse,
  makeCompleteBreed,
} from '@/__tests__/fixtures';

function breedOf(id: string, name: string): Breed {
  const parsed = parseBreed(makeBreedWithWeight(id, name, 10, 12));
  if (parsed === null) throw new Error(`fixture ${id} failed to parse`);
  return parsed;
}

function pageOf(pageNumber: number, breeds: readonly Breed[]): BreedPageResult {
  return {
    pageNumber,
    breeds,
    skipped: 0,
    totalRecords: 283,
    lastPage: 6,
    hasNextPage: pageNumber < 6,
  };
}

describe('mergeBreedPages', () => {
  it('concatenates pages in page order regardless of arrival order', () => {
    const merged = mergeBreedPages([
      pageOf(3, [breedOf('c', 'Collie')]),
      pageOf(1, [breedOf('a', 'Akita')]),
      pageOf(2, [breedOf('b', 'Beagle')]),
    ]);

    expect(merged.breeds.map((breed) => breed.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops duplicate ids that appear across page boundaries', () => {
    // A record shifting between pages mid-pagination is the real cause here.
    const merged = mergeBreedPages([
      pageOf(1, [breedOf('a', 'Akita'), breedOf('b', 'Beagle')]),
      pageOf(2, [breedOf('b', 'Beagle'), breedOf('c', 'Collie')]),
    ]);

    expect(merged.breeds).toHaveLength(3);
    expect(merged.duplicatesDropped).toBe(1);
    expect(merged.breeds.map((breed) => breed.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the first occurrence when a duplicate id is seen again', () => {
    const first = breedOf('dup', 'First Name');
    const second = { ...breedOf('dup', 'Second Name'), name: 'Second Name' };

    const merged = mergeBreedPages([pageOf(1, [first]), pageOf(2, [second])]);
    expect(merged.breeds).toHaveLength(1);
    expect(merged.breeds[0]?.name).toBe('First Name');
  });

  it('returns an empty result for no pages', () => {
    expect(mergeBreedPages([])).toEqual({ breeds: [], duplicatesDropped: 0 });
  });
});

describe('resolvePageCount', () => {
  it('uses the API-reported last page', () => {
    expect(resolvePageCount(pageOf(1, []))).toBe(6);
  });

  it('derives the page count from the record total when last is absent', () => {
    const page: BreedPageResult = {
      pageNumber: 1,
      breeds: Array.from({ length: 48 }, (_, index) =>
        breedOf(`b${String(index)}`, `Breed ${String(index)}`),
      ),
      skipped: 0,
      totalRecords: 283,
      lastPage: null,
      hasNextPage: true,
    };
    // ceil(283 / 48) = 6
    expect(resolvePageCount(page)).toBe(6);
  });

  it('falls back to a single page when it has nothing to go on', () => {
    const page: BreedPageResult = {
      pageNumber: 1,
      breeds: [],
      skipped: 0,
      totalRecords: null,
      lastPage: null,
      hasNextPage: false,
    };
    expect(resolvePageCount(page)).toBe(1);
  });

  it('clamps an absurd page count so a bad cursor cannot spawn 1000 requests', () => {
    const page: BreedPageResult = { ...pageOf(1, []), lastPage: 99_999 };
    expect(resolvePageCount(page)).toBeLessThanOrEqual(50);
  });
});

describe('fetchAllBreeds', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /** Serves `pageCount` pages of fixtures, failing the pages in `failPages`. */
  function mockPagedApi(options: {
    pageCount: number;
    perPage: number;
    failPages?: readonly number[];
    duplicateOnPage?: number;
  }): jest.Mock {
    const { pageCount, perPage, failPages = [], duplicateOnPage } = options;

    const mock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = /page%5Bnumber%5D=(\d+)/u.exec(url);
      const pageNumber = match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);

      if (failPages.includes(pageNumber)) {
        throw new TypeError('Network request failed');
      }

      const data = Array.from({ length: perPage }, (_, index) => {
        const globalIndex = (pageNumber - 1) * perPage + index;
        return makeBreedWithWeight(
          `breed-${String(globalIndex)}`,
          `Breed ${String(globalIndex)}`,
          8,
          12,
        );
      });

      // Optionally repeat page 1's first record, simulating a shifted record.
      if (duplicateOnPage === pageNumber) {
        data[0] = makeBreedWithWeight('breed-0', 'Breed 0', 8, 12);
      }

      const body = makeCollectionResponse(data, {
        current: pageNumber,
        ...(pageNumber < pageCount ? { next: pageNumber + 1 } : {}),
        ...(pageNumber === 1 ? { last: pageCount } : {}),
        records: pageCount * perPage,
      });

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  it('fetches every page and merges them into one dataset', async () => {
    mockPagedApi({ pageCount: 6, perPage: 48 });

    const result = await fetchAllBreeds();

    expect(result.pagesRequested).toBe(6);
    expect(result.pagesSucceeded).toBe(6);
    expect(result.breeds).toHaveLength(288);
    expect(result.partial).toBe(false);
    expect(result.failures).toEqual([]);
  });

  it('requests each page exactly once when all succeed', async () => {
    const mock = mockPagedApi({ pageCount: 6, perPage: 48 });
    await fetchAllBreeds();

    const requested = mock.mock.calls
      .map((call) => /page%5Bnumber%5D=(\d+)/u.exec(String(call[0]))?.[1])
      .filter((page): page is string => page !== undefined);

    expect(new Set(requested)).toEqual(new Set(['1', '2', '3', '4', '5', '6']));
    expect(requested).toHaveLength(6);
  });

  it('keeps the breeds from healthy pages when some pages fail', async () => {
    mockPagedApi({ pageCount: 6, perPage: 48, failPages: [3, 5] });

    const result = await fetchAllBreeds({ retryBaseDelayMs: 1 });

    // Losing 2 pages costs 96 breeds, not all 288.
    expect(result.breeds).toHaveLength(192);
    expect(result.partial).toBe(true);
    expect(result.pagesSucceeded).toBe(4);
    expect(result.failures.map((failure) => failure.pageNumber).sort()).toEqual([3, 5]);
  });

  it('de-duplicates records repeated across pages', async () => {
    mockPagedApi({ pageCount: 3, perPage: 10, duplicateOnPage: 2 });

    const result = await fetchAllBreeds();
    expect(result.duplicatesDropped).toBe(1);
    expect(new Set(result.breeds.map((breed) => breed.id)).size).toBe(result.breeds.length);
  });

  it('propagates a failure on page 1, which leaves nothing to merge', async () => {
    mockPagedApi({ pageCount: 6, perPage: 48, failPages: [1] });
    await expect(fetchAllBreeds({ retryBaseDelayMs: 1 })).rejects.toThrow();
  });

  it('reports the API record total so sync can detect a short dataset', async () => {
    mockPagedApi({ pageCount: 6, perPage: 48 });
    const result = await fetchAllBreeds();
    expect(result.expectedTotal).toBe(288);
  });

  it('handles a single-page dataset with no pagination metadata', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ data: [makeCompleteBreed()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    const result = await fetchAllBreeds();
    expect(result.breeds).toHaveLength(1);
    expect(result.pagesRequested).toBe(1);
  });
});
