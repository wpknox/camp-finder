import { describe, it, expect } from 'vitest'
import { normalizeAmenities } from '../src/normalize.js'
import type { RidbAttribute } from '../src/types.js'

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
