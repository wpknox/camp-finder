import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { validateEmail } from "$lib/server/auth/validate";
import { findUserByEmail } from "$lib/server/auth/users";
import { signToken, RESET_TTL_MS } from "$lib/server/auth/tokens";

/**
 * POST /api/admin/reset-link → generate a password-reset link for a given
 * user's email, for an admin to hand off directly instead of reading it out
 * of Pages logs. Gated by requireAdmin — the link is a live credential and
 * must never reach anyone but an authenticated admin.
 */
export const POST: RequestHandler = async ({ locals, request, url }) => {
  await requireAdmin(locals);

  const { email } = (await request.json()) as Record<string, string>;
  if (!validateEmail(email ?? "") || email.includes('"')) {
    return json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return json({ error: "No account found with that email." }, { status: 404 });
  }

  const token = await signToken({ uid: user.id, purpose: "reset" }, user.updated, RESET_TTL_MS);
  return json({ link: `${url.origin}/reset?token=${token}` });
};
