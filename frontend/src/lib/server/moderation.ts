import { json } from "@sveltejs/kit";
import { tb, tbHeaders, tbList, tbView } from "./tb";
import { tbFetch } from "./tbFetch";
import { parseFacility } from "./facilities";
import { suggestionLimiter } from "./auth/limiters";
import type { Facility } from "../types";

// Shared plumbing for the four moderation queues (edit / merge / delete /
// campground suggestions). Each route keeps only what is specific to its queue.

type Action = "approve" | "reject";

/** Pending rows of a queue table (no compound WHERE in Teenybase, so callers filter further in JS). */
export function listPending<T>(
  table: string,
  opts: { order?: string; limit?: number } = {},
): Promise<T[]> {
  const { order, limit = 1000 } = opts;
  return tbList<T>(table, {
    where: "status == 'pending'",
    ...(order ? { order } : {}),
    limit,
  });
}

/** The pending row, or a ready 404/409 Response. `noun` is e.g. "Suggestion" or "Flag". */
export async function loadPendingRow<T extends { status: string }>(
  table: string,
  id: string,
  noun: string,
): Promise<T | Response> {
  const row = await tbView<T>(table, id);
  if (!row) return json({ error: `${noun} not found` }, { status: 404 });
  if (row.status !== "pending") {
    return json({ error: `${noun} already resolved` }, { status: 409 });
  }
  return row;
}

/** Parse the shared `{ id, action, admin_note }` admin POST body, or a 400 Response. */
export async function parseResolveBody<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  request: Request,
): Promise<
  | ({ id: string; action: Action; admin_note?: string } & Omit<
      Extra,
      "id" | "action" | "admin_note"
    >)
  | Response
> {
  const body = (await request.json()) as Record<string, unknown>;
  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });
  }
  return body as never;
}

/** Mark a queue row approved/rejected. Returns the fetch Response so each route owns its error message. */
export function resolveRow(
  table: string,
  id: string,
  adminId: string,
  action: Action,
  adminNote: string | undefined,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return tbFetch(tb(`${table}/edit/${id}`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      admin_note: (adminNote ?? "").slice(0, 1000),
      ...extra,
    }),
  });
}

interface UserRow {
  id: string;
  email: string;
}

/** All facilities (parsed, including tombstoned) and users, for joining onto queue rows. */
export async function loadLookups(): Promise<{
  facilities: Facility[];
  facById: Map<string, Facility>;
  userById: Map<string, UserRow>;
}> {
  const [rawFacilities, users] = await Promise.all([
    tbList<Record<string, unknown>>("facilities", { limit: 10000 }),
    tbList<UserRow>("users", { limit: 10000 }),
  ]);
  const facilities = rawFacilities.map(parseFacility);
  return {
    facilities,
    facById: new Map(facilities.map((f) => [f.id, f])),
    userById: new Map(users.map((u) => [u.id, u])),
  };
}

export const userEmail = (userById: Map<string, { email: string }>, id: string): string =>
  userById.get(id)?.email ?? "(deleted)";

/** Public submit routes: 401 if signed out, then 429 if rate-limited; null if OK. */
export function guardSubmission(
  locals: App.Locals,
  getClientAddress: () => string,
): Response | null {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  if (!suggestionLimiter.check(getClientAddress()).allowed) {
    return json({ error: "Too many submissions — try again later" }, { status: 429 });
  }
  return null;
}

/** Insert a row with the service token; 201 on success, else passthrough of Teenybase's status/body. */
export async function insertRow(table: string, values: Record<string, unknown>): Promise<Response> {
  const res = await tbFetch(tb(`${table}/insert`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({ values }),
  });
  const data = await res.json();
  return json(data, { status: res.ok ? 201 : res.status });
}
