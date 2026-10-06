/**
 * Shared types: the domain model the app renders, and sync state.
 *
 * Nullable API fields are resolved to explicit `null`, and derived facets
 * (size band, coat category, search haystack) are computed once at parse time.
 */

export type SizeBand = 'small' | 'medium' | 'large' | 'giant';
export const SIZE_BANDS: SizeBand[] = ['small', 'medium', 'large', 'giant'];

export type CoatCategory = 'short' | 'medium' | 'long' | 'wire' | 'curly' | 'hairless';
export const COAT_CATEGORIES: CoatCategory[] = [
  'short',
  'medium',
  'long',
  'wire',
  'curly',
  'hairless',
];

/** The ten 1-5 trait scores. (`exercise_minutes` is minutes, not a score.) */
export type ScoredTraitKey =
  | 'energy'
  | 'barking'
  | 'drooling'
  | 'grooming'
  | 'shedding'
  | 'trainability'
  | 'good_with_dogs'
  | 'apartment_friendly'
  | 'good_with_children'
  | 'good_with_strangers';

export const SCORED_TRAIT_KEYS: ScoredTraitKey[] = [
  'energy',
  'barking',
  'drooling',
  'grooming',
  'shedding',
  'trainability',
  'good_with_dogs',
  'apartment_friendly',
  'good_with_children',
  'good_with_strangers',
];

/** Traits the list can filter by ("good with children: 4+"). */
export type FilterableTraitKey = 'good_with_children' | 'good_with_dogs' | 'good_with_strangers';
export const FILTERABLE_TRAIT_KEYS: FilterableTraitKey[] = [
  'good_with_children',
  'good_with_dogs',
  'good_with_strangers',
];

export const TRAIT_SCORE_MIN = 1;
export const TRAIT_SCORE_MAX = 5;

/** A numeric range where either bound may be unknown. */
export interface Range {
  min: number | null;
  max: number | null;
}

export interface Origin {
  era: string | null;
  region: string | null;
  country: string | null;
}

export interface Coat {
  type: string | null;
  length: string | null;
  colors: string[];
}

/** Scores keyed by trait; a missing trait is `null`, never 0. */
export type TraitScores = Record<ScoredTraitKey, number | null>;

export interface Traits {
  scores: TraitScores;
  /** Minutes of daily exercise (observed 20..120), or null. */
  exerciseMinutes: number | null;
  temperament: string[];
}

export interface ImageAttribution {
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export interface BreedImage {
  id: string;
  breedId: string;
  /** Position in the API's ordering; index 0 is used as the list thumbnail. */
  position: number;
  thumbUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  attribution: ImageAttribution;
}

export interface BreedSource {
  url: string | null;
  title: string | null;
}

export interface Breed {
  id: string;
  name: string;
  description: string | null;
  groupId: string | null;
  life: Range;
  maleWeight: Range;
  femaleWeight: Range;
  maleHeight: Range;
  femaleHeight: Range;
  hypoallergenic: boolean | null;
  origin: Origin;
  coat: Coat;
  traits: Traits;
  otherNames: string[];
  recognizedBy: string[];
  sources: BreedSource[];
  images: BreedImage[];

  // ---- Derived facets (computed once at parse time) ----
  /** Size band derived from weight, falling back to height. Null when unknown. */
  sizeBand: SizeBand | null;
  /** Coat category merging API `coat.type` and `coat.length`. Null when unknown. */
  coatCategory: CoatCategory | null;
  /** Lowercased "name + other names", precomputed for debounced search. */
  searchHaystack: string;
  /** First available thumbnail URL — what the list row renders. */
  thumbnailUrl: string | null;
}

export interface BreedGroup {
  id: string;
  name: string;
}

export type SyncStatus =
  | 'idle' // never run this session, nothing in flight
  | 'syncing' // a run is in flight
  | 'success' // last run completed fully
  | 'partial' // last run completed, but some pages failed
  | 'error'; // last run produced no usable data

/** Outcome of a completed sync run, persisted so it survives a restart. */
export interface SyncState {
  status: SyncStatus;
  /** Epoch ms of the last run that persisted data. Null until the first one. */
  lastSyncedAt: number | null;
  /** Page numbers that failed in the last run. */
  failedPages: number[];
  /** User-facing reason the last run was not fully successful. */
  lastError: string | null;
}

export const INITIAL_SYNC_STATE: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  failedPages: [],
  lastError: null,
};

/** Result handed back by the sync service to the store. */
export interface SyncResult {
  status: 'success' | 'partial' | 'error';
  syncedAt: number;
  failedPages: number[];
  error: string | null;
}
