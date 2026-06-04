import type { Handle } from "@sveltejs/kit";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  NAME_COOKIE,
  setSession,
  clearSession,
} from "$lib/server/auth/session";
import { decodeJwtPayload, isExpired } from "$lib/server/auth/jwt";
import { tbRefresh } from "$lib/server/auth/tbAuth";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;

  const access = event.cookies.get(ACCESS_COOKIE);
  const refresh = event.cookies.get(REFRESH_COOKIE);

  if (access) {
    const payload = decodeJwtPayload(access);

    if (payload && !isExpired(payload)) {
      event.locals.user = {
        id: payload.id,
        username: payload.user,
        email: payload.sub,
        name: event.cookies.get(NAME_COOKIE) ?? null,
      };
    } else if (refresh) {
      // Access token expired (or unreadable) — try silent refresh.
      const refreshed = await tbRefresh(access, refresh);
      if (refreshed) {
        setSession(
          event.cookies,
          refreshed.token,
          refreshed.refresh_token,
          refreshed.record.name,
        );
        event.locals.user = {
          id: refreshed.record.id,
          username: refreshed.record.username,
          email: refreshed.record.email,
          name: refreshed.record.name ?? event.cookies.get(NAME_COOKIE) ?? null,
        };
      } else {
        clearSession(event.cookies);
      }
    }
  }

  return resolve(event);
};
