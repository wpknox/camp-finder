import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbView } from "$lib/server/tb";
import { parseJson } from "$lib/json";
import { tbFetch } from "$lib/server/tbFetch";
import { isTombstoned } from "$lib/server/facilities";
import {
  listPending,
  loadLookups,
  loadPendingRow,
  parseResolveBody,
  resolveRow,
  userEmail,
} from "$lib/server/moderation";
import type { Amenities } from "$lib/types";
import { deriveFcfsFlags } from "$lib/fcfs";

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
  amenities: string | Record<string, unknown>;
  cell_coverage: string | Record<string, unknown> | null;
  fcfs_total: number | null;
  reservable_total: number | null;
  name: string;
}

/** GET /api/admin/suggestions → pending edit suggestions, joined to facility + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [suggestions, { facById, userById }] = await Promise.all([
    listPending<RawSuggestion>("edit_suggestions", { order: "created asc", limit: 500 }),
    loadLookups(),
  ]);

  const result = suggestions.map((s) => {
    const fac = facById.get(s.facility_id);
    return {
      ...s,
      changes: parseJson<Record<string, unknown>>(s.changes, {}),
      facility_name: fac?.name ?? "(deleted)",
      // Current values for diffing; tombstoned facilities have none.
      current: fac && !isTombstoned(fac as unknown as Record<string, unknown>) ? fac : null,
      user_email: userEmail(userById, s.user_id),
    };
  });

  return json(result);
};

/** POST /api/admin/suggestions → approve/reject one edit suggestion. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = await parseResolveBody(request);
  if (body instanceof Response) return body;
  const { id, action } = body;

  const suggestion = await loadPendingRow<RawSuggestion>("edit_suggestions", id, "Suggestion");
  if (suggestion instanceof Response) return suggestion;

  let editedFacility: { id: string; name: string } | null = null;

  if (action === "approve") {
    const changes = parseJson<Record<string, unknown>>(suggestion.changes, {});

    const facility = await tbView<RawFacility>("facilities", suggestion.facility_id);
    if (!facility) return json({ error: "Facility not found" }, { status: 404 });

    const {
      amenities: amenityChanges,
      cell_coverage: carrierChanges,
      ...scalarChanges
    } = changes as {
      amenities?: Partial<Amenities>;
      cell_coverage?: Record<string, boolean | null>;
    } & Record<string, unknown>;

    const patch: Record<string, unknown> = { ...scalarChanges };
    if (amenityChanges && typeof amenityChanges === "object") {
      const current = parseJson<Record<string, unknown>>(facility.amenities, {});
      patch.amenities = JSON.stringify({ ...current, ...amenityChanges });
    }
    if (carrierChanges && typeof carrierChanges === "object") {
      const current = parseJson<Record<string, unknown>>(facility.cell_coverage, {
        verizon: null,
        att: null,
        tmobile: null,
        as_of: null,
      });
      const existing = Array.isArray(current.user_edited) ? (current.user_edited as string[]) : [];
      const userEdited = new Set(existing);
      // null = "unknown" relinquishes user ownership so enrich-cell can repopulate from FCC data
      for (const k of Object.keys(carrierChanges)) {
        if (carrierChanges[k] === null) userEdited.delete(k);
        else userEdited.add(k);
      }
      patch.cell_coverage = JSON.stringify({
        ...current,
        ...carrierChanges,
        user_edited: [...userEdited],
      });
    }

    // Site counts drive derived flags (and marker colors) — recompute whenever
    // either count changes, using the facility's current value for the other.
    if ("fcfs_total" in changes || "reservable_total" in changes) {
      const fcfs = (changes.fcfs_total ?? facility.fcfs_total ?? 0) as number;
      const reservable = (changes.reservable_total ?? facility.reservable_total ?? 0) as number;
      Object.assign(patch, deriveFcfsFlags(fcfs, reservable));
    }

    const editRes = await tbFetch(tb(`facilities/edit/${facility.id}`), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify(patch),
    });
    if (!editRes.ok) {
      return json({ error: "Failed to apply edit", detail: await editRes.text() }, { status: 502 });
    }

    editedFacility = { id: facility.id, name: facility.name };
  }

  const resolveRes = await resolveRow("edit_suggestions", id, admin.id, action, body.admin_note);
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
