import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { validatePassword } from "$lib/server/auth/validate";
import { decodeToken, verifyToken } from "$lib/server/auth/tokens";
import { getUserById, updateUser } from "$lib/server/auth/users";

const BAD_TOKEN = "This link is invalid or has expired. Request a new one.";

export const POST: RequestHandler = async ({ request }) => {
  const { token, password, passwordConfirm } = (await request.json()) as Record<string, string>;

  const pw = validatePassword(password ?? "");
  if (!pw.ok) return json({ error: pw.error }, { status: 400 });
  if (password !== passwordConfirm) {
    return json({ error: "Passwords do not match." }, { status: 400 });
  }

  const decoded = token ? decodeToken(token) : null;
  const user = decoded ? await getUserById(decoded.uid) : null;
  // verify against the CURRENT updated stamp — a consumed token fails here
  // because the password edit below bumps `updated`.
  const payload = user ? await verifyToken(token, "reset", user.updated) : null;
  if (!user || !payload) return json({ error: BAD_TOKEN }, { status: 400 });

  const ok = await updateUser(user.id, { password, passwordConfirm: password });
  if (!ok) return json({ error: "Could not update password. Try again." }, { status: 500 });
  return json({ ok: true });
};
