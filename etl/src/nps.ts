import type { Amenities, NormalizedFacility, ToiletType } from "./types.js";
import {
  parseDescriptionAmenities,
  extractFeesFromDescription,
  scoreDataQuality,
} from "./normalize.js";

const BASE_URL = "https://developer.nps.gov/api/v1";
const PAGE_SIZE = 500;

// Colorado NPS parks — includes cross-border parks where campgrounds sit in CO
export const CO_NPS_PARKS: Record<string, string> = {
  romo: "Rocky Mountain National Park",
  dino: "Dinosaur National Monument",
  meve: "Mesa Verde National Park",
  blca: "Black Canyon of the Gunnison National Park",
  cure: "Curecanti National Recreation Area",
  grsa: "Great Sand Dunes National Park & Preserve",
  colm: "Colorado National Monument",
  flfo: "Florissant Fossil Beds National Monument",
};

// CO bounding box with a small buffer for border campgrounds
const CO_BOUNDS = {
  minLat: 36.9,
  maxLat: 41.1,
  minLng: -109.1,
  maxLng: -101.9,
};

// --- NPS API response shapes ---

interface NpsAmenities {
  toilets: string[];
  potableWater: string[];
  foodStorageLockers: string;
  showers: string[];
  trashRecyclingCollection: string;
  internetConnectivity: string;
  cellPhoneReception: string;
  laundry: string;
  amphitheater: string;
  dumpStation: string;
  campStore: string;
  staffOrVolunteerHostOnsite: string;
  iceAvailableForSale: string;
  firewoodForSale: string;
}

interface NpsCampsites {
  totalSites: string;
  group: string;
  horse: string;
  tentOnly: string;
  electricalHookups: string;
  rvOnly: string;
  walkBoatTo: string;
  other: string;
}

interface NpsAccessibility {
  wheelchairAccess: string;
  rvAllowed: string;
  rvInfo: string;
  rvMaxLength: string;
  trailerMaxLength: string;
  adaInfo: string;
  trailerAllowed: string;
  accessRoads: string[];
  classifications: string[];
  internetInfo: string;
  cellPhoneInfo: string;
  fireStovePolicy: string;
  additionalInfo: string;
}

export interface NpsCampground {
  id: string;
  url: string;
  name: string;
  parkCode: string;
  description: string;
  latitude: string;
  longitude: string;
  reservationInfo: string;
  reservationUrl: string;
  regulationsOverview: string;
  amenities: NpsAmenities;
  fees: Array<{ cost: string; description: string; title: string }>;
  numberOfSitesReservable: string;
  numberOfSitesFirstComeFirstServe: string;
  campsites: NpsCampsites;
  accessibility: NpsAccessibility;
  operatingHours: Array<{
    name: string;
    description: string;
    standardHours: Record<string, string>;
    exceptions: Array<{
      name: string;
      startDate: string;
      endDate: string;
      exceptionHours: Record<string, string>;
    }>;
  }>;
}

interface NpsListResponse {
  total: string;
  limit: string;
  start: string;
  data: NpsCampground[];
}

// --- API client ---

export class NpsClient {
  constructor(private readonly apiKey: string) {}

  async getCampgrounds(parkCodes: string[]): Promise<NpsCampground[]> {
    const all: NpsCampground[] = [];
    let start = 0;
    const codes = parkCodes.join(",");

    while (true) {
      // NPS API requires literal commas in parkCode; URLSearchParams encodes
      // them as %2C, which the API mishandles (returns only the first park).
      const url =
        `${BASE_URL}/campgrounds?parkCode=${codes}` +
        `&limit=${PAGE_SIZE}&start=${start}`;

      const res = await fetch(url, {
        headers: { "X-Api-Key": this.apiKey },
      });
      if (!res.ok)
        throw new Error(`NPS API error ${res.status}: ${await res.text()}`);

      const data: NpsListResponse = await res.json();
      all.push(...data.data);

      if (all.length >= Number.parseInt(data.total, 10)) break;
      start += PAGE_SIZE;
    }

    return all;
  }
}

// --- Normalization helpers (exported for testing) ---

export function isInColorado(lat: number, lng: number): boolean {
  return (
    lat >= CO_BOUNDS.minLat &&
    lat <= CO_BOUNDS.maxLat &&
    lng >= CO_BOUNDS.minLng &&
    lng <= CO_BOUNDS.maxLng
  );
}

export function normalizeNpsAmenities(c: NpsCampground): Amenities {
  const { amenities, campsites, accessibility } = c;

  // Toilet type from amenities.toilets array (e.g. "Flush Toilets - year round")
  let toiletType: ToiletType = "unknown";
  const toilets = (amenities?.toilets ?? []).map((t) => t.toLowerCase());
  if (toilets.some((t) => t.includes("flush"))) toiletType = "flush";
  else if (toilets.some((t) => t.includes("vault") || t.includes("pit")))
    toiletType = "vault";
  else if (toilets.some((t) => t.includes("none") || t.includes("no toilet")))
    toiletType = "none";

  // Potable water from amenities.potableWater array (e.g. "Tap Water - year round")
  const waterList = (amenities?.potableWater ?? []).map((w) => w.toLowerCase());
  const potableWater =
    waterList.length > 0 && !waterList.every((w) => w.includes("none"));

  // Bear boxes / food storage lockers
  const bearBoxes = /yes/i.test(amenities?.foodStorageLockers ?? "");

  // RV max length from accessibility
  const rvMaxRaw = Number.parseInt(accessibility?.rvMaxLength ?? "0", 10);
  const maxRvLength = rvMaxRaw > 0 ? rvMaxRaw : null;

  // Drive-up: NPS flags rvAllowed / trailerAllowed as "1" or "Yes"
  const npsTrue = (v: string | undefined) => v === "1" || /^yes$/i.test(v ?? "");
  const driveUp = npsTrue(accessibility?.rvAllowed) || npsTrue(accessibility?.trailerAllowed);

  // Electric hookups from campsite count
  const electricHookups =
    Number.parseInt(campsites?.electricalHookups ?? "0", 10) > 0;

  // Horses from campsite count
  const horsesAllowed = Number.parseInt(campsites?.horse ?? "0", 10) > 0;

  // ADA accessible — non-empty wheelchairAccess field that isn't "No"/"None"
  const accessible = !!(
    accessibility?.wheelchairAccess &&
    !/^(no|none)$/i.test(accessibility.wheelchairAccess.trim())
  );

  // Fill text-derived fields (pets, picnic tables, fire rings, water fallback)
  // from description + reservation info + regulations combined
  const combinedText = [c.description, c.reservationInfo, c.regulationsOverview]
    .filter(Boolean)
    .join("\n");
  const fromText = parseDescriptionAmenities(combinedText);

  return {
    potableWater: fromText.potableWater ?? potableWater,
    toiletType,
    bearBoxes,
    driveUp,
    maxRvLength,
    electricHookups,
    waterHookups: false,
    sewerHookups: false,
    petsAllowed: fromText.petsAllowed ?? false,
    horsesAllowed,
    picnicTables: fromText.picnicTables ?? false,
    fireRings: fromText.fireRings ?? false,
    accessible,
  };
}

export function extractNpsFees(c: NpsCampground): {
  fee_min: number | null;
  fee_max: number | null;
} {
  const costs = (c.fees ?? [])
    .map((f) => Number.parseFloat(f.cost))
    .filter((n) => !Number.isNaN(n) && n >= 0);

  if (costs.length > 0) {
    return { fee_min: Math.min(...costs), fee_max: Math.max(...costs) };
  }

  // Fall back to description text
  const text = [c.description, c.reservationInfo].filter(Boolean).join("\n");
  return extractFeesFromDescription(text);
}

// Only match explicit closure phrases — "closed" alone appears in too many
// non-closure contexts (road closed, gate closed, etc.)
export function detectIsClosed(c: NpsCampground): boolean {
  const text = [c.description, c.reservationInfo, c.regulationsOverview]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(temporarily closed|closed indefinitely|campground closed|campground is closed|closed for the season|closed for season)\b/.test(
    text,
  );
}

// --- Public normalization entry point ---

// Returns null when the campground is outside Colorado's bounding box.
export function normalizeNpsCampground(
  c: NpsCampground,
  parkName: string,
): NormalizedFacility | null {
  const lat = Number.parseFloat(c.latitude);
  const lng = Number.parseFloat(c.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng) || !isInColorado(lat, lng)) return null;

  const amenities = normalizeNpsAmenities(c);
  const fees = extractNpsFees(c);
  const is_closed = detectIsClosed(c);

  const fcfs_total =
    Number.parseInt(c.numberOfSitesFirstComeFirstServe, 10) || 0;
  const reservable_total = Number.parseInt(c.numberOfSitesReservable, 10) || 0;

  return {
    ridb_id: `nps-${c.parkCode}-${c.id}`,
    name: c.name,
    lat,
    lng,
    forest: parkName,
    district: "",
    description: [c.description, c.reservationInfo, c.regulationsOverview]
      .filter(Boolean)
      .join("\n\n"),
    fee_min: fees.fee_min,
    fee_max: fees.fee_max,
    season_start: "",
    season_end: "",
    fcfs_total,
    reservable_total,
    is_fully_fcfs: reservable_total === 0 && fcfs_total > 0,
    is_partial_fcfs: fcfs_total > 0 && reservable_total > 0,
    amenities: JSON.stringify(amenities) as any,
    ridb_data_quality: scoreDataQuality(amenities),
    fs_url: c.url,
    is_closed,
    last_synced: new Date().toISOString(),
  };
}
