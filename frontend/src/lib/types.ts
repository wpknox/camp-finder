export type ToiletType = "flush" | "vault" | "none" | "unknown";
export type DataQuality = "rich" | "sparse" | "unknown";

export interface Amenities {
  potableWater: boolean;
  toiletType: ToiletType;
  bearBoxes: boolean;
  driveUp: boolean;
  maxRvLength: number | null;
  electricHookups: boolean;
  waterHookups: boolean;
  sewerHookups: boolean;
  petsAllowed: boolean;
  horsesAllowed: boolean;
  picnicTables: boolean;
  fireRings: boolean;
  accessible: boolean;
}

export interface Facility {
  id: string;
  ridb_id: string;
  name: string;
  lat: number;
  lng: number;
  forest: string;
  district: string;
  description: string;
  fee_min: number | null;
  fee_max: number | null;
  season_start: string;
  season_end: string;
  fcfs_total: number;
  reservable_total: number;
  is_fully_fcfs: boolean;
  is_partial_fcfs: boolean;
  amenities: Amenities;
  ridb_data_quality: DataQuality;
  fs_url: string;
  is_closed: boolean;
}

export interface Alert {
  content: string | null;
  scraped_at: string | null;
}

export interface Rating {
  id: string;
  score: number;
  notes: string;
  visited_at: string;
  user_id: string;
}
