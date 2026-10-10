import type { PageServerLoad } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";

export const load: PageServerLoad = async ({ locals, fetch }) => {
  await requireAdmin(locals);
  const [editsRes, mergesRes, deletionsRes, campgroundsRes] = await Promise.all([
    fetch("/api/admin/suggestions"),
    fetch("/api/admin/merges"),
    fetch("/api/admin/deletions"),
    fetch("/api/admin/campground-suggestions"),
  ]);

  const edits = editsRes.ok ? await editsRes.json() : [];
  const merges = mergesRes.ok ? await mergesRes.json() : [];
  const campgrounds = campgroundsRes.ok ? await campgroundsRes.json() : [];
  const deletions = deletionsRes.ok ? await deletionsRes.json() : [];

  return { edits, merges, deletions, campgrounds };
};
