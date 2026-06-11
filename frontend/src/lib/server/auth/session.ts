import { dev } from "$app/environment";
import type { Cookies } from "@sveltejs/kit";

export const ACCESS_COOKIE = "cf_access";
export const REFRESH_COOKIE = "cf_refresh";
// Display name for the signed-in indicator. The JWT doesn't carry it, so we
// stash it here to avoid a user lookup on every request. Not sensitive.
export const NAME_COOKIE = "cf_name";

// 30-day COOKIE lifetime so the (stale) access token is still sent to
// /refresh-token after the JWT's 1-hour exp. Token validity is judged by the
// JWT exp claim, not the cookie lifetime.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function opts() {
  return {
    httpOnly: true,
    secure: !dev,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function setSession(
  cookies: Cookies,
  accessToken: string,
  refreshToken: string,
  name?: string,
): void {
  cookies.set(ACCESS_COOKIE, accessToken, opts());
  cookies.set(REFRESH_COOKIE, refreshToken, opts());
  if (name) cookies.set(NAME_COOKIE, name, opts());
}

export function clearSession(cookies: Cookies): void {
  cookies.delete(ACCESS_COOKIE, { path: "/" });
  cookies.delete(REFRESH_COOKIE, { path: "/" });
  cookies.delete(NAME_COOKIE, { path: "/" });
}
