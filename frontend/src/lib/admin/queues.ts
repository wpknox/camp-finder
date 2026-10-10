// Pure moderation-queue helpers shared by /admin and the admin API routes.

/** A queue row's facility references (edit/deletion: facility_id; merge: facility_a/b). */
export interface FacilityRefs {
  facility_id?: string | null;
  facility_a?: string | null;
  facility_b?: string | null;
}

/** True when the row points at `facilityId` through any of its facility columns. */
export function refsFacility(row: FacilityRefs, facilityId: string): boolean {
  return (
    row.facility_id === facilityId || row.facility_a === facilityId || row.facility_b === facilityId
  );
}
