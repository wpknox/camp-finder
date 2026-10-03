import { describe, it, expect } from 'vitest'
import {
  emptyDraft, draftFromSubmission, draftErrors, draftToSubmission, validateSubmission,
  validateSourceUrl, buildFacilityValues, findNearby, scoreDataQuality,
} from './campgroundSubmission'

const valid = () => ({ ...emptyDraft(44.12345678, -110.5), name: 'Pine Flat' })

describe('draft <-> submission', () => {
  it('emptyDraft formats coords and defaults amenities to unknown', () => {
    const d = emptyDraft(44.123456, -110.5)
    expect(d.latStr).toBe('44.12346')
    expect(d.lngStr).toBe('-110.50000')
    expect(Object.values(d.amenities).every((v) => v === 'unknown')).toBe(true)
  })
  it('minimal draft omits empty fields and unknown amenities', () => {
    expect(draftToSubmission(valid())).toEqual({ name: 'Pine Flat', lat: 44.12346, lng: -110.5 })
  })
  it('round trips a full submission', () => {
    const s = {
      name: 'Pine Flat', lat: 44.12346, lng: -110.5, fee_min: 10, fee_max: 20,
      season_start: 'May', season_end: 'Sep', fcfs_total: 5, reservable_total: 0,
      description: 'Nice', forest: 'Shoshone', district: 'North',
      amenities: { potableWater: true, bearBoxes: false },
    }
    expect(draftToSubmission(draftFromSubmission(s))).toEqual(s)
  })
  it('maps yes/no amenities and omits unknown', () => {
    const d = valid()
    d.amenities.fireRings = 'yes'
    d.amenities.accessible = 'no'
    expect(draftToSubmission(d).amenities).toEqual({ fireRings: true, accessible: false })
  })
})

describe('draftErrors', () => {
  it('is empty for a valid draft', () => expect(draftErrors(valid())).toEqual({}))
  it('requires a trimmed name of at most 120 chars', () => {
    expect(draftErrors({ ...valid(), name: '   ' }).name).toBeTruthy()
    expect(draftErrors({ ...valid(), name: 'x'.repeat(121) }).name).toBeTruthy()
    expect(draftErrors({ ...valid(), name: 'x'.repeat(120) }).name).toBeUndefined()
  })
  it('validates coordinate range', () => {
    expect(draftErrors({ ...valid(), latStr: '91' }).latStr).toBeTruthy()
    expect(draftErrors({ ...valid(), lngStr: '-181' }).lngStr).toBeTruthy()
    expect(draftErrors({ ...valid(), latStr: 'abc' }).latStr).toBeTruthy()
    expect(draftErrors({ ...valid(), latStr: '' }).latStr).toBeTruthy()
  })
  it('validates fees', () => {
    expect(draftErrors({ ...valid(), feeMin: 'abc' }).feeMin).toBe('Enter a valid number.')
    expect(draftErrors({ ...valid(), feeMin: '-1' }).feeMin).toBeTruthy()
    expect(draftErrors({ ...valid(), feeMin: '10', feeMax: '5' }).feeMax).toBeTruthy()
    expect(draftErrors({ ...valid(), feeMin: '10', feeMax: '10' })).toEqual({})
  })
  it('validates counts as whole numbers', () => {
    expect(draftErrors({ ...valid(), fcfsTotal: '1.5' }).fcfsTotal).toBe('Enter a whole number (0 or more).')
    expect(draftErrors({ ...valid(), reservableTotal: '-2' }).reservableTotal).toBeTruthy()
    expect(draftErrors({ ...valid(), fcfsTotal: '0' })).toEqual({})
  })
})

describe('validateSubmission', () => {
  const ok = { name: 'A', lat: 1, lng: 2 }
  it('accepts valid input', () => {
    expect(validateSubmission(ok)).toBeNull()
    expect(validateSubmission({ ...ok, amenities: { potableWater: true, fireRings: null }, fee_min: null })).toBeNull()
  })
  it('rejects non-objects without throwing', () => {
    for (const v of [null, undefined, [], 'x', 5]) expect(validateSubmission(v)).toBeTruthy()
  })
  it('rejects unknown keys and amenity keys', () => {
    expect(validateSubmission({ ...ok, evil: 1 })).toMatch(/Unknown field/)
    expect(validateSubmission({ ...ok, amenities: { horsesAllowed: true } })).toMatch(/Unknown amenity/)
  })
  it('rejects non-boolean amenities', () => {
    expect(validateSubmission({ ...ok, amenities: { potableWater: 'yes' } })).toBeTruthy()
    expect(validateSubmission({ ...ok, amenities: [] })).toBeTruthy()
  })
  it('rejects bad name, coords, numbers and long strings', () => {
    expect(validateSubmission({ ...ok, name: '  ' })).toBeTruthy()
    expect(validateSubmission({ ...ok, name: 5 })).toBeTruthy()
    expect(validateSubmission({ ...ok, lat: NaN })).toBeTruthy()
    expect(validateSubmission({ ...ok, lng: 181 })).toBeTruthy()
    expect(validateSubmission({ ...ok, lat: '1' })).toBeTruthy()
    expect(validateSubmission({ ...ok, fee_min: -1 })).toBeTruthy()
    expect(validateSubmission({ ...ok, fee_min: 10, fee_max: 5 })).toBeTruthy()
    expect(validateSubmission({ ...ok, fcfs_total: 1.5 })).toBeTruthy()
    expect(validateSubmission({ ...ok, reservable_total: '3' })).toBeTruthy()
    expect(validateSubmission({ ...ok, forest: 'x'.repeat(201) })).toBeTruthy()
    expect(validateSubmission({ ...ok, description: 'x'.repeat(2000) })).toBeNull()
    expect(validateSubmission({ ...ok, description: 'x'.repeat(2001) })).toBeTruthy()
  })
})

describe('validateSourceUrl', () => {
  it('allows empty, http and https', () => {
    expect(validateSourceUrl('')).toBeNull()
    expect(validateSourceUrl('https://www.fs.usda.gov/x')).toBeNull()
    expect(validateSourceUrl('http://example.com')).toBeNull()
  })
  it('rejects bad protocols, garbage and over-long', () => {
    expect(validateSourceUrl('javascript:alert(1)')).toBeTruthy()
    expect(validateSourceUrl('ftp://x.com')).toBeTruthy()
    expect(validateSourceUrl('not a url')).toBeTruthy()
    expect(validateSourceUrl('https://a.com/' + 'x'.repeat(500))).toBeTruthy()
  })
})

describe('buildFacilityValues', () => {
  const s = { name: ' Pine Flat ', lat: 1, lng: 2 }
  const now = '2026-01-01T00:00:00.000Z'
  it('prefixes ridb_id and nulls absent fields', () => {
    const v = buildFacilityValues(s, 'abc', null, now)
    expect(v.ridb_id).toBe('user-abc')
    expect(v.name).toBe('Pine Flat')
    expect(v.fee_min).toBeNull()
    expect(v.description).toBeNull()
    expect(v.is_closed).toBe(false)
    expect(v.is_deleted).toBe(false)
    expect(v.merged_ridb_ids).toBe('[]')
    expect(v.last_synced).toBe(now)
  })
  it('derives FCFS flags', () => {
    const f = (a: number, b: number) => {
      const v = buildFacilityValues({ ...s, fcfs_total: a, reservable_total: b }, 'x', null, now)
      return [v.is_fully_fcfs, v.is_partial_fcfs]
    }
    expect(f(5, 0)).toEqual([true, false])
    expect(f(5, 3)).toEqual([false, true])
    expect(f(0, 0)).toEqual([false, false])
  })
  it('stringifies full amenities with defaults and scores quality', () => {
    const v = buildFacilityValues({ ...s, amenities: { potableWater: true, fireRings: false } }, 'x', null, now)
    expect(typeof v.amenities).toBe('string')
    const a = JSON.parse(v.amenities)
    expect(a.potableWater).toBe(true)
    expect(a.fireRings).toBe(false)
    expect(a.toiletType).toBe('unknown')
    expect(a.maxRvLength).toBeNull()
    expect(Object.keys(a)).toHaveLength(13)
    expect(v.ridb_data_quality).toBe('sparse')
    expect(buildFacilityValues(s, 'x', null, now).ridb_data_quality).toBe('unknown')
  })
  it('sets fs_url only for fs.usda.gov', () => {
    expect(buildFacilityValues(s, 'x', 'https://www.fs.usda.gov/r/x', now).fs_url).toBe('https://www.fs.usda.gov/r/x')
    expect(buildFacilityValues(s, 'x', 'https://example.com/fs.usda.gov', now).fs_url).toBeNull()
    expect(buildFacilityValues(s, 'x', 'https://notfs.usda.gov.evil.com', now).fs_url).toBeNull()
    expect(buildFacilityValues(s, 'x', null, now).fs_url).toBeNull()
  })
})

describe('scoreDataQuality', () => {
  it('matches ETL thresholds', () => {
    const base = buildFacilityValues({ name: 'a', lat: 0, lng: 0 }, 'x', null, '')
    expect(base.ridb_data_quality).toBe('unknown')
    const five = buildFacilityValues({
      name: 'a', lat: 0, lng: 0,
      amenities: { potableWater: true, bearBoxes: true, petsAllowed: true, fireRings: true, accessible: true },
    }, 'x', null, '')
    expect(five.ridb_data_quality).toBe('rich')
    expect(scoreDataQuality(JSON.parse(five.amenities))).toBe('rich')
  })
})

describe('findNearby', () => {
  const list = [
    { id: 'far', name: 'Far', lat: 45, lng: -110 },
    { id: 'b', name: 'B', lat: 44.01, lng: -110 },
    { id: 'a', name: 'A', lat: 44.005, lng: -110 },
  ]
  it('sorts by distance, applies cutoff and rounds km', () => {
    const r = findNearby(list, 44, -110, 1.5)
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r[0].km).toBe(0.56)
    expect(findNearby(list, 44, -110, 0.1)).toEqual([])
  })
})
