// etl/src/types.ts

// --- RIDB API shapes ---

export interface RidbAttribute {
  AttributeID: number
  AttributeName: string
  AttributeValue: string
}

export interface RidbFacility {
  FacilityID: string
  FacilityName: string
  FacilityLatitude: number
  FacilityLongitude: number
  FacilityDescription: string
  FacilityUseFeeDescription: string
  FacilityAdaAccess: string
  ATTRIBUTES: RidbAttribute[]
  LINK: Array<{ LinkType: string; LinkURL: string; Title: string }>
  OrgFacilityID: string
  ParentOrgID: string
  StayLimit: string
  LastUpdatedDate: string
}

export interface RidbCampsite {
  CampsiteID: string
  FacilityID: string
  CampsiteName: string
  CampsiteType: string
  TypeOfUse: string   // "Overnight" | "Day"
  CampsiteReservable: boolean
  CampsiteAccessible: string
  Loop: string
  ATTRIBUTES: RidbAttribute[]
}

export interface RidbListResponse<T> {
  RECDATA: T[]
  METADATA: {
    RESULTS: { CURRENT_COUNT: number; TOTAL_COUNT: number }
  }
}

// --- Internal / Teenybase shapes ---

export type ToiletType = 'flush' | 'vault' | 'none' | 'unknown'
export type DataQuality = 'rich' | 'sparse' | 'unknown'

export interface Amenities {
  potableWater: boolean
  toiletType: ToiletType
  bearBoxes: boolean
  driveUp: boolean
  maxRvLength: number | null
  electricHookups: boolean
  waterHookups: boolean
  sewerHookups: boolean
  petsAllowed: boolean
  horsesAllowed: boolean
  picnicTables: boolean
  fireRings: boolean
  accessible: boolean
}

export interface FcfsAggregation {
  fcfs_total: number
  reservable_total: number
  is_fully_fcfs: boolean
  is_partial_fcfs: boolean
}

export interface NormalizedFacility {
  ridb_id: string
  name: string
  lat: number
  lng: number
  forest: string
  district: string
  description: string
  fee_min: number | null
  fee_max: number | null
  season_start: string
  season_end: string
  fcfs_total: number
  reservable_total: number
  is_fully_fcfs: boolean
  is_partial_fcfs: boolean
  amenities: Amenities
  ridb_data_quality: DataQuality
  fs_url: string
  last_synced: string
}
