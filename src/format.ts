/**
 * Display helpers. Every nullable field renders through these, so the UI shows
 * an em-dash instead of "null" or "undefined".
 */

import type { Origin, Range } from '@/types';

export const UNKNOWN_PLACEHOLDER = '—';

/** Formats a numeric range as "12–18 kg", tolerating a half-open range. */
export function formatRange(range: Range, unit: string): string {
  const { min, max } = range;
  if (min === null && max === null) return UNKNOWN_PLACEHOLDER;
  if (min !== null && max !== null) {
    if (min === max) return `${formatNumber(min)} ${unit}`;
    return `${formatNumber(min)}–${formatNumber(max)} ${unit}`;
  }
  if (min !== null) return `from ${formatNumber(min)} ${unit}`;
  return `up to ${formatNumber(max ?? 0)} ${unit}`;
}

/** Trims pointless decimals: 12.0 -> "12", 12.5 -> "12.5". */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatLifespan(range: Range): string {
  const { min, max } = range;
  if (min === null && max === null) return UNKNOWN_PLACEHOLDER;
  if (min !== null && max !== null) {
    if (min === max) return `${formatNumber(min)} years`;
    return `${formatNumber(min)}–${formatNumber(max)} years`;
  }
  const single = min ?? max ?? 0;
  return `${formatNumber(single)} years`;
}

/** Joins the parts of an origin that are actually known. */
export function formatOrigin(origin: Origin): string {
  const parts = [origin.country, origin.region, origin.era].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : UNKNOWN_PLACEHOLDER;
}

export function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : UNKNOWN_PLACEHOLDER;
}

export function formatHypoallergenic(value: boolean | null): string {
  if (value === null) return UNKNOWN_PLACEHOLDER;
  return value ? 'Yes' : 'No';
}

export function formatExerciseMinutes(minutes: number | null): string {
  if (minutes === null) return UNKNOWN_PLACEHOLDER;
  if (minutes < 60) return `${minutes} min/day`;
  const hours = minutes / 60;
  return `${formatNumber(hours)} hr/day`;
}

/** Turns "good_with_children" into "Good with children". */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/_/gu, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Relative time for the freshness indicator ("Last synced 2 hours ago").
 * Deliberately coarse — the user needs staleness, not a precise duration.
 */
export function formatRelativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null) return 'never';

  const elapsed = now - timestamp;
  if (elapsed < 0) return 'just now'; // clock skew; do not say "in -3 minutes"
  if (elapsed < MINUTE_MS) return 'just now';

  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Strips the API's redundant group suffixes for display:
 * "Herding Group" -> "Herding", "Miscellaneous Class" -> "Miscellaneous".
 * "Foundation Stock Service" is left intact — it is the real name.
 */
export function formatGroupName(name: string): string {
  return name.replace(/\s+(Group|Class)$/u, '');
}

/** Initials for the thumbnail placeholder shown before an image loads. */
export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return '?';
  const second = words[1];
  if (second === undefined) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

const WEB_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/iu;

/** Returns the trimmed URL when it is an http(s) link, otherwise null. */
export function toSafeExternalUrl(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return WEB_URL.test(trimmed) ? trimmed : null;
}
