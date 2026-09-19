/**
 * Domain model — the normalised shape the app actually renders.
 *
 * Distinct from the wire types in `api.ts`: nullable/absent API fields are
 * resolved to explicit `null` here, and derived facets (size band, coat
 * category, search haystack) are precomputed once at parse time so the list
 * screen never derives them during render or scroll.
 */

export const SIZE_BANDS = ['small', 'medium', 'large', 'giant'] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const COAT_CATEGORIES = ['short', 'medium', 'long', 'wire', 'curly', 'hairless'] as const;
export type CoatCategory = (typeof COAT_CATEGORIES)[number];

/** The ten 1-5 trait scores. `exercise_minutes` is excluded: it is a duration. */
export const SCORED_TRAIT_KEYS = [
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
] as const;
export type ScoredTraitKey = (typeof SCORED_TRAIT_KEYS)[number];

/** Traits offered as a "minimum score" filter on the list screen. */
export const FILTERABLE_TRAIT_KEYS = [
  'good_with_children',
  'good_with_dogs',
  'good_with_strangers',
] as const;
export type FilterableTraitKey = (typeof FILTERABLE_TRAIT_KEYS)[number];

export const TRAIT_SCORE_MIN = 1;
export const TRAIT_SCORE_MAX = 5;

/** A numeric range where either bound may be unknown. */
export interface Range {
  readonly min: number | null;
  readonly max: number | null;
}

export interface Origin {
  readonly era: string | null;
  readonly region: string | null;
  readonly country: string | null;
}

export interface Coat {
  readonly type: string | null;
  readonly length: string | null;
  readonly colors: readonly string[];
}

/** Scores keyed by trait; a missing trait is `null`, never 0. */
export type TraitScores = Readonly<Record<ScoredTraitKey, number | null>>;

export interface Traits {
  readonly scores: TraitScores;
  /** Minutes of daily exercise (observed 20..120), or null. */
  readonly exerciseMinutes: number | null;
  readonly temperament: readonly string[];
}

export interface ImageAttribution {
  readonly author: string | null;
  readonly license: string | null;
  readonly licenseUrl: string | null;
  readonly source: string | null;
  readonly sourceUrl: string | null;
}

export interface BreedImage {
  readonly id: string;
  readonly breedId: string;
  /** Position in the API's ordering; index 0 is used as the list thumbnail. */
  readonly position: number;
  readonly thumbUrl: string | null;
  readonly mediumUrl: string | null;
  readonly largeUrl: string | null;
  readonly attribution: ImageAttribution;
}

export interface BreedSource {
  readonly url: string | null;
  readonly title: string | null;
}

export interface Breed {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId: string | null;
  readonly life: Range;
  readonly maleWeight: Range;
  readonly femaleWeight: Range;
  readonly maleHeight: Range;
  readonly femaleHeight: Range;
  readonly hypoallergenic: boolean | null;
  readonly origin: Origin;
  readonly coat: Coat;
  readonly traits: Traits;
  readonly otherNames: readonly string[];
  readonly recognizedBy: readonly string[];
  readonly sources: readonly BreedSource[];
  readonly images: readonly BreedImage[];

  // ---- Derived facets (computed once at parse time) ----
  /** Size band derived from weight, falling back to height. Null when unknown. */
  readonly sizeBand: SizeBand | null;
  /** Coat category merging API `coat.type` and `coat.length`. Null when unknown. */
  readonly coatCategory: CoatCategory | null;
  /** Lowercased "name + other names", precomputed for debounced search. */
  readonly searchHaystack: string;
  /** First available thumbnail URL — what the list row renders. */
  readonly thumbnailUrl: string | null;
}

export interface BreedGroup {
  readonly id: string;
  readonly name: string;
}
