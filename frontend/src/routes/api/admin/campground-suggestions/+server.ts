import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbList } from "$lib/server/tb";
import { parseJson } from "$lib/json";
import { isSafeId } from "$lib/server/facilities";
import { tbFetch } from "$lib/server/tbFetch";
import {
  validateSubmission,
  validateSourceUrl,
  buildFacilityValues,
  findNearby,
} from "$lib/campgroundSubmission";
import type { CampgroundSubmission } from "$lib/types";

interface RawCampground {
  id: string;
  user_id: string;
  // Teenybase may hand JSON columns back as a string.
  submission: CampgroundSubmission | string;
  source_url: string | null;
  note: string | null;
  status: string;
  created_facility_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

interface RawFacility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  ridb_id: string;
  is_deleted?: boolean | number | null;
}

interface RawUser {
  id: string;
  email: string;
}

/** GET /api/admin/campground-suggestions → pending new-campground submissions, with nearby duplicates + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [rows, facilities, users] = await Promise.all([
    tbList<RawCampground>("campground_suggestions", {
      where: "status == 'pending'",
      order: "created asc",
      limit: 500,
    }),
    tbList<RawFacility>("facilities", { limit: 10000 }),
    tbList<RawUser>("users", { limit: 10000 }),
  ]);

  // Tombstoned facilities aren't real duplicates.
  const live = facilities.filter((f) => !f.is_deleted);
  const userById = new Map(users.map((u) => [u.id, u]));

  const result = rows.map((r) => {
    const submission = parseJson(r.submission, null) as CampgroundSubmission | null;
    const nearby =
      submission && typeof submission.lat === "number" && typeof submission.lng === "number"
        ? findNearby(live, submission.lat, submission.lng)
        : [];
    return {
      ...r,
      submission,
      user_email: userById.get(r.user_id)?.email ?? "(deleted)",
      nearby,
    };
  });

  return json(result);
};

/** POST /api/admin/campground-suggestions → approve (create facility) / reject one submission. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = (await request.json()) as {
    id?: string;
    action?: string;
    submission?: unknown;
    source_url?: unknown;
    admin_note?: string;
  };
  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });
  }

  const viewRes = await tbFetch(tb(`campground_suggestions/view/${id}`), {
    headers: tbHeaders,
  });
  if (!viewRes.ok) return json({ error: "Suggestion not found" }, { status: 404 });
  const row = (await viewRes.json()) as RawCampground;
  if (row.status !== "pending") {
    return json({ error: "Suggestion already resolved" }, { status: 409 });
  }

  let created: { id: string; name: string } | null = null;
  let finalSubmission: unknown = null;
  let finalSourceUrl: string | null = null;

  if (action === "approve") {
    // Admin-edited values win; otherwise fall back to what the user submitted.
    finalSubmission =
      body.submission !== undefined && body.submission !== null
        ? body.submission
        : parseJson(row.submission, null);
    finalSourceUrl =
      typeof body.source_url === "string"
        ? body.source_url.trim() || null
        : row.source_url;

    const subError = validateSubmission(finalSubmission);
    if (subError) return json({ error: subError }, { status: 400 });
    const urlError = validateSourceUrl(finalSourceUrl ?? "");
    if (urlError) return json({ error: urlError }, { status: 400 });

    // The id comes from Teenybase (autoSetUid), but it goes into a WHERE below.
    if (!isSafeId(id)) return json({ error: "Invalid id" }, { status: 400 });

    // Idempotent: a previous approve may have created the facility and then
    // failed to mark the suggestion approved — reuse that row on retry rather
    // than tripping the unique ridb_id constraint forever.
    const findCreated = () =>
      tbList<RawFacility>("facilities", {
        where: `ridb_id == 'user-${id}'`,
        limit: 1,
      });
    let found = await findCreated();
    if (!found[0]) {
      const insertRes = await tbFetch(tb("facilities/insert"), {
        method: "POST",
        headers: tbHeaders,
        body: JSON.stringify({
          values: buildFacilityValues(
            finalSubmission as CampgroundSubmission,
            id,
            finalSourceUrl,
            new Date().toISOString(),
          ),
        }),
      });
      if (!insertRes.ok) {
        return json(
          { error: "Failed to create facility", detail: await insertRes.text() },
          { status: 502 },
        );
      }
      // Don't rely on the insert response shape: find the row by its ridb_id.
      found = await findCreated();
    }
    if (!found[0]) {
      return json(
        { error: "Facility created but could not be located" },
        { status: 502 },
      );
    }
    created = { id: found[0].id, name: found[0].name };
  }

  const resolveRes = await tbFetch(tb(`campground_suggestions/edit/${id}`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (body.admin_note ?? "").slice(0, 1000),
      // On approve, record what actually went live (admin edits included).
      ...(created
        ? {
            submission: JSON.stringify(finalSubmission),
            source_url: finalSourceUrl,
            created_facility_id: created.id,
          }
        : {}),
    }),
  });
  if (!resolveRes.ok) {
    return json(
      {
        error: created
          ? "Facility was created but the suggestion could not be marked approved"
          : "Failed to update suggestion",
        ...(created ? { facility_id: created.id } : {}),
        detail: await resolveRes.text(),
      },
      { status: 502 },
    );
  }

  return json(
    created
      ? { ok: true, facility_id: created.id, facility_name: created.name }
      : { ok: true },
  );
};
