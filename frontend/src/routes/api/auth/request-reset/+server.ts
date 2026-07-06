import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { validateEmail } from "$lib/server/auth/validate";
import { emailLimiter } from "$lib/server/auth/limiters";
import { findUserByEmail } from "$lib/server/auth/users";
import { signToken, RESET_TTL_MS } from "$lib/server/auth/tokens";
import { sendEmail, resetEmail } from "$lib/server/email";

// Identical response whether or not the account exists — no enumeration.
const OK = { ok: true };

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  if (!emailLimiter.check(getClientAddress()).allowed) {
    return json({ error: "Too many requests, try again later." }, { status: 429 });
  }

  const { email } = (await request.json()) as Record<string, string>;
  if (!validateEmail(email ?? "") || email.includes('"')) {
    return json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (user) {
    const token = await signToken({ uid: user.id, purpose: "reset" }, user.updated, RESET_TTL_MS);
    await sendEmail({ to: user.email, ...resetEmail(url.origin, token) }); // best-effort
  }
  return json(OK);
};
