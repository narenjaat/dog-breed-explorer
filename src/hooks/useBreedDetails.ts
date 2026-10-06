/**
 * Loads one breed for the detail screen.
 *
 * Cache-first: the Redux projection renders immediately, SQLite fills in the
 * images the list query deliberately skipped, and a network refresh is
 * attempted last. Each stage is optional — offline, the first two still work.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchBreedById } from '@/api/breedsApi';
import { isApiError } from '@/api/errors';
import { getBreedById } from '@/database/repositories/breedRepository';
import { upsertBreeds } from '@/database/repositories/breedRepository';
import { useAppDispatch, useAppSelector } from '@/store';
import { breedUpdated } from '@/store/slices/breedsSlice';
import { selectBreedById, selectIsOnline } from '@/store/selectors';
import type { RootState } from '@/store';
import type { Breed } from '@/types/domain';

export interface UseBreedDetailsResult {
  readonly breed: Breed | null;
  /** True only while there is nothing at all to show. */
  readonly isLoading: boolean;
  /** True while a background refresh runs over already-visible content. */
  readonly isRefreshing: boolean;
  /** Set when the refresh failed but cached content is still on screen. */
  readonly refreshError: string | null;
  readonly refresh: () => void;
}

export function useBreedDetails(breedId: string): UseBreedDetailsResult {
  const dispatch = useAppDispatch();
  const online = useAppSelector(selectIsOnline);
  const cachedBreed = useAppSelector((state: RootState) => selectBreedById(state, breedId));

  const [dbBreed, setDbBreed] = useState<Breed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  /** Images live only in SQLite, so the detail screen always reads them. */
  const loadFromDatabase = useCallback(async (): Promise<Breed | null> => {
    try {
      const stored = await getBreedById(breedId);
      // A network refresh that resolved first holds newer data than this
      // read, so the database copy only fills an empty slot.
      if (mountedRef.current && stored !== null) setDbBreed((current) => current ?? stored);
      return stored;
    } catch {
      // The Redux copy is still usable; it just has no gallery.
      return null;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [breedId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!online) {
      if (mountedRef.current) {
        setRefreshError('You are offline. Showing cached details.');
      }
      return;
    }

    if (mountedRef.current) {
      setIsRefreshing(true);
      setRefreshError(null);
    }

    try {
      const fresh = await fetchBreedById(breedId);
      await upsertBreeds([fresh], Date.now());
      if (!mountedRef.current) return;

      dispatch(breedUpdated(fresh));
      setDbBreed(fresh);
    } catch (error) {
      if (!mountedRef.current) return;
      // Refresh failure is non-fatal: cached content stays on screen.
      const message = isApiError(error)
        ? 'Could not refresh this breed. Showing cached details.'
        : 'Could not refresh this breed.';
      setRefreshError(message);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [breedId, online, dispatch]);

  useEffect(() => {
    mountedRef.current = true;
    void loadFromDatabase();
    return () => {
      mountedRef.current = false;
    };
  }, [loadFromDatabase]);

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  // Prefer the SQLite copy: it is the only one carrying images.
  const breed = dbBreed ?? cachedBreed ?? null;

  return {
    breed,
    isLoading: isLoading && breed === null,
    isRefreshing,
    refreshError,
    refresh: handleRefresh,
  };
}
