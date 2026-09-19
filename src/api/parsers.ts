/**
 * Parsers: untrusted `unknown` JSON -> typed domain objects.
 *
 * Every parser is total: it either returns a valid object or `null`, and never
 * throws on malformed input. A single bad record must not lose the other 282,
 * so callers skip nulls rather than failing the whole page.
 */

import type {
  Breed,
  BreedGroup,
  BreedImage,
  BreedSource,
  Coat,
  ImageAttribution,
  Origin,
  Range,
  ScoredTraitKey,
  TraitScores,
  Traits,
} from '@/types/domain';
import { SCORED_TRAIT_KEYS } from '@/types/domain';
import type { ApiPagination } from '@/types/api';
import { buildSearchHaystack, deriveCoatCategory, deriveSizeBand } from '@/utils/derive';
import {
  isRecord,
  nestedRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  recordArray,
  stringArray,
} from '@/utils/guards';

const EMPTY_RANGE: Range = { min: null, max: null };

function parseRange(source: Record<string, unknown>, key: string): Range {
  const raw = nestedRecord(source, key);
  const min = optionalNumber(raw, 'min');
  const max = optionalNumber(raw, 'max');
  if (min === null && max === null) return EMPTY_RANGE;
  return { min, max };
}

function parseOrigin(source: Record<string, unknown>): Origin {
  const raw = nestedRecord(source, 'origin');
  return {
    era: optionalString(raw, 'era'),
    region: optionalString(raw, 'region'),
    country: optionalString(raw, 'country'),
  };
}

function parseCoat(source: Record<string, unknown>): Coat {
  const raw = nestedRecord(source, 'coat');
  return {
    type: optionalString(raw, 'type'),
    length: optionalString(raw, 'length'),
    colors: stringArray(raw, 'colors'),
  };
}

function parseTraits(source: Record<string, unknown>): Traits {
  const raw = nestedRecord(source, 'traits');

  // Build the score map explicitly so a missing trait is null, never 0 —
  // 0 would render as an empty bar and read as "scored lowest".
  const scores = {} as Record<ScoredTraitKey, number | null>;
  for (const key of SCORED_TRAIT_KEYS) {
    scores[key] = optionalNumber(raw, key);
  }

  return {
    scores: scores as TraitScores,
    exerciseMinutes: optionalNumber(raw, 'exercise_minutes'),
    temperament: stringArray(raw, 'temperament'),
  };
}

function parseAttribution(source: Record<string, unknown>): ImageAttribution {
  const raw = nestedRecord(source, 'attribution');
  return {
    author: optionalString(raw, 'author'),
    license: optionalString(raw, 'license'),
    licenseUrl: optionalString(raw, 'license_url'),
    source: optionalString(raw, 'source'),
    sourceUrl: optionalString(raw, 'source_url'),
  };
}

/**
 * Parses one image. Returns null when no usable URL exists in any variant —
 * an image with no source is not renderable and would only add an empty slide.
 */
function parseImage(raw: Record<string, unknown>, breedId: string, position: number): BreedImage | null {
  const thumbUrl = optionalString(raw, 'thumb');
  const mediumUrl = optionalString(raw, 'medium');
  const largeUrl = optionalString(raw, 'large');
  const fallbackUrl = optionalString(raw, 'url');

  if (thumbUrl === null && mediumUrl === null && largeUrl === null && fallbackUrl === null) {
    return null;
  }

  const id = optionalString(raw, 'id') ?? `${breedId}:${String(position)}`;

  return {
    id,
    breedId,
    position,
    // Degrade to the next-best variant so a missing size never blanks the UI.
    thumbUrl: thumbUrl ?? mediumUrl ?? fallbackUrl ?? largeUrl,
    mediumUrl: mediumUrl ?? largeUrl ?? fallbackUrl ?? thumbUrl,
    largeUrl: largeUrl ?? mediumUrl ?? fallbackUrl ?? thumbUrl,
    attribution: parseAttribution(raw),
  };
}

function parseSources(source: Record<string, unknown>): readonly BreedSource[] {
  const out: BreedSource[] = [];
  for (const raw of recordArray(source, 'sources')) {
    const url = optionalString(raw, 'url');
    const title = optionalString(raw, 'title');
    if (url === null && title === null) continue;
    out.push({ url, title });
  }
  return out;
}

/**
 * Parses a breed resource. Returns null when the record lacks the two fields
 * the app cannot function without: a stable id and a display name.
 */
export function parseBreed(value: unknown): Breed | null {
  if (!isRecord(value)) return null;

  const id = optionalString(value, 'id');
  if (id === null) return null;

  const attributes = nestedRecord(value, 'attributes');
  const name = optionalString(attributes, 'name');
  if (name === null) return null;

  const relationships = nestedRecord(value, 'relationships');
  const groupRef = nestedRecord(nestedRecord(relationships, 'group'), 'data');
  const groupId = optionalString(groupRef, 'id');

  const maleWeight = parseRange(attributes, 'male_weight');
  const femaleWeight = parseRange(attributes, 'female_weight');
  const maleHeight = parseRange(attributes, 'male_height');
  const femaleHeight = parseRange(attributes, 'female_height');
  const coat = parseCoat(attributes);
  const otherNames = stringArray(attributes, 'other_names');

  const images: BreedImage[] = [];
  const rawImages = recordArray(attributes, 'images');
  for (let index = 0; index < rawImages.length; index += 1) {
    const rawImage = rawImages[index];
    if (rawImage === undefined) continue;
    const image = parseImage(rawImage, id, index);
    if (image !== null) images.push(image);
  }

  const firstImage = images[0];

  return {
    id,
    name,
    description: optionalString(attributes, 'description'),
    groupId,
    life: parseRange(attributes, 'life'),
    maleWeight,
    femaleWeight,
    maleHeight,
    femaleHeight,
    hypoallergenic: optionalBoolean(attributes, 'hypoallergenic'),
    origin: parseOrigin(attributes),
    coat,
    traits: parseTraits(attributes),
    otherNames,
    recognizedBy: stringArray(attributes, 'recognized_by'),
    sources: parseSources(attributes),
    images,
    sizeBand: deriveSizeBand(maleWeight, femaleWeight, maleHeight, femaleHeight),
    coatCategory: deriveCoatCategory(coat),
    searchHaystack: buildSearchHaystack(name, otherNames),
    thumbnailUrl: firstImage === undefined ? null : firstImage.thumbUrl,
  };
}

export function parseGroup(value: unknown): BreedGroup | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value, 'id');
  if (id === null) return null;
  const name = optionalString(nestedRecord(value, 'attributes'), 'name');
  if (name === null) return null;
  return { id, name };
}

/** Reads pagination metadata, tolerating its complete absence. */
export function parsePagination(value: unknown): ApiPagination {
  if (!isRecord(value)) return {};
  const pagination = nestedRecord(nestedRecord(value, 'meta'), 'pagination');
  return {
    current: optionalNumber(pagination, 'current') ?? undefined,
    next: optionalNumber(pagination, 'next') ?? undefined,
    prev: optionalNumber(pagination, 'prev') ?? undefined,
    first: optionalNumber(pagination, 'first') ?? undefined,
    last: optionalNumber(pagination, 'last') ?? undefined,
    records: optionalNumber(pagination, 'records') ?? undefined,
  };
}

/**
 * Extracts the `data` array from a collection response and parses each entry
 * with `parseItem`, dropping entries that fail. Returns both the parsed items
 * and how many were skipped, so sync can surface partial-parse damage instead
 * of silently shrinking the dataset.
 */
export function parseCollection<T>(
  value: unknown,
  parseItem: (entry: unknown) => T | null,
): { readonly items: readonly T[]; readonly skipped: number } {
  if (!isRecord(value)) return { items: [], skipped: 0 };
  const data = value['data'];
  if (!Array.isArray(data)) return { items: [], skipped: 0 };

  const items: T[] = [];
  let skipped = 0;
  for (const entry of data) {
    const parsed = parseItem(entry);
    if (parsed === null) skipped += 1;
    else items.push(parsed);
  }
  return { items, skipped };
}

/** Extracts and parses the single `data` object of a detail response. */
export function parseSingle<T>(value: unknown, parseItem: (entry: unknown) => T | null): T | null {
  if (!isRecord(value)) return null;
  return parseItem(value['data']);
}
