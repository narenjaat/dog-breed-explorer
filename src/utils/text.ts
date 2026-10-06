/** Small string helpers shared across UI and selectors. */

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
