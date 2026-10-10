/** Teenybase may return JSON columns as strings. Parse strings, pass objects through, fall back on null/undefined or bad JSON. */
export function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}
