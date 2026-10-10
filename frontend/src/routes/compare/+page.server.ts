// frontend/src/routes/compare/+page.server.ts
import { listPublicFacilities } from "$lib/server/facilities";
import type { PageServerLoad } from "./$types";
import type { Facility } from "$lib/types";

export const load: PageServerLoad = async ({ url }) => {
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  if (ids.length === 0) return { facilities: [] };

  // Teenybase rejects compound WHERE expressions (`||` and `&&` both fail to
  // parse), so we can't query several ids at once. Fetch the full set and
  // filter in-process — the same workaround used by /api/facilities. Fine at
  // ~592 records. Preserve the requested id order so columns match selection.
  const parsed = await listPublicFacilities();
  const byId = new Map(parsed.map((f) => [f.id, f]));
  const facilities = ids.map((id) => byId.get(id)).filter((f): f is Facility => f != null);
  return { facilities };
};
