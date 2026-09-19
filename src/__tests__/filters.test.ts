/**
 * Filter, search and grouping tests, exercised through the real store so the
 * reducers and memoised selectors are covered together.
 */

import { configureStore } from '@reduxjs/toolkit';

import { parseBreed } from '@/api/parsers';
import { breedsReducer, hydratedFromCache } from '@/store/slices/breedsSlice';
import {
  allFiltersCleared,
  coatCategoryToggled,
  filtersReducer,
  groupToggled,
  hypoallergenicToggled,
  searchQueryCommitted,
  sizeBandToggled,
  traitKeyToggled,
  traitMinScoreChanged,
} from '@/store/slices/filtersSlice';
import { syncReducer } from '@/store/slices/syncSlice';
import {
  selectActiveFilterCount,
  selectFilteredBreeds,
  selectGroupedBreeds,
  selectHasActiveFilters,
} from '@/store/selectors';
import type { RootState } from '@/store';
import type { ApiBreedResource } from '@/types/api';
import type { Breed, BreedGroup } from '@/types/domain';
import { GROUP_IDS } from '@/__tests__/fixtures';

function makeStore() {
  return configureStore({
    reducer: { breeds: breedsReducer, filters: filtersReducer, sync: syncReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

/** Builds a breed with precisely the facets a test needs. */
function buildBreed(options: {
  id: string;
  name: string;
  groupId?: string;
  weightKg?: number;
  coatType?: string;
  coatLength?: string;
  hypoallergenic?: boolean;
  goodWithChildren?: number;
  otherNames?: readonly string[];
}): Breed {
  const weight = options.weightKg ?? 15;
  const resource: ApiBreedResource = {
    id: options.id,
    type: 'breed',
    attributes: {
      name: options.name,
      male_weight: { min: weight, max: weight },
      female_weight: { min: weight, max: weight },
      male_height: {},
      female_height: {},
      hypoallergenic: options.hypoallergenic ?? false,
      coat: { type: options.coatType ?? 'smooth', length: options.coatLength ?? 'short' },
      traits:
        options.goodWithChildren === undefined
          ? {}
          : { good_with_children: options.goodWithChildren },
      other_names: options.otherNames ?? [],
      images: [],
    },
    relationships: {
      group: { data: { id: options.groupId ?? GROUP_IDS.herding, type: 'group' } },
    },
  };

  const breed = parseBreed(resource);
  if (breed === null) throw new Error(`failed to build ${options.id}`);
  return breed;
}

const GROUPS: readonly BreedGroup[] = [
  { id: GROUP_IDS.herding, name: 'Herding Group' },
  { id: GROUP_IDS.hound, name: 'Hound Group' },
  { id: GROUP_IDS.toy, name: 'Toy Group' },
];

const BREEDS: readonly Breed[] = [
  buildBreed({
    id: 'b1',
    name: 'Border Collie',
    groupId: GROUP_IDS.herding,
    weightKg: 18,
    coatLength: 'medium',
    coatType: 'double',
    goodWithChildren: 4,
  }),
  buildBreed({
    id: 'b2',
    name: 'Chihuahua',
    groupId: GROUP_IDS.toy,
    weightKg: 3,
    coatLength: 'short',
    goodWithChildren: 2,
    otherNames: ['Chi'],
  }),
  buildBreed({
    id: 'b3',
    name: 'Poodle',
    groupId: GROUP_IDS.toy,
    weightKg: 8,
    coatType: 'curly',
    coatLength: 'medium',
    hypoallergenic: true,
    goodWithChildren: 5,
  }),
  buildBreed({
    id: 'b4',
    name: 'Irish Wolfhound',
    groupId: GROUP_IDS.hound,
    weightKg: 60,
    coatType: 'wire',
    coatLength: 'medium',
    goodWithChildren: 5,
  }),
  buildBreed({
    id: 'b5',
    name: 'Beagle',
    groupId: GROUP_IDS.hound,
    weightKg: 11,
    coatLength: 'short',
    goodWithChildren: 5,
    otherNames: ['English Beagle'],
  }),
];

function seededStore() {
  const store = makeStore();
  store.dispatch(hydratedFromCache({ breeds: BREEDS, groups: GROUPS }));
  return store;
}

const namesOf = (breeds: readonly Breed[]): readonly string[] =>
  breeds.map((breed) => breed.name).sort();

describe('search', () => {
  it('returns everything when the query is empty', () => {
    const store = seededStore();
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(5);
  });

  it('matches breed names case-insensitively', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('poodle'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Poodle']);
  });

  it('matches partial names', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('collie'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Border Collie']);
  });

  it('matches other_names, not just the primary name', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('english beagle'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Beagle']);
  });

  it('ignores surrounding whitespace', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('  chihuahua  '));
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(1);
  });

  it('returns nothing for a query that matches no breed', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('velociraptor'));
    expect(selectFilteredBreeds(store.getState() as RootState)).toEqual([]);
  });
});

describe('facet filters', () => {
  it('filters by a single group', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual([
      'Chihuahua',
      'Poodle',
    ]);
  });

  it('ORs multiple values within one facet', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    store.dispatch(groupToggled(GROUP_IDS.hound));
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(4);
  });

  it('removes a group when toggled twice', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    store.dispatch(groupToggled(GROUP_IDS.toy));
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(5);
  });

  it('filters by size band', () => {
    const store = seededStore();
    store.dispatch(sizeBandToggled('giant'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual([
      'Irish Wolfhound',
    ]);
  });

  it('filters by coat category', () => {
    const store = seededStore();
    store.dispatch(coatCategoryToggled('curly'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Poodle']);
  });

  it('filters by hypoallergenic yes', () => {
    const store = seededStore();
    store.dispatch(hypoallergenicToggled(true));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Poodle']);
  });

  it('filters by hypoallergenic no', () => {
    const store = seededStore();
    store.dispatch(hypoallergenicToggled(false));
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(4);
  });

  it('clears the hypoallergenic constraint when the same value is re-selected', () => {
    const store = seededStore();
    store.dispatch(hypoallergenicToggled(true));
    store.dispatch(hypoallergenicToggled(true));
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(5);
  });

  it('filters by a trait threshold', () => {
    const store = seededStore();
    store.dispatch(traitKeyToggled('good_with_children'));
    store.dispatch(traitMinScoreChanged(5));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual([
      'Beagle',
      'Irish Wolfhound',
      'Poodle',
    ]);
  });

  it('excludes breeds with no score for the filtered trait', () => {
    const unrated = buildBreed({ id: 'b6', name: 'Unrated Dog', weightKg: 12 });
    const store = makeStore();
    store.dispatch(hydratedFromCache({ breeds: [...BREEDS, unrated], groups: GROUPS }));
    store.dispatch(traitKeyToggled('good_with_children'));
    store.dispatch(traitMinScoreChanged(1));

    // A missing score is "unknown", not "scores 1".
    const names = namesOf(selectFilteredBreeds(store.getState() as RootState));
    expect(names).not.toContain('Unrated Dog');
  });
});

describe('composed filters', () => {
  it('ANDs different facets together', () => {
    // Toy group + small + hypoallergenic + good_with_children >= 4
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    store.dispatch(sizeBandToggled('small'));
    store.dispatch(hypoallergenicToggled(true));
    store.dispatch(traitKeyToggled('good_with_children'));
    store.dispatch(traitMinScoreChanged(4));

    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Poodle']);
  });

  it('combines a search term with facets', () => {
    const store = seededStore();
    // "wolf" matches only the wolfhound; the giant facet must not exclude it.
    store.dispatch(searchQueryCommitted('wolf'));
    store.dispatch(sizeBandToggled('giant'));
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual([
      'Irish Wolfhound',
    ]);
  });

  it('can produce an empty result from an over-constrained combination', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.hound));
    store.dispatch(hypoallergenicToggled(true));
    expect(selectFilteredBreeds(store.getState() as RootState)).toEqual([]);
  });

  it('restores the full list when filters are cleared', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    store.dispatch(sizeBandToggled('small'));
    store.dispatch(allFiltersCleared());
    expect(selectFilteredBreeds(store.getState() as RootState)).toHaveLength(5);
  });

  it('leaves the search term intact when only facets are cleared', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('poodle'));
    store.dispatch(groupToggled(GROUP_IDS.hound));
    store.dispatch(allFiltersCleared());
    expect(namesOf(selectFilteredBreeds(store.getState() as RootState))).toEqual(['Poodle']);
  });
});

describe('filter bookkeeping', () => {
  it('counts each selected facet value', () => {
    const store = seededStore();
    store.dispatch(groupToggled(GROUP_IDS.toy));
    store.dispatch(groupToggled(GROUP_IDS.hound));
    store.dispatch(sizeBandToggled('small'));
    store.dispatch(hypoallergenicToggled(true));

    expect(selectActiveFilterCount(store.getState() as RootState)).toBe(4);
    expect(selectHasActiveFilters(store.getState() as RootState)).toBe(true);
  });

  it('does not count a search term as a filter', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('poodle'));
    expect(selectActiveFilterCount(store.getState() as RootState)).toBe(0);
    expect(selectHasActiveFilters(store.getState() as RootState)).toBe(false);
  });
});

describe('grouping', () => {
  it('buckets breeds under their group, sorted by group name', () => {
    const store = seededStore();
    const sections = selectGroupedBreeds(store.getState() as RootState);

    expect(sections.map((section) => section.title)).toEqual([
      'Herding Group',
      'Hound Group',
      'Toy Group',
    ]);
    expect(sections[1]?.data.map((breed) => breed.name)).toEqual(['Beagle', 'Irish Wolfhound']);
  });

  it('only includes sections that still have matches after filtering', () => {
    const store = seededStore();
    store.dispatch(sizeBandToggled('giant'));

    const sections = selectGroupedBreeds(store.getState() as RootState);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Hound Group');
  });

  it('places breeds with no group in a trailing "Other breeds" section', () => {
    const orphan = buildBreed({ id: 'b7', name: 'Orphan Dog' });
    const withoutGroup: Breed = { ...orphan, groupId: null };

    const store = makeStore();
    store.dispatch(hydratedFromCache({ breeds: [...BREEDS, withoutGroup], groups: GROUPS }));

    const sections = selectGroupedBreeds(store.getState() as RootState);
    expect(sections[sections.length - 1]?.title).toBe('Other breeds');
  });

  it('returns no sections when nothing matches', () => {
    const store = seededStore();
    store.dispatch(searchQueryCommitted('nothing matches this'));
    expect(selectGroupedBreeds(store.getState() as RootState)).toEqual([]);
  });
});

describe('selector memoisation', () => {
  it('returns the same array reference when nothing relevant changed', () => {
    const store = seededStore();
    const first = selectFilteredBreeds(store.getState() as RootState);
    const second = selectFilteredBreeds(store.getState() as RootState);

    // Referential stability is what keeps the list from re-rendering on
    // every unrelated dispatch.
    expect(first).toBe(second);
  });

  it('returns a new reference once a filter changes', () => {
    const store = seededStore();
    const before = selectFilteredBreeds(store.getState() as RootState);
    store.dispatch(sizeBandToggled('small'));
    expect(selectFilteredBreeds(store.getState() as RootState)).not.toBe(before);
  });
});
