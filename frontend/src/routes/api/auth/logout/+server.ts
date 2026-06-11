import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { ACCESS_COOKIE, clearSession } from '$lib/server/auth/session'
import { tbLogout } from '$lib/server/auth/tbAuth'

export const POST: RequestHandler = async ({ cookies }) => {
  const access = cookies.get(ACCESS_COOKIE)
  if (access) await tbLogout(access)
  clearSession(cookies)
  return json({ ok: true })
}
