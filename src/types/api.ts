/**
 * Wire-format types for the Dog API v2 (JSON:API-ish).
 *
 * These describe what the network *may* return. Every field that the live API
 * was observed to omit is optional here, so the compiler forces us to handle
 * the gaps. Parsing/normalisation into the domain model lives in
 * `src/api/parsers.ts`; nothing outside the API layer should import these.
 */

/** A numeric range. The API emits `{}` (not null) when a range is unknown. */
export interface ApiRange {
  readonly min?: number;
  readonly max?: number;
}

export interface ApiOrigin {
  readonly era?: string;
  readonly region?: string;
  readonly country?: string;
}

export interface ApiCoat {
  readonly type?: string;
  readonly length?: string;
  readonly colors?: readonly string[];
}

/**
 * Trait scores. All are optional: one breed in the live dataset
 * (Bavarian Mountain Scent Hound) ships `traits: {}`.
 *
 * Note `exercise_minutes` is a duration (observed 20..120), NOT a 1-5 score.
 */
export interface ApiTraits {
  readonly energy?: number;
  readonly barking?: number;
  readonly drooling?: number;
  readonly grooming?: number;
  readonly shedding?: number;
  readonly trainability?: number;
  readonly good_with_dogs?: number;
  readonly exercise_minutes?: number;
  readonly apartment_friendly?: number;
  readonly good_with_children?: number;
  readonly good_with_strangers?: number;
  readonly temperament?: readonly string[];
}

export interface ApiImageAttribution {
  readonly author?: string;
  readonly license?: string;
  readonly license_url?: string;
  readonly source?: string;
  readonly source_url?: string;
}

export interface ApiImage {
  readonly id: string;
  readonly url?: string;
  readonly thumb?: string;
  readonly medium?: string;
  readonly large?: string;
  readonly attribution?: ApiImageAttribution;
}

export interface ApiSource {
  readonly url?: string;
  readonly title?: string;
}

export interface ApiBreedAttributes {
  readonly name?: string;
  readonly description?: string;
  readonly life?: ApiRange;
  readonly male_weight?: ApiRange;
  readonly female_weight?: ApiRange;
  readonly male_height?: ApiRange;
  readonly female_height?: ApiRange;
  readonly hypoallergenic?: boolean;
  readonly origin?: ApiOrigin;
  readonly coat?: ApiCoat;
  readonly traits?: ApiTraits;
  readonly other_names?: readonly string[];
  readonly recognized_by?: readonly string[];
  readonly sources?: readonly ApiSource[];
  readonly images?: readonly ApiImage[];
}

export interface ApiRelationshipRef {
  readonly id?: string;
  readonly type?: string;
}

export interface ApiBreedRelationships {
  readonly group?: { readonly data?: ApiRelationshipRef | null };
}

export interface ApiBreedResource {
  readonly id: string;
  readonly type: string;
  readonly attributes?: ApiBreedAttributes;
  readonly relationships?: ApiBreedRelationships;
}

export interface ApiGroupResource {
  readonly id: string;
  readonly type: string;
  readonly attributes?: { readonly name?: string };
  readonly relationships?: {
    readonly breeds?: { readonly data?: readonly ApiRelationshipRef[] };
  };
}

/**
 * Pagination metadata. `last` is absent on the final page and `next` is absent
 * once exhausted, so both are optional — the sync loop must not assume `last`.
 */
export interface ApiPagination {
  readonly current?: number;
  readonly next?: number;
  readonly prev?: number;
  readonly first?: number;
  readonly last?: number;
  readonly records?: number;
}

export interface ApiCollectionResponse<TResource> {
  readonly data: readonly TResource[];
  readonly meta?: { readonly pagination?: ApiPagination };
}

export interface ApiSingleResponse<TResource> {
  readonly data: TResource;
}
