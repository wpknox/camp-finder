import { TB_SERVICE_TOKEN } from "$env/static/private";
import { tbFetch } from "../tbFetch";

// Service-token access for admin moderation routes: the suggestion tables have
// all Teenybase rules set to 'false', and facility writes are admin-approved
// patches, so nothing here can use a user token.
export const tbHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

export const tb = (path: string) => `/api/v1/table/${path}`;

export async function tbList<T>(
  table: string,
  body: Record<string, unknown>,
): Promise<T[]> {
  const res = await tbFetch(tb(`${table}/list`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { items?: T[] };
  return data.items ?? [];
}
