/**
 * Parser tests: the boundary where messy API data becomes typed domain data.
 */

import { parseBreed, parseCollection, parseGroup, parsePagination } from '@/api/parsers';
import {
  makeBreedWithWeight,
  makeCollectionResponse,
  makeCompleteBreed,
  makeSparseBreed,
} from '@/__tests__/fixtures';

describe('parseBreed', () => {
  it('maps a fully populated record into the domain model', () => {
    const breed = parseBreed(makeCompleteBreed());

    expect(breed).not.toBeNull();
    expect(breed?.name).toBe('Affenpinscher');
    expect(breed?.life).toEqual({ min: 14, max: 16 });
    expect(breed?.hypoallergenic).toBe(true);
    expect(breed?.origin.country).toBe('Germany');
    expect(breed?.traits.scores.energy).toBe(3);
    expect(breed?.traits.exerciseMinutes).toBe(30);
    expect(breed?.traits.temperament).toEqual(['confident', 'curious', 'playful']);
    expect(breed?.otherNames).toEqual(['Monkey Terrier', 'Affen']);
    expect(breed?.images).toHaveLength(2);
  });

  it('preserves image attribution rather than dropping it', () => {
    const breed = parseBreed(makeCompleteBreed());
    const first = breed?.images[0];

    expect(first?.attribution.author).toBe('Futurebreak');
    expect(first?.attribution.license).toBe('CC0');
    expect(first?.attribution.source).toBe('wikimedia_commons');
    expect(first?.attribution.sourceUrl).toContain('commons.wikimedia.org');
  });

  it('handles the sparse real-world record without throwing', () => {
    const breed = parseBreed(makeSparseBreed());

    expect(breed).not.toBeNull();
    expect(breed?.name).toBe('Bavarian Mountain Scent Hound');
    expect(breed?.origin).toEqual({ era: null, region: null, country: null });
    expect(breed?.coat.type).toBeNull();
    expect(breed?.maleHeight).toEqual({ min: null, max: null });
    expect(breed?.traits.temperament).toEqual([]);
  });

  it('represents a missing trait as null, never as zero', () => {
    const breed = parseBreed(makeSparseBreed());

    // 0 would render as an empty bar and read as "scores lowest",
    // which is a different claim from "not rated".
    expect(breed?.traits.scores.energy).toBeNull();
    expect(breed?.traits.scores.good_with_children).toBeNull();
    expect(breed?.traits.exerciseMinutes).toBeNull();
  });

  it('still derives a size band when heights are missing but weights are not', () => {
    const breed = parseBreed(makeSparseBreed());
    // 20-30kg midpoint is 25kg, which sits on the medium/large boundary.
    expect(breed?.sizeBand).toBe('medium');
  });

  it('returns null for records missing an id or a name', () => {
    expect(parseBreed({ type: 'breed', attributes: { name: 'No Id' } })).toBeNull();
    expect(parseBreed({ id: 'x', type: 'breed', attributes: {} })).toBeNull();
    expect(parseBreed({ id: 'x', type: 'breed' })).toBeNull();
  });

  it('returns null for values that are not objects at all', () => {
    expect(parseBreed(null)).toBeNull();
    expect(parseBreed(undefined)).toBeNull();
    expect(parseBreed('a string')).toBeNull();
    expect(parseBreed(42)).toBeNull();
    expect(parseBreed([])).toBeNull();
  });

  it('ignores fields whose types are wrong instead of trusting them', () => {
    const malformed = {
      id: 'breed-malformed',
      type: 'breed',
      attributes: {
        name: 'Malformed',
        life: { min: 'twelve', max: null },
        hypoallergenic: 'yes',
        other_names: ['Valid', 42, null, ''],
        traits: { energy: 'high', good_with_dogs: 4 },
        images: 'not-an-array',
      },
    };

    const breed = parseBreed(malformed);
    expect(breed?.life).toEqual({ min: null, max: null });
    expect(breed?.hypoallergenic).toBeNull();
    expect(breed?.otherNames).toEqual(['Valid']);
    expect(breed?.traits.scores.energy).toBeNull();
    expect(breed?.traits.scores.good_with_dogs).toBe(4);
    expect(breed?.images).toEqual([]);
  });

  it('builds a lowercased haystack covering name and other names', () => {
    const breed = parseBreed(makeCompleteBreed());
    expect(breed?.searchHaystack).toContain('affenpinscher');
    expect(breed?.searchHaystack).toContain('monkey terrier');
  });

  it('uses the first image thumbnail as the list thumbnail', () => {
    const breed = parseBreed(makeCompleteBreed());
    expect(breed?.thumbnailUrl).toBe('https://images.example/thumb-1');
  });

  it('falls back to another variant when thumb is absent', () => {
    const resource = makeCompleteBreed({
      attributes: {
        name: 'No Thumb',
        images: [{ id: 'i1', large: 'https://images.example/only-large' }],
      },
    });
    const breed = parseBreed(resource);
    expect(breed?.images[0]?.thumbUrl).toBe('https://images.example/only-large');
    expect(breed?.thumbnailUrl).toBe('https://images.example/only-large');
  });

  it('drops images that carry no usable URL in any variant', () => {
    const resource = makeCompleteBreed({
      attributes: {
        name: 'Broken Images',
        images: [{ id: 'i1', attribution: { author: 'Nobody' } }, { id: 'i2', thumb: 'https://ok' }],
      },
    });
    const breed = parseBreed(resource);
    expect(breed?.images).toHaveLength(1);
    expect(breed?.images[0]?.id).toBe('i2');
  });

  it('reads the group id from the relationships object', () => {
    const breed = parseBreed(makeCompleteBreed());
    expect(breed?.groupId).toBe('c1d7e2b4-6f3a-4a58-9b21-77f0c6d4e8a1');
  });

  it('tolerates a missing group relationship', () => {
    const resource = makeCompleteBreed({ relationships: {} });
    expect(parseBreed(resource)?.groupId).toBeNull();
  });
});

describe('parseCollection', () => {
  it('parses every valid record and counts the ones it skipped', () => {
    const payload = makeCollectionResponse(
      [makeCompleteBreed(), makeSparseBreed(), makeBreedWithWeight('w1', 'Weighted', 5, 7)],
      { current: 1, records: 3 },
    );

    const { items, skipped } = parseCollection(payload, parseBreed);
    expect(items).toHaveLength(3);
    expect(skipped).toBe(0);
  });

  it('keeps good records when a sibling record is unparseable', () => {
    const payload = {
      data: [makeCompleteBreed(), { id: 'broken', type: 'breed' }, makeSparseBreed()],
    };

    const { items, skipped } = parseCollection(payload, parseBreed);
    // One bad record must not cost us the other two.
    expect(items).toHaveLength(2);
    expect(skipped).toBe(1);
  });

  it('returns an empty result for a payload with no data array', () => {
    expect(parseCollection({ meta: {} }, parseBreed)).toEqual({ items: [], skipped: 0 });
    expect(parseCollection(null, parseBreed)).toEqual({ items: [], skipped: 0 });
  });
});

describe('parsePagination', () => {
  it('reads pagination metadata', () => {
    const payload = makeCollectionResponse([], { current: 1, next: 2, last: 6, records: 283 });
    expect(parsePagination(payload)).toMatchObject({ current: 1, next: 2, last: 6, records: 283 });
  });

  it('leaves absent fields undefined on the final page', () => {
    const payload = { meta: { pagination: { current: 6, prev: 5, records: 283 } } };
    const pagination = parsePagination(payload);
    expect(pagination.next).toBeUndefined();
    expect(pagination.last).toBeUndefined();
    expect(pagination.current).toBe(6);
  });

  it('returns an empty object when metadata is missing entirely', () => {
    expect(parsePagination({ data: [] })).toEqual({});
  });
});

describe('parseGroup', () => {
  it('parses a group resource', () => {
    expect(parseGroup({ id: 'g1', type: 'group', attributes: { name: 'Herding Group' } })).toEqual({
      id: 'g1',
      name: 'Herding Group',
    });
  });

  it('rejects a group with no name', () => {
    expect(parseGroup({ id: 'g1', type: 'group', attributes: {} })).toBeNull();
  });
});
