/**
 * Normalised cache of breeds and groups.
 *
 * `createEntityAdapter` gives us an id-keyed map plus a sorted id array, so
 * a detail screen lookup is O(1) instead of a scan, and the list renders from
 * a stable array of ids. SQLite remains the durable store; this is the
 * in-memory projection the UI renders from.
 */

import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import type { EntityState, PayloadAction } from '@reduxjs/toolkit';

import type { Breed, BreedGroup } from '@/types/domain';

export const breedsAdapter = createEntityAdapter<Breed>({
  // Sorted once on write so the list never sorts 283 rows during render.
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export const groupsAdapter = createEntityAdapter<BreedGroup>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export interface BreedsState {
  readonly breeds: EntityState<Breed, string>;
  readonly groups: EntityState<BreedGroup, string>;
  /** True until the first load attempt resolves, for the skeleton state. */
  readonly isHydrating: boolean;
}

const INITIAL_STATE: BreedsState = {
  breeds: breedsAdapter.getInitialState(),
  groups: groupsAdapter.getInitialState(),
  isHydrating: true,
};

const breedsSlice = createSlice({
  name: 'breeds',
  initialState: INITIAL_STATE,
  reducers: {
    hydrationStarted(state) {
      state.isHydrating = true;
    },
    /**
     * Replaces the projection with what the local cache holds.
     * `setAll` is correct here (unlike for sync writes) because the cache is
     * the single source of truth for what the app knows.
     */
    hydratedFromCache(
      state,
      action: PayloadAction<{ breeds: readonly Breed[]; groups: readonly BreedGroup[] }>,
    ) {
      breedsAdapter.setAll(state.breeds, action.payload.breeds as Breed[]);
      groupsAdapter.setAll(state.groups, action.payload.groups as BreedGroup[]);
      state.isHydrating = false;
    },
    /** The cache could not be read; the network path can still fill it. */
    hydrationFailed(state) {
      state.isHydrating = false;
    },
    /**
     * Applies freshly-synced records. `upsertMany` (not `setAll`) so a partial
     * sync adds and updates without deleting breeds whose page failed.
     */
    breedsUpserted(state, action: PayloadAction<readonly Breed[]>) {
      breedsAdapter.upsertMany(state.breeds, action.payload as Breed[]);
      state.isHydrating = false;
    },
    groupsUpserted(state, action: PayloadAction<readonly BreedGroup[]>) {
      groupsAdapter.upsertMany(state.groups, action.payload as BreedGroup[]);
    },
    /** Replaces a single breed after a detail-screen refresh. */
    breedUpdated(state, action: PayloadAction<Breed>) {
      breedsAdapter.upsertOne(state.breeds, action.payload);
    },
  },
});

export const {
  breedUpdated,
  breedsUpserted,
  groupsUpserted,
  hydratedFromCache,
  hydrationFailed,
  hydrationStarted,
} = breedsSlice.actions;

export const breedsReducer = breedsSlice.reducer;
