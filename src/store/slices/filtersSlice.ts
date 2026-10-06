/**
 * Filter + search UI state.
 *
 * Pure UI intent — no server data lives here. Multi-select facets are stored
 * as arrays (not Sets) to stay serialisable, which keeps Redux DevTools and
 * state persistence straightforward.
 */

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { CoatCategory, FilterableTraitKey, SizeBand } from '@/types/domain';
import { TRAIT_SCORE_MIN } from '@/types/domain';

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

const INITIAL_STATE: FiltersState = {
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
  initialState: INITIAL_STATE,
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
