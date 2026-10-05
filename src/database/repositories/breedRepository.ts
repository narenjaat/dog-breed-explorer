/**
 * Breed persistence and querying.
 *
 * Filtering happens here in SQL rather than in a JS pass over hydrated
 * objects: the indexed scalar columns mean a multi-facet filter touches only
 * matching rows, and the UI never holds a second copy of the dataset just to
 * filter it.
 */

import { getDatabase } from '@/database/database';
import type { SqlDatabase } from '@/database/database';
import type { BreedImageRow, BreedRow, SQLiteBindValue } from '@/database/rowMappers';
import { breedToBindValues, mapBreedRow, mapImageRow } from '@/database/rowMappers';
import type { Breed, BreedImage, CoatCategory, FilterableTraitKey, SizeBand } from '@/types/domain';

/** A filter set from the UI. Empty arrays mean "no constraint on this facet". */
export interface BreedQuery {
  readonly search?: string;
  readonly groupIds?: readonly string[];
  readonly sizeBands?: readonly SizeBand[];
  readonly coatCategories?: readonly CoatCategory[];
  readonly hypoallergenic?: boolean | null;
  readonly traitKey?: FilterableTraitKey | null;
  readonly traitMinScore?: number | null;
}

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

/** Builds `IN (?, ?, ...)` with matching binds; returns null for empty input. */
function inClause(
  column: string,
  values: readonly string[],
): { readonly sql: string; readonly binds: readonly string[] } | null {
  if (values.length === 0) return null;
  const placeholders = values.map(() => '?').join(', ');
  return { sql: `${column} IN (${placeholders})`, binds: values };
}

/**
 * Translates a `BreedQuery` into a WHERE clause and its bind values.
 * Exported so it can be unit tested without a database.
 */
export function buildBreedWhereClause(query: BreedQuery): {
  readonly sql: string;
  readonly binds: readonly SQLiteBindValue[];
} {
  const conditions: string[] = [];
  const binds: SQLiteBindValue[] = [];

  const search = query.search?.trim().toLowerCase() ?? '';
  if (search.length > 0) {
    // Matches name or any other_name: both live in search_haystack.
    // Escaped so a user typing % or _ searches literally.
    conditions.push("search_haystack LIKE ? ESCAPE '\\'");
    binds.push(`%${escapeLikePattern(search)}%`);
  }

  const groupClause = inClause('group_id', query.groupIds ?? []);
  if (groupClause !== null) {
    conditions.push(groupClause.sql);
    binds.push(...groupClause.binds);
  }

  const sizeClause = inClause('size_band', query.sizeBands ?? []);
  if (sizeClause !== null) {
    conditions.push(sizeClause.sql);
    binds.push(...sizeClause.binds);
  }

  const coatClause = inClause('coat_category', query.coatCategories ?? []);
  if (coatClause !== null) {
    conditions.push(coatClause.sql);
    binds.push(...coatClause.binds);
  }

  if (query.hypoallergenic !== undefined && query.hypoallergenic !== null) {
    conditions.push('hypoallergenic = ?');
    binds.push(Number(query.hypoallergenic));
  }

  const traitKey = query.traitKey ?? null;
  const traitMin = query.traitMinScore ?? null;
  if (traitKey !== null && traitMin !== null) {
    // Column name comes from a closed union, never from user input.
    conditions.push(`${traitColumn(traitKey)} >= ?`);
    binds.push(traitMin);
  }

  const sql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { sql, binds };
}

function traitColumn(key: FilterableTraitKey): string {
  switch (key) {
    case 'good_with_children':
      return 'trait_good_with_children';
    case 'good_with_dogs':
      return 'trait_good_with_dogs';
    case 'good_with_strangers':
      return 'trait_good_with_strangers';
    default:
      return 'trait_good_with_children';
  }
}

/** Escapes LIKE wildcards so they are matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

/**
 * Persists breeds and their images in one transaction.
 *
 * Upserts rather than delete-then-insert: a sync that only returns part of the
 * dataset must never wipe rows it simply did not mention. Prepared statements
 * are reused across all rows, which is what keeps a 283-breed write fast.
 */
export async function upsertBreeds(breeds: readonly Breed[], syncedAt: number): Promise<void> {
  if (breeds.length === 0) return;
  const db = await getDatabase();

  await db.withTransaction(async () => {
    const breedStatement = await db.prepare(UPSERT_BREED_SQL);
    const imageStatement = await db.prepare(UPSERT_IMAGE_SQL);

    try {
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
    } finally {
      await breedStatement.finalize();
      await imageStatement.finalize();
    }
  });
}

/** Loads images for many breeds in one query, grouped by breed id. */
async function loadImagesFor(
  db: SqlDatabase,
  breedIds: readonly string[],
): Promise<Map<string, BreedImage[]>> {
  const grouped = new Map<string, BreedImage[]>();
  if (breedIds.length === 0) return grouped;

  const placeholders = breedIds.map(() => '?').join(', ');
  const rows = await db.getAll<BreedImageRow>(
    `SELECT id, breed_id, position, thumb_url, medium_url, large_url,
            author, license, license_url, source, source_url
       FROM breed_images
      WHERE breed_id IN (${placeholders})
      ORDER BY breed_id, position`,
    breedIds,
  );

  for (const row of rows) {
    const existing = grouped.get(row.breed_id);
    if (existing === undefined) grouped.set(row.breed_id, [mapImageRow(row)]);
    else existing.push(mapImageRow(row));
  }
  return grouped;
}

/**
 * Queries breeds with filters applied in SQL.
 *
 * Images are deliberately NOT loaded here: the list only needs
 * `thumbnail_url`, and hydrating ~2,400 image rows for a 283-row list would be
 * pure waste. The detail screen loads them for one breed via `getBreedById`.
 */
export async function queryBreeds(query: BreedQuery = {}): Promise<readonly Breed[]> {
  const db = await getDatabase();
  const { sql, binds } = buildBreedWhereClause(query);

  const rows = await db.getAll<BreedRow>(
    `SELECT ${BREED_COLUMNS} FROM breeds ${sql} ORDER BY name COLLATE NOCASE ASC`,
    binds,
  );

  return rows.map((row) => mapBreedRow(row, []));
}

/** Loads one breed with its images, for the detail screen. */
export async function getBreedById(id: string): Promise<Breed | null> {
  const db = await getDatabase();
  const row = await db.getFirst<BreedRow>(
    `SELECT ${BREED_COLUMNS} FROM breeds WHERE id = ?`,
    [id],
  );
  if (row === null) return null;

  const images = await loadImagesFor(db, [id]);
  return mapBreedRow(row, images.get(id) ?? []);
}

export async function countBreeds(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirst<{ total: number }>('SELECT COUNT(*) AS total FROM breeds');
  return row?.total ?? 0;
}

/** Clears breed data. Used only by an explicit user-initiated reset. */
export async function clearBreeds(): Promise<void> {
  const db = await getDatabase();
  await db.withTransaction(async () => {
    await db.run('DELETE FROM breed_images');
    await db.run('DELETE FROM breeds');
  });
}
