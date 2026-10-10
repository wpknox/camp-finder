// Pure validators shared by browser forms and server routes. Relative imports only.
import { CARRIER_KEYS, TOILET_TYPES, type CarrierKey } from "./fields";
import type { ToiletType } from "./types";

// String-input field validators: '' means OK, otherwise the message to show.

export function feeError(v: string): string {
  if (v.trim() === "") return "";
  const n = Number(v);
  return Number.isNaN(n) || n < 0 ? "Enter a valid number." : "";
}

export function countError(v: string): string {
  if (v.trim() === "") return "";
  const n = Number(v);
  return !Number.isInteger(n) || n < 0 ? "Enter a whole number (0 or more)." : "";
}

export function latError(v: string, { required }: { required: boolean }): string {
  if (v.trim() === "") return required ? "Latitude must be -90 to 90." : "";
  const n = Number(v);
  return Number.isNaN(n) || n < -90 || n > 90 ? "Latitude must be -90 to 90." : "";
}

export function lngError(v: string, { required }: { required: boolean }): string {
  if (v.trim() === "") return required ? "Longitude must be -180 to 180." : "";
  const n = Number(v);
  return Number.isNaN(n) || n < -180 || n > 180 ? "Longitude must be -180 to 180." : "";
}

export function feeRangeError(min: string, max: string): string {
  if (min.trim() === "" || max.trim() === "" || feeError(min) || feeError(max)) return "";
  return Number(max) < Number(min) ? "Max fee must be at least the min fee." : "";
}

// Top-level keys only; inner `amenities` keys are deliberately not validated here —
// admin review is the gate, and malformed submissions get rejected there.
const EDIT_ALLOWED_KEYS = new Set([
  "fee_min",
  "fee_max",
  "season_start",
  "season_end",
  "amenities",
  "fcfs_total",
  "reservable_total",
  "is_closed",
  "lat",
  "lng",
  "cell_coverage",
]);

/** Server-side validation of an untrusted edit-suggestion patch (non-empty object).
 * Returns an error message or null. Fees/seasons/amenities keep their existing looseness. */
export function validateEditChanges(changes: unknown): string | null {
  const c = changes as Record<string, unknown>;
  const badKey = Object.keys(c).find((k) => !EDIT_ALLOWED_KEYS.has(k));
  if (badKey) return `Unknown field: ${badKey}`;

  for (const key of ["fcfs_total", "reservable_total"] as const) {
    const v = c[key];
    if (v === undefined || v === null) continue;
    if (!Number.isInteger(v) || (v as number) < 0) return `${key} must be a non-negative integer`;
  }
  if (c.is_closed !== undefined && typeof c.is_closed !== "boolean")
    return "is_closed must be a boolean";
  if (c.lat !== undefined && (typeof c.lat !== "number" || c.lat < -90 || c.lat > 90))
    return "lat must be between -90 and 90";
  if (c.lng !== undefined && (typeof c.lng !== "number" || c.lng < -180 || c.lng > 180))
    return "lng must be between -180 and 180";
  // lat/lng travel together — a half-updated location is never intended.
  if ((c.lat === undefined) !== (c.lng === undefined))
    return "lat and lng must be provided together";
  const toilet = (c.amenities as { toiletType?: unknown } | undefined)?.toiletType;
  if (toilet !== undefined && !TOILET_TYPES.includes(toilet as ToiletType))
    return "toiletType must be flush, vault, none or unknown";
  if (c.cell_coverage !== undefined) {
    if (typeof c.cell_coverage !== "object" || c.cell_coverage === null)
      return "cell_coverage must be an object";
    for (const [k, v] of Object.entries(c.cell_coverage)) {
      if (!CARRIER_KEYS.includes(k as CarrierKey)) return `Unknown carrier: ${k}`;
      if (v !== null && typeof v !== "boolean") return "carrier values must be boolean or null";
    }
  }
  return null;
}
