/**
 * Derivation tests: size banding and coat categorisation — the two places the
 * app invents classifications the API does not provide.
 */

import {
  buildSearchHaystack,
  deriveCoatCategory,
  deriveSizeBand,
  rangeMidpoint,
  representativeMeasurement,
} from '@/utils/derive';
import type { Coat, Range } from '@/types/domain';

const NONE: Range = { min: null, max: null };
const range = (min: number | null, max: number | null): Range => ({ min, max });
const coat = (type: string | null, length: string | null): Coat => ({ type, length, colors: [] });

describe('rangeMidpoint', () => {
  it('averages a complete range', () => {
    expect(rangeMidpoint(range(10, 20))).toBe(15);
  });

  it('uses the single known bound of a half-open range', () => {
    expect(rangeMidpoint(range(10, null))).toBe(10);
    expect(rangeMidpoint(range(null, 20))).toBe(20);
  });

  it('returns null when nothing is known', () => {
    expect(rangeMidpoint(NONE)).toBeNull();
  });
});

describe('representativeMeasurement', () => {
  it('averages male and female midpoints', () => {
    expect(representativeMeasurement(range(30, 40), range(20, 30))).toBe(30);
  });

  it('falls back to whichever sex has data', () => {
    expect(representativeMeasurement(NONE, range(20, 30))).toBe(25);
    expect(representativeMeasurement(range(30, 40), NONE)).toBe(35);
  });

  it('returns null when neither sex has data', () => {
    expect(representativeMeasurement(NONE, NONE)).toBeNull();
  });
});

describe('deriveSizeBand', () => {
  const bandForWeight = (min: number, max: number): string | null =>
    deriveSizeBand(range(min, max), range(min, max), NONE, NONE);

  it('classifies toy breeds as small', () => {
    expect(bandForWeight(2, 4)).toBe('small'); // Chihuahua
    expect(bandForWeight(3, 7)).toBe('small'); // Maltese
  });

  it('classifies mid-sized breeds as medium', () => {
    expect(bandForWeight(14, 20)).toBe('medium'); // Border Collie
  });

  it('classifies retriever-sized breeds as large', () => {
    expect(bandForWeight(29, 36)).toBe('large'); // Labrador
  });

  it('classifies mastiff-sized breeds as giant', () => {
    expect(bandForWeight(70, 100)).toBe('giant'); // Mastiff
  });

  it('places boundary values in the lower band', () => {
    // Thresholds are inclusive upper bounds: 10kg is small, not medium.
    expect(bandForWeight(10, 10)).toBe('small');
    expect(bandForWeight(25, 25)).toBe('medium');
    expect(bandForWeight(45, 45)).toBe('large');
    expect(bandForWeight(46, 46)).toBe('giant');
  });

  it('falls back to height when no weight is recorded', () => {
    expect(deriveSizeBand(NONE, NONE, range(20, 25), range(20, 25))).toBe('small');
    expect(deriveSizeBand(NONE, NONE, range(60, 70), range(58, 66))).toBe('large');
  });

  it('prefers weight over height when both exist', () => {
    // A heavy but short breed (e.g. Bulldog) is sized by weight.
    expect(deriveSizeBand(range(23, 25), range(18, 23), range(31, 40), range(31, 40))).toBe(
      'medium',
    );
  });

  it('returns null rather than guessing when nothing is measurable', () => {
    expect(deriveSizeBand(NONE, NONE, NONE, NONE)).toBeNull();
  });
});

describe('deriveCoatCategory', () => {
  it('treats wire as a category in its own right', () => {
    // The API models "wire" as a texture; the brief filters on it as a coat.
    expect(deriveCoatCategory(coat('wire', 'short'))).toBe('wire');
    expect(deriveCoatCategory(coat('wire', 'medium'))).toBe('wire');
  });

  it('maps curly and corded textures to curly', () => {
    expect(deriveCoatCategory(coat('curly', 'medium'))).toBe('curly');
    expect(deriveCoatCategory(coat('corded', 'long'))).toBe('curly');
  });

  it('maps hairless from either field', () => {
    expect(deriveCoatCategory(coat('hairless', 'hairless'))).toBe('hairless');
    expect(deriveCoatCategory(coat(null, 'hairless'))).toBe('hairless');
  });

  it('uses length for textures that do not imply one', () => {
    expect(deriveCoatCategory(coat('double', 'short'))).toBe('short');
    expect(deriveCoatCategory(coat('double', 'medium'))).toBe('medium');
    expect(deriveCoatCategory(coat('double', 'long'))).toBe('long');
    expect(deriveCoatCategory(coat('smooth', 'short'))).toBe('short');
  });

  it('falls back to the texture when length is missing', () => {
    expect(deriveCoatCategory(coat('smooth', null))).toBe('short');
    expect(deriveCoatCategory(coat('long', null))).toBe('long');
    expect(deriveCoatCategory(coat('double', null))).toBe('medium');
  });

  it('is case-insensitive', () => {
    expect(deriveCoatCategory(coat('WIRE', 'SHORT'))).toBe('wire');
  });

  it('returns null for an empty coat object', () => {
    expect(deriveCoatCategory(coat(null, null))).toBeNull();
  });

  it('returns null for an unrecognised texture with no length', () => {
    expect(deriveCoatCategory(coat('sequined', null))).toBeNull();
  });
});

describe('buildSearchHaystack', () => {
  it('lowercases the name and all alternate names', () => {
    const haystack = buildSearchHaystack('Affenpinscher', ['Monkey Terrier', 'Affen']);
    expect(haystack).toContain('affenpinscher');
    expect(haystack).toContain('monkey terrier');
    expect(haystack).toContain('affen');
  });

  it('works with no alternate names', () => {
    expect(buildSearchHaystack('Beagle', [])).toBe('beagle');
  });
});
