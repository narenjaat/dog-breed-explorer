/**
 * Schema migrations, applied in order and tracked by `PRAGMA user_version`.
 *
 * Adding a schema change means appending a migration here — never editing an
 * existing one, since shipped installs have already run it.
 */

import type { SqlDatabase } from '@/database/database';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
}

/**
 * v1 — breeds, groups, images and sync metadata.
 *
 * Design notes:
 *  - Scalar columns hold everything the *list* screen filters or sorts on
 *    (group_id, size_band, coat_category, hypoallergenic, the three filterable
 *    trait scores, search_haystack). These are indexed so filtering can move
 *    into SQLite when the dataset outgrows memory. At 283 rows the list
 *    filters in a memoised selector instead (see DECISIONS.md §4).
 *  - Rarely-queried nested structures (colors, sources, recognized_by,
 *    temperament, the full trait map) are stored as JSON text. Splitting them
 *    into child tables would add joins and write cost for data that is only
 *    ever read back whole, on one detail screen.
 *  - Images get their own table: they are a true one-to-many (up to 10 per
 *    breed), the list needs only image 0, and a separate table lets the
 *    gallery load them lazily without inflating every list row.
 */
const MIGRATION_001: Migration = {
  version: 1,
  name: 'initial_schema',
  up: `
    CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS breeds (
      id                  TEXT PRIMARY KEY NOT NULL,
      name                TEXT NOT NULL,
      description         TEXT,
      group_id            TEXT,

      life_min            REAL,
      life_max            REAL,
      male_weight_min     REAL,
      male_weight_max     REAL,
      female_weight_min   REAL,
      female_weight_max   REAL,
      male_height_min     REAL,
      male_height_max     REAL,
      female_height_min   REAL,
      female_height_max   REAL,

      -- 0/1/NULL: NULL means the API did not state it.
      hypoallergenic      INTEGER,

      origin_era          TEXT,
      origin_region       TEXT,
      origin_country      TEXT,

      coat_type           TEXT,
      coat_length         TEXT,
      coat_colors_json    TEXT NOT NULL DEFAULT '[]',

      -- Full 1-5 trait map, kept whole for the detail screen.
      traits_json         TEXT NOT NULL DEFAULT '{}',
      exercise_minutes    INTEGER,
      temperament_json    TEXT NOT NULL DEFAULT '[]',

      -- Denormalised for indexed filtering (see design notes above).
      trait_good_with_children  INTEGER,
      trait_good_with_dogs      INTEGER,
      trait_good_with_strangers INTEGER,

      other_names_json    TEXT NOT NULL DEFAULT '[]',
      recognized_by_json  TEXT NOT NULL DEFAULT '[]',
      sources_json        TEXT NOT NULL DEFAULT '[]',

      -- Derived facets, computed at parse time and persisted so filters
      -- never recompute them.
      size_band           TEXT,
      coat_category       TEXT,
      search_haystack     TEXT NOT NULL DEFAULT '',
      thumbnail_url       TEXT,

      synced_at           INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_breeds_name ON breeds (name);
    CREATE INDEX IF NOT EXISTS idx_breeds_group ON breeds (group_id);
    CREATE INDEX IF NOT EXISTS idx_breeds_size ON breeds (size_band);
    CREATE INDEX IF NOT EXISTS idx_breeds_coat ON breeds (coat_category);
    CREATE INDEX IF NOT EXISTS idx_breeds_hypo ON breeds (hypoallergenic);

    CREATE TABLE IF NOT EXISTS breed_images (
      id              TEXT PRIMARY KEY NOT NULL,
      breed_id        TEXT NOT NULL,
      position        INTEGER NOT NULL,
      thumb_url       TEXT,
      medium_url      TEXT,
      large_url       TEXT,
      author          TEXT,
      license         TEXT,
      license_url     TEXT,
      source          TEXT,
      source_url      TEXT,
      FOREIGN KEY (breed_id) REFERENCES breeds (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_breed ON breed_images (breed_id, position);

    -- Single-row-per-key store for sync bookkeeping (last success, status,
    -- failed pages). Kept as a key/value table so new sync fields do not
    -- require a migration.
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key         TEXT PRIMARY KEY NOT NULL,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `,
};

export const MIGRATIONS: readonly Migration[] = [MIGRATION_001];

export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);

/**
 * Applies any migrations newer than the database's current `user_version`.
 * Each migration runs inside a transaction so a partial apply cannot leave a
 * half-built schema behind.
 */
export async function runMigrations(db: SqlDatabase): Promise<number> {
  const row = await db.getFirst<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  let appliedVersion = currentVersion;
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    await db.withTransaction(async () => {
      await db.exec(migration.up);
    });
    // PRAGMA cannot be parameterised, and the value is a trusted literal.
    await db.exec(`PRAGMA user_version = ${String(migration.version)}`);
    appliedVersion = migration.version;
  }

  return appliedVersion;
}
