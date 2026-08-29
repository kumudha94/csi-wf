/**
 * Parses a route/query param into a positive integer id.
 *
 * Returns null for anything that isn't one (empty string, "abc", "1.5", "-3",
 * "0"), so callers can answer 400 instead of letting `NaN` reach Postgres and
 * surface as a raw 500 (error code 22P02, "invalid input syntax for integer").
 */
export function parseId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
