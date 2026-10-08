// Shared great-circle distance helpers. Pure: safe in browser, server and tests.

const EARTH_RADIUS_KM = 6371
const EARTH_RADIUS_M = 6371000
const EARTH_RADIUS_MI = 3958.8

function haversine(aLat: number, aLng: number, bLat: number, bLng: number, radius: number): number {
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return haversine(aLat, aLng, bLat, bLng, EARTH_RADIUS_KM)
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return haversine(aLat, aLng, bLat, bLng, EARTH_RADIUS_M)
}

export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversine(a.lat, a.lng, b.lat, b.lng, EARTH_RADIUS_MI)
}

export function findNearby(
  facilities: Array<{ id: string; name: string; lat: number; lng: number }>,
  lat: number,
  lng: number,
  km = 1.5,
): Array<{ id: string; name: string; km: number }> {
  return facilities
    .map((f) => ({ id: f.id, name: f.name, km: distanceKm(lat, lng, f.lat, f.lng) }))
    .filter((f) => f.km <= km)
    .sort((a, b) => a.km - b.km)
    .map((f) => ({ ...f, km: Math.round(f.km * 100) / 100 }))
}
