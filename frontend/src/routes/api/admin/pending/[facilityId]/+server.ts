import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tbList } from "$lib/server/admin/tb";

/** GET /api/admin/pending/[facilityId] → pending moderation counts for one
 * facility, powering the admin-only shortcut on the detail panel. */
export const GET: RequestHandler = async ({ locals, params }) => {
  await requireAdmin(locals);
  const facilityId = params.facilityId;

  // No compound WHERE in Teenybase — fetch pending and filter in JS.
  const [edits, merges, deletions] = await Promise.all([
    tbList<{ facility_id: string }>("edit_suggestions", {
      where: "status == 'pending'",
      limit: 1000,
    }),
    tbList<{ facility_a: string | null; facility_b: string | null }>("merge_suggestions", {
      where: "status == 'pending'",
      limit: 1000,
    }),
    tbList<{ facility_id: string | null }>("delete_suggestions", {
      where: "status == 'pending'",
      limit: 1000,
    }),
  ]);

  return json({
    edits: edits.filter((s) => s.facility_id === facilityId).length,
    merges: merges.filter((s) => s.facility_a === facilityId || s.facility_b === facilityId)
      .length,
    deletions: deletions.filter((s) => s.facility_id === facilityId).length,
  });
};
