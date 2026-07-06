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
  merged_ridb_ids?: string[];
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

export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface EditChanges {
  fee_min?: number | null;
  fee_max?: number | null;
  season_start?: string;
  season_end?: string;
  amenities?: Partial<Amenities>;
}

export interface EditSuggestion {
  id: string;
  facility_id: string;
  user_id: string;
  changes: EditChanges;
  note: string;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

export interface MergeSuggestion {
  id: string;
  facility_a: string;
  facility_b: string;
  user_id: string;
  note: string;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}
