/**
 * Redux store: three slices, typed hooks.
 *
 *  - breeds:  normalised in-memory projection of the SQLite cache
 *  - filters: search and filter UI intent
 *  - sync:    sync status and connectivity, rendered by the banner
 *
 * Anything derivable is computed in a memoised selector (selectors.ts), never
 * stored.
 */

import { createEntityAdapter, createSlice, configureStore } from '@reduxjs/toolkit';
import type { EntityState, PayloadAction } from '@reduxjs/toolkit';
import type {
  Breed,
  BreedGroup,
  CoatCategory,
  FilterableTraitKey,
  SizeBand,
  SyncResult,
  SyncState,
} from '@/types';
import { TRAIT_SCORE_MIN, INITIAL_SYNC_STATE } from '@/types';
import { useDispatch, useSelector } from 'react-redux';

// ---- Breeds slice ------------------------------------------------------------
//
// `createEntityAdapter` (from Redux Toolkit) stores a list as:
//   { ids: ['id-1', 'id-2'], entities: { 'id-1': breed1, 'id-2': breed2 } }
// so one breed can be found by id instantly. It also gives ready-made update
// functions, used in the reducers below:
//   setAll(state, list)      -> replace everything with `list`
//   upsertMany(state, list)  -> add new items, update existing ones, delete nothing
//   upsertOne(state, item)   -> same, for a single item
// `sortComparer` keeps `ids` in A-Z order, so the list never sorts during render.

export const breedsAdapter = createEntityAdapter<Breed>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export const groupsAdapter = createEntityAdapter<BreedGroup>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export interface BreedsState {
  breeds: EntityState<Breed, string>; // { ids, entities } for breeds
  groups: EntityState<BreedGroup, string>; // { ids, entities } for groups
  /** True until the first load attempt resolves, for the skeleton state. */
  isHydrating: boolean;
}

const INITIAL_BREEDS_STATE: BreedsState = {
  breeds: breedsAdapter.getInitialState(), // { ids: [], entities: {} }
  groups: groupsAdapter.getInitialState(),
  isHydrating: true,
};

const breedsSlice = createSlice({
  name: 'breeds',
  initialState: INITIAL_BREEDS_STATE,
  reducers: {
    hydrationStarted(state) {
      state.isHydrating = true;
    },
    /** App start: replace everything with what SQLite has. */
    hydratedFromCache(state, action: PayloadAction<{ breeds: Breed[]; groups: BreedGroup[] }>) {
      breedsAdapter.setAll(state.breeds, action.payload.breeds);
      groupsAdapter.setAll(state.groups, action.payload.groups);
      state.isHydrating = false;
    },
    /** The cache could not be read; the network path can still fill it. */
    hydrationFailed(state) {
      state.isHydrating = false;
    },
    /**
     * After a sync. `upsertMany`, not `setAll`: if a page failed, its breeds
     * are missing from this list, and they must not be deleted.
     */
    breedsUpserted(state, action: PayloadAction<Breed[]>) {
      breedsAdapter.upsertMany(state.breeds, action.payload);
      state.isHydrating = false;
    },
    groupsUpserted(state, action: PayloadAction<BreedGroup[]>) {
      groupsAdapter.upsertMany(state.groups, action.payload);
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

export interface FiltersState {
  /** Raw text from the input, updated on every keystroke. */
  searchInput: string;
  /** Debounced text that actually drives querying. */
  searchQuery: string;
  groupIds: string[];
  sizeBands: SizeBand[];
  coatCategories: CoatCategory[];
  /** true=only hypoallergenic, false=only non-, null=no constraint. */
  hypoallergenic: boolean | null;
  traitKey: FilterableTraitKey | null;
  traitMinScore: number;
}

const INITIAL_FILTERS_STATE: FiltersState = {
  searchInput: '',
  searchQuery: '',
  groupIds: [],
  sizeBands: [],
  coatCategories: [],
  hypoallergenic: null,
  traitKey: null,
  traitMinScore: TRAIT_SCORE_MIN,
};

/** Multi-select: removes the value if present, adds it otherwise. */
function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

const filtersSlice = createSlice({
  name: 'filters',
  initialState: INITIAL_FILTERS_STATE,
  reducers: {
    /** Fires on every keystroke; does not trigger a query by itself. */
    searchInputChanged(state, action: PayloadAction<string>) {
      state.searchInput = action.payload;
    },
    /** Fires after the debounce interval; this is what the query reads. */
    searchQueryCommitted(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    searchCleared(state) {
      state.searchInput = '';
      state.searchQuery = '';
    },
    groupToggled(state, action: PayloadAction<string>) {
      state.groupIds = toggle(state.groupIds, action.payload);
    },
    sizeBandToggled(state, action: PayloadAction<SizeBand>) {
      state.sizeBands = toggle(state.sizeBands, action.payload);
    },
    coatCategoryToggled(state, action: PayloadAction<CoatCategory>) {
      state.coatCategories = toggle(state.coatCategories, action.payload);
    },
    /** Tri-state: selecting the active value clears the constraint. */
    hypoallergenicToggled(state, action: PayloadAction<boolean>) {
      state.hypoallergenic = state.hypoallergenic === action.payload ? null : action.payload;
    },
    /** Selecting the active trait clears it; switching keeps the threshold. */
    traitKeyToggled(state, action: PayloadAction<FilterableTraitKey>) {
      if (state.traitKey === action.payload) {
        state.traitKey = null;
        state.traitMinScore = TRAIT_SCORE_MIN;
      } else {
        state.traitKey = action.payload;
      }
    },
    traitMinScoreChanged(state, action: PayloadAction<number>) {
      state.traitMinScore = action.payload;
    },
    allFiltersCleared(state) {
      state.groupIds = [];
      state.sizeBands = [];
      state.coatCategories = [];
      state.hypoallergenic = null;
      state.traitKey = null;
      state.traitMinScore = TRAIT_SCORE_MIN;
    },
  },
});

export const {
  allFiltersCleared,
  coatCategoryToggled,
  groupToggled,
  hypoallergenicToggled,
  searchCleared,
  searchInputChanged,
  searchQueryCommitted,
  sizeBandToggled,
  traitKeyToggled,
  traitMinScoreChanged,
} = filtersSlice.actions;

export const filtersReducer = filtersSlice.reducer;

export interface SyncSliceState extends SyncState {
  isOnline: boolean;
  /** True when the user pulled to refresh, to distinguish from auto-sync. */
  isManualRefresh: boolean;
}

const INITIAL_SYNC_SLICE_STATE: SyncSliceState = {
  ...INITIAL_SYNC_STATE,
  isOnline: true,
  isManualRefresh: false,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState: INITIAL_SYNC_SLICE_STATE,
  reducers: {
    /** Restores persisted sync metadata at startup. */
    syncStateRestored(state, action: PayloadAction<SyncState>) {
      Object.assign(state, action.payload);
    },
    syncStarted(state, action: PayloadAction<{ manual: boolean }>) {
      state.status = 'syncing';
      state.isManualRefresh = action.payload.manual;
    },
    syncFinished(state, action: PayloadAction<SyncResult>) {
      const result = action.payload;
      state.status = result.status;
      state.failedPages = result.failedPages;
      state.lastError = result.error;
      state.isManualRefresh = false;

      // A failed run must not advance the freshness timestamp: the cache is
      // exactly as old as it was before.
      if (result.status !== 'error') {
        state.lastSyncedAt = result.syncedAt;
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
    },
  },
});

export const { networkStatusChanged, syncFailed, syncFinished, syncStarted, syncStateRestored } =
  syncSlice.actions;

export const syncReducer = syncSlice.reducer;

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

// The shape of the whole state ({ breeds, filters, sync }), worked out by
// TypeScript from the reducers above, so it never goes out of date.
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/** Typed versions of useDispatch/useSelector, so components get autocomplete. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
