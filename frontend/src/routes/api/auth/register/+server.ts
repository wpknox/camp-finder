import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { validateEmail, validatePassword } from "$lib/server/auth/validate";
import { deriveUsername } from "$lib/server/auth/username";
import { tbSignUp, tbLogin } from "$lib/server/auth/tbAuth";
import { setSession } from "$lib/server/auth/session";
import { authLimiter } from "$lib/server/auth/limiters";
import { getUserById } from "$lib/server/auth/users";
import { signToken, VERIFY_TTL_MS } from "$lib/server/auth/tokens";
import { sendEmail, verifyEmail } from "$lib/server/email";

const GENERIC = "Could not create account. Please try again.";

export const POST: RequestHandler = async ({
  request,
  cookies,
  getClientAddress,
  url,
}) => {
  if (!authLimiter.check(getClientAddress()).allowed) {
    return json(
      { error: "Too many attempts, try again in a few minutes." },
      { status: 429 },
    );
  }

  if (!env.INVITE_CODE) {
    console.error(
      "[register] INVITE_CODE is not configured — refusing all registrations",
    );
    return json({ error: "Invalid invite code." }, { status: 403 });
  }

  const { email, name, password, passwordConfirm, inviteCode } =
    (await request.json()) as Record<string, string>;

  if (inviteCode !== env.INVITE_CODE) {
    return json({ error: "Invalid invite code." }, { status: 403 });
  }

  if (!validateEmail(email ?? ""))
    return json({ error: "Enter a valid email address." }, { status: 400 });
  if (!name?.trim())
    return json({ error: "Display name is required." }, { status: 400 });
  const pw = validatePassword(password ?? "");
  if (!pw.ok) return json({ error: pw.error }, { status: 400 });
  if (password !== passwordConfirm)
    return json({ error: "Passwords do not match." }, { status: 400 });

  const username = deriveUsername(email, name);
  const created = await tbSignUp({
    username,
    name: name.trim(),
    email,
    password,
  });
  if (!created.ok) return json({ error: GENERIC }, { status: 400 });

  const auth = await tbLogin(email, password);
  if (!auth) return json({ error: GENERIC }, { status: 400 });

  setSession(
    cookies,
    auth.token,
    auth.refresh_token,
    auth.record.name ?? name.trim(),
  );

  try {
    const record = await getUserById(auth.record.id);
    if (record) {
      const token = await signToken(
        { uid: record.id, purpose: "verify" },
        record.updated,
        VERIFY_TTL_MS,
      );
      await sendEmail({ to: record.email, ...verifyEmail(url.origin, token) });
    }
  } catch (e) {
    console.error("[register] verification email failed:", e);
  }

  return json(
    {
      user: {
        id: auth.record.id,
        username: auth.record.username,
        email: auth.record.email,
        name: auth.record.name ?? name.trim(),
      },
    },
    { status: 201 },
  );
};
