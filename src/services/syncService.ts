/**
 * Synchronisation orchestration: API -> parse -> SQLite.
 *
 * The governing rule is that a sync failure is never allowed to make things
 * worse. Writes are upserts inside a transaction, a run that yields no breeds
 * writes nothing at all, and the previous cache is always left standing.
 */

import { fetchAllBreeds } from '@/api/breedsApi';
import { fetchGroups } from '@/api/groupsApi';
import { describeApiError, toApiError } from '@/api/errors';
import { countBreeds, upsertBreeds } from '@/database/repositories/breedRepository';
import { upsertGroups } from '@/database/repositories/groupRepository';
import { getSyncState, saveSyncState } from '@/database/repositories/syncRepository';
import type { SyncResult, SyncState } from '@/types/sync';

export interface SyncOptions {
  readonly signal?: AbortSignal;
}

/**
 * Guard against overlapping runs. A pull-to-refresh landing on top of an
 * automatic reconnect sync would otherwise duplicate work and interleave two
 * sets of writes; the second caller simply joins the first run's promise.
 */
let inFlight: Promise<SyncResult> | null = null;

export function isSyncInFlight(): boolean {
  return inFlight !== null;
}

/**
 * Runs a full synchronisation.
 *
 * Groups and breeds are fetched concurrently — groups are small and one must
 * not gate the other. Groups are written first so the breeds' `group_id`
 * foreign key resolves immediately.
 */
export async function synchronize(options: SyncOptions = {}): Promise<SyncResult> {
  const existing = inFlight;
  if (existing !== null) return existing;

  const run = performSync(options).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function performSync(options: SyncOptions): Promise<SyncResult> {
  const syncedAt = Date.now();
  const previous = await getSyncState();

  // Groups failing is survivable: breeds still render, just with a fallback
  // section label. So it is settled independently rather than awaited with
  // a plain `await` that would throw away the breeds result.
  const [breedsOutcome, groupsOutcome] = await Promise.allSettled([
    fetchAllBreeds({ signal: options.signal }),
    fetchGroups({ signal: options.signal }),
  ]);

  if (breedsOutcome.status === 'rejected') {
    const error = toApiError(breedsOutcome.reason, null);
    if (error.kind === 'aborted') throw error;

    // Total failure: keep whatever is cached, record why, write nothing.
    const cachedCount = await safeCountBreeds();
    const state: SyncState = {
      status: 'error',
      lastSyncedAt: previous.lastSyncedAt,
      lastFullSyncAt: previous.lastFullSyncAt,
      lastSyncedBreedCount: previous.lastSyncedBreedCount,
      failedPages: [],
      lastError: describeApiError(error),
    };
    await saveSyncState(state);

    return {
      status: 'error',
      syncedAt,
      breedCount: cachedCount,
      groupCount: 0,
      failedPages: [],
      duplicatesDropped: 0,
      recordsSkipped: 0,
      error: describeApiError(error),
      usedCache: cachedCount > 0,
    };
  }

  const breedsResult = breedsOutcome.value;

  let groupCount = 0;
  if (groupsOutcome.status === 'fulfilled') {
    await upsertGroups(groupsOutcome.value.groups, syncedAt);
    groupCount = groupsOutcome.value.groups.length;
  }

  // Zero breeds from a "successful" fetch means the payload was empty or
  // wholly unparseable. Writing that would be indistinguishable from a wipe,
  // so treat it as an error and preserve the cache.
  if (breedsResult.breeds.length === 0) {
    const cachedCount = await safeCountBreeds();
    const message = 'The Dog API returned no usable breed records.';
    await saveSyncState({
      status: 'error',
      lastSyncedAt: previous.lastSyncedAt,
      lastFullSyncAt: previous.lastFullSyncAt,
      lastSyncedBreedCount: previous.lastSyncedBreedCount,
      failedPages: breedsResult.failures.map((failure) => failure.pageNumber),
      lastError: message,
    });

    return {
      status: 'error',
      syncedAt,
      breedCount: cachedCount,
      groupCount,
      failedPages: breedsResult.failures.map((failure) => failure.pageNumber),
      duplicatesDropped: breedsResult.duplicatesDropped,
      recordsSkipped: breedsResult.recordsSkipped,
      error: message,
      usedCache: cachedCount > 0,
    };
  }

  await upsertBreeds(breedsResult.breeds, syncedAt);

  const failedPages = breedsResult.failures.map((failure) => failure.pageNumber);
  const groupsFailed = groupsOutcome.status === 'rejected';
  const partial = breedsResult.partial || groupsFailed;

  const errorMessage = buildPartialMessage(failedPages, groupsFailed);

  const state: SyncState = {
    status: partial ? 'partial' : 'success',
    lastSyncedAt: syncedAt,
    // Only a clean run advances the "fully fresh" marker.
    lastFullSyncAt: partial ? previous.lastFullSyncAt : syncedAt,
    lastSyncedBreedCount: breedsResult.breeds.length,
    failedPages,
    lastError: errorMessage,
  };
  await saveSyncState(state);

  return {
    status: partial ? 'partial' : 'success',
    syncedAt,
    breedCount: breedsResult.breeds.length,
    groupCount,
    failedPages,
    duplicatesDropped: breedsResult.duplicatesDropped,
    recordsSkipped: breedsResult.recordsSkipped,
    error: errorMessage,
    usedCache: false,
  };
}

/** Human-readable summary of what a partial run failed to refresh. */
export function buildPartialMessage(
  failedPages: readonly number[],
  groupsFailed: boolean,
): string | null {
  if (failedPages.length === 0 && !groupsFailed) return null;

  const parts: string[] = [];
  if (failedPages.length > 0) {
    const plural = failedPages.length === 1 ? '' : 's';
    parts.push(`page${plural} ${failedPages.join(', ')}`);
  }
  if (groupsFailed) parts.push('breed groups');

  return `Some data could not be refreshed (${parts.join(' and ')}). Showing cached data.`;
}

/** Counting must never itself throw a sync into an unhandled rejection. */
async function safeCountBreeds(): Promise<number> {
  try {
    return await countBreeds();
  } catch {
    return 0;
  }
}
