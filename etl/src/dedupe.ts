// etl/src/dedupe.ts
// Shared cross-source duplicate matching. Sources name the same campground
// differently — RIDB "ALMONT" vs fs.usda.gov "Almont Campground - Gunnison RD"
// vs NPS "Almont (CO)" — so names are canonicalized aggressively before
// comparison, and a match always also requires coordinate proximity.

export function canonicalName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/\([^()]*\)/g, " ") // parentheticals: "(CO)", "(Taylor River Canyon...)"
    .replace(/\s+/g, " ");
  // district suffixes: " - Gunnison RD" — strip from the first spaced dash on
  const dash = s.indexOf(" - ");
  if (dash !== -1) s = s.slice(0, dash);
  return s
    .replace(/\b(campground|camping area|cg)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ~1km at Colorado latitudes
const PROXIMITY_DEG = 0.01;

export function groupByCanonicalName<T extends { name: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = canonicalName(row.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function findDuplicate<T extends { lat: number; lng: number }>(
  byName: Map<string, T[]>,
  name: string,
  lat: number,
  lng: number,
): T | undefined {
  const candidates = byName.get(canonicalName(name)) ?? [];
  return candidates.find(
    (r) =>
      Math.abs(r.lat - lat) < PROXIMITY_DEG &&
      Math.abs(r.lng - lng) < PROXIMITY_DEG,
  );
}
