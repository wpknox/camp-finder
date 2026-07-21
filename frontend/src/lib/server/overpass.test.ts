import { describe, it, expect } from 'vitest'
import { haversineMeters, buildOverpassQuery, normalizeOverpass, type OverpassResponse } from './overpass'

describe('haversineMeters', () => {
  it('is ~1.11 km per 0.01° latitude', () => {
    const d = haversineMeters(39.0, -106.0, 39.01, -106.0)
    expect(d).toBeGreaterThan(1100)
    expect(d).toBeLessThan(1125)
  })
})

describe('buildOverpassQuery', () => {
  it('includes both radii and the coordinates', () => {
    const q = buildOverpassQuery(39.0, -106.0)
    expect(q).toContain('around:8000,39,-106')
    expect(q).toContain('around:25000,39,-106')
    expect(q).toContain('highway"="trailhead')
    expect(q).toContain('out center')
  })
})

const raw: OverpassResponse = {
  elements: [
    { type: 'node', id: 1, lat: 39.001, lon: -106.0, tags: { highway: 'trailhead', name: 'Lost Lake TH' } },
    { type: 'node', id: 2, lat: 39.002, lon: -106.0, tags: { highway: 'trailhead' } }, // unnamed → skip
    { type: 'way', id: 3, center: { lat: 39.05, lon: -106.0 }, tags: { shop: 'supermarket', name: 'City Market' } },
    { type: 'node', id: 4, lat: 39.06, lon: -106.0, tags: { shop: 'convenience', name: 'Kum & Go' } }, // farther grocery → dropped
    { type: 'node', id: 5, lat: 39.04, lon: -106.0, tags: { amenity: 'fuel', brand: 'Shell' } },
    ...Array.from({ length: 8 }, (_, i) => ({
      type: 'node' as const, id: 10 + i, lat: 39.003 + i * 0.001, lon: -106.0,
      tags: { highway: 'trailhead', name: `TH ${i}` },
    })),
  ],
}

describe('normalizeOverpass', () => {
  const pois = normalizeOverpass(raw, 39.0, -106.0)
  it('caps trailheads at 6, sorted nearest-first', () => {
    const ths = pois.filter((p) => p.category === 'trailhead')
    expect(ths).toHaveLength(6)
    expect(ths[0].name).toBe('Lost Lake TH')
    expect(ths.every((p, i, a) => i === 0 || a[i - 1].distance_m <= p.distance_m)).toBe(true)
  })
  it('keeps only the nearest grocery', () => {
    const groceries = pois.filter((p) => p.category === 'grocery')
    expect(groceries).toHaveLength(1)
    expect(groceries[0].name).toBe('City Market')
  })
  it('names fuel from brand fallback', () => {
    const fuel = pois.filter((p) => p.category === 'fuel')
    expect(fuel).toHaveLength(1)
    expect(fuel[0].name).toBe('Shell')
  })
  it('uses way center coordinates', () => {
    expect(pois.find((p) => p.name === 'City Market')!.lat).toBeCloseTo(39.05)
  })
})
