/**
 * Memoised selectors.
 *
 * The list screen's whole performance story lives here: filtering and
 * grouping run inside `createSelector`, so they recompute only when the
 * breeds array or a filter value actually changes — not on every render,
 * every keystroke, or every scroll frame.
 */

import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { breedsAdapter, groupsAdapter } from '@/store/slices/breedsSlice';
import type { Breed, BreedGroup } from '@/types/domain';

const breedSelectors = breedsAdapter.getSelectors<RootState>((state) => state.breeds.breeds);
const groupSelectors = groupsAdapter.getSelectors<RootState>((state) => state.breeds.groups);

export const selectAllBreeds = breedSelectors.selectAll;
export const selectBreedTotal = breedSelectors.selectTotal;
export const selectAllGroups = groupSelectors.selectAll;

export const selectIsHydrating = (state: RootState): boolean => state.breeds.isHydrating;

export const selectFilters = (state: RootState) => state.filters;
export const selectSearchInput = (state: RootState): string => state.filters.searchInput;
export const selectSearchQuery = (state: RootState): string => state.filters.searchQuery;

export const selectSyncState = (state: RootState) => state.sync;
export const selectIsOnline = (state: RootState): boolean => state.sync.isOnline;

/** O(1) detail-screen lookup, thanks to the normalised entity map. */
export const selectBreedById = (state: RootState, breedId: string): Breed | undefined =>
  breedSelectors.selectById(state, breedId);

/** Group lookup map, for turning a breed's `group_id` into a label. */
export const selectGroupsById = createSelector(
  [selectAllGroups],
  (groups): ReadonlyMap<string, BreedGroup> => {
    const map = new Map<string, BreedGroup>();
    for (const group of groups) map.set(group.id, group);
    return map;
  },
);

/** True when any facet (not search) is constraining the list. */
export const selectHasActiveFilters = createSelector(
  [selectFilters],
  (filters): boolean =>
    filters.groupIds.length > 0 ||
    filters.sizeBands.length > 0 ||
    filters.coatCategories.length > 0 ||
    filters.hypoallergenic !== null ||
    filters.traitKey !== null,
);

export const selectActiveFilterCount = createSelector([selectFilters], (filters): number => {
  let count = filters.groupIds.length + filters.sizeBands.length + filters.coatCategories.length;
  if (filters.hypoallergenic !== null) count += 1;
  if (filters.traitKey !== null) count += 1;
  return count;
});

/**
 * Applies every facet to the breed list.
 *
 * Recomputes only when breeds or filters change. Cheap scalar comparisons
 * come first so an expensive substring search is skipped for rows already
 * excluded by a group or size facet.
 */
export const selectFilteredBreeds = createSelector(
  [selectAllBreeds, selectFilters],
  (breeds, filters): readonly Breed[] => {
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
  readonly id: string;
  readonly title: string;
  readonly data: readonly Breed[];
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
  (breeds, groupsById): readonly BreedSection[] => {
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
