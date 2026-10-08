import { tbFetch } from "../tbFetch";
import { tbHeaders, tbView } from "../tb";

export interface TbUserRecord {
  id: string;
  email: string;
  name?: string;
  updated: string;
  email_verified: boolean | number;
}

/** Caller MUST have rejected emails containing `"` (WHERE interpolation). */
export async function findUserByEmail(email: string): Promise<TbUserRecord | null> {
  const res = await tbFetch(`/api/v1/table/users/list`, {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({ where: `email == "${email}"`, limit: 1 }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: TbUserRecord[] };
  return data.items?.[0] ?? null;
}

export async function getUserById(id: string): Promise<TbUserRecord | null> {
  return tbView<TbUserRecord>("users", id);
}

export async function updateUser(
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await tbFetch(`/api/v1/table/users/edit/${id}`, {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify(patch),
  });
  return res.ok;
}
