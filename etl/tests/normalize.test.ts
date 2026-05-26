import { describe, it, expect } from 'vitest'
import { normalizeAmenities, aggregateFcfs, scoreDataQuality } from '../src/normalize.js'
import type { RidbAttribute, RidbCampsite } from '../src/types.js'

function attrs(pairs: [string, string][]): RidbAttribute[] {
  return pairs.map(([name, value], i) => ({ AttributeID: i, AttributeName: name, AttributeValue: value }))
}

describe('normalizeAmenities', () => {
  it('detects potable water from variant names', () => {
    expect(normalizeAmenities(attrs([['Drinking Water', 'Yes']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['Potable Water', 'Available']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['Water Available', 'Yes']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['No Drinking Water', 'True']])).potableWater).toBe(false)
  })

  it('normalizes toilet type from variant names', () => {
    expect(normalizeAmenities(attrs([['Toilet', 'Flush Toilets']])).toiletType).toBe('flush')
    expect(normalizeAmenities(attrs([['Restroom', 'Vault Toilets']])).toiletType).toBe('vault')
    expect(normalizeAmenities(attrs([['Toilet', 'No Toilets']])).toiletType).toBe('none')
    expect(normalizeAmenities(attrs([])).toiletType).toBe('unknown')
  })

  it('parses max RV length as a number', () => {
    expect(normalizeAmenities(attrs([['Max Vehicle Length', '35 feet']])).maxRvLength).toBe(35)
    expect(normalizeAmenities(attrs([['Max Num of Vehicles', '3']])).maxRvLength).toBe(null)
    expect(normalizeAmenities(attrs([])).maxRvLength).toBe(null)
  })

  it('detects bear boxes', () => {
    expect(normalizeAmenities(attrs([['Bear Box', 'Yes']])).bearBoxes).toBe(true)
    expect(normalizeAmenities(attrs([['Food Storage Locker', 'Yes']])).bearBoxes).toBe(true)
  })

  it('defaults unknowns to false/null/unknown rather than throwing', () => {
    const result = normalizeAmenities([])
    expect(result.potableWater).toBe(false)
    expect(result.maxRvLength).toBe(null)
    expect(result.toiletType).toBe('unknown')
  })
})

function site(reservable: boolean, typeOfUse = 'Overnight'): RidbCampsite {
  return { CampsiteID: '', FacilityID: '', CampsiteName: '', CampsiteType: '',
           TypeOfUse: typeOfUse, CampsiteReservable: reservable,
           CampsiteAccessible: 'N', Loop: '', ATTRIBUTES: [] }
}

describe('aggregateFcfs', () => {
  it('counts FCFS vs reservable sites', () => {
    const result = aggregateFcfs([site(false), site(false), site(true)])
    expect(result.fcfs_total).toBe(2)
    expect(result.reservable_total).toBe(1)
    expect(result.is_partial_fcfs).toBe(true)
    expect(result.is_fully_fcfs).toBe(false)
  })

  it('marks fully FCFS when no reservable sites', () => {
    const result = aggregateFcfs([site(false), site(false)])
    expect(result.is_fully_fcfs).toBe(true)
    expect(result.is_partial_fcfs).toBe(false)
  })

  it('excludes day-use sites from FCFS count', () => {
    const result = aggregateFcfs([site(false, 'Day'), site(false, 'Overnight')])
    expect(result.fcfs_total).toBe(1)
  })
})

describe('scoreDataQuality', () => {
  it('returns rich when 5+ amenity fields are populated', () => {
    const amenities = { potableWater: true, toiletType: 'flush' as const,
      bearBoxes: true, driveUp: true, maxRvLength: 35,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: true, horsesAllowed: false, picnicTables: true, fireRings: true, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('rich')
  })

  it('returns sparse when 1–4 fields are populated', () => {
    const amenities = { potableWater: true, toiletType: 'unknown' as const,
      bearBoxes: false, driveUp: false, maxRvLength: null,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: false, horsesAllowed: false, picnicTables: false, fireRings: false, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('sparse')
  })

  it('returns unknown when nothing is populated', () => {
    const amenities = { potableWater: false, toiletType: 'unknown' as const,
      bearBoxes: false, driveUp: false, maxRvLength: null,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: false, horsesAllowed: false, picnicTables: false, fireRings: false, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('unknown')
  })
})
