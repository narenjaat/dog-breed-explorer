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
  SyncStatus,
} from '@/types';
import { TRAIT_SCORE_MIN, INITIAL_SYNC_STATE } from '@/types';
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';

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

const INITIAL_BREEDS_STATE: BreedsState = {
  breeds: breedsAdapter.getInitialState(),
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

export interface FiltersState {
  /** Raw text from the input, updated on every keystroke. */
  readonly searchInput: string;
  /** Debounced text that actually drives querying. */
  readonly searchQuery: string;
  readonly groupIds: readonly string[];
  readonly sizeBands: readonly SizeBand[];
  readonly coatCategories: readonly CoatCategory[];
  /** true=only hypoallergenic, false=only non-, null=no constraint. */
  readonly hypoallergenic: boolean | null;
  readonly traitKey: FilterableTraitKey | null;
  readonly traitMinScore: number;
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

/** Adds or removes a value — the multi-select toggle semantics. */
function toggle<T>(values: readonly T[], value: T): readonly T[] {
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
      state.groupIds = [...toggle(state.groupIds, action.payload)];
    },
    sizeBandToggled(state, action: PayloadAction<SizeBand>) {
      state.sizeBands = [...toggle(state.sizeBands, action.payload)];
    },
    coatCategoryToggled(state, action: PayloadAction<CoatCategory>) {
      state.coatCategories = [...toggle(state.coatCategories, action.payload)];
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
  readonly isOnline: boolean;
  /** True when the user pulled to refresh, to distinguish from auto-sync. */
  readonly isManualRefresh: boolean;
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
      const restored = action.payload;
      state.status = restored.status;
      state.lastSyncedAt = restored.lastSyncedAt;
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
export type { SyncStatus };

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

/** Typed hooks — components never import the untyped react-redux versions. */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
