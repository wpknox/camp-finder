import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { guardSubmission, insertRow } from "$lib/server/moderation";
import type { EditChanges } from "$lib/types";
import { validateEditChanges } from "$lib/validation";

// Deliberately uses the service token (see $lib/server/tb) — don't "fix" this to the
// per-request user-token pattern of sibling routes (api/saved, api/ratings).

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  const blocked = guardSubmission(locals, getClientAddress);
  if (blocked) return blocked;

  const { facility_id, changes, note } = (await request.json()) as {
    facility_id?: string;
    changes?: EditChanges;
    note?: string;
  };
  if (!facility_id) return json({ error: "facility_id required" }, { status: 400 });
  if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0)
    return json({ error: "changes required" }, { status: 400 });

  const invalid = validateEditChanges(changes);
  if (invalid) return json({ error: invalid }, { status: 400 });

  return insertRow("edit_suggestions", {
    facility_id,
    user_id: locals.user!.id,
    changes: JSON.stringify(changes), // Teenybase quirk: JSON fields stringified on write
    note: (note ?? "").slice(0, 1000),
    status: "pending",
  });
};
