/**
 * Offline-first startup and background sync.
 *
 *   1. On launch, show whatever SQLite has, before any network call. This is
 *      why the app works offline.
 *   2. If online and the cache is empty or older than 6 hours, sync.
 *   3. Sync again when the internet comes back or the app is reopened.
 *
 * A failed sync never clears the cache; it only updates the banner.
 */

import NetInfo from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
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

/** Data older than this is refreshed automatically. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

function isStale(lastSyncedAt: number | null): boolean {
  return lastSyncedAt === null || Date.now() - lastSyncedAt > STALE_AFTER_MS;
}

/**
 * Online = connected AND the internet is reachable. Some Android versions
 * report reachability as null; then we trust `isConnected`.
 */
function isOnline(state: NetInfoState): boolean {
  const connected = state.isConnected ?? false;
  return connected && (state.isInternetReachable ?? connected);
}

/** Downloads the first 24 list thumbnails so the next cold start has images. */
function prefetchThumbnails(breeds: Breed[]): void {
  const sources = breeds
    .slice(0, 24)
    .filter((breed) => breed.thumbnailUrl !== null)
    .map((breed) => ({ uri: breed.thumbnailUrl!, cache: FastImage.cacheControl.immutable }));
  FastImage.preload(sources);
}

export function useOfflineSync() {
  const dispatch = useAppDispatch();
  const online = useAppSelector(selectIsOnline);

  // Refs hold values the listeners below need without re-subscribing.
  const isSyncingRef = useRef(false);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const runSync = useCallback(
    async (manual: boolean) => {
      // Two triggers can land together (reconnect + app foreground): run once.
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      dispatch(syncStarted({ manual }));

      try {
        const result = await synchronize();
        dispatch(syncFinished(result));

        // Read back from SQLite: after a partial sync it holds old + new
        // rows, which is more than this run downloaded.
        if (result.status !== 'error') {
          const [breeds, groups] = await Promise.all([getAllBreeds(), getAllGroups()]);
          dispatch(groupsUpserted(groups));
          dispatch(breedsUpserted(breeds));
          prefetchThumbnails(breeds);
        }
      } catch (error) {
        dispatch(syncFailed(error instanceof Error ? error.message : 'Sync failed.'));
      } finally {
        isSyncingRef.current = false;
      }
    },
    [dispatch],
  );

  // 1. On launch: show the cache first, then sync if needed.
  useEffect(() => {
    async function bootstrap() {
      dispatch(hydrationStarted());

      let cachedCount = 0;
      let lastSyncedAt: number | null = null;
      try {
        const [breeds, groups, syncState] = await Promise.all([
          getAllBreeds(),
          getAllGroups(),
          getSyncState(),
        ]);
        cachedCount = breeds.length;
        lastSyncedAt = syncState.lastSyncedAt;
        dispatch(syncStateRestored(syncState));
        dispatch(hydratedFromCache({ breeds, groups }));
      } catch {
        // A broken cache must not block the app; a sync can still fill it.
        dispatch(hydrationFailed());
      }

      const connected = isOnline(await NetInfo.fetch());
      dispatch(networkStatusChanged(connected));

      if (connected && (cachedCount === 0 || isStale(lastSyncedAt))) {
        runSync(false);
      }
    }
    bootstrap();
  }, [dispatch, runSync]);

  // 2. When the internet comes back, sync again.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = isOnline(state);
      const wasOnline = onlineRef.current;
      dispatch(networkStatusChanged(connected));

      // Only on the offline -> online change, not on every network event.
      if (connected && !wasOnline) runSync(false);
    });
    return unsubscribe;
  }, [dispatch, runSync]);

  // 3. When the app comes back to the foreground with old data, sync.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !onlineRef.current) return;
      const syncState = await getSyncState();
      if (isStale(syncState.lastSyncedAt)) runSync(false);
    });
    return () => subscription.remove();
  }, [runSync]);

  /** Manual sync: pull-to-refresh and every Retry button. */
  const refresh = useCallback(() => runSync(true), [runSync]);

  return { refresh };
}
