import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbList } from "$lib/server/admin/tb";
import { tbFetch } from "$lib/server/tbFetch";

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

interface RawFacility {
  id: string;
  name: string;
  ridb_id: string;
}

interface RawUser {
  id: string;
  email: string;
}

/** GET /api/admin/deletions → pending deletion flags, joined to facility + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [deletions, facilities, users] = await Promise.all([
    tbList<RawDeletion>("delete_suggestions", {
      where: "status == 'pending'",
      order: "created asc",
      limit: 500,
    }),
    tbList<RawFacility>("facilities", { limit: 10000 }),
    tbList<RawUser>("users", { limit: 10000 }),
  ]);

  const facById = new Map(facilities.map((f) => [f.id, f]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const result = deletions.map((d) => {
    const fac = d.facility_id ? facById.get(d.facility_id) : undefined;
    return {
      ...d,
      facility_name: fac?.name ?? "(deleted)",
      facility_ridb_id: fac?.ridb_id ?? "",
      user_email: userById.get(d.user_id)?.email ?? "(deleted)",
    };
  });

  return json(result);
};

/** POST /api/admin/deletions → approve (tombstone facility) / reject one flag. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = (await request.json()) as {
    id?: string;
    action?: string;
    admin_note?: string;
  };
  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });
  }

  const viewRes = await tbFetch(tb(`delete_suggestions/view/${id}`), {
    headers: tbHeaders,
  });
  if (!viewRes.ok) return json({ error: "Flag not found" }, { status: 404 });
  const flag = (await viewRes.json()) as RawDeletion;
  if (flag.status !== "pending") {
    return json({ error: "Flag already resolved" }, { status: 409 });
  }

  let tombstoned: { id: string; name: string } | null = null;

  if (action === "approve") {
    if (!flag.facility_id) {
      return json({ error: "Facility no longer exists" }, { status: 404 });
    }
    const facRes = await tbFetch(tb(`facilities/view/${flag.facility_id}`), {
      headers: tbHeaders,
    });
    if (!facRes.ok) return json({ error: "Facility not found" }, { status: 404 });
    const facility = (await facRes.json()) as RawFacility;

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

  const resolveRes = await tbFetch(tb(`delete_suggestions/edit/${id}`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (body.admin_note ?? "").slice(0, 1000),
    }),
  });
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
