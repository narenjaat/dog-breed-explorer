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

import NetInfo from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { getAllGroups, getAllBreeds, getSyncState } from '@/database/repository';
import FastImage from '@d11/react-native-fast-image';
import { synchronize } from '@/syncService';
import {
  useAppDispatch,
  useAppSelector,
  breedsUpserted,
  groupsUpserted,
  hydratedFromCache,
  hydrationFailed,
  hydrationStarted,
  networkStatusChanged,
  syncFailed,
  syncFinished,
  syncStarted,
  syncStateRestored,
} from '@/store';
import { selectIsOnline } from '@/store/selectors';
import type { Breed } from '@/types';

export interface NetworkSnapshot {
  /** The device has a network interface up. */
  readonly isConnected: boolean;
  /**
   * The OS believes that interface can actually reach the internet. On some
   * Android versions this is undefined, in which case we fall back to
   * `isConnected` rather than declaring the app offline.
   */
  readonly isInternetReachable: boolean;
}

export type NetworkListener = (snapshot: NetworkSnapshot) => void;

function toSnapshot(state: NetInfoState): NetworkSnapshot {
  const isConnected = state.isConnected ?? false;
  return {
    isConnected,
    isInternetReachable: state.isInternetReachable ?? isConnected,
  };
}

/** Reads current connectivity. Assumes online if the check itself fails, so a
 *  probe error cannot strand the user in a permanent "offline" state. */
export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  try {
    const state = await NetInfo.fetch();
    return toSnapshot(state);
  } catch {
    return { isConnected: true, isInternetReachable: true };
  }
}

/**
 * Subscribes to connectivity changes. Returns an unsubscribe function.
 */
export function subscribeToNetwork(listener: NetworkListener): () => void {
  return NetInfo.addEventListener((state) => {
    listener(toSnapshot(state));
  });
}

/** True when the snapshot indicates the app can reach the API. */
export function isOnline(snapshot: NetworkSnapshot): boolean {
  return snapshot.isConnected && snapshot.isInternetReachable;
}

/** Data older than this triggers an automatic refresh on launch. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Warms the disk cache for the first screenful of list thumbnails, so the top
 * of the list has art on the next cold start. Capped so it does not compete
 * with the images actually being scrolled to.
 */
function prefetchThumbnails(breeds: readonly Breed[]): void {
  const sources = breeds
    .slice(0, 24)
    .flatMap((breed) => (breed.thumbnailUrl === null ? [] : [breed.thumbnailUrl]))
    .map((uri) => ({ uri, cache: FastImage.cacheControl.immutable }));
  if (sources.length > 0) FastImage.preload(sources);
}

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
          const [breeds, groups] = await Promise.all([getAllBreeds(), getAllGroups()]);
          if (!mountedRef.current) return;

          dispatch(groupsUpserted(groups));
          dispatch(breedsUpserted(breeds));
          prefetchThumbnails(breeds);
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
          getAllBreeds(),
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
