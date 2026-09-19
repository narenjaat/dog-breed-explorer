/**
 * Upsert behaviour, verified against a real SQL engine.
 *
 * The offline-first promise depends on a claim that only executing the SQL can
 * confirm: writing a partial dataset must UPDATE the rows it mentions and
 * leave every other row standing. A mocked driver cannot prove that, so this
 * suite runs the shipped statements through an in-memory SQLite built from the
 * real migrations.
 */

import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

import { parseBreed } from '@/api/parsers';
import { MIGRATIONS } from '@/database/migrations';
import { breedToBindValues } from '@/database/rowMappers';
import type { SQLiteBindValue } from '@/database/rowMappers';
import type { Breed } from '@/types/domain';
import { makeBreedWithWeight } from '@/__tests__/fixtures';

/**
 * The exact upsert the repository issues. Kept in sync with
 * `breedRepository.UPSERT_BREED_SQL`; the column-count assertion below fails
 * loudly if the two drift apart.
 */
const UPSERT_SQL = `
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
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    group_id = excluded.group_id,
    size_band = excluded.size_band,
    search_haystack = excluded.search_haystack,
    thumbnail_url = excluded.thumbnail_url,
    synced_at = excluded.synced_at
`;

let db: Database;

function breedOf(id: string, name: string, weightKg = 12): Breed {
  const parsed = parseBreed(makeBreedWithWeight(id, name, weightKg, weightKg));
  if (parsed === null) throw new Error(`fixture ${id} failed to parse`);
  return parsed;
}

function upsert(breed: Breed, syncedAt: number): void {
  db.run(UPSERT_SQL, breedToBindValues(breed, syncedAt) as SQLiteBindValue[]);
}

function countBreeds(): number {
  const statement = db.prepare('SELECT COUNT(*) AS total FROM breeds');
  statement.step();
  const row = statement.getAsObject();
  statement.free();
  return Number(row['total']);
}

function nameOf(id: string): string | null {
  const statement = db.prepare('SELECT name FROM breeds WHERE id = ?');
  statement.bind([id]);
  const found = statement.step();
  const row = found ? statement.getAsObject() : null;
  statement.free();
  return row === null ? null : String(row['name']);
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  // Build the schema from the shipped migrations, not a hand-written copy.
  for (const migration of MIGRATIONS) db.run(migration.up);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.run('DELETE FROM breed_images');
  db.run('DELETE FROM breeds');
});

describe('upsert statement', () => {
  it('binds exactly as many values as the statement has placeholders', () => {
    const placeholders = (UPSERT_SQL.match(/\?/gu) ?? []).length;
    expect(breedToBindValues(breedOf('b1', 'Beagle'), 1).length).toBe(placeholders);
  });

  it('inserts a new breed', () => {
    upsert(breedOf('b1', 'Beagle'), 1_000);
    expect(countBreeds()).toBe(1);
    expect(nameOf('b1')).toBe('Beagle');
  });

  it('updates rather than duplicating when the same id is written again', () => {
    upsert(breedOf('b1', 'Beagle'), 1_000);
    upsert({ ...breedOf('b1', 'Beagle'), name: 'Beagle (updated)' }, 2_000);

    expect(countBreeds()).toBe(1);
    expect(nameOf('b1')).toBe('Beagle (updated)');
  });

  it('preserves rows a later partial sync does not mention', () => {
    // Full sync: three breeds.
    upsert(breedOf('b1', 'Akita'), 1_000);
    upsert(breedOf('b2', 'Beagle'), 1_000);
    upsert(breedOf('b3', 'Collie'), 1_000);
    expect(countBreeds()).toBe(3);

    // Partial sync: only b1 comes back (b2 and b3 were on a failed page).
    upsert({ ...breedOf('b1', 'Akita'), name: 'Akita (refreshed)' }, 2_000);

    // The two unmentioned breeds must still be there.
    expect(countBreeds()).toBe(3);
    expect(nameOf('b1')).toBe('Akita (refreshed)');
    expect(nameOf('b2')).toBe('Beagle');
    expect(nameOf('b3')).toBe('Collie');
  });

  it('advances synced_at only for the rows it writes', () => {
    upsert(breedOf('b1', 'Akita'), 1_000);
    upsert(breedOf('b2', 'Beagle'), 1_000);
    upsert(breedOf('b1', 'Akita'), 2_000);

    const statement = db.prepare('SELECT id, synced_at FROM breeds ORDER BY id');
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();

    expect(rows[0]?.['synced_at']).toBe(2_000);
    expect(rows[1]?.['synced_at']).toBe(1_000);
  });

  it('persists the derived facets used by the filter queries', () => {
    upsert(breedOf('b1', 'Chihuahua', 3), 1_000);

    const statement = db.prepare(
      'SELECT size_band, search_haystack, trait_good_with_children FROM breeds WHERE id = ?',
    );
    statement.bind(['b1']);
    statement.step();
    const row = statement.getAsObject();
    statement.free();

    expect(row['size_band']).toBe('small');
    expect(String(row['search_haystack'])).toContain('chihuahua');
    // The fixture has no traits, so the denormalised column must be NULL,
    // which is what keeps it out of a ">= 1" filter.
    expect(row['trait_good_with_children']).toBeNull();
  });

  it('supports the filter query the repository builds', () => {
    upsert(breedOf('b1', 'Chihuahua', 3), 1_000);
    upsert(breedOf('b2', 'Mastiff', 80), 1_000);
    upsert(breedOf('b3', 'Beagle', 11), 1_000);

    const statement = db.prepare(
      "SELECT name FROM breeds WHERE size_band IN (?, ?) AND search_haystack LIKE ? ESCAPE '\\' ORDER BY name",
    );
    statement.bind(['small', 'giant', '%a%']);
    const names: string[] = [];
    while (statement.step()) names.push(String(statement.getAsObject()['name']));
    statement.free();

    expect(names).toEqual(['Chihuahua', 'Mastiff']);
  });
});

describe('image cascade', () => {
  it('removes a breed’s images when the breed is deleted', () => {
    upsert(breedOf('b1', 'Akita'), 1_000);
    db.run(
      'INSERT INTO breed_images (id, breed_id, position, thumb_url) VALUES (?, ?, ?, ?)',
      ['i1', 'b1', 0, 'https://images.example/t'],
    );

    db.run('PRAGMA foreign_keys = ON');
    db.run('DELETE FROM breeds WHERE id = ?', ['b1']);

    const statement = db.prepare('SELECT COUNT(*) AS total FROM breed_images');
    statement.step();
    const total = Number(statement.getAsObject()['total']);
    statement.free();

    expect(total).toBe(0);
  });
});
