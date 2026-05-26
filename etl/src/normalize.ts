import type { RidbAttribute, RidbCampsite, Amenities, ToiletType, FcfsAggregation, DataQuality } from './types.js'

export function normalizeAmenities(attributes: RidbAttribute[]): Amenities {
  const get = (needles: string[]): string | null => {
    const needle = needles.map(n => n.toLowerCase())
    return attributes.find(a =>
      needle.some(n => a.AttributeName.toLowerCase().includes(n))
    )?.AttributeValue ?? null
  }

  const bool = (v: string | null): boolean =>
    v != null && ['yes', 'true', 'y', '1', 'available'].includes(v.toLowerCase().trim())

  const toiletRaw = get(['toilet', 'restroom'])
  let toiletType: ToiletType = 'unknown'
  if (toiletRaw) {
    const t = toiletRaw.toLowerCase()
    if (t.includes('flush'))       toiletType = 'flush'
    else if (t.includes('vault'))  toiletType = 'vault'
    else if (t.includes('none') || t.includes('no toilet')) toiletType = 'none'
  }

  const rvRaw = get(['max vehicle length', 'max rv length', 'rv length'])
  const maxRvLength = rvRaw ? (parseInt(rvRaw.replace(/\D.*/, ''), 10) || null) : null

  return {
    potableWater:    bool(get(['drinking water', 'potable water', 'water available'])) &&
                     !get(['no drinking water', 'no water']),
    toiletType,
    bearBoxes:       bool(get(['bear box', 'bear locker', 'food storage locker'])),
    driveUp:         bool(get(['driveway', 'drive-up', 'drive up', 'vehicle site'])),
    maxRvLength,
    electricHookups: bool(get(['electric hookup', 'electrical hookup', 'electricity', 'amp hookup'])),
    waterHookups:    bool(get(['water hookup', 'water service hookup'])),
    sewerHookups:    bool(get(['sewer hookup', 'sewer service hookup'])),
    petsAllowed:     bool(get(['pets allowed', 'pets', 'dogs allowed'])),
    horsesAllowed:   bool(get(['horses', 'horse allowed'])),
    picnicTables:    bool(get(['picnic table', 'table'])),
    fireRings:       bool(get(['fire pit', 'fire ring', 'campfire ring'])),
    accessible:      bool(get(['ada', 'accessible', 'wheelchair'])),
  }
}

export function aggregateFcfs(campsites: RidbCampsite[]): FcfsAggregation {
  const overnight = campsites.filter(c => c.TypeOfUse === 'Overnight')
  const fcfs_total = overnight.filter(c => !c.CampsiteReservable).length
  const reservable_total = overnight.filter(c => c.CampsiteReservable).length
  return {
    fcfs_total,
    reservable_total,
    is_fully_fcfs: reservable_total === 0 && fcfs_total > 0,
    is_partial_fcfs: fcfs_total > 0 && reservable_total > 0,
  }
}

export function scoreDataQuality(amenities: Amenities): DataQuality {
  const populated = Object.entries(amenities).filter(([k, v]) => {
    if (k === 'toiletType') return v !== 'unknown'
    if (typeof v === 'boolean') return v === true
    return v !== null
  }).length
  if (populated === 0) return 'unknown'
  if (populated < 5)   return 'sparse'
  return 'rich'
}

export function extractFees(feeDescription: string): { fee_min: number | null; fee_max: number | null } {
  if (!feeDescription) return { fee_min: null, fee_max: null }
  if (/free/i.test(feeDescription)) return { fee_min: 0, fee_max: 0 }

  const dollars = [...feeDescription.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]))
  if (dollars.length === 0) return { fee_min: null, fee_max: null }

  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}

export function extractFsUrl(links: Array<{ LinkURL: string }>): string {
  return links.find(l => l.LinkURL?.includes('fs.usda.gov'))?.LinkURL ?? ''
}
