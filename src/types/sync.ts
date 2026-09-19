/**
 * Synchronisation state — the vocabulary the sync banner renders from.
 */

export type SyncStatus =
  | 'idle' // never run this session, nothing in flight
  | 'syncing' // a run is in flight
  | 'success' // last run completed fully
  | 'partial' // last run completed, but some pages failed
  | 'error'; // last run produced no usable data

/** Outcome of a completed sync run, persisted so it survives a restart. */
export interface SyncState {
  readonly status: SyncStatus;
  /** Epoch ms of the last run that persisted data. Null until the first one. */
  readonly lastSyncedAt: number | null;
  /** Epoch ms of the last fully-successful run (no failed pages). */
  readonly lastFullSyncAt: number | null;
  /** Breeds written by the last run that persisted data. */
  readonly lastSyncedBreedCount: number;
  /** Page numbers that failed in the last run. */
  readonly failedPages: readonly number[];
  /** User-facing reason the last run was not fully successful. */
  readonly lastError: string | null;
}

export const INITIAL_SYNC_STATE: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  lastFullSyncAt: null,
  lastSyncedBreedCount: 0,
  failedPages: [],
  lastError: null,
};

/** Result handed back by the sync service to the store. */
export interface SyncResult {
  readonly status: Extract<SyncStatus, 'success' | 'partial' | 'error'>;
  readonly syncedAt: number;
  readonly breedCount: number;
  readonly groupCount: number;
  readonly failedPages: readonly number[];
  readonly duplicatesDropped: number;
  readonly recordsSkipped: number;
  readonly error: string | null;
  /** True when nothing was written and any existing cache was left intact. */
  readonly usedCache: boolean;
}
