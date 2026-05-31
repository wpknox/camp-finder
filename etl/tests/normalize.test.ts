import { describe, it, expect } from 'vitest'
import { normalizeAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFeesFromDescription, extractFsUrl } from '../src/normalize.js'
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

describe('extractFees', () => {
  it('extracts min and max fee from fee description', () => {
    expect(extractFees('$15 per night')).toEqual({ fee_min: 15, fee_max: 15 })
    expect(extractFees('$10–$20 per night')).toEqual({ fee_min: 10, fee_max: 20 })
    expect(extractFees('Free')).toEqual({ fee_min: 0, fee_max: 0 })
    expect(extractFees('')).toEqual({ fee_min: null, fee_max: null })
  })
})

describe('extractFsUrl', () => {
  it('returns the first fs.usda.gov link', () => {
    const links = [
      { LinkType: 'Official', LinkURL: 'https://www.fs.usda.gov/recarea/arp', Title: '' },
      { LinkType: 'Reservations', LinkURL: 'https://recreation.gov/...', Title: '' },
    ]
    expect(extractFsUrl(links)).toBe('https://www.fs.usda.gov/recarea/arp')
  })

  it('returns empty string when no fs.usda.gov link', () => {
    expect(extractFsUrl([])).toBe('')
  })
})

describe('extractFeesFromDescription', () => {
  it('extracts fee from a sentence with "per night"', () => {
    expect(extractFeesFromDescription('<p>The camping fee is $20 per night.</p>'))
      .toEqual({ fee_min: 20, fee_max: 20 })
  })

  it('extracts fee range from description', () => {
    expect(extractFeesFromDescription('<p>Fees range from $18 to $24 per night.</p>'))
      .toEqual({ fee_min: 18, fee_max: 24 })
  })

  it('returns free when description mentions "no fee"', () => {
    expect(extractFeesFromDescription('<p>There is no fee to camp here.</p>'))
      .toEqual({ fee_min: 0, fee_max: 0 })
  })

  it('returns free when description says camping is free', () => {
    expect(extractFeesFromDescription('<p>Camping is free at this campsite.</p>'))
      .toEqual({ fee_min: 0, fee_max: 0 })
  })

  it('returns null when no fee context found', () => {
    expect(extractFeesFromDescription('<p>Beautiful campground near the river.</p>'))
      .toEqual({ fee_min: null, fee_max: null })
  })

  it('returns null for empty description', () => {
    expect(extractFeesFromDescription('')).toEqual({ fee_min: null, fee_max: null })
  })

  it('ignores dollar amounts with no fee context', () => {
    expect(extractFeesFromDescription('<p>Over $1 million in improvements were made.</p>'))
      .toEqual({ fee_min: null, fee_max: null })
  })
})

import { parseDescriptionAmenities } from '../src/normalize.js'

describe('parseDescriptionAmenities', () => {
  it('detects picnic tables', () => {
    expect(parseDescriptionAmenities('Picnic tables are available at this site.').picnicTables).toBe(true)
    expect(parseDescriptionAmenities('No picnic tables provided.').picnicTables).toBeUndefined()
  })

  it('detects pets allowed from leash language', () => {
    expect(parseDescriptionAmenities('Dogs must be leashed or otherwise physically restrained.').petsAllowed).toBe(true)
    expect(parseDescriptionAmenities('Pets allowed. Dogs on leash required.').petsAllowed).toBe(true)
  })

  it('does not set petsAllowed when pets are prohibited', () => {
    expect(parseDescriptionAmenities('No pets allowed at this campground.').petsAllowed).toBeUndefined()
  })

  it('detects potable water from well/pump language', () => {
    expect(parseDescriptionAmenities('A hand pump provides water at the site.').potableWater).toBe(true)
    expect(parseDescriptionAmenities('Potable water is available at this site.').potableWater).toBe(true)
  })
})
