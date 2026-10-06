/**
 * Reads and writes for breeds, groups and sync metadata, plus the mapping
 * between domain objects and SQLite rows.
 *
 * Writes are upserts inside a transaction, never delete-then-insert: a sync
 * that returns only part of the dataset must not wipe rows it did not mention.
 */

import type {
  Breed,
  BreedImage,
  BreedSource,
  Coat,
  CoatCategory,
  SizeBand,
  TraitScores,
  Traits,
  BreedGroup,
  SyncState,
} from '@/types';
import { COAT_CATEGORIES, SCORED_TRAIT_KEYS, SIZE_BANDS, INITIAL_SYNC_STATE } from '@/types';
import { isRecord, optionalNumber, optionalString } from '@/api/parsers';
import { getDatabase } from '@/database/database';

/** Shape of a `breeds` row as returned by SQLite. */
export interface BreedRow {
  id: string;
  name: string;
  description: string | null;
  group_id: string | null;
  life_min: number | null;
  life_max: number | null;
  male_weight_min: number | null;
  male_weight_max: number | null;
  female_weight_min: number | null;
  female_weight_max: number | null;
  male_height_min: number | null;
  male_height_max: number | null;
  female_height_min: number | null;
  female_height_max: number | null;
  hypoallergenic: number | null;
  origin_era: string | null;
  origin_region: string | null;
  origin_country: string | null;
  coat_type: string | null;
  coat_length: string | null;
  coat_colors_json: string;
  traits_json: string;
  exercise_minutes: number | null;
  temperament_json: string;
  other_names_json: string;
  recognized_by_json: string;
  sources_json: string;
  size_band: string | null;
  coat_category: string | null;
  search_haystack: string;
  thumbnail_url: string | null;
}

export interface BreedImageRow {
  id: string;
  breed_id: string;
  position: number;
  thumb_url: string | null;
  medium_url: string | null;
  large_url: string | null;
  author: string | null;
  license: string | null;
  license_url: string | null;
  source: string | null;
  source_url: string | null;
}

/** Reads a JSON text column. A corrupt value becomes `fallback` instead of crashing. */
function readJson(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function jsonStringArray(raw: string): string[] {
  const parsed = readJson(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === 'string');
}

function jsonSources(raw: string): BreedSource[] {
  const parsed = readJson(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord).map((entry) => ({
    url: optionalString(entry, 'url'),
    title: optionalString(entry, 'title'),
  }));
}

function jsonTraitScores(raw: string): TraitScores {
  const parsed = readJson(raw, {});
  const source = isRecord(parsed) ? parsed : {};
  const scores = {} as TraitScores;
  for (const key of SCORED_TRAIT_KEYS) {
    scores[key] = optionalNumber(source, key);
  }
  return scores;
}

/** Only accept values we know; anything else in the column becomes null. */
function toSizeBand(value: string | null): SizeBand | null {
  return SIZE_BANDS.includes(value as SizeBand) ? (value as SizeBand) : null;
}

function toCoatCategory(value: string | null): CoatCategory | null {
  return COAT_CATEGORIES.includes(value as CoatCategory) ? (value as CoatCategory) : null;
}

/** SQLite has no boolean type: 1 = true, 0 = false, NULL = unknown. */
function toNullableBoolean(value: number | null): boolean | null {
  return value === null ? null : value === 1;
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
export function mapBreedRow(row: BreedRow, images: BreedImage[]): Breed {
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
export function breedToBindValues(breed: Breed, syncedAt: number): SQLiteBindValue[] {
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

const BREED_COLUMNS = `
  id, name, description, group_id,
  life_min, life_max,
  male_weight_min, male_weight_max, female_weight_min, female_weight_max,
  male_height_min, male_height_max, female_height_min, female_height_max,
  hypoallergenic,
  origin_era, origin_region, origin_country,
  coat_type, coat_length, coat_colors_json,
  traits_json, exercise_minutes, temperament_json,
  other_names_json, recognized_by_json, sources_json,
  size_band, coat_category, search_haystack, thumbnail_url
`;

const UPSERT_BREED_SQL = `
  INSERT INTO breeds (
    id, name, description, group_id,
    life_min, life_max,
    male_weight_min, male_weight_max, female_weight_min, female_weight_max,
    male_height_min, male_height_max, female_height_min, female_height_max,
    hypoallergenic,
    origin_era, origin_region, origin_country,
    coat_type, coat_length, coat_colors_json,
    traits_json, exercise_minutes, temperament_json,
    trait_good_with_children, trait_good_with_dogs, trait_good_with_strangers,
    other_names_json, recognized_by_json, sources_json,
    size_band, coat_category, search_haystack, thumbnail_url,
    synced_at
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    group_id = excluded.group_id,
    life_min = excluded.life_min,
    life_max = excluded.life_max,
    male_weight_min = excluded.male_weight_min,
    male_weight_max = excluded.male_weight_max,
    female_weight_min = excluded.female_weight_min,
    female_weight_max = excluded.female_weight_max,
    male_height_min = excluded.male_height_min,
    male_height_max = excluded.male_height_max,
    female_height_min = excluded.female_height_min,
    female_height_max = excluded.female_height_max,
    hypoallergenic = excluded.hypoallergenic,
    origin_era = excluded.origin_era,
    origin_region = excluded.origin_region,
    origin_country = excluded.origin_country,
    coat_type = excluded.coat_type,
    coat_length = excluded.coat_length,
    coat_colors_json = excluded.coat_colors_json,
    traits_json = excluded.traits_json,
    exercise_minutes = excluded.exercise_minutes,
    temperament_json = excluded.temperament_json,
    trait_good_with_children = excluded.trait_good_with_children,
    trait_good_with_dogs = excluded.trait_good_with_dogs,
    trait_good_with_strangers = excluded.trait_good_with_strangers,
    other_names_json = excluded.other_names_json,
    recognized_by_json = excluded.recognized_by_json,
    sources_json = excluded.sources_json,
    size_band = excluded.size_band,
    coat_category = excluded.coat_category,
    search_haystack = excluded.search_haystack,
    thumbnail_url = excluded.thumbnail_url,
    synced_at = excluded.synced_at
`;

const UPSERT_IMAGE_SQL = `
  INSERT INTO breed_images (
    id, breed_id, position, thumb_url, medium_url, large_url,
    author, license, license_url, source, source_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    breed_id = excluded.breed_id,
    position = excluded.position,
    thumb_url = excluded.thumb_url,
    medium_url = excluded.medium_url,
    large_url = excluded.large_url,
    author = excluded.author,
    license = excluded.license,
    license_url = excluded.license_url,
    source = excluded.source,
    source_url = excluded.source_url
`;

/**
 * Persists breeds and their images in one transaction.
 *
 * Upserts rather than delete-then-insert: a sync that only returns part of the
 * dataset must never wipe rows it simply did not mention. Prepared statements
 * are reused across all rows, which is what keeps a 283-breed write fast.
 */
export async function upsertBreeds(breeds: Breed[], syncedAt: number): Promise<void> {
  if (breeds.length === 0) return;
  const db = await getDatabase();

  await db.withTransaction(async () => {
    const breedStatement = await db.prepare(UPSERT_BREED_SQL);
    const imageStatement = await db.prepare(UPSERT_IMAGE_SQL);

    for (const breed of breeds) {
      await breedStatement.execute(breedToBindValues(breed, syncedAt));

      // Replace this breed's images wholesale so images removed upstream do
      // not linger. Scoped to one breed, so it is not a global wipe.
      await db.run('DELETE FROM breed_images WHERE breed_id = ?', [breed.id]);

      for (const image of breed.images) {
        await imageStatement.execute([
          image.id,
          breed.id,
          image.position,
          image.thumbUrl,
          image.mediumUrl,
          image.largeUrl,
          image.attribution.author,
          image.attribution.license,
          image.attribution.licenseUrl,
          image.attribution.source,
          image.attribution.sourceUrl,
        ]);
      }
    }
  });
}

/**
 * Loads every breed, sorted by name, without images: the list only needs
 * `thumbnail_url`, and hydrating ~2,400 image rows for it would be waste. The
 * detail screen loads images for one breed via `getBreedById`.
 *
 * Filtering happens in a memoised selector at this size. The facet columns are
 * indexed, so moving it into a WHERE clause is a query change, not a schema one.
 */
export async function getAllBreeds(): Promise<Breed[]> {
  const db = await getDatabase();
  const rows = await db.getAll<BreedRow>(
    `SELECT ${BREED_COLUMNS} FROM breeds ORDER BY name COLLATE NOCASE ASC`,
  );
  return rows.map((row) => mapBreedRow(row, []));
}

/** Loads one breed with its images, for the detail screen. */
export async function getBreedById(id: string): Promise<Breed | null> {
  const db = await getDatabase();
  const row = await db.getFirst<BreedRow>(`SELECT ${BREED_COLUMNS} FROM breeds WHERE id = ?`, [id]);
  if (row === null) return null;

  const imageRows = await db.getAll<BreedImageRow>(
    `SELECT id, breed_id, position, thumb_url, medium_url, large_url,
            author, license, license_url, source, source_url
       FROM breed_images WHERE breed_id = ? ORDER BY position`,
    [id],
  );
  return mapBreedRow(row, imageRows.map(mapImageRow));
}

const UPSERT_GROUP_SQL = `
  INSERT INTO groups (id, name, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    updated_at = excluded.updated_at
`;

export async function upsertGroups(groups: BreedGroup[], syncedAt: number): Promise<void> {
  if (groups.length === 0) return;
  const db = await getDatabase();

  await db.withTransaction(async () => {
    const statement = await db.prepare(UPSERT_GROUP_SQL);
    for (const group of groups) {
      await statement.execute([group.id, group.name, syncedAt]);
    }
  });
}

export async function getAllGroups(): Promise<BreedGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAll<{ id: string; name: string }>(
    'SELECT id, name FROM groups ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

const SYNC_STATE_KEY = 'sync_state';

const UPSERT_SQL = `
  INSERT INTO sync_metadata (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`;

/** Reads persisted sync state. Missing or corrupt data falls back to the initial state. */
export async function getSyncState(): Promise<SyncState> {
  const db = await getDatabase();
  const row = await db.getFirst<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [SYNC_STATE_KEY],
  );
  if (row === null) return INITIAL_SYNC_STATE;

  const saved = readJson(row.value, null);
  if (!isRecord(saved)) return INITIAL_SYNC_STATE;

  // 'syncing' means the app was killed mid-sync; nothing is running now.
  const knownStatuses = ['idle', 'success', 'partial', 'error'];
  const status = knownStatuses.includes(saved.status as string)
    ? (saved.status as SyncState['status'])
    : 'idle';

  const failedPages = Array.isArray(saved.failedPages)
    ? saved.failedPages.filter((page): page is number => typeof page === 'number')
    : [];

  return {
    status,
    lastSyncedAt: optionalNumber(saved, 'lastSyncedAt'),
    failedPages,
    lastError: optionalString(saved, 'lastError'),
  };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  const db = await getDatabase();
  await db.run(UPSERT_SQL, [SYNC_STATE_KEY, JSON.stringify(state), Date.now()]);
}
