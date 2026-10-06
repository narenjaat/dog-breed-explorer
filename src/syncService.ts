/**
 * Synchronisation orchestration: API -> parse -> SQLite.
 *
 * The governing rule is that a sync failure is never allowed to make things
 * worse. Writes are upserts inside a transaction, a run that yields no breeds
 * writes nothing at all, and the previous cache is always left standing.
 */

import { fetchAllBreeds, fetchGroups } from '@/api/dogApi';
import { describeApiError, toApiError } from '@/api/client';
import { upsertBreeds, upsertGroups, getSyncState, saveSyncState } from '@/database/repository';
import type { SyncResult } from '@/types';

export interface SyncOptions {
  signal?: AbortSignal;
}

/**
 * Guard against overlapping runs. A pull-to-refresh landing on top of an
 * automatic reconnect sync would otherwise duplicate work and interleave two
 * sets of writes; the second caller simply joins the first run's promise.
 */
let inFlight: Promise<SyncResult> | null = null;

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

  /** Records a failed run. Writes no breeds, so the existing cache stands. */
  const fail = async (message: string, failedPages: number[]): Promise<SyncResult> => {
    await saveSyncState({
      status: 'error',
      lastSyncedAt: previous.lastSyncedAt,
      failedPages,
      lastError: message,
    });
    return { status: 'error', syncedAt, failedPages, error: message };
  };

  if (breedsOutcome.status === 'rejected') {
    const error = toApiError(breedsOutcome.reason, null);
    if (error.kind === 'aborted') throw error;
    return fail(describeApiError(error), []);
  }

  const breedsResult = breedsOutcome.value;
  const failedPages = breedsResult.failures.map((failure) => failure.pageNumber);

  if (groupsOutcome.status === 'fulfilled') {
    await upsertGroups(groupsOutcome.value, syncedAt);
  }

  // Zero breeds from a "successful" fetch means the payload was empty or
  // wholly unparseable. Writing that would be indistinguishable from a wipe,
  // so treat it as an error and preserve the cache.
  if (breedsResult.breeds.length === 0) {
    return fail('The Dog API returned no usable breed records.', failedPages);
  }

  await upsertBreeds(breedsResult.breeds, syncedAt);

  const groupsFailed = groupsOutcome.status === 'rejected';
  const status = breedsResult.partial || groupsFailed ? 'partial' : 'success';
  const error = buildPartialMessage(failedPages, groupsFailed);

  await saveSyncState({ status, lastSyncedAt: syncedAt, failedPages, lastError: error });
  return { status, syncedAt, failedPages, error };
}

/** Human-readable summary of what a partial run failed to refresh. */
export function buildPartialMessage(failedPages: number[], groupsFailed: boolean): string | null {
  if (failedPages.length === 0 && !groupsFailed) return null;

  const parts: string[] = [];
  if (failedPages.length > 0) {
    const plural = failedPages.length === 1 ? '' : 's';
    parts.push(`page${plural} ${failedPages.join(', ')}`);
  }
  if (groupsFailed) parts.push('breed groups');

  return `Some data could not be refreshed (${parts.join(' and ')}). Showing cached data.`;
}
