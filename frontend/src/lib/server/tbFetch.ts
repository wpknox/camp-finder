import { env } from "$env/dynamic/private";
import { PUBLIC_TB_URL } from "$env/static/public";

// Prefer the private TB_URL (prod); fall back to the legacy public var (dev).
const base = () => env.TB_URL || PUBLIC_TB_URL;

/** Path is everything after the host, e.g. "/api/v1/table/facilities/list". */
export function tbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (env.TB_SHARED_SECRET) {
    headers.set("X-TB-Key", env.TB_SHARED_SECRET);
  }
  if (env.TB_ACCESS_CLIENT_ID && env.TB_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.TB_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.TB_ACCESS_CLIENT_SECRET);
  }
  return fetch(`${base()}${path}`, { ...init, headers });
}
