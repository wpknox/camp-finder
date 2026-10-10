// Diff the suggest-an-edit form against the facility. Pure; relative imports only.
import { CARRIERS, EDITABLE_AMENITIES, fromTriState, triState } from "./fields";
import type { CarrierKey, EditableAmenityKey } from "./fields";
import type { Amenities, EditChanges, Facility, ToiletType, TriState } from "./types";
import { numOrNull } from "./validation";

export interface EditForm {
  feeMin: string;
  feeMax: string;
  seasonStart: string;
  seasonEnd: string;
  fcfsTotal: string;
  reservableTotal: string;
  closed: boolean;
  lat: string;
  lng: string;
  amenityValues: Record<EditableAmenityKey, TriState>;
  toiletType: ToiletType;
  carrierValues: Record<CarrierKey, TriState>;
}

/** Only the fields that differ from `facility`. Assumes the form passed validation. */
export function buildEditChanges(facility: Facility, f: EditForm): EditChanges {
  const c: EditChanges = {};
  const fMin = numOrNull(f.feeMin);
  const fMax = numOrNull(f.feeMax);
  if (fMin !== (facility.fee_min ?? null)) c.fee_min = fMin;
  if (fMax !== (facility.fee_max ?? null)) c.fee_max = fMax;
  const sStart = f.seasonStart.trim();
  const sEnd = f.seasonEnd.trim();
  if (sStart !== (facility.season_start ?? "")) c.season_start = sStart;
  if (sEnd !== (facility.season_end ?? "")) c.season_end = sEnd;
  const ft = numOrNull(f.fcfsTotal);
  if (ft !== (facility.fcfs_total ?? null)) c.fcfs_total = ft;
  const rt = numOrNull(f.reservableTotal);
  if (rt !== (facility.reservable_total ?? null)) c.reservable_total = rt;
  if (f.closed !== !!facility.is_closed) c.is_closed = f.closed;

  const latRounded = Number(Number(f.lat).toFixed(5));
  const lngRounded = Number(Number(f.lng).toFixed(5));
  if (
    latRounded !== Number(facility.lat.toFixed(5)) ||
    lngRounded !== Number(facility.lng.toFixed(5))
  ) {
    c.lat = latRounded;
    c.lng = lngRounded;
  }

  const amenityDiff: Partial<Amenities> = {};
  for (const { key } of EDITABLE_AMENITIES) {
    const current = f.amenityValues[key];
    if (current !== triState(facility.amenities?.[key] as boolean | null)) {
      (amenityDiff as Record<string, boolean | null>)[key] = fromTriState(current);
    }
  }
  if (f.toiletType !== (facility.amenities?.toiletType ?? "unknown"))
    amenityDiff.toiletType = f.toiletType;
  if (Object.keys(amenityDiff).length) c.amenities = amenityDiff;

  const carrierDiff: NonNullable<EditChanges["cell_coverage"]> = {};
  for (const { key } of CARRIERS) {
    const current = f.carrierValues[key];
    if (current !== triState(facility.cell_coverage?.[key])) {
      carrierDiff[key] = fromTriState(current);
    }
  }
  if (Object.keys(carrierDiff).length) c.cell_coverage = carrierDiff;
  return c;
}
