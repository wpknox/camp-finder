// RIDB ParentOrgID → human-readable managing agency
const ORG_ID_MAP: Record<string, string> = {
  "128": "National Park Service",
  "130": "Colorado State Parks",
  "131": "USDA Forest Service",
  "126": "Bureau of Land Management",
};

export function parentOrgToAgency(orgId: string | undefined): string {
  return ORG_ID_MAP[orgId ?? ""] ?? "";
}

// RIDB query params for campground facilities. Deliberately NO `state` or
// `activity` filter: `state` matches on the facility's address record, and
// `activity` on its ACTIVITY list — both are empty for many real campgrounds
// (e.g. ROSY LANE 232157), which silently drops them from results. Coverage
// comes from lat/lng radius queries over the CO_GRID instead; junk records
// mislabeled as Campground (trailheads, day-use) are filtered downstream by
// requiring at least one overnight campsite.
export const CAMPGROUND_QUERY_PARAMS = {
  facilitytype: "Campground",
} as const;

// Colorado bounding box, padded slightly so border campgrounds aren't lost
// to coordinate rounding.
export const CO_BBOX = {
  north: 41.01,
  south: 36.99,
  east: -102.03,
  west: -109.07,
} as const;

export function inCoBbox(lat: number, lng: number): boolean {
  return (
    lat >= CO_BBOX.south &&
    lat <= CO_BBOX.north &&
    lng >= CO_BBOX.west &&
    lng <= CO_BBOX.east
  );
}

// RIDB silently clamps the `radius` param to ~25 miles (measured: 25/50/100/200
// all return identical counts), so full state coverage requires a grid of
// circle queries. Step sizes keep every point in the bbox within 25 miles of a
// grid point: 0.4° lat ≈ 27.6mi, 0.5° lng ≈ 26.7mi at 39°N → half-diagonal
// ≈ 19.2mi, comfortably under the 25mi radius.
export const GRID_RADIUS_MILES = 25;
const LAT_STEP = 0.4;
const LNG_STEP = 0.5;

export function buildCoGrid(): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (
    let lat = CO_BBOX.south + LAT_STEP / 2;
    lat < CO_BBOX.north + LAT_STEP / 2;
    lat += LAT_STEP
  ) {
    for (
      let lng = CO_BBOX.west + LNG_STEP / 2;
      lng < CO_BBOX.east + LNG_STEP / 2;
      lng += LNG_STEP
    ) {
      points.push({
        lat: Math.round(lat * 100) / 100,
        lng: Math.round(lng * 100) / 100,
      });
    }
  }
  return points;
}
