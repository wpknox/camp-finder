import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeAmenities, scoreDataQuality } from '../src/normalize.js'
import type { Amenities, DataQuality } from '../src/types.js'

// Shared with frontend/src/lib/lockstep.test.ts — both packages must agree.
const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/data-quality.json', import.meta.url), 'utf8'),
) as {
  defaultAmenities: Amenities
  cases: Array<{ name: string; amenities: Amenities; expected: DataQuality }>
}

describe('ETL/frontend lockstep fixture', () => {
  it('normalizeAmenities([]) matches the shared default amenities', () => {
    expect(normalizeAmenities([])).toEqual(fixture.defaultAmenities)
  })

  for (const c of fixture.cases) {
    it(`scoreDataQuality: ${c.name}`, () => {
      expect(scoreDataQuality(c.amenities)).toBe(c.expected)
    })
  }
})
