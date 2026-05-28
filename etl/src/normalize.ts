import type { RidbAttribute, RidbCampsite, Amenities, ToiletType, FcfsAggregation, DataQuality } from './types.js'

// Strip HTML tags for plain-text keyword matching
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
}

// Parse amenity fields from free-text facility description as a fallback
// when structured attribute data isn't available.
export function parseDescriptionAmenities(description: string): Partial<Amenities> {
  const text = stripHtml(description)
  const has  = (...terms: string[]) => terms.some(t => text.includes(t))
  const lacks = (...terms: string[]) => terms.some(t => text.includes(t))

  const potableWater = has('drinking water', 'potable water') && !lacks('no drinking water', 'no potable water', 'non-potable')

  let toiletType: ToiletType | undefined
  if (has('flush toilet', 'flush restroom'))        toiletType = 'flush'
  else if (has('vault toilet', 'pit toilet', 'vault restroom')) toiletType = 'vault'
  else if (has('no toilet', 'no restroom', 'no sanitation')) toiletType = 'none'

  const bearBoxes = has('bear box', 'bear locker', 'food storage locker', 'food storage box')

  return {
    ...(potableWater              ? { potableWater }  : {}),
    ...(toiletType !== undefined  ? { toiletType }    : {}),
    ...(bearBoxes                 ? { bearBoxes }     : {}),
  }
}

export function normalizeAmenities(attributes: RidbAttribute[] | undefined): Amenities {
  attributes = attributes ?? []
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

  // driveUp: true if any driveway/site-access attribute exists and isn't walk/hike-in
  const driveUp = (() => {
    const siteAccess = get(['site access'])
    if (siteAccess) return /drive/i.test(siteAccess)
    const driveAttr = get(['driveway entry', 'driveway surface', 'driveway length'])
    return driveAttr != null && driveAttr !== '0' && driveAttr !== ''
  })()

  return {
    potableWater:    bool(get(['drinking water', 'potable water', 'water available'])) &&
                     !get(['no drinking water', 'no water']),
    toiletType,
    bearBoxes:       bool(get(['bear box', 'bear locker', 'food storage locker'])),
    driveUp,
    maxRvLength,
    electricHookups: bool(get(['electric hookup', 'electrical hookup', 'electricity', 'amp hookup', 'electric'])),
    waterHookups:    bool(get(['water hookup', 'water service hookup'])),
    sewerHookups:    bool(get(['sewer hookup', 'sewer service hookup'])),
    petsAllowed:     bool(get(['pets allowed', 'pets', 'dogs allowed'])),
    horsesAllowed:   bool(get(['horses', 'horse allowed'])),
    picnicTables:    bool(get(['picnic table', 'table'])),
    fireRings:       bool(get(['fire pit', 'fire ring', 'campfire ring', 'campfire allowed'])),
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

export function extractFeesFromDescription(description: string): { fee_min: number | null; fee_max: number | null } {
  if (!description) return { fee_min: null, fee_max: null }

  const text = stripHtml(description)

  // "no fee" / "free" — check before dollar extraction
  if (/no fee|free of charge|no charge/i.test(text)) return { fee_min: 0, fee_max: 0 }

  // Fee-context keywords that must appear near a dollar amount
  const feeContext = /fee|per night|camping cost|nightly rate/i

  // Split into sentences and find ones with both a dollar amount and fee context
  const sentences = text.split(/[.!?]/)
  const dollars: number[] = []

  for (const sentence of sentences) {
    if (!feeContext.test(sentence)) continue
    const matches = [...sentence.matchAll(/\$(\d+(?:\.\d+)?)/g)]
    for (const m of matches) dollars.push(parseFloat(m[1]))
  }

  if (dollars.length === 0) return { fee_min: null, fee_max: null }
  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}

export function extractFsUrl(links: Array<{ LinkURL: string }>): string {
  return links.find(l => l.LinkURL?.includes('fs.usda.gov'))?.LinkURL ?? ''
}
