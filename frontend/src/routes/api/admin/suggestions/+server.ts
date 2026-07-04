import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbList } from "$lib/server/admin/tb";
import type { Amenities } from "$lib/types";

interface RawSuggestion {
  id: string;
  facility_id: string;
  user_id: string;
  changes: string | Record<string, unknown>;
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
  amenities: string | Record<string, unknown>;
}

interface RawUser {
  id: string;
  email: string;
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

/** GET /api/admin/suggestions → pending edit suggestions, joined to facility + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [suggestions, facilities, users] = await Promise.all([
    tbList<RawSuggestion>("edit_suggestions", {
      where: "status == 'pending'",
      order: "created asc",
      limit: 500,
    }),
    tbList<RawFacility>("facilities", { limit: 10000 }),
    tbList<RawUser>("users", { limit: 10000 }),
  ]);

  const facById = new Map(facilities.map((f) => [f.id, f]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const result = suggestions.map((s) => ({
    ...s,
    changes: parseJson<Record<string, unknown>>(s.changes, {}),
    facility_name: facById.get(s.facility_id)?.name ?? "(deleted)",
    user_email: userById.get(s.user_id)?.email ?? "(deleted)",
  }));

  return json(result);
};

/** POST /api/admin/suggestions → approve/reject one edit suggestion. */
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

  const viewRes = await fetch(tb(`edit_suggestions/view/${id}`), {
    headers: tbHeaders,
  });
  if (!viewRes.ok) return json({ error: "Suggestion not found" }, { status: 404 });
  const suggestion = (await viewRes.json()) as RawSuggestion;
  if (suggestion.status !== "pending") {
    return json({ error: "Suggestion already resolved" }, { status: 409 });
  }

  let editedFacility: { id: string; name: string } | null = null;

  if (action === "approve") {
    const changes = parseJson<Record<string, unknown>>(suggestion.changes, {});

    const facRes = await fetch(tb(`facilities/view/${suggestion.facility_id}`), {
      headers: tbHeaders,
    });
    if (!facRes.ok) return json({ error: "Facility not found" }, { status: 404 });
    const facility = (await facRes.json()) as RawFacility;

    const { amenities: amenityChanges, ...scalarChanges } = changes as {
      amenities?: Partial<Amenities>;
    } & Record<string, unknown>;

    const patch: Record<string, unknown> = { ...scalarChanges };
    if (amenityChanges && typeof amenityChanges === "object") {
      const current = parseJson<Record<string, unknown>>(facility.amenities, {});
      patch.amenities = JSON.stringify({ ...current, ...amenityChanges });
    }

    const editRes = await fetch(tb(`facilities/edit/${facility.id}`), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify(patch),
    });
    if (!editRes.ok) {
      return json(
        { error: "Failed to apply edit", detail: await editRes.text() },
        { status: 502 },
      );
    }

    editedFacility = { id: facility.id, name: facility.name };
  }

  const resolveRes = await fetch(tb(`edit_suggestions/edit/${id}`), {
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
      { error: "Failed to update suggestion", detail: await resolveRes.text() },
      { status: 502 },
    );
  }

  return json(
    editedFacility
      ? { ok: true, facility_id: editedFacility.id, facility_name: editedFacility.name }
      : { ok: true },
  );
};
