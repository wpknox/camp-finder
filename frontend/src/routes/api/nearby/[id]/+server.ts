// frontend/src/routes/api/nearby/[id]/+server.ts
import { json } from '@sveltejs/kit'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { buildOverpassQuery, normalizeOverpass, type NearbyPoi, type OverpassResponse } from '$lib/server/overpass'
import type { RequestHandler } from './$types'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const tbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TB_SERVICE_TOKEN}`,
}

function parsePois(v: unknown): NearbyPoi[] | null {
  if (v == null) return null
  if (typeof v === 'string') {
    try { return JSON.parse(v) as NearbyPoi[] } catch { return null }
  }
  return v as NearbyPoi[]
}

export const GET: RequestHandler = async ({ params }) => {
  const facilityId = params.id
  const cutoff = Date.now() - CACHE_TTL_MS

  const cacheRes = await tbFetch(`/api/v1/table/nearby_pois/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const cache = await cacheRes.json() as { items?: Array<{ id: string; pois: unknown; fetched_at: string }> }
  const row = cache.items?.[0]

  if (row && new Date(row.fetched_at).getTime() >= cutoff) {
    return json({ pois: parsePois(row.pois), fetched_at: row.fetched_at, cached: true })
  }

  const facRes = await tbFetch(`/api/v1/table/facilities/view/${facilityId}`)
  const facility = facRes.ok ? await facRes.json() as { lat?: number; lng?: number } : null

  if (facility?.lat == null || facility?.lng == null) return json({ pois: null })

  let pois: NearbyPoi[] | null = null
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CampFinder/1.0 (campground info aggregator)',
      },
      body: `data=${encodeURIComponent(buildOverpassQuery(facility.lat, facility.lng))}`,
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) pois = normalizeOverpass(await res.json() as OverpassResponse, facility.lat, facility.lng)
  } catch { /* fail gracefully below */ }

  if (pois === null) {
    // Overpass down or rate-limited: serve stale if we have anything at all.
    if (row) return json({ pois: parsePois(row.pois), fetched_at: row.fetched_at, cached: true, stale: true })
    return json({ pois: null })
  }

  const fetched_at = new Date().toISOString()

  if (row) {
    await tbFetch(`/api/v1/table/nearby_pois/edit/${row.id}`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ pois: JSON.stringify(pois), fetched_at }),
    })
  } else {
    await tbFetch(`/api/v1/table/nearby_pois/insert`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ values: { facility_id: facilityId, pois: JSON.stringify(pois), fetched_at } }),
    })
  }

  return json({ pois, fetched_at, cached: false })
}
