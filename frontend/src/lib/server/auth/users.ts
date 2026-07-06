import { TB_SERVICE_TOKEN } from "$env/static/private";
import { tbFetch } from "../tbFetch";

export interface TbUserRecord {
  id: string;
  email: string;
  name?: string;
  updated: string;
  email_verified: boolean | number;
}

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

/** Caller MUST have rejected emails containing `"` (WHERE interpolation). */
export async function findUserByEmail(email: string): Promise<TbUserRecord | null> {
  const res = await tbFetch(`/api/v1/table/users/list`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ where: `email == "${email}"`, limit: 1 }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: TbUserRecord[] };
  return data.items?.[0] ?? null;
}

export async function getUserById(id: string): Promise<TbUserRecord | null> {
  const res = await tbFetch(`/api/v1/table/users/view/${id}`, { headers: HEADERS });
  return res.ok ? ((await res.json()) as TbUserRecord) : null;
}

export async function updateUser(
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await tbFetch(`/api/v1/table/users/edit/${id}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(patch),
  });
  return res.ok;
}
