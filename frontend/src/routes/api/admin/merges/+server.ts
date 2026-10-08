import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbList, tbView } from "$lib/server/tb";
import { tbFetch } from "$lib/server/tbFetch";
import { parseFacility } from "$lib/server/facilities";
import {
  listPending,
  loadLookups,
  loadPendingRow,
  parseResolveBody,
  resolveRow,
  userEmail,
} from "$lib/server/moderation";
import { pickWinner, mergeFacilityFields, CHOICE_FIELDS } from "$lib/server/admin/merge";
import type { ChoiceField, FieldChoices } from "$lib/server/admin/merge";
import type { Facility } from "$lib/types";

const CHOICE_FIELD_SET = new Set<string>(CHOICE_FIELDS);

/** Validate an untrusted field_choices payload; returns null if invalid. */
function parseFieldChoices(raw: unknown): FieldChoices | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: FieldChoices = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!CHOICE_FIELD_SET.has(key)) return null;
    if (value !== "winner" && value !== "loser") return null;
    out[key as ChoiceField] = value;
  }
  return out;
}

interface RawMerge {
  id: string;
  facility_a: string;
  facility_b: string;
  user_id: string;
  note: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

interface ChildRow {
  id: string;
  user_id: string;
  facility_id: string;
}

/** Load a facility by id, parsing its JSON fields into a usable Facility. */
async function loadFacility(id: string): Promise<Facility | null> {
  const raw = await tbView<Record<string, unknown>>("facilities", id);
  return raw ? parseFacility(raw) : null;
}

/** GET /api/admin/merges → pending merge suggestions, joined to both facilities + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [suggestions, { facById, userById }] = await Promise.all([
    listPending<RawMerge>("merge_suggestions", { order: "created asc", limit: 500 }),
    loadLookups(),
  ]);

  const result = suggestions.map((s) => {
    const a = facById.get(s.facility_a);
    const b = facById.get(s.facility_b);
    return {
      ...s,
      facility_a_name: a?.name ?? "(deleted)",
      facility_a_ridb_id: a?.ridb_id ?? "(deleted)",
      facility_b_name: b?.name ?? "(deleted)",
      facility_b_ridb_id: b?.ridb_id ?? "(deleted)",
      facility_a_data: a ?? null,
      facility_b_data: b ?? null,
      user_email: userEmail(userById, s.user_id),
    };
  });

  return json(result);
};

/** Repoint all rows of `table` from loser → winner, deleting rows that would
 * collide on the unique (user_id, facility_id) index. Idempotent. */
async function repointChildren(table: string, loserId: string, winnerId: string): Promise<void> {
  const [loserRows, winnerRows] = await Promise.all([
    tbList<ChildRow>(table, { where: `facility_id == '${loserId}'`, limit: 1000 }),
    tbList<ChildRow>(table, { where: `facility_id == '${winnerId}'`, limit: 1000 }),
  ]);
  const winnerUsers = new Set(winnerRows.map((r) => r.user_id));

  for (const row of loserRows) {
    if (winnerUsers.has(row.user_id)) {
      // Collision: winner already has a row for this user. Drop the loser's.
      await tbFetch(tb(`${table}/delete`), {
        method: "POST",
        headers: tbHeaders,
        body: JSON.stringify({ where: `id == '${row.id}'` }),
      });
    } else {
      await tbFetch(tb(`${table}/edit/${row.id}`), {
        method: "POST",
        headers: tbHeaders,
        body: JSON.stringify({ facility_id: winnerId }),
      });
    }
  }
}

/** POST /api/admin/merges → approve (run the merge engine) or reject. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = await parseResolveBody<{ winner_id?: string; field_choices?: unknown }>(request);
  if (body instanceof Response) return body;
  const { id, action, winner_id } = body;

  const fieldChoices = parseFieldChoices(body.field_choices);
  if (fieldChoices === null) {
    return json(
      { error: "field_choices contains unknown keys or invalid values" },
      { status: 400 },
    );
  }

  const suggestion = await loadPendingRow<RawMerge>("merge_suggestions", id, "Suggestion");
  if (suggestion instanceof Response) return suggestion;

  let mergedWinner: { id: string; name: string } | null = null;

  if (action === "approve") {
    // The merge is deliberately NON-transactional: Teenybase has no multi-op
    // transaction. Every step (child repoint, winner edit, loser delete) is
    // idempotent, so a merge that fails partway can be safely re-approved.
    const [a, b] = await Promise.all([
      loadFacility(suggestion.facility_a),
      loadFacility(suggestion.facility_b),
    ]);
    if (!a || !b) return json({ error: "One or both facilities not found" }, { status: 404 });

    let winner = pickWinner(a, b);
    if (winner_id === a.id) winner = a;
    if (winner_id === b.id) winner = b;
    const loser = winner.id === a.id ? b : a;

    const merged = mergeFacilityFields(winner, loser, fieldChoices);

    // Repoint children before touching the winner facility (idempotent either order).
    await repointChildren("ratings", loser.id, winner.id);
    await repointChildren("saved_campgrounds", loser.id, winner.id);

    // Loser's alerts are a scrape cache — drop them, they regenerate on demand.
    await tbFetch(tb("alerts/delete"), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify({ where: `facility_id == '${loser.id}'` }),
    });

    // Apply merged fields to the winner. Fail here BEFORE deleting the loser.
    const editRes = await tbFetch(tb(`facilities/edit/${winner.id}`), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify({
        name: merged.name,
        lat: merged.lat,
        lng: merged.lng,
        forest: merged.forest,
        district: merged.district,
        description: merged.description,
        fee_min: merged.fee_min,
        fee_max: merged.fee_max,
        season_start: merged.season_start,
        season_end: merged.season_end,
        fcfs_total: merged.fcfs_total,
        reservable_total: merged.reservable_total,
        is_fully_fcfs: merged.is_fully_fcfs,
        is_partial_fcfs: merged.is_partial_fcfs,
        fs_url: merged.fs_url,
        amenities: JSON.stringify(merged.amenities),
        merged_ridb_ids: JSON.stringify(merged.merged_ridb_ids),
      }),
    });
    if (!editRes.ok) {
      return json(
        { error: "Failed to update winner facility", detail: await editRes.text() },
        { status: 502 },
      );
    }

    // Delete the loser LAST — children already repointed; any stragglers cascade.
    await tbFetch(tb("facilities/delete"), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify({ where: `id == '${loser.id}'` }),
    });

    mergedWinner = { id: winner.id, name: merged.name };
  }

  const resolveRes = await resolveRow("merge_suggestions", id, admin.id, action, body.admin_note);
  if (!resolveRes.ok) {
    return json(
      { error: "Failed to update suggestion", detail: await resolveRes.text() },
      { status: 502 },
    );
  }

  return json(
    mergedWinner
      ? { ok: true, facility_id: mergedWinner.id, facility_name: mergedWinner.name }
      : { ok: true },
  );
};
