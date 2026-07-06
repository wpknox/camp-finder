import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { tbFetch } from "$lib/server/tbFetch";
import { ACCESS_COOKIE } from "$lib/server/auth/session";

interface FacilityLite {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) throw redirect(303, "/");
  const token = cookies.get(ACCESS_COOKIE)!;
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Display name (not in JWT).
  let name = "";
  const me = await tbFetch(
    `/api/v1/table/users/view/${locals.user.id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (me.ok) name = ((await me.json()) as { name?: string }).name ?? "";

  // Facility id → {name, lat, lng} map (single fetch; ~600 rows at current scale).
  const facRes = await tbFetch(`/api/v1/table/facilities/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 10000 }),
  });
  const facItems =
    ((await facRes.json()) as { items?: FacilityLite[] }).items ?? [];
  const facMap = new Map(facItems.map((f) => [f.id, f]));

  // Saved campgrounds (scoped to the user by their token).
  const savedRes = await tbFetch(
    `/api/v1/table/saved_campgrounds/list`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        where: `user_id == '${locals.user.id}'`,
        limit: 1000,
      }),
    },
  );
  const savedItems =
    (
      (await savedRes.json()) as {
        items?: Array<{ id: string; facility_id: string }>;
      }
    ).items ?? [];
  const saved = savedItems.map((s) => ({
    id: s.id,
    facility: facMap.get(s.facility_id) ?? null,
  }));

  // The user's reviews (ratings list is public; filter to this user).
  const revRes = await tbFetch(`/api/v1/table/ratings/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      where: `user_id == '${locals.user.id}'`,
      order: "created desc",
      limit: 500,
    }),
  });
  const revItems =
    (
      (await revRes.json()) as {
        items?: Array<{
          id: string;
          facility_id: string;
          score: number;
          notes: string;
          visited_at: string;
        }>;
      }
    ).items ?? [];
  const reviews = revItems.map((r) => ({
    ...r,
    facility: facMap.get(r.facility_id) ?? null,
  }));

  return { account: { ...locals.user, name }, saved, reviews };
};
