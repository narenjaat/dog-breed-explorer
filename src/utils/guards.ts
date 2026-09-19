/**
 * Runtime type guards.
 *
 * The API layer receives `unknown` from `response.json()` and narrows it here.
 * This is the only sanctioned way to cross from untrusted JSON into typed
 * domain code — there is no `any` anywhere in the codebase.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** True only for real, finite numbers (rejects NaN/Infinity from bad JSON). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Reads a string property, returning null when absent, empty or wrong-typed. */
export function optionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (!isString(value)) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Reads a finite-number property, returning null when absent or wrong-typed. */
export function optionalNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return isFiniteNumber(value) ? value : null;
}

export function optionalBoolean(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return isBoolean(value) ? value : null;
}

/** Reads a nested object property; returns an empty record when absent. */
export function nestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

/**
 * Reads an array of non-empty strings, dropping any non-string entries.
 * Returns a frozen empty array when the field is absent or malformed.
 */
export function stringArray(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  if (!isArray(value)) return EMPTY_STRINGS;
  const out: string[] = [];
  for (const entry of value) {
    if (isString(entry)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}

/** Reads an array of objects, dropping non-object entries. */
export function recordArray(
  source: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const value = source[key];
  if (!isArray(value)) return [];
  return value.filter(isRecord);
}

const EMPTY_STRINGS: readonly string[] = Object.freeze([]);
