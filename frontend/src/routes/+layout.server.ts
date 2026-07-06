import { getRoleForDisplay } from "$lib/server/auth/admin";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) return { user: null };

  const role = await getRoleForDisplay(locals);
  return { user: { ...locals.user, role } };
};
