import { json } from "@sveltejs/kit";
import { tbFetch } from "$lib/server/tbFetch";
import { ACCESS_COOKIE } from "$lib/server/auth/session";
import type { RequestHandler } from "./$types";

const TB = `/api/v1/table/ratings`;

interface RatingRow {
  id: string;
  user_id: string;
  facility_id: string;
  score: number;
  notes: string;
  visited_at: string;
}

async function listForFacility(facilityId: string): Promise<RatingRow[]> {
  const res = await tbFetch(`${TB}/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      where: `facility_id == '${facilityId}'`,
      order: "created desc",
      limit: 200,
    }),
  });
  const data = (await res.json()) as { items?: RatingRow[] };
  return data.items ?? [];
}

// Public read — anyone (incl. guests) can read reviews.
export const GET: RequestHandler = async ({ params }) => {
  return json(await listForFacility(params.facilityId));
};

// Authenticated upsert — one review per (user, facility).
export const POST: RequestHandler = async ({
  params,
  request,
  locals,
  cookies,
}) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  const token = cookies.get(ACCESS_COOKIE)!;
  const { score, notes, visited_at } = (await request.json()) as Record<
    string,
    unknown
  >;
  const n = Number(score);
  if (!n || n < 1 || n > 5)
    return json({ error: "Score must be 1–5" }, { status: 400 });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const existing = (await listForFacility(params.facilityId)).find(
    (r) => r.user_id === locals.user!.id,
  );
  const values = {
    facility_id: params.facilityId,
    user_id: locals.user.id,
    score: n,
    notes: (notes as string) ?? "",
    visited_at: (visited_at as string) ?? "",
  };

  const res = existing
    ? await tbFetch(`${TB}/edit/${existing.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify(values),
      })
    : await tbFetch(`${TB}/insert`, {
        method: "POST",
        headers,
        body: JSON.stringify({ values }),
      });

  const data = await res.json();
  return json(data, { status: res.ok ? (existing ? 200 : 201) : res.status });
};

// Delete the caller's own review for this facility.
export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  const token = cookies.get(ACCESS_COOKIE)!;
  const mine = (await listForFacility(params.facilityId)).find(
    (r) => r.user_id === locals.user!.id,
  );
  if (!mine) return json({ ok: true });
  const res = await tbFetch(`${TB}/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ where: `id == '${mine.id}'` }),
  });
  return json({ ok: res.ok }, { status: res.ok ? 200 : res.status });
};
