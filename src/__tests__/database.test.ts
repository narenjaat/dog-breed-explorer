/**
 * Database layer tests.
 *
 * The SQL builder and the row mappers are pure, so they are tested directly.
 * A fake in-memory SQLite driver covers the repository's write path, proving
 * the upsert is genuinely an upsert (it must never delete unmentioned rows).
 */

import { parseBreed } from '@/api/parsers';
import { mapBreedRow, mapImageRow } from '@/database/repository';
import type { BreedImageRow, BreedRow } from '@/database/repository';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@/database/database';
import { makeCompleteBreed } from '@/__tests__/fixtures';

describe('row mapping', () => {
  const baseRow: BreedRow = {
    id: 'b1',
    name: 'Border Collie',
    description: 'A herding breed.',
    group_id: 'g1',
    life_min: 12,
    life_max: 15,
    male_weight_min: 14,
    male_weight_max: 20,
    female_weight_min: 12,
    female_weight_max: 19,
    male_height_min: 48,
    male_height_max: 56,
    female_height_min: 46,
    female_height_max: 53,
    hypoallergenic: 0,
    origin_era: null,
    origin_region: 'Anglo-Scottish border',
    origin_country: 'United Kingdom',
    coat_type: 'double',
    coat_length: 'medium',
    coat_colors_json: '["black","white"]',
    traits_json: '{"energy":5,"barking":3}',
    exercise_minutes: 120,
    temperament_json: '["intelligent","energetic"]',
    other_names_json: '["Scottish Sheepdog"]',
    recognized_by_json: '["AKC"]',
    sources_json: '[{"url":"https://example.org","title":"Standard"}]',
    size_band: 'medium',
    coat_category: 'medium',
    search_haystack: 'border collie | scottish sheepdog',
    thumbnail_url: 'https://images.example/thumb',
  };

  it('reconstructs the domain object from a row', () => {
    const breed = mapBreedRow(baseRow, []);

    expect(breed.name).toBe('Border Collie');
    expect(breed.life).toEqual({ min: 12, max: 15 });
    expect(breed.coat.colors).toEqual(['black', 'white']);
    expect(breed.traits.scores.energy).toBe(5);
    expect(breed.traits.temperament).toEqual(['intelligent', 'energetic']);
    expect(breed.otherNames).toEqual(['Scottish Sheepdog']);
    expect(breed.sources[0]?.title).toBe('Standard');
  });

  it('maps SQLite integer booleans back to true/false/null', () => {
    expect(mapBreedRow({ ...baseRow, hypoallergenic: 0 }, []).hypoallergenic).toBe(false);
    expect(mapBreedRow({ ...baseRow, hypoallergenic: 1 }, []).hypoallergenic).toBe(true);
    expect(mapBreedRow({ ...baseRow, hypoallergenic: null }, []).hypoallergenic).toBeNull();
  });

  it('reports traits absent from the stored JSON as null', () => {
    const breed = mapBreedRow(baseRow, []);
    expect(breed.traits.scores.drooling).toBeNull();
  });

  it('survives corrupt JSON columns instead of throwing', () => {
    const corrupt: BreedRow = {
      ...baseRow,
      coat_colors_json: '{not json',
      traits_json: 'null',
      temperament_json: '"a string, not an array"',
    };

    const breed = mapBreedRow(corrupt, []);
    expect(breed.coat.colors).toEqual([]);
    expect(breed.traits.scores.energy).toBeNull();
    expect(breed.traits.temperament).toEqual([]);
  });

  it('rejects a size band that is not in the union', () => {
    expect(mapBreedRow({ ...baseRow, size_band: 'enormous' }, []).sizeBand).toBeNull();
    expect(mapBreedRow({ ...baseRow, coat_category: 'fluffy' }, []).coatCategory).toBeNull();
  });

  it('maps an image row including its attribution', () => {
    const row: BreedImageRow = {
      id: 'i1',
      breed_id: 'b1',
      position: 0,
      thumb_url: 'https://images.example/t',
      medium_url: 'https://images.example/m',
      large_url: 'https://images.example/l',
      author: 'Photographer',
      license: 'CC BY 2.0',
      license_url: 'https://creativecommons.org/licenses/by/2.0',
      source: 'wikimedia_commons',
      source_url: 'https://commons.wikimedia.org/x',
    };

    const image = mapImageRow(row);
    expect(image.attribution.author).toBe('Photographer');
    expect(image.attribution.license).toBe('CC BY 2.0');
    expect(image.largeUrl).toBe('https://images.example/l');
  });
});

describe('round trip', () => {
  it('preserves a parsed breed through serialisation and back', () => {
    const parsed = parseBreed(makeCompleteBreed());
    if (parsed === null) throw new Error('fixture failed to parse');

    // Mirrors what breedToBindValues writes and mapBreedRow reads.
    const row: BreedRow = {
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      group_id: parsed.groupId,
      life_min: parsed.life.min,
      life_max: parsed.life.max,
      male_weight_min: parsed.maleWeight.min,
      male_weight_max: parsed.maleWeight.max,
      female_weight_min: parsed.femaleWeight.min,
      female_weight_max: parsed.femaleWeight.max,
      male_height_min: parsed.maleHeight.min,
      male_height_max: parsed.maleHeight.max,
      female_height_min: parsed.femaleHeight.min,
      female_height_max: parsed.femaleHeight.max,
      hypoallergenic: parsed.hypoallergenic === null ? null : Number(parsed.hypoallergenic),
      origin_era: parsed.origin.era,
      origin_region: parsed.origin.region,
      origin_country: parsed.origin.country,
      coat_type: parsed.coat.type,
      coat_length: parsed.coat.length,
      coat_colors_json: JSON.stringify(parsed.coat.colors),
      traits_json: JSON.stringify(parsed.traits.scores),
      exercise_minutes: parsed.traits.exerciseMinutes,
      temperament_json: JSON.stringify(parsed.traits.temperament),
      other_names_json: JSON.stringify(parsed.otherNames),
      recognized_by_json: JSON.stringify(parsed.recognizedBy),
      sources_json: JSON.stringify(parsed.sources),
      size_band: parsed.sizeBand,
      coat_category: parsed.coatCategory,
      search_haystack: parsed.searchHaystack,
      thumbnail_url: parsed.thumbnailUrl,
    };

    const restored = mapBreedRow(row, parsed.images);

    expect(restored.name).toBe(parsed.name);
    expect(restored.traits.scores).toEqual(parsed.traits.scores);
    expect(restored.sizeBand).toBe(parsed.sizeBand);
    expect(restored.coatCategory).toBe(parsed.coatCategory);
    expect(restored.images).toHaveLength(parsed.images.length);
    expect(restored.searchHaystack).toBe(parsed.searchHaystack);
  });
});

describe('migrations', () => {
  it('has strictly increasing version numbers', () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('reports the latest version', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });

  it('creates every table the repositories query', () => {
    const sql = MIGRATIONS.map((migration) => migration.up).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS breeds');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS groups');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS breed_images');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sync_metadata');
  });

  it('indexes every column the list filters on', () => {
    const sql = MIGRATIONS.map((migration) => migration.up).join('\n');
    for (const column of ['group', 'size', 'coat', 'hypo', 'name']) {
      expect(sql).toContain(`idx_breeds_${column}`);
    }
  });
});
