// etl/src/forests.ts

// Colorado National Forest names for post-fetch filtering.
// RIDB facilities are fetched state=CO; we keep only those whose
// organization name or fs.usda.gov link indicates a National Forest.
export const COLORADO_NF_NAMES = [
  'Arapaho',
  'Roosevelt',
  'White River',
  'Pike',
  'San Isabel',
  'Grand Mesa',
  'Uncompahgre',
  'Gunnison',
  'Rio Grande',
  'San Juan',
  'Routt',
  'Medicine Bow',
  'Manti-La Sal',
]

export function isColoradoNationalForest(facility: { FacilityName: string; LINK: Array<{ LinkURL: string }> }): boolean {
  const hasFsUrl = facility.LINK.some(l => l.LinkURL?.includes('fs.usda.gov'))
  const nameMatch = COLORADO_NF_NAMES.some(nf =>
    facility.FacilityName.toLowerCase().includes(nf.toLowerCase())
  )
  return hasFsUrl || nameMatch
}

// RIDB query params to fetch Colorado campgrounds
export const CO_QUERY_PARAMS = {
  state: 'CO',
  activity: 'CAMPING',
  facilitytype: 'Campground',
} as const
