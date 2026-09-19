/**
 * Store composition and typed hooks.
 *
 * Three slices only: normalised server-data projection (breeds), UI intent
 * (filters) and sync/connectivity (sync). Anything derivable is computed in a
 * memoised selector rather than stored.
 */

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';

import { breedsReducer } from '@/store/slices/breedsSlice';
import { filtersReducer } from '@/store/slices/filtersSlice';
import { syncReducer } from '@/store/slices/syncSlice';

export const store = configureStore({
  reducer: {
    breeds: breedsReducer,
    filters: filtersReducer,
    sync: syncReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Breed objects are plain and deeply nested; the default deep checks
      // walk all 283 records on every dispatch, which is measurable jank in
      // dev. Types already guarantee serialisability here.
      serializableCheck: false,
      immutableCheck: { warnAfter: 100 },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;

/** Typed hooks — components never import the untyped react-redux versions. */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore: () => AppStore = useStore;
