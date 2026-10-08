import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { defaultAmenities, scoreDataQuality } from './amenities'
import type { Amenities, DataQuality } from './types'

// Shared with etl/tests/lockstep.test.ts — both packages must agree.
const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/data-quality.json', import.meta.url), 'utf8'),
) as {
  defaultAmenities: Amenities
  cases: Array<{ name: string; amenities: Amenities; expected: DataQuality }>
}

describe('ETL/frontend lockstep fixture', () => {
  it('defaultAmenities() matches the shared default amenities', () => {
    expect(defaultAmenities()).toEqual(fixture.defaultAmenities)
  })

  for (const c of fixture.cases) {
    it(`scoreDataQuality: ${c.name}`, () => {
      expect(scoreDataQuality(c.amenities)).toBe(c.expected)
    })
  }
})
