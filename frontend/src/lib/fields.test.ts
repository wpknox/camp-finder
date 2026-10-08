import { describe, expect, it } from 'vitest'
import { fromTriState, hasAnyCarrier, triState } from './fields'

describe('triState', () => {
  it('maps booleans and nullish to yes/no/unknown', () => {
    expect(triState(true)).toBe('yes')
    expect(triState(false)).toBe('no')
    expect(triState(null)).toBe('unknown')
    expect(triState(undefined)).toBe('unknown')
  })
})

describe('fromTriState', () => {
  it('maps yes/no/unknown back to true/false/null', () => {
    expect(fromTriState('yes')).toBe(true)
    expect(fromTriState('no')).toBe(false)
    expect(fromTriState('unknown')).toBeNull()
  })

  it('round-trips with triState', () => {
    for (const v of [true, false, null] as const) {
      expect(fromTriState(triState(v))).toBe(v)
    }
  })
})

describe('hasAnyCarrier', () => {
  it('is false for missing or all-false/null coverage', () => {
    expect(hasAnyCarrier(null)).toBe(false)
    expect(hasAnyCarrier(undefined)).toBe(false)
    expect(hasAnyCarrier({})).toBe(false)
    expect(hasAnyCarrier({ verizon: null, att: false, tmobile: null })).toBe(false)
  })

  it('is true when any carrier is truthy', () => {
    expect(hasAnyCarrier({ verizon: true })).toBe(true)
    expect(hasAnyCarrier({ att: null, tmobile: true })).toBe(true)
  })
})
