/**
 * Sync service tests — the offline-first guarantees.
 *
 * The central claim under test: a sync failure never destroys or degrades the
 * cache that is already on the device.
 */

import { makeBreedWithWeight, makeCollectionResponse, makeGroup } from '@/__tests__/fixtures';

// --- Repository mocks ------------------------------------------------------
// The repositories are mocked so these tests exercise the orchestration logic
// (what gets written, when, and what is preserved) without a native SQLite.

const mockUpsertBreeds = jest.fn(async () => undefined);
const mockUpsertGroups = jest.fn(async () => undefined);
const mockCountBreeds = jest.fn(async () => 0);
const mockGetSyncState = jest.fn();
const mockSaveSyncState = jest.fn(async () => undefined);

jest.mock('@/database/repositories/breedRepository', () => ({
  upsertBreeds: (...args: readonly unknown[]) => mockUpsertBreeds(...(args as [])),
  countBreeds: () => mockCountBreeds(),
}));

jest.mock('@/database/repositories/groupRepository', () => ({
  upsertGroups: (...args: readonly unknown[]) => mockUpsertGroups(...(args as [])),
}));

jest.mock('@/database/repositories/syncRepository', () => ({
  getSyncState: () => mockGetSyncState() as unknown,
  saveSyncState: (...args: readonly unknown[]) => mockSaveSyncState(...(args as [])),
}));

import { buildPartialMessage, synchronize } from '@/services/syncService';
import { INITIAL_SYNC_STATE } from '@/types/sync';

const originalFetch = globalThis.fetch;

interface MockApiOptions {
  readonly pageCount?: number;
  readonly perPage?: number;
  readonly failPages?: readonly number[];
  readonly failGroups?: boolean;
  readonly emptyBreeds?: boolean;
}

function mockApi(options: MockApiOptions = {}): void {
  const {
    pageCount = 3,
    perPage = 10,
    failPages = [],
    failGroups = false,
    emptyBreeds = false,
  } = options;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/groups')) {
      if (failGroups) throw new TypeError('Network request failed');
      return jsonResponse({ data: [makeGroup('g1', 'Herding Group')] });
    }

    const match = /page%5Bnumber%5D=(\d+)/u.exec(url);
    const pageNumber = match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
    if (failPages.includes(pageNumber)) throw new TypeError('Network request failed');

    const data = emptyBreeds
      ? []
      : Array.from({ length: perPage }, (_, index) =>
          makeBreedWithWeight(
            `breed-${String((pageNumber - 1) * perPage + index)}`,
            `Breed ${String((pageNumber - 1) * perPage + index)}`,
            10,
            12,
          ),
        );

    return jsonResponse(
      makeCollectionResponse(data, {
        current: pageNumber,
        ...(pageNumber < pageCount ? { next: pageNumber + 1 } : {}),
        ...(pageNumber === 1 ? { last: pageCount } : {}),
        records: pageCount * perPage,
      }),
    );
  }) as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSyncState.mockResolvedValue(INITIAL_SYNC_STATE);
  mockCountBreeds.mockResolvedValue(0);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('synchronize — success', () => {
  it('persists every merged breed and reports success', async () => {
    mockApi({ pageCount: 3, perPage: 10 });

    const result = await synchronize();

    expect(result.status).toBe('success');
    expect(result.breedCount).toBe(30);
    expect(result.failedPages).toEqual([]);
    expect(mockUpsertBreeds).toHaveBeenCalledTimes(1);

    const [written] = mockUpsertBreeds.mock.calls[0] as unknown as [readonly unknown[]];
    expect(written).toHaveLength(30);
  });

  it('writes groups before breeds so the foreign key resolves', async () => {
    mockApi();
    await synchronize();

    const groupOrder = mockUpsertGroups.mock.invocationCallOrder[0];
    const breedOrder = mockUpsertBreeds.mock.invocationCallOrder[0];
    expect(groupOrder).toBeDefined();
    expect(breedOrder).toBeDefined();
    expect(groupOrder as number).toBeLessThan(breedOrder as number);
  });

  it('records the sync timestamp so freshness can be shown', async () => {
    mockApi();
    const before = Date.now();
    const result = await synchronize();

    expect(result.syncedAt).toBeGreaterThanOrEqual(before);
    const [state] = mockSaveSyncState.mock.calls[0] as unknown as [{ lastSyncedAt: number }];
    expect(state.lastSyncedAt).toBe(result.syncedAt);
  });
});

describe('synchronize — partial failure', () => {
  it('persists the pages that succeeded and flags the run as partial', async () => {
    mockApi({ pageCount: 3, perPage: 10, failPages: [2] });

    const result = await synchronize();

    expect(result.status).toBe('partial');
    // Page 2's 10 breeds are lost; the other 20 are saved.
    expect(result.breedCount).toBe(20);
    expect(result.failedPages).toEqual([2]);
    expect(mockUpsertBreeds).toHaveBeenCalledTimes(1);
  });

  it('explains which pages failed in the banner message', async () => {
    mockApi({ pageCount: 3, perPage: 10, failPages: [2] });
    const result = await synchronize();

    expect(result.error).toContain('page 2');
    expect(result.error).toContain('cached data');
  });

  it('does not advance the full-sync marker on a partial run', async () => {
    mockGetSyncState.mockResolvedValue({ ...INITIAL_SYNC_STATE, lastFullSyncAt: 1000 });
    mockApi({ pageCount: 3, perPage: 10, failPages: [3] });

    await synchronize();

    const [state] = mockSaveSyncState.mock.calls[0] as unknown as [{ lastFullSyncAt: number }];
    expect(state.lastFullSyncAt).toBe(1000);
  });

  it('still saves breeds when only the groups request fails', async () => {
    mockApi({ failGroups: true });

    const result = await synchronize();

    expect(result.status).toBe('partial');
    expect(mockUpsertBreeds).toHaveBeenCalledTimes(1);
    expect(result.error).toContain('breed groups');
  });
});

describe('synchronize — total failure preserves the cache', () => {
  it('writes nothing when the first page fails', async () => {
    mockApi({ failPages: [1] });
    mockCountBreeds.mockResolvedValue(283);

    const result = await synchronize();

    expect(result.status).toBe('error');
    // The critical assertion: no write at all, so the cache is untouched.
    expect(mockUpsertBreeds).not.toHaveBeenCalled();
  });

  it('reports the cached count and that cached data is in use', async () => {
    mockApi({ failPages: [1] });
    mockCountBreeds.mockResolvedValue(283);

    const result = await synchronize();

    expect(result.breedCount).toBe(283);
    expect(result.usedCache).toBe(true);
  });

  it('keeps the previous sync timestamp when a run fails', async () => {
    mockGetSyncState.mockResolvedValue({
      ...INITIAL_SYNC_STATE,
      lastSyncedAt: 5_000,
      lastFullSyncAt: 5_000,
      status: 'success',
    });
    mockApi({ failPages: [1] });

    await synchronize();

    // A failed refresh must not make the cache look fresher than it is.
    const [state] = mockSaveSyncState.mock.calls[0] as unknown as [{ lastSyncedAt: number }];
    expect(state.lastSyncedAt).toBe(5_000);
  });

  it('treats an all-empty response as an error rather than wiping the cache', async () => {
    mockApi({ emptyBreeds: true, pageCount: 1 });
    mockCountBreeds.mockResolvedValue(283);

    const result = await synchronize();

    expect(result.status).toBe('error');
    expect(mockUpsertBreeds).not.toHaveBeenCalled();
    expect(result.error).toContain('no usable breed records');
  });

  it('reports no cached data when the device has none', async () => {
    mockApi({ failPages: [1] });
    mockCountBreeds.mockResolvedValue(0);

    const result = await synchronize();
    expect(result.usedCache).toBe(false);
  });
});

describe('synchronize — concurrency', () => {
  it('joins an in-flight run instead of starting a second one', async () => {
    mockApi({ pageCount: 2, perPage: 5 });

    const [first, second] = await Promise.all([synchronize(), synchronize()]);

    // Both callers observe the same run, and only one write happens.
    expect(first).toEqual(second);
    expect(mockUpsertBreeds).toHaveBeenCalledTimes(1);
  });
});

describe('buildPartialMessage', () => {
  it('returns null when nothing failed', () => {
    expect(buildPartialMessage([], false)).toBeNull();
  });

  it('uses the singular for one failed page', () => {
    expect(buildPartialMessage([3], false)).toContain('page 3');
  });

  it('lists several failed pages', () => {
    const message = buildPartialMessage([2, 4], false);
    expect(message).toContain('pages 2, 4');
  });

  it('mentions groups when only groups failed', () => {
    const message = buildPartialMessage([], true);
    expect(message).toContain('breed groups');
  });

  it('mentions both when pages and groups failed', () => {
    const message = buildPartialMessage([5], true);
    expect(message).toContain('page 5');
    expect(message).toContain('breed groups');
  });
});
