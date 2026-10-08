import type { Amenities, ToiletType, TriState } from "./types";

/** Amenities users can propose/edit, in display order. */
export const EDITABLE_AMENITIES = [
  { key: "potableWater", label: "Potable water" },
  { key: "bearBoxes", label: "Bear boxes" },
  { key: "petsAllowed", label: "Pets allowed" },
  { key: "electricHookups", label: "Electric hookups" },
  { key: "picnicTables", label: "Picnic tables" },
  { key: "fireRings", label: "Fire rings" },
  { key: "accessible", label: "Accessible sites" },
] as const satisfies ReadonlyArray<{ key: keyof Amenities; label: string }>;

export type EditableAmenityKey = (typeof EDITABLE_AMENITIES)[number]["key"];

export type CarrierKey = "verizon" | "att" | "tmobile";

export const CARRIERS: ReadonlyArray<{ key: CarrierKey; label: string }> = [
  { key: "verizon", label: "Verizon" },
  { key: "att", label: "AT&T" },
  { key: "tmobile", label: "T-Mobile" },
];

export const CARRIER_KEYS: CarrierKey[] = CARRIERS.map((c) => c.key);

export const TOILET_OPTIONS: ReadonlyArray<{ value: ToiletType; label: string }> = [
  { value: "flush", label: "Flush" },
  { value: "vault", label: "Vault" },
  { value: "none", label: "None" },
  { value: "unknown", label: "Unknown" },
];

export const TOILET_TYPES: ToiletType[] = TOILET_OPTIONS.map((o) => o.value);

export const TRI_OPTIONS: ReadonlyArray<{ value: TriState; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
];

export function triState(v: boolean | null | undefined): TriState {
  return v === true ? "yes" : v === false ? "no" : "unknown";
}

export function fromTriState(t: TriState): boolean | null {
  return t === "yes" ? true : t === "no" ? false : null;
}

export function hasAnyCarrier(
  c: Partial<Record<CarrierKey, boolean | null>> | null | undefined,
): boolean {
  return CARRIER_KEYS.some((k) => !!c?.[k]);
}
