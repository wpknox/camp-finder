import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { tbLogin } from '$lib/server/auth/tbAuth'
import { setSession } from '$lib/server/auth/session'
import { authLimiter } from '$lib/server/auth/limiters'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  if (!authLimiter.check(getClientAddress()).allowed) {
    return json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 })
  }

  const { email, password } = (await request.json()) as Record<string, string>
  const auth = await tbLogin(email ?? '', password ?? '')
  if (!auth) return json({ error: 'Invalid email or password.' }, { status: 401 })

  setSession(cookies, auth.token, auth.refresh_token)
  return json({ user: { id: auth.record.id, username: auth.record.username, email: auth.record.email } })
}
