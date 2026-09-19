/**
 * Derived facets: size band, coat category, search haystack.
 *
 * These run once per breed at parse time (not during render) so the list
 * screen can filter on plain scalar fields. Kept pure and dependency-free so
 * they are cheap to unit test.
 */

import type { Coat, CoatCategory, Range, SizeBand } from '@/types/domain';

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
