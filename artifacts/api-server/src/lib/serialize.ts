/**
 * Converts all Date objects to ISO strings so Zod response schemas
 * (which expect string timestamps) can parse Drizzle query results.
 */
export function serializeForZod<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}
