/**
 * Offline-first bootstrap and background sync.
 *
 * Order of operations on launch:
 *   1. Read SQLite and render whatever is cached — immediately, before any
 *      network call. This is what makes a cold start usable offline.
 *   2. Probe connectivity.
 *   3. If online and the cache is empty or stale, sync in the background.
 *   4. On regaining connectivity, sync again.
 *
 * The cache is never cleared on failure; a failed sync only updates the
 * banner.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { getAllGroups } from '@/database/repositories/groupRepository';
import { queryBreeds } from '@/database/repositories/breedRepository';
import { getSyncState } from '@/database/repositories/syncRepository';
import { getNetworkSnapshot, isOnline, subscribeToNetwork } from '@/services/networkService';
import { prefetchListThumbnails } from '@/services/imageCacheService';
import { synchronize } from '@/services/syncService';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  breedsUpserted,
  groupsUpserted,
  hydratedFromCache,
  hydrationFailed,
  hydrationStarted,
} from '@/store/slices/breedsSlice';
import {
  networkStatusChanged,
  syncFailed,
  syncFinished,
  syncStarted,
  syncStateRestored,
} from '@/store/slices/syncSlice';
import { selectIsOnline } from '@/store/selectors';

/** Data older than this triggers an automatic refresh on launch. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

function isStale(lastSyncedAt: number | null): boolean {
  return lastSyncedAt === null || Date.now() - lastSyncedAt > STALE_AFTER_MS;
}

export interface UseOfflineSyncResult {
  /** Starts a manual sync: pull-to-refresh and every Retry button. */
  readonly refresh: () => void;
}

export function useOfflineSync(): UseOfflineSyncResult {
  const dispatch = useAppDispatch();
  const online = useAppSelector(selectIsOnline);

  // Guards against a sync firing twice (e.g. foreground + reconnect landing
  // together). The service also de-duplicates, but this avoids the dispatch churn.
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const runSync = useCallback(
    async (manual: boolean): Promise<void> => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      dispatch(syncStarted({ manual }));

      try {
        const result = await synchronize();
        if (!mountedRef.current) return;

        dispatch(syncFinished(result));

        // Re-read from SQLite rather than trusting the in-memory result: the
        // database is the source of truth, and a partial sync merged with
        // previously-cached rows produces a different set than the API returned.
        if (result.status !== 'error') {
          const [breeds, groups] = await Promise.all([queryBreeds(), getAllGroups()]);
          if (!mountedRef.current) return;

          dispatch(groupsUpserted(groups));
          dispatch(breedsUpserted(breeds));
          void prefetchListThumbnails(breeds.map((breed) => breed.thumbnailUrl));
        }
      } catch (error) {
        if (!mountedRef.current) return;
        const message = error instanceof Error ? error.message : 'Synchronisation failed.';
        dispatch(syncFailed(message));
      } finally {
        syncingRef.current = false;
      }
    },
    [dispatch],
  );

  // --- Step 1 & 2: hydrate from cache, then decide whether to sync ---
  useEffect(() => {
    mountedRef.current = true;

    const bootstrap = async (): Promise<void> => {
      dispatch(hydrationStarted());

      let cachedBreedCount = 0;
      let lastSyncedAt: number | null = null;

      try {
        const [breeds, groups, syncState] = await Promise.all([
          queryBreeds(),
          getAllGroups(),
          getSyncState(),
        ]);
        if (!mountedRef.current) return;

        cachedBreedCount = breeds.length;
        lastSyncedAt = syncState.lastSyncedAt;

        dispatch(syncStateRestored(syncState));
        dispatch(hydratedFromCache({ breeds, groups }));
      } catch {
        if (!mountedRef.current) return;
        // A broken cache must not block the app; the network path can still
        // populate it.
        dispatch(hydrationFailed());
      }

      const snapshot = await getNetworkSnapshot();
      if (!mountedRef.current) return;

      const connected = isOnline(snapshot);
      dispatch(networkStatusChanged(connected));

      if (!connected) return;

      // Sync when there is nothing cached, or when what is cached is old.
      if (cachedBreedCount === 0 || isStale(lastSyncedAt)) {
        void runSync(false);
      }
    };

    void bootstrap();

    return () => {
      mountedRef.current = false;
    };
  }, [dispatch, runSync]);

  // --- Step 4: sync when connectivity returns ---
  useEffect(() => {
    const unsubscribe = subscribeToNetwork((snapshot) => {
      const connected = isOnline(snapshot);
      const wasOnline = onlineRef.current;
      dispatch(networkStatusChanged(connected));

      // Only on the offline -> online edge, so a flapping connection does not
      // start a sync per event.
      if (connected && !wasOnline) {
        void runSync(false);
      }
    });

    return unsubscribe;
  }, [dispatch, runSync]);

  // Refresh stale data when the app returns to the foreground.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus): void => {
      if (nextState !== 'active' || !onlineRef.current) return;
      void (async () => {
        const syncState = await getSyncState();
        if (isStale(syncState.lastSyncedAt)) {
          void runSync(false);
        }
      })();
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [runSync]);

  const refresh = useCallback(() => {
    void runSync(true);
  }, [runSync]);

  return { refresh };
}
