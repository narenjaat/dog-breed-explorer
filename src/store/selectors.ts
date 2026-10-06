/**
 * Selectors: small functions that read data out of the Redux state.
 *
 * Breeds and groups are stored "normalised" (see store/index.ts):
 *
 *   state.breeds.breeds = {
 *     ids:      ['id-1', 'id-2', ...],              // the A-Z order
 *     entities: { 'id-1': {...}, 'id-2': {...} },   // id -> breed object
 *   }
 *
 * `createSelector` remembers its last result and only recomputes when its
 * inputs change. So filtering 283 breeds runs when a filter changes, not on
 * every render or scroll frame.
 */

import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { Breed, BreedGroup } from '@/types';

/** All breeds as an array, A-Z. */
export const selectAllBreeds = createSelector(
  [(state: RootState) => state.breeds.breeds],
  (breeds) => breeds.ids.map((id) => breeds.entities[id]),
);

/** How many breeds are cached (283 after a full sync). */
export const selectBreedTotal = (state: RootState) => state.breeds.breeds.ids.length;

/** All groups as an array, A-Z. */
export const selectAllGroups = createSelector(
  [(state: RootState) => state.breeds.groups],
  (groups) => groups.ids.map((id) => groups.entities[id]),
);

/** One breed by id. A direct object lookup, no searching through the list. */
export const selectBreedById = (state: RootState, breedId: string): Breed | undefined =>
  state.breeds.breeds.entities[breedId];

export const selectIsHydrating = (state: RootState): boolean => state.breeds.isHydrating;

export const selectFilters = (state: RootState) => state.filters;
export const selectSearchInput = (state: RootState): string => state.filters.searchInput;
export const selectSearchQuery = (state: RootState): string => state.filters.searchQuery;

export const selectSyncState = (state: RootState) => state.sync;
export const selectIsOnline = (state: RootState): boolean => state.sync.isOnline;

/** Group lookup map, for turning a breed's `group_id` into a label. */
export const selectGroupsById = createSelector(
  [selectAllGroups],
  (groups) => new Map<string, BreedGroup>(groups.map((group) => [group.id, group])),
);

export const selectActiveFilterCount = createSelector([selectFilters], (filters): number => {
  let count = filters.groupIds.length + filters.sizeBands.length + filters.coatCategories.length;
  if (filters.hypoallergenic !== null) count += 1;
  if (filters.traitKey !== null) count += 1;
  return count;
});

/** True when any filter (not search) is narrowing the list. */
export const selectHasActiveFilters = (state: RootState) => selectActiveFilterCount(state) > 0;

/**
 * Applies every facet to the breed list.
 *
 * Recomputes only when breeds or filters change. Cheap scalar comparisons
 * come first so an expensive substring search is skipped for rows already
 * excluded by a group or size facet.
 */
export const selectFilteredBreeds = createSelector(
  [selectAllBreeds, selectFilters],
  (breeds, filters): Breed[] => {
    const {
      searchQuery,
      groupIds,
      sizeBands,
      coatCategories,
      hypoallergenic,
      traitKey,
      traitMinScore,
    } = filters;

    const needle = searchQuery.trim().toLowerCase();
    const hasSearch = needle.length > 0;
    const hasGroups = groupIds.length > 0;
    const hasSizes = sizeBands.length > 0;
    const hasCoats = coatCategories.length > 0;

    if (
      !hasSearch &&
      !hasGroups &&
      !hasSizes &&
      !hasCoats &&
      hypoallergenic === null &&
      traitKey === null
    ) {
      return breeds;
    }

    return breeds.filter((breed) => {
      if (hasGroups && (breed.groupId === null || !groupIds.includes(breed.groupId))) return false;
      if (hasSizes && (breed.sizeBand === null || !sizeBands.includes(breed.sizeBand)))
        return false;
      if (
        hasCoats &&
        (breed.coatCategory === null || !coatCategories.includes(breed.coatCategory))
      ) {
        return false;
      }
      if (hypoallergenic !== null && breed.hypoallergenic !== hypoallergenic) return false;

      if (traitKey !== null) {
        const score = breed.traits.scores[traitKey];
        // A breed with no score for this trait is excluded rather than
        // treated as 0 — we do not know that it scores badly.
        if (score === null || score < traitMinScore) return false;
      }

      // Haystack is prebuilt and lowercased at parse time, so this is a
      // plain substring test over name + other_names.
      if (hasSearch && !breed.searchHaystack.includes(needle)) return false;

      return true;
    });
  },
);

/** One section of the grouped list. */
export interface BreedSection {
  id: string;
  title: string;
  data: Breed[];
}

const UNGROUPED_ID = '__ungrouped__';
const UNGROUPED_TITLE = 'Other breeds';

/**
 * Buckets the filtered breeds by group for the sectioned list.
 *
 * Breeds keep their alphabetical order inside each section (the entity
 * adapter already sorted them), and sections are alphabetical, with
 * "Other breeds" pinned last so an unclassified bucket never leads the list.
 */
export const selectGroupedBreeds = createSelector(
  [selectFilteredBreeds, selectGroupsById],
  (breeds, groupsById): BreedSection[] => {
    const buckets = new Map<string, Breed[]>();

    for (const breed of breeds) {
      const key = breed.groupId ?? UNGROUPED_ID;
      const bucket = buckets.get(key);
      if (bucket === undefined) buckets.set(key, [breed]);
      else bucket.push(breed);
    }

    const sections: BreedSection[] = [];
    for (const [groupId, data] of buckets) {
      const group = groupsById.get(groupId);
      sections.push({
        id: groupId,
        // Falls back to a readable label when groups have not synced yet.
        title: group?.name ?? (groupId === UNGROUPED_ID ? UNGROUPED_TITLE : 'Unknown group'),
        data,
      });
    }

    sections.sort((a, b) => {
      if (a.id === UNGROUPED_ID) return 1;
      if (b.id === UNGROUPED_ID) return -1;
      return a.title.localeCompare(b.title);
    });

    return sections;
  },
);

export const selectFilteredCount = createSelector(
  [selectFilteredBreeds],
  (breeds): number => breeds.length,
);
