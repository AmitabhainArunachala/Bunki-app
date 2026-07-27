/**
 * Stable JSON, shared by replay and the golden harness (WP-02).
 *
 * This lives in its own module rather than inside `golden.ts` because both
 * `replay.ts` and `golden.ts` need it and `golden.ts` already imports
 * `replay.ts`. Putting it here keeps the dependency a tree instead of a cycle.
 *
 * Comparison on canonical text rather than structural equality is deliberate:
 * two values can be `toEqual`-equal and serialise differently, and a difference
 * that survives into exported bytes is a real difference. WP-03's export
 * round-trip (T-14) compares bytes, so the gates above it have to as well.
 */

/**
 * Stable JSON: object keys sorted, arrays left in their meaningful order.
 *
 * Sorting keys means the text depends only on the *content* of the value, not
 * on the order a reducer happened to assign fields. Arrays are never sorted
 * here — `observations` is in log order and that order is part of the evidence.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value), null, 2);
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    Object.keys(source)
      .sort()
      .forEach((key) => {
        sorted[key] = canonicalise(source[key]);
      });
    return sorted;
  }
  return value;
}
