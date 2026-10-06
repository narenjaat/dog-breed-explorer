/**
 * Sync + connectivity state, as rendered by the status banner.
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { SyncResult, SyncState, SyncStatus } from '@/types/sync';
import { INITIAL_SYNC_STATE } from '@/types/sync';

export interface SyncSliceState extends SyncState {
  readonly isOnline: boolean;
  /** False until the first connectivity probe resolves, so the UI does not
   *  flash an "Offline" banner during startup. */
  readonly hasNetworkStatus: boolean;
  /** True when the user pulled to refresh, to distinguish from auto-sync. */
  readonly isManualRefresh: boolean;
}

const INITIAL_STATE: SyncSliceState = {
  ...INITIAL_SYNC_STATE,
  isOnline: true,
  hasNetworkStatus: false,
  isManualRefresh: false,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState: INITIAL_STATE,
  reducers: {
    /** Restores persisted sync metadata at startup. */
    syncStateRestored(state, action: PayloadAction<SyncState>) {
      const restored = action.payload;
      state.status = restored.status;
      state.lastSyncedAt = restored.lastSyncedAt;
      state.lastFullSyncAt = restored.lastFullSyncAt;
      state.lastSyncedBreedCount = restored.lastSyncedBreedCount;
      state.failedPages = [...restored.failedPages];
      state.lastError = restored.lastError;
    },
    syncStarted(state, action: PayloadAction<{ manual: boolean }>) {
      state.status = 'syncing';
      state.isManualRefresh = action.payload.manual;
    },
    syncFinished(state, action: PayloadAction<SyncResult>) {
      const result = action.payload;
      state.status = result.status;
      state.failedPages = [...result.failedPages];
      state.lastError = result.error;
      state.isManualRefresh = false;

      // A failed run must not advance the freshness timestamp: the cache is
      // exactly as old as it was before.
      if (result.status !== 'error') {
        state.lastSyncedAt = result.syncedAt;
        state.lastSyncedBreedCount = result.breedCount;
        if (result.status === 'success') state.lastFullSyncAt = result.syncedAt;
      }
    },
    /** A sync that threw outside the service's own handling. */
    syncFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.lastError = action.payload;
      state.isManualRefresh = false;
    },
    networkStatusChanged(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
      state.hasNetworkStatus = true;
    },
  },
});

export const { networkStatusChanged, syncFailed, syncFinished, syncStarted, syncStateRestored } =
  syncSlice.actions;

export const syncReducer = syncSlice.reducer;
export type { SyncStatus };
export { INITIAL_STATE as INITIAL_SYNC_SLICE_STATE };
