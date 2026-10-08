import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbView } from "$lib/server/tb";
import { tbFetch } from "$lib/server/tbFetch";
import {
  listPending,
  loadLookups,
  loadPendingRow,
  parseResolveBody,
  resolveRow,
  userEmail,
} from "$lib/server/moderation";

interface RawDeletion {
  id: string;
  facility_id: string | null;
  user_id: string;
  note: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

/** GET /api/admin/deletions → pending deletion flags, joined to facility + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [deletions, { facById, userById }] = await Promise.all([
    listPending<RawDeletion>("delete_suggestions", { order: "created asc", limit: 500 }),
    loadLookups(),
  ]);

  const result = deletions.map((d) => {
    const fac = d.facility_id ? facById.get(d.facility_id) : undefined;
    return {
      ...d,
      facility_name: fac?.name ?? "(deleted)",
      facility_ridb_id: fac?.ridb_id ?? "",
      user_email: userEmail(userById, d.user_id),
    };
  });

  return json(result);
};

/** POST /api/admin/deletions → approve (tombstone facility) / reject one flag. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = await parseResolveBody(request);
  if (body instanceof Response) return body;
  const { id, action } = body;

  const flag = await loadPendingRow<RawDeletion>("delete_suggestions", id, "Flag");
  if (flag instanceof Response) return flag;

  let tombstoned: { id: string; name: string } | null = null;

  if (action === "approve") {
    if (!flag.facility_id) {
      return json({ error: "Facility no longer exists" }, { status: 404 });
    }
    const facility = await tbView<{ id: string; name: string }>("facilities", flag.facility_id);
    if (!facility) return json({ error: "Facility not found" }, { status: 404 });

    // Soft-delete: the row stays so the ETL's ridb_id index keeps absorbing
    // this id (see etl tombstone handling) — never hard-delete here.
    const editRes = await tbFetch(tb(`facilities/edit/${facility.id}`), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify({ is_deleted: true }),
    });
    if (!editRes.ok) {
      return json(
        { error: "Failed to tombstone facility", detail: await editRes.text() },
        { status: 502 },
      );
    }
    tombstoned = { id: facility.id, name: facility.name };
  }

  const resolveRes = await resolveRow("delete_suggestions", id, admin.id, action, body.admin_note);
  if (!resolveRes.ok) {
    return json(
      { error: "Failed to update flag", detail: await resolveRes.text() },
      { status: 502 },
    );
  }

  return json(
    tombstoned
      ? { ok: true, facility_id: tombstoned.id, facility_name: tombstoned.name }
      : { ok: true },
  );
};
