// frontend/src/lib/server/overpass.ts — query building + normalization for the
// "things nearby" feature. Pure functions; the fetch lives in the route.
export interface NearbyPoi {
  name: string
  category: 'trailhead' | 'grocery' | 'fuel'
  lat: number
  lng: number
  distance_m: number
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export interface OverpassResponse {
  elements: OverpassElement[]
}

const TRAILHEAD_RADIUS_M = 8000
const SUPPLY_RADIUS_M = 25000
const MAX_TRAILHEADS = 6

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function buildOverpassQuery(lat: number, lng: number): string {
  return `[out:json][timeout:10];
(
  nwr["highway"="trailhead"]["name"](around:${TRAILHEAD_RADIUS_M},${lat},${lng});
  nwr["shop"~"^(supermarket|convenience)$"]["name"](around:${SUPPLY_RADIUS_M},${lat},${lng});
  nwr["amenity"="fuel"](around:${SUPPLY_RADIUS_M},${lat},${lng});
);
out center 200;`
}

function coords(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon }
  if (el.center) return { lat: el.center.lat, lng: el.center.lon }
  return null
}

function categorize(tags: Record<string, string>): NearbyPoi['category'] | null {
  if (tags.highway === 'trailhead') return 'trailhead'
  if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 'grocery'
  if (tags.amenity === 'fuel') return 'fuel'
  return null
}

export function normalizeOverpass(raw: OverpassResponse, lat: number, lng: number): NearbyPoi[] {
  const all: NearbyPoi[] = []
  for (const el of raw.elements ?? []) {
    const tags = el.tags ?? {}
    const category = categorize(tags)
    const c = coords(el)
    if (!category || !c) continue
    const name = tags.name ?? tags.brand ?? (category === 'fuel' ? 'Gas station' : null)
    if (!name) continue // unnamed trailheads/shops aren't useful list entries
    all.push({ name, category, lat: c.lat, lng: c.lng, distance_m: Math.round(haversineMeters(lat, lng, c.lat, c.lng)) })
  }
  all.sort((a, b) => a.distance_m - b.distance_m)
  return [
    ...all.filter((p) => p.category === 'trailhead').slice(0, MAX_TRAILHEADS),
    ...all.filter((p) => p.category === 'grocery').slice(0, 1),
    ...all.filter((p) => p.category === 'fuel').slice(0, 1),
  ]
}
