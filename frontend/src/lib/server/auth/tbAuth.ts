import { PUBLIC_TB_URL } from "$env/static/public";

const AUTH = `${PUBLIC_TB_URL}/api/v1/table/users/auth`;

export interface TbAuthResult {
  token: string;
  refresh_token: string;
  record: { id: string; username: string; email: string; name?: string };
}

async function call(
  path: string,
  body: unknown,
  bearer?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(`${AUTH}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function tbSignUp(input: {
  username: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; status: number }> {
  const res = await call("sign-up", {
    ...input,
    passwordConfirm: input.password,
  });
  return { ok: res.ok, status: res.status };
}

export async function tbLogin(
  identity: string,
  password: string,
): Promise<TbAuthResult | null> {
  const res = await call("login-password", { identity, password });
  if (!res.ok) return null;
  return res.json();
}

export async function tbRefresh(
  accessToken: string,
  refreshToken: string,
): Promise<TbAuthResult | null> {
  const res = await call(
    "refresh-token",
    { refresh_token: refreshToken },
    accessToken,
  );
  if (!res.ok) return null;
  return res.json();
}

export async function tbLogout(accessToken: string): Promise<void> {
  try {
    await call("logout", {}, accessToken);
  } catch {
    // best-effort; cookies are cleared regardless
  }
}
