/**
 * Parsers: untrusted `unknown` JSON to typed domain objects.
 *
 * Every parser is total: it returns a valid object or `null` and never throws,
 * so one bad record cannot lose the other 282. Includes the type guards and
 * the derived facets (size band, coat category, search haystack).
 */

import type {
  Coat,
  CoatCategory,
  Range,
  SizeBand,
  Breed,
  BreedGroup,
  BreedImage,
  BreedSource,
  ImageAttribution,
  Origin,
  ScoredTraitKey,
  TraitScores,
  Traits,
} from '@/types';
import { SCORED_TRAIT_KEYS } from '@/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** True only for real, finite numbers (rejects NaN/Infinity from bad JSON). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Reads a string property, returning null when absent, empty or wrong-typed. */
export function optionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (!isString(value)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Reads a finite-number property, returning null when absent or wrong-typed. */
export function optionalNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return isFiniteNumber(value) ? value : null;
}

export function optionalBoolean(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return isBoolean(value) ? value : null;
}

/** Reads a nested object property; returns an empty record when absent. */
export function nestedRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

/**
 * Reads an array of non-empty strings, dropping any non-string entries.
 * Returns a frozen empty array when the field is absent or malformed.
 */
export function stringArray(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  if (!isArray(value)) return EMPTY_STRINGS;
  const out: string[] = [];
  for (const entry of value) {
    if (isString(entry)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}

/** Reads an array of objects, dropping non-object entries. */
export function recordArray(
  source: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const value = source[key];
  if (!isArray(value)) return [];
  return value.filter(isRecord);
}

const EMPTY_STRINGS: readonly string[] = Object.freeze([]);

/**
 * Weight thresholds in kilograms, applied to the breed's *typical adult
 * weight* (see `representativeMeasurement`). Chosen against the live
 * distribution (p25=12kg, p50=25kg, p75=35kg, p95=70kg) so that all four bands
 * are populated rather than dumping ~70% of breeds into one bucket:
 *
 *   small  <= 10kg   (Chihuahua, Maltese, Pomeranian)
 *   medium <= 25kg   (Border Collie, Whippet)
 *   large  <= 45kg   (Labrador, German Shepherd)
 *   giant   > 45kg   (Mastiff, Great Dane)
 */
export const SIZE_WEIGHT_THRESHOLDS_KG = { small: 10, medium: 25, large: 45 } as const;

/**
 * Height fallback in centimetres, used only when no weight is recorded.
 * Calibrated to roughly match the weight bands at the withers.
 */
export const SIZE_HEIGHT_THRESHOLDS_CM = { small: 30, medium: 50, large: 65 } as const;

/** Separator used inside the search haystack; never typed by a user. */
const HAYSTACK_SEPARATOR = ' | ';

/**
 * Midpoint of a range, tolerating a half-open range (only min or only max).
 * Returns null when neither bound is known — the API emits `{}` for unknowns.
 */
export function rangeMidpoint(range: Range): number | null {
  const { min, max } = range;
  if (min !== null && max !== null) return (min + max) / 2;
  if (min !== null) return min;
  if (max !== null) return max;
  return null;
}

/**
 * A single representative measurement for a breed, averaging the male and
 * female midpoints when both exist. Averaging (rather than taking the male
 * value) avoids systematically over-sizing dimorphic breeds.
 */
export function representativeMeasurement(male: Range, female: Range): number | null {
  const maleMid = rangeMidpoint(male);
  const femaleMid = rangeMidpoint(female);
  if (maleMid !== null && femaleMid !== null) return (maleMid + femaleMid) / 2;
  return maleMid ?? femaleMid;
}

/**
 * Classifies a breed into a size band.
 *
 * Weight is preferred because it is present for every breed in the live
 * dataset; height is a fallback for robustness (6 breeds ship `height: {}`).
 * Returns null rather than guessing when neither is known, so the UI can say
 * "Unknown" instead of silently mis-filtering.
 */
export function deriveSizeBand(
  maleWeight: Range,
  femaleWeight: Range,
  maleHeight: Range,
  femaleHeight: Range,
): SizeBand | null {
  const weightKg = representativeMeasurement(maleWeight, femaleWeight);
  if (weightKg !== null) {
    if (weightKg <= SIZE_WEIGHT_THRESHOLDS_KG.small) return 'small';
    if (weightKg <= SIZE_WEIGHT_THRESHOLDS_KG.medium) return 'medium';
    if (weightKg <= SIZE_WEIGHT_THRESHOLDS_KG.large) return 'large';
    return 'giant';
  }

  const heightCm = representativeMeasurement(maleHeight, femaleHeight);
  if (heightCm !== null) {
    if (heightCm <= SIZE_HEIGHT_THRESHOLDS_CM.small) return 'small';
    if (heightCm <= SIZE_HEIGHT_THRESHOLDS_CM.medium) return 'medium';
    if (heightCm <= SIZE_HEIGHT_THRESHOLDS_CM.large) return 'large';
    return 'giant';
  }

  return null;
}

/**
 * Collapses the API's two coat fields into one filterable category.
 *
 * The API models coat texture (`type`: wire, curly, corded, double, smooth,
 * hairless, ...) separately from `length` (short, medium, long, hairless).
 * The brief asks for a single short/medium/long/wire filter, so texture wins
 * where it is the distinguishing feature a user would search for — a
 * wire-haired breed is "wire" regardless of whether its hair is short or
 * medium — and length is used otherwise.
 */
export function deriveCoatCategory(coat: Coat): CoatCategory | null {
  const type = coat.type === null ? null : coat.type.toLowerCase();
  const length = coat.length === null ? null : coat.length.toLowerCase();

  if (type === 'hairless' || length === 'hairless') return 'hairless';
  if (type === 'wire') return 'wire';
  if (type === 'curly' || type === 'corded') return 'curly';

  if (length === 'short') return 'short';
  if (length === 'medium') return 'medium';
  if (length === 'long') return 'long';

  // No usable length: fall back to types that imply one.
  if (type === 'short' || type === 'smooth') return 'short';
  if (type === 'long') return 'long';
  if (type === 'medium' || type === 'double') return 'medium';

  return null;
}

/**
 * Builds the lowercased haystack searched by the list screen.
 * Precomputed so a keystroke never re-lowercases 283 names + alias arrays.
 */
export function buildSearchHaystack(name: string, otherNames: readonly string[]): string {
  return [name, ...otherNames].join(HAYSTACK_SEPARATOR).toLowerCase();
}

/** `meta.pagination` from a collection response; every field may be absent. */
export interface ApiPagination {
  readonly current?: number;
  readonly next?: number;
  readonly prev?: number;
  readonly first?: number;
  readonly last?: number;
  readonly records?: number;
}

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
function parseImage(
  raw: Record<string, unknown>,
  breedId: string,
  position: number,
): BreedImage | null {
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
