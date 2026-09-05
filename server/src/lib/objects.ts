/**
 * Drops keys whose value is `undefined`.
 *
 * Zod's `.partial()` produces objects with explicitly-present undefined keys,
 * which Prisma's update types reject under `exactOptionalPropertyTypes`. This
 * keeps "field not supplied" (skip it) distinct from "field set to null"
 * (write NULL), which matters for nullable columns.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }

  return result as { [K in keyof T]: Exclude<T[K], undefined> };
}
