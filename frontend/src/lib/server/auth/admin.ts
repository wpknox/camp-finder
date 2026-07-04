import { error } from "@sveltejs/kit";
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";

export interface AdminUser {
  id: string;
  email: string;
  role: string | null;
}

/**
 * Fetch a user record with the service token. The users table is the ONLY
 * trusted source for `role` — the JWT and cookies never carry it. Returns
 * null on network failure or a non-ok response.
 */
async function fetchUserRecord(userId: string): Promise<AdminUser | null> {
  try {
    const res = await fetch(
      `${PUBLIC_TB_URL}/api/v1/table/users/view/${userId}`,
      { headers: { Authorization: `Bearer ${TB_SERVICE_TOKEN}` } },
    );
    if (!res.ok) return null;
    return (await res.json()) as AdminUser;
  } catch {
    return null;
  }
}

/**
 * Server-side admin gate. Verifies role against the users table with the
 * service token on EVERY call — the JWT and cookies never carry the role,
 * so there is nothing client-forgeable in this path.
 */
export async function requireAdmin(locals: App.Locals): Promise<AdminUser> {
  if (!locals.user) throw error(401, "Unauthenticated");

  const record = await fetchUserRecord(locals.user.id);
  // Deliberate: not-found, backend-unreachable, and not-admin all collapse to 403 to avoid leaking distinctions to callers.
  if (record?.role !== "admin") throw error(403, "Forbidden");

  return record;
}

/**
 * Display-only role lookup — never throws. Used to surface an "Admin" link
 * in the UI; the actual gate for any admin action is requireAdmin() above.
 */
export async function getRoleForDisplay(
  locals: App.Locals,
): Promise<string | null> {
  if (!locals.user) return null;
  const record = await fetchUserRecord(locals.user.id);
  return record?.role ?? null;
}
