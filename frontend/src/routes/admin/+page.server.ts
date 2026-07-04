import type { PageServerLoad } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import type { Facility } from "$lib/types";

export const load: PageServerLoad = async ({ locals, fetch }) => {
  await requireAdmin(locals);
  const [editsRes, mergesRes, facilitiesRes] = await Promise.all([
    fetch("/api/admin/suggestions"),
    fetch("/api/admin/merges"),
    // World bbox: reuse the existing public bbox-filtered endpoint (no new
    // route) to build a facility_id → current-values map for edit diffs.
    fetch("/api/facilities?north=90&south=-90&east=180&west=-180"),
  ]);

  const edits = editsRes.ok ? await editsRes.json() : [];
  const merges = mergesRes.ok ? await mergesRes.json() : [];
  const facilities: Facility[] = facilitiesRes.ok ? await facilitiesRes.json() : [];
  const facilityById = new Map(facilities.map((f) => [f.id, f]));

  const editsWithCurrent = (
    edits as Array<{ facility_id: string; [k: string]: unknown }>
  ).map((s) => ({ ...s, current: facilityById.get(s.facility_id) ?? null }));

  return { edits: editsWithCurrent, merges };
};
