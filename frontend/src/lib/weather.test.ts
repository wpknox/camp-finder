import { describe, it, expect } from 'vitest'
import { wmoToWeather, metersToFeet, formatElevationFt } from './weather'

describe('wmoToWeather', () => {
  it('maps clear sky', () => expect(wmoToWeather(0)).toEqual({ icon: '☀️', label: 'Clear' }))
  it('maps partly cloudy', () => expect(wmoToWeather(2).icon).toBe('⛅'))
  it('maps fog', () => expect(wmoToWeather(45).label).toBe('Fog'))
  it('maps rain', () => expect(wmoToWeather(63).icon).toBe('🌧️'))
  it('maps snow', () => expect(wmoToWeather(73).icon).toBe('🌨️'))
  it('maps thunderstorm', () => expect(wmoToWeather(95).icon).toBe('⛈️'))
  it('falls back for unknown codes', () => expect(wmoToWeather(42).icon).toBe('☁️'))
})

describe('elevation formatting', () => {
  it('converts meters to feet', () => expect(Math.round(metersToFeet(1000))).toBe(3281))
  it('formats with thousands separator', () => expect(formatElevationFt(2987)).toBe('9,800 ft'))
  it('returns null for null/undefined', () => {
    expect(formatElevationFt(null)).toBeNull()
    expect(formatElevationFt(undefined)).toBeNull()
  })
})
