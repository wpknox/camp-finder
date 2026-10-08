import { describe, it, expect } from 'vitest'
import { sourceOf, sourceLabel, isRidbRecord } from './source'

describe('source', () => {
  it('maps prefixes', () => {
    expect(sourceOf('fs-12')).toBe('fs')
    expect(sourceOf('nps-x')).toBe('nps')
    expect(sourceOf('user-abc')).toBe('user')
    expect(sourceOf('234567')).toBe('ridb')
    expect(sourceOf('weird')).toBe('ridb')
  })
  it('labels', () => {
    expect(sourceLabel('fs-1')).toBe('USFS')
    expect(sourceLabel('nps-1')).toBe('NPS')
    expect(sourceLabel('user-1')).toBe('User')
    expect(sourceLabel('123')).toBe('RIDB')
  })
  it('isRidbRecord is strictly numeric', () => {
    expect(isRidbRecord('123456')).toBe(true)
    expect(isRidbRecord('fs-123')).toBe(false)
    expect(isRidbRecord('weird')).toBe(false)
    expect(isRidbRecord('12a')).toBe(false)
    expect(isRidbRecord('')).toBe(false)
  })
})
