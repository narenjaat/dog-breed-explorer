/**
 * Test fixtures shaped exactly like real Dog API v2 payloads.
 *
 * The awkward cases here are not invented: they mirror records observed in the
 * live dataset (notably Bavarian Mountain Scent Hound, which ships
 * `traits: {}`, `coat: {}`, `origin: {}` and empty height objects).
 */

/* Wire format of the Dog API v2, used to type the fixtures below. */

/** A numeric range. The API emits `{}` (not null) when a range is unknown. */
export interface ApiRange {
  min?: number;
  max?: number;
}

export interface ApiOrigin {
  era?: string;
  region?: string;
  country?: string;
}

export interface ApiCoat {
  type?: string;
  length?: string;
  colors?: string[];
}

/**
 * Trait scores. All are optional: one breed in the live dataset
 * (Bavarian Mountain Scent Hound) ships `traits: {}`.
 *
 * Note `exercise_minutes` is a duration (observed 20..120), NOT a 1-5 score.
 */
export interface ApiTraits {
  energy?: number;
  barking?: number;
  drooling?: number;
  grooming?: number;
  shedding?: number;
  trainability?: number;
  good_with_dogs?: number;
  exercise_minutes?: number;
  apartment_friendly?: number;
  good_with_children?: number;
  good_with_strangers?: number;
  temperament?: string[];
}

export interface ApiImageAttribution {
  author?: string;
  license?: string;
  license_url?: string;
  source?: string;
  source_url?: string;
}

export interface ApiImage {
  id: string;
  url?: string;
  thumb?: string;
  medium?: string;
  large?: string;
  attribution?: ApiImageAttribution;
}

export interface ApiSource {
  url?: string;
  title?: string;
}

export interface ApiBreedAttributes {
  name?: string;
  description?: string;
  life?: ApiRange;
  male_weight?: ApiRange;
  female_weight?: ApiRange;
  male_height?: ApiRange;
  female_height?: ApiRange;
  hypoallergenic?: boolean;
  origin?: ApiOrigin;
  coat?: ApiCoat;
  traits?: ApiTraits;
  other_names?: string[];
  recognized_by?: string[];
  sources?: ApiSource[];
  images?: ApiImage[];
}

export interface ApiRelationshipRef {
  id?: string;
  type?: string;
}

export interface ApiBreedRelationships {
  group?: { data?: ApiRelationshipRef | null };
}

export interface ApiBreedResource {
  id: string;
  type: string;
  attributes?: ApiBreedAttributes;
  relationships?: ApiBreedRelationships;
}

export interface ApiGroupResource {
  id: string;
  type: string;
  attributes?: { name?: string };
  relationships?: {
    breeds?: { data?: ApiRelationshipRef[] };
  };
}

export const GROUP_IDS = {
  herding: 'f56dc4b1-ba1a-4454-8ce2-bd5d41404a0c',
  hound: 'a2ac3f9a-8c2e-4b19-9f2a-3c9a7e5d1b44',
  toy: 'c1d7e2b4-6f3a-4a58-9b21-77f0c6d4e8a1',
} as const;

/** A fully-populated breed, as most records look. */
export function makeCompleteBreed(overrides: Partial<ApiBreedResource> = {}): ApiBreedResource {
  return {
    id: 'breed-complete-1',
    type: 'breed',
    attributes: {
      name: 'Affenpinscher',
      description: 'A small and playful breed originally bred in Germany.',
      life: { min: 14, max: 16 },
      male_weight: { min: 4, max: 6 },
      female_weight: { min: 4, max: 6 },
      male_height: { min: 23, max: 29 },
      female_height: { min: 23, max: 29 },
      hypoallergenic: true,
      origin: { era: '17th century', region: 'Central Europe', country: 'Germany' },
      coat: { type: 'wire', length: 'short', colors: ['black', 'gray'] },
      traits: {
        energy: 3,
        barking: 3,
        drooling: 1,
        grooming: 3,
        shedding: 2,
        trainability: 3,
        good_with_dogs: 3,
        exercise_minutes: 30,
        apartment_friendly: 5,
        good_with_children: 3,
        good_with_strangers: 2,
        temperament: ['confident', 'curious', 'playful'],
      },
      other_names: ['Monkey Terrier', 'Affen'],
      recognized_by: ['AKC', 'FCI'],
      sources: [{ url: 'https://example.org/std.pdf', title: 'Official Standard' }],
      images: [
        {
          id: 'img-1',
          url: 'https://images.example/full-1',
          thumb: 'https://images.example/thumb-1',
          medium: 'https://images.example/medium-1',
          large: 'https://images.example/large-1',
          attribution: {
            author: 'Futurebreak',
            license: 'CC0',
            license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
            source: 'wikimedia_commons',
            source_url: 'https://commons.wikimedia.org/wiki/File:Affenpinscher.jpg',
          },
        },
        {
          id: 'img-2',
          thumb: 'https://images.example/thumb-2',
          medium: 'https://images.example/medium-2',
          large: 'https://images.example/large-2',
          attribution: { author: 'Canarian', license: 'CC BY-SA 4.0' },
        },
      ],
    },
    relationships: { group: { data: { id: GROUP_IDS.toy, type: 'group' } } },
    ...overrides,
  };
}

/**
 * The real-world sparse record: empty objects rather than nulls, no traits,
 * no coat, no origin, no heights, no other names.
 */
export function makeSparseBreed(): ApiBreedResource {
  return {
    id: 'breed-sparse-1',
    type: 'breed',
    attributes: {
      name: 'Bavarian Mountain Scent Hound',
      description: 'A medium-sized scent hound bred in Germany.',
      life: { min: 12, max: 15 },
      male_weight: { min: 20, max: 30 },
      female_weight: { min: 20, max: 30 },
      male_height: {},
      female_height: {},
      hypoallergenic: false,
      origin: {},
      coat: {},
      traits: {},
      other_names: [],
      recognized_by: [],
      sources: [],
      images: [
        {
          id: 'img-sparse-1',
          thumb: 'https://images.example/sparse-thumb',
          medium: 'https://images.example/sparse-medium',
          large: 'https://images.example/sparse-large',
          attribution: { author: 'Ralf Lotys', license: 'CC BY 2.5' },
        },
      ],
    },
    relationships: { group: { data: { id: GROUP_IDS.hound, type: 'group' } } },
  };
}

/** Builds a breed of a given weight, for size-band tests. */
export function makeBreedWithWeight(
  id: string,
  name: string,
  minKg: number,
  maxKg: number,
): ApiBreedResource {
  return {
    id,
    type: 'breed',
    attributes: {
      name,
      male_weight: { min: minKg, max: maxKg },
      female_weight: { min: minKg, max: maxKg },
      male_height: {},
      female_height: {},
      traits: {},
      coat: {},
      origin: {},
      images: [],
    },
    relationships: { group: { data: { id: GROUP_IDS.herding, type: 'group' } } },
  };
}

/** Wraps resources in a JSON:API collection envelope with pagination. */
export function makeCollectionResponse(
  data: ApiBreedResource[],
  pagination: { current: number; next?: number; last?: number; records: number },
): unknown {
  return { data, meta: { pagination }, links: {} };
}

export function makeGroup(id: string, name: string): ApiGroupResource {
  return { id, type: 'group', attributes: { name } };
}

export const SAMPLE_GROUPS: ApiGroupResource[] = [
  makeGroup(GROUP_IDS.herding, 'Herding Group'),
  makeGroup(GROUP_IDS.hound, 'Hound Group'),
  makeGroup(GROUP_IDS.toy, 'Toy Group'),
];
