import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { guardSubmission, insertRow, listPending } from "$lib/server/moderation";

// Deliberately uses the service token (see $lib/server/tb) — don't "fix" this to the
// per-request user-token pattern of sibling routes (api/saved, api/ratings).

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  const blocked = guardSubmission(locals, getClientAddress);
  if (blocked) return blocked;

  const { facility_id, reason } = (await request.json()) as Record<string, string>;
  if (!facility_id) return json({ error: "facility_id required" }, { status: 400 });
  // Reason is REQUIRED for deletion flags (owner decision) — unlike the
  // optional notes on edit/duplicate suggestions.
  if (!reason || typeof reason !== "string" || reason.trim().length === 0)
    return json({ error: "A reason is required" }, { status: 400 });

  // Dedupe pending flags per facility (no compound WHERE — fetch pending and
  // filter in JS; 1000-row ceiling is fine at current scale).
  const existing = await listPending<{ facility_id: string }>("delete_suggestions");
  if (existing.some((s) => s.facility_id === facility_id))
    return json({ duplicate: true }, { status: 200 });

  return insertRow("delete_suggestions", {
    facility_id,
    user_id: locals.user!.id,
    note: reason.trim().slice(0, 1000),
    status: "pending",
  });
};
