// Shared by browser and server routes: no $env / $lib/server imports here.
import { EDITABLE_AMENITIES, type EditableAmenityKey } from './amenityFields'
import { deriveFcfsFlags } from './fcfs'
import type { Amenities, CampgroundSubmission, DataQuality, TriState } from './types'

const AMENITY_KEYS = EDITABLE_AMENITIES.map((a) => a.key) as EditableAmenityKey[]
const SUBMISSION_KEYS = new Set([
  'name', 'lat', 'lng', 'fee_min', 'fee_max', 'season_start', 'season_end',
  'fcfs_total', 'reservable_total', 'amenities', 'description', 'forest', 'district',
])
const NAME_MAX = 120
const STRING_MAX = 200
const DESCRIPTION_MAX = 2000
const URL_MAX = 500

export interface CampgroundDraft {
  name: string
  latStr: string
  lngStr: string
  feeMin: string
  feeMax: string
  seasonStart: string
  seasonEnd: string
  fcfsTotal: string
  reservableTotal: string
  description: string
  forest: string
  district: string
  amenities: Record<EditableAmenityKey, TriState>
}

function triState(v: boolean | null | undefined): TriState {
  return v === true ? 'yes' : v === false ? 'no' : 'unknown'
}

export function emptyDraft(lat: number, lng: number): CampgroundDraft {
  return {
    name: '',
    latStr: lat.toFixed(5),
    lngStr: lng.toFixed(5),
    feeMin: '',
    feeMax: '',
    seasonStart: '',
    seasonEnd: '',
    fcfsTotal: '',
    reservableTotal: '',
    description: '',
    forest: '',
    district: '',
    amenities: Object.fromEntries(AMENITY_KEYS.map((k) => [k, 'unknown'])) as Record<EditableAmenityKey, TriState>,
  }
}

export function draftFromSubmission(s: CampgroundSubmission): CampgroundDraft {
  const str = (v: string | number | null | undefined) => (v == null ? '' : String(v))
  const d = emptyDraft(s.lat, s.lng)
  d.name = s.name
  d.feeMin = str(s.fee_min)
  d.feeMax = str(s.fee_max)
  d.seasonStart = str(s.season_start)
  d.seasonEnd = str(s.season_end)
  d.fcfsTotal = str(s.fcfs_total)
  d.reservableTotal = str(s.reservable_total)
  d.description = str(s.description)
  d.forest = str(s.forest)
  d.district = str(s.district)
  for (const k of AMENITY_KEYS) d.amenities[k] = triState(s.amenities?.[k])
  return d
}

function countError(v: string): string {
  if (v.trim() === '') return ''
  const n = Number(v)
  return !Number.isInteger(n) || n < 0 ? 'Enter a whole number (0 or more).' : ''
}

function feeError(v: string): string {
  if (v.trim() === '') return ''
  const n = Number(v)
  return Number.isNaN(n) || n < 0 ? 'Enter a valid number.' : ''
}

export function draftErrors(d: CampgroundDraft): Partial<Record<keyof CampgroundDraft, string>> {
  const e: Partial<Record<keyof CampgroundDraft, string>> = {}
  const name = d.name.trim()
  if (name === '') e.name = 'Name is required.'
  else if (name.length > NAME_MAX) e.name = `Name must be ${NAME_MAX} characters or fewer.`

  const lat = Number(d.latStr)
  if (d.latStr.trim() === '' || Number.isNaN(lat) || lat < -90 || lat > 90) e.latStr = 'Latitude must be -90 to 90.'
  const lng = Number(d.lngStr)
  if (d.lngStr.trim() === '' || Number.isNaN(lng) || lng < -180 || lng > 180) e.lngStr = 'Longitude must be -180 to 180.'

  const fm = feeError(d.feeMin)
  if (fm) e.feeMin = fm
  const fx = feeError(d.feeMax)
  if (fx) e.feeMax = fx
  if (!fm && !fx && d.feeMin.trim() !== '' && d.feeMax.trim() !== '' && Number(d.feeMax) < Number(d.feeMin))
    e.feeMax = 'Max fee must be at least the min fee.'

  const ft = countError(d.fcfsTotal)
  if (ft) e.fcfsTotal = ft
  const rt = countError(d.reservableTotal)
  if (rt) e.reservableTotal = rt

  if (d.seasonStart.length > STRING_MAX) e.seasonStart = `Keep this under ${STRING_MAX} characters.`
  if (d.seasonEnd.length > STRING_MAX) e.seasonEnd = `Keep this under ${STRING_MAX} characters.`
  if (d.forest.length > STRING_MAX) e.forest = `Keep this under ${STRING_MAX} characters.`
  if (d.district.length > STRING_MAX) e.district = `Keep this under ${STRING_MAX} characters.`
  if (d.description.length > DESCRIPTION_MAX) e.description = `Keep this under ${DESCRIPTION_MAX} characters.`
  return e
}

/** Assumes the draft passed draftErrors. */
export function draftToSubmission(d: CampgroundDraft): CampgroundSubmission {
  const s: CampgroundSubmission = {
    name: d.name.trim(),
    lat: Number(Number(d.latStr).toFixed(5)),
    lng: Number(Number(d.lngStr).toFixed(5)),
  }
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const txt = (v: string) => (v.trim() === '' ? null : v.trim())
  const fields: Array<[keyof CampgroundSubmission, number | string | null]> = [
    ['fee_min', num(d.feeMin)],
    ['fee_max', num(d.feeMax)],
    ['season_start', txt(d.seasonStart)],
    ['season_end', txt(d.seasonEnd)],
    ['fcfs_total', num(d.fcfsTotal)],
    ['reservable_total', num(d.reservableTotal)],
    ['description', txt(d.description)],
    ['forest', txt(d.forest)],
    ['district', txt(d.district)],
  ]
  for (const [k, v] of fields) if (v !== null) (s as unknown as Record<string, unknown>)[k] = v
  const amenities: Partial<Record<EditableAmenityKey, boolean>> = {}
  for (const k of AMENITY_KEYS) {
    if (d.amenities[k] === 'yes') amenities[k] = true
    else if (d.amenities[k] === 'no') amenities[k] = false
  }
  if (Object.keys(amenities).length) s.amenities = amenities
  return s
}

/** Server-side shape validation of untrusted JSON. Returns an error message or null. */
export function validateSubmission(s: unknown): string | null {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return 'submission must be an object'
  const o = s as Record<string, unknown>
  const badKey = Object.keys(o).find((k) => !SUBMISSION_KEYS.has(k))
  if (badKey) return `Unknown field: ${badKey}`

  if (typeof o.name !== 'string' || o.name.trim() === '') return 'name is required'
  if (o.name.trim().length > NAME_MAX) return `name must be ${NAME_MAX} characters or fewer`
  if (typeof o.lat !== 'number' || !Number.isFinite(o.lat) || o.lat < -90 || o.lat > 90)
    return 'lat must be between -90 and 90'
  if (typeof o.lng !== 'number' || !Number.isFinite(o.lng) || o.lng < -180 || o.lng > 180)
    return 'lng must be between -180 and 180'

  for (const key of ['fee_min', 'fee_max'] as const) {
    const v = o[key]
    if (v === undefined || v === null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return `${key} must be a non-negative number`
  }
  if (typeof o.fee_min === 'number' && typeof o.fee_max === 'number' && o.fee_max < o.fee_min)
    return 'fee_max must be at least fee_min'
  for (const key of ['fcfs_total', 'reservable_total'] as const) {
    const v = o[key]
    if (v === undefined || v === null) continue
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`
  }
  for (const key of ['season_start', 'season_end', 'forest', 'district', 'description'] as const) {
    const v = o[key]
    if (v === undefined || v === null) continue
    const max = key === 'description' ? DESCRIPTION_MAX : STRING_MAX
    if (typeof v !== 'string') return `${key} must be a string`
    if (v.length > max) return `${key} must be ${max} characters or fewer`
  }
  if (o.amenities !== undefined) {
    if (typeof o.amenities !== 'object' || o.amenities === null || Array.isArray(o.amenities))
      return 'amenities must be an object'
    for (const [k, v] of Object.entries(o.amenities)) {
      if (!(AMENITY_KEYS as string[]).includes(k)) return `Unknown amenity: ${k}`
      if (v !== null && typeof v !== 'boolean') return 'amenity values must be boolean or null'
    }
  }
  return null
}

/** Empty is OK. Otherwise must be an http(s) URL. Returns an error message or null. */
export function validateSourceUrl(u: string): string | null {
  if (u === '') return null
  if (u.length > URL_MAX) return `source_url must be ${URL_MAX} characters or fewer`
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return 'source_url must be a valid URL'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'source_url must start with http:// or https://'
  return null
}

/** Copy of etl/src/normalize.ts scoreDataQuality. MUST stay in lockstep with the ETL. */
export function scoreDataQuality(amenities: Amenities): DataQuality {
  const populated = Object.entries(amenities).filter(([k, v]) => {
    if (k === 'toiletType') return v !== 'unknown'
    if (typeof v === 'boolean') return v === true
    return v !== null
  }).length
  if (populated === 0) return 'unknown'
  if (populated < 5) return 'sparse'
  return 'rich'
}

/** Exact `values` object for a `facilities/insert` from an approved submission. */
export function buildFacilityValues(
  s: CampgroundSubmission,
  suggestionId: string,
  sourceUrl: string | null,
  nowIso: string,
) {
  // Matches the ETL default (normalizeAmenities([])): everything off/unknown.
  const full: Amenities = {
    potableWater: false,
    toiletType: 'unknown',
    bearBoxes: false,
    driveUp: false,
    maxRvLength: null,
    electricHookups: false,
    waterHookups: false,
    sewerHookups: false,
    petsAllowed: false,
    horsesAllowed: false,
    picnicTables: false,
    fireRings: false,
    accessible: false,
  }
  for (const k of AMENITY_KEYS) if (s.amenities?.[k] === true) full[k] = true

  let fsUrl: string | null = null
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname
      if (host === 'fs.usda.gov' || host.endsWith('.fs.usda.gov')) fsUrl = sourceUrl
    } catch {
      // not a URL; leave null
    }
  }

  const fcfs = s.fcfs_total ?? 0
  const res = s.reservable_total ?? 0
  return {
    ridb_id: `user-${suggestionId}`,
    name: s.name.trim(),
    lat: s.lat,
    lng: s.lng,
    fee_min: s.fee_min ?? null,
    fee_max: s.fee_max ?? null,
    season_start: s.season_start ?? null,
    season_end: s.season_end ?? null,
    fcfs_total: s.fcfs_total ?? null,
    reservable_total: s.reservable_total ?? null,
    ...deriveFcfsFlags(fcfs, res),
    description: s.description ?? null,
    forest: s.forest ?? null,
    district: s.district ?? null,
    amenities: JSON.stringify(full),
    ridb_data_quality: scoreDataQuality(full),
    fs_url: fsUrl,
    is_closed: false,
    is_deleted: false,
    merged_ridb_ids: '[]',
    last_synced: nowIso,
  }
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
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
