/**
 * Row <-> domain mapping.
 *
 * SQLite hands back loosely-typed rows; these helpers narrow them without
 * `any`, and treat a corrupt JSON column as "field absent" rather than
 * throwing and taking the whole list down.
 */

import type {
  Breed,
  BreedImage,
  BreedSource,
  Coat,
  CoatCategory,
  ScoredTraitKey,
  SizeBand,
  TraitScores,
  Traits,
} from '@/types/domain';
import { COAT_CATEGORIES, SCORED_TRAIT_KEYS, SIZE_BANDS } from '@/types/domain';
import { isRecord, isString, optionalNumber, optionalString } from '@/utils/guards';

/** Shape of a `breeds` row as returned by SQLite. */
export interface BreedRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly group_id: string | null;
  readonly life_min: number | null;
  readonly life_max: number | null;
  readonly male_weight_min: number | null;
  readonly male_weight_max: number | null;
  readonly female_weight_min: number | null;
  readonly female_weight_max: number | null;
  readonly male_height_min: number | null;
  readonly male_height_max: number | null;
  readonly female_height_min: number | null;
  readonly female_height_max: number | null;
  readonly hypoallergenic: number | null;
  readonly origin_era: string | null;
  readonly origin_region: string | null;
  readonly origin_country: string | null;
  readonly coat_type: string | null;
  readonly coat_length: string | null;
  readonly coat_colors_json: string;
  readonly traits_json: string;
  readonly exercise_minutes: number | null;
  readonly temperament_json: string;
  readonly other_names_json: string;
  readonly recognized_by_json: string;
  readonly sources_json: string;
  readonly size_band: string | null;
  readonly coat_category: string | null;
  readonly search_haystack: string;
  readonly thumbnail_url: string | null;
}

export interface BreedImageRow {
  readonly id: string;
  readonly breed_id: string;
  readonly position: number;
  readonly thumb_url: string | null;
  readonly medium_url: string | null;
  readonly large_url: string | null;
  readonly author: string | null;
  readonly license: string | null;
  readonly license_url: string | null;
  readonly source: string | null;
  readonly source_url: string | null;
}

/** Parses a JSON column, returning `fallback` if it is absent or corrupt. */
function parseJsonColumn(raw: string, fallback: unknown): unknown {
  if (raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

function jsonStringArray(raw: string): readonly string[] {
  const parsed = parseJsonColumn(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isString);
}

function jsonSources(raw: string): readonly BreedSource[] {
  const parsed = parseJsonColumn(raw, []);
  if (!Array.isArray(parsed)) return [];
  const out: BreedSource[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    out.push({ url: optionalString(entry, 'url'), title: optionalString(entry, 'title') });
  }
  return out;
}

function jsonTraitScores(raw: string): TraitScores {
  const parsed = parseJsonColumn(raw, {});
  const source = isRecord(parsed) ? parsed : {};
  const scores = {} as Record<ScoredTraitKey, number | null>;
  for (const key of SCORED_TRAIT_KEYS) {
    scores[key] = optionalNumber(source, key);
  }
  return scores as TraitScores;
}

function toSizeBand(value: string | null): SizeBand | null {
  if (value === null) return null;
  return SIZE_BANDS.find((band) => band === value) ?? null;
}

function toCoatCategory(value: string | null): CoatCategory | null {
  if (value === null) return null;
  return COAT_CATEGORIES.find((category) => category === value) ?? null;
}

/** SQLite has no boolean type: 1/0/NULL maps to true/false/unknown. */
function toNullableBoolean(value: number | null): boolean | null {
  if (value === null) return null;
  return value !== 0;
}

export function mapImageRow(row: BreedImageRow): BreedImage {
  return {
    id: row.id,
    breedId: row.breed_id,
    position: row.position,
    thumbUrl: row.thumb_url,
    mediumUrl: row.medium_url,
    largeUrl: row.large_url,
    attribution: {
      author: row.author,
      license: row.license,
      licenseUrl: row.license_url,
      source: row.source,
      sourceUrl: row.source_url,
    },
  };
}

/**
 * Rebuilds a `Breed` from its row plus its already-loaded images.
 * Images are passed in rather than fetched here so callers can batch the
 * image query across many breeds instead of issuing one per row.
 */
export function mapBreedRow(row: BreedRow, images: readonly BreedImage[]): Breed {
  const coat: Coat = {
    type: row.coat_type,
    length: row.coat_length,
    colors: jsonStringArray(row.coat_colors_json),
  };

  const traits: Traits = {
    scores: jsonTraitScores(row.traits_json),
    exerciseMinutes: row.exercise_minutes,
    temperament: jsonStringArray(row.temperament_json),
  };

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupId: row.group_id,
    life: { min: row.life_min, max: row.life_max },
    maleWeight: { min: row.male_weight_min, max: row.male_weight_max },
    femaleWeight: { min: row.female_weight_min, max: row.female_weight_max },
    maleHeight: { min: row.male_height_min, max: row.male_height_max },
    femaleHeight: { min: row.female_height_min, max: row.female_height_max },
    hypoallergenic: toNullableBoolean(row.hypoallergenic),
    origin: {
      era: row.origin_era,
      region: row.origin_region,
      country: row.origin_country,
    },
    coat,
    traits,
    otherNames: jsonStringArray(row.other_names_json),
    recognizedBy: jsonStringArray(row.recognized_by_json),
    sources: jsonSources(row.sources_json),
    images,
    sizeBand: toSizeBand(row.size_band),
    coatCategory: toCoatCategory(row.coat_category),
    searchHaystack: row.search_haystack,
    thumbnailUrl: row.thumbnail_url,
  };
}

/** Flattens a `Breed` into positional bind values for the upsert statement. */
export function breedToBindValues(breed: Breed, syncedAt: number): readonly SQLiteBindValue[] {
  return [
    breed.id,
    breed.name,
    breed.description,
    breed.groupId,
    breed.life.min,
    breed.life.max,
    breed.maleWeight.min,
    breed.maleWeight.max,
    breed.femaleWeight.min,
    breed.femaleWeight.max,
    breed.maleHeight.min,
    breed.maleHeight.max,
    breed.femaleHeight.min,
    breed.femaleHeight.max,
    breed.hypoallergenic === null ? null : Number(breed.hypoallergenic),
    breed.origin.era,
    breed.origin.region,
    breed.origin.country,
    breed.coat.type,
    breed.coat.length,
    JSON.stringify(breed.coat.colors),
    JSON.stringify(breed.traits.scores),
    breed.traits.exerciseMinutes,
    JSON.stringify(breed.traits.temperament),
    breed.traits.scores.good_with_children,
    breed.traits.scores.good_with_dogs,
    breed.traits.scores.good_with_strangers,
    JSON.stringify(breed.otherNames),
    JSON.stringify(breed.recognizedBy),
    JSON.stringify(breed.sources),
    breed.sizeBand,
    breed.coatCategory,
    breed.searchHaystack,
    breed.thumbnailUrl,
    syncedAt,
  ];
}

/** Values the driver accepts as statement parameters. */
export type SQLiteBindValue = string | number | null;
