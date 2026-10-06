/**
 * External URL policy.
 *
 * Attribution links come from the API, so they are untrusted input. Handing
 * one straight to `Linking.openURL` would let a compromised or malformed
 * payload launch any scheme the OS knows (`intent:`, `tel:`, another app's
 * deep link). Only plain web links are allowed out.
 */

const WEB_URL = /^https?:\/\/[^\s/?#]+[^\s]*$/iu;

/** Returns the trimmed URL when it is an http(s) link, otherwise null. */
export function toSafeExternalUrl(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return WEB_URL.test(trimmed) ? trimmed : null;
}
