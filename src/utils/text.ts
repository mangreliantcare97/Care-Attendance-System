/** Normalise a human name for case-insensitive comparisons. */
export function normaliseNameKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
