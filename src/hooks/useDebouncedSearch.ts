/**
 * Debounced search.
 *
 * The input value updates on every keystroke (so typing never feels laggy),
 * but the committed query — which triggers refiltering all 283 breeds —
 * settles only after the user pauses.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import {
  searchCleared,
  searchInputChanged,
  searchQueryCommitted,
} from '@/store/slices/filtersSlice';
import { selectSearchInput } from '@/store/selectors';

/** 250ms: long enough to skip intermediate keystrokes, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface UseDebouncedSearchResult {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onClear: () => void;
}

export function useDebouncedSearch(
  debounceMs: number = SEARCH_DEBOUNCE_MS,
): UseDebouncedSearchResult {
  const dispatch = useAppDispatch();
  const value = useAppSelector(selectSearchInput);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onChangeText = useCallback(
    (text: string) => {
      dispatch(searchInputChanged(text));
      clearTimer();
      timerRef.current = setTimeout(() => {
        dispatch(searchQueryCommitted(text));
        timerRef.current = null;
      }, debounceMs);
    },
    [dispatch, debounceMs, clearTimer],
  );

  const onClear = useCallback(() => {
    // Clearing is intentional and immediate: waiting 250ms to restore the
    // full list after tapping ✕ feels broken.
    clearTimer();
    dispatch(searchCleared());
  }, [dispatch, clearTimer]);

  // Cancel a pending commit if the screen unmounts mid-debounce.
  useEffect(() => clearTimer, [clearTimer]);

  return { value, onChangeText, onClear };
}
