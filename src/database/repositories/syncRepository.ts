/**
 * Sync metadata persistence.
 *
 * Stored in SQLite (not in-memory) so "Last synced 2 hours ago" survives an
 * app restart — which is exactly the case where the user most needs to know
 * how stale the cache is.
 */

import { getDatabase } from '@/database/database';
import type { SyncState } from '@/types/sync';
import { INITIAL_SYNC_STATE } from '@/types/sync';
import { isRecord, isString, optionalNumber, optionalString } from '@/utils/guards';

const SYNC_STATE_KEY = 'sync_state';

const UPSERT_SQL = `
  INSERT INTO sync_metadata (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`;

/** Narrows a persisted status string back into the union. */
function toStatus(value: string | null): SyncState['status'] {
  switch (value) {
    case 'syncing':
      // A run was in flight when the app died; it certainly is not now.
      return 'idle';
    case 'success':
    case 'partial':
    case 'error':
    case 'idle':
      return value;
    default:
      return 'idle';
  }
}

function toPageNumbers(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
}

/** Reads persisted sync state, falling back to the initial state. */
export async function getSyncState(): Promise<SyncState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    SYNC_STATE_KEY,
  );
  if (row === null || row === undefined) return INITIAL_SYNC_STATE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value) as unknown;
  } catch {
    // Corrupt metadata must not block the app: fall back and move on.
    return INITIAL_SYNC_STATE;
  }
  if (!isRecord(parsed)) return INITIAL_SYNC_STATE;

  const statusValue = parsed['status'];
  return {
    status: toStatus(isString(statusValue) ? statusValue : null),
    lastSyncedAt: optionalNumber(parsed, 'lastSyncedAt'),
    lastFullSyncAt: optionalNumber(parsed, 'lastFullSyncAt'),
    lastSyncedBreedCount: optionalNumber(parsed, 'lastSyncedBreedCount') ?? 0,
    failedPages: toPageNumbers(parsed['failedPages']),
    lastError: optionalString(parsed, 'lastError'),
  };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(UPSERT_SQL, SYNC_STATE_KEY, JSON.stringify(state), Date.now());
}
