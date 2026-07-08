import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { tbFetch } from "$lib/server/tbFetch";
import { ACCESS_COOKIE } from "$lib/server/auth/session";

const TB = `/api/v1/table/saved_campgrounds`;

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** GET /api/saved            → all of the user's saves
 *  GET /api/saved?facilityId= → { saved, id } for one facility */
export const GET: RequestHandler = async ({ locals, cookies, url }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  const token = cookies.get(ACCESS_COOKIE)!;
  const res = await tbFetch(`${TB}/list`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      where: `user_id == '${locals.user.id}'`,
      limit: 1000,
    }),
  });
  const data = (await res.json()) as {
    items?: Array<{ id: string; facility_id: string; personal_notes?: string }>;
  };
  const items = data.items ?? [];
  const facilityId = url.searchParams.get("facilityId");
  if (facilityId) {
    const match = items.find((i) => i.facility_id === facilityId);
    return json({ saved: !!match, id: match?.id ?? null });
  }
  return json(items);
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  const token = cookies.get(ACCESS_COOKIE)!;
  const { facility_id, personal_notes } = (await request.json()) as Record<
    string,
    string
  >;
  if (!facility_id)
    return json({ error: "facility_id required" }, { status: 400 });

  // Idempotent save: a campground can only be saved once per user. Check for an
  // existing row first and return it rather than inserting a duplicate. The DB
  // also enforces this with a unique (user_id, facility_id) index, but this
  // guard keeps the API well-behaved and hands the client back a stable id.
  const existingRes = await tbFetch(`${TB}/list`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      where: `user_id == '${locals.user.id}'`,
      limit: 1000,
    }),
  });
  const existing = (await existingRes.json()) as {
    items?: Array<{ id: string; facility_id: string }>;
  };
  const dupe = existing.items?.find((i) => i.facility_id === facility_id);
  if (dupe) return json(dupe, { status: 200 });

  const res = await tbFetch(`${TB}/insert`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      values: {
        user_id: locals.user.id,
        facility_id,
        personal_notes: personal_notes ?? "",
      },
    }),
  });
  const data = await res.json();
  return json(data, { status: res.ok ? 201 : res.status });
};

export const DELETE: RequestHandler = async ({ locals, cookies, request }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  const token = cookies.get(ACCESS_COOKIE)!;
  const { id } = (await request.json()) as Record<string, string>;
  if (!id) return json({ error: "id required" }, { status: 400 });
  // saved_campgrounds deleteRule (auth.uid == user_id) ensures users only delete their own.
  const res = await tbFetch(`${TB}/delete`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ where: `id == '${id}'` }),
  });
  return json({ ok: res.ok }, { status: res.ok ? 200 : res.status });
};
