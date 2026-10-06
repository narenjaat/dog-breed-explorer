/**
 * Loads one breed for the detail screen.
 *
 * Cache first: the Redux copy shows immediately, SQLite adds the images (the
 * list never loads them), and a network refresh runs last. Offline, the first
 * two still work.
 */

import { useCallback, useEffect, useState } from 'react';

import { fetchBreedById } from '@/api/dogApi';
import { getBreedById, upsertBreeds } from '@/database/repository';
import { useAppDispatch, useAppSelector, breedUpdated } from '@/store';
import { selectBreedById, selectIsOnline } from '@/store/selectors';
import type { RootState } from '@/store';
import type { Breed } from '@/types';

export function useBreedDetails(breedId: string) {
  const dispatch = useAppDispatch();
  const online = useAppSelector(selectIsOnline);
  const cachedBreed = useAppSelector((state: RootState) => selectBreedById(state, breedId));

  const [dbBreed, setDbBreed] = useState<Breed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Step 1: read the breed (with its images) from SQLite.
  useEffect(() => {
    getBreedById(breedId)
      .then((stored) => {
        // If a network refresh already finished, its data is newer: keep it.
        if (stored !== null) setDbBreed((current) => current ?? stored);
      })
      .catch(() => {
        // The Redux copy still works; it just has no gallery.
      })
      .finally(() => setIsLoading(false));
  }, [breedId]);

  // Step 2 (called by the screen): fetch a fresh copy from the API.
  const refresh = useCallback(async () => {
    if (!online) {
      setRefreshError('You are offline. Showing cached details.');
      return;
    }

    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await fetchBreedById(breedId);
      await upsertBreeds([fresh], Date.now());
      dispatch(breedUpdated(fresh));
      setDbBreed(fresh);
    } catch {
      // Not fatal: the cached details stay on screen.
      setRefreshError('Could not refresh this breed. Showing cached details.');
    } finally {
      setIsRefreshing(false);
    }
  }, [breedId, online, dispatch]);

  // Prefer the SQLite copy: it is the only one with images.
  const breed = dbBreed ?? cachedBreed ?? null;

  return {
    breed,
    /** True only while there is nothing at all to show. */
    isLoading: isLoading && breed === null,
    isRefreshing,
    refreshError,
    refresh,
  };
}
