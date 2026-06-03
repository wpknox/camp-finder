import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { validateEmail, validatePassword } from '$lib/server/auth/validate'
import { deriveUsername } from '$lib/server/auth/username'
import { tbSignUp, tbLogin } from '$lib/server/auth/tbAuth'
import { setSession } from '$lib/server/auth/session'
import { authLimiter } from '$lib/server/auth/limiters'

const GENERIC = 'Could not create account. Please try again.'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  if (!authLimiter.check(getClientAddress()).allowed) {
    return json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 })
  }

  const { email, name, password, passwordConfirm } = (await request.json()) as Record<string, string>

  if (!validateEmail(email ?? '')) return json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!name?.trim()) return json({ error: 'Display name is required.' }, { status: 400 })
  const pw = validatePassword(password ?? '')
  if (!pw.ok) return json({ error: pw.error }, { status: 400 })
  if (password !== passwordConfirm) return json({ error: 'Passwords do not match.' }, { status: 400 })

  const username = deriveUsername(email, name)
  const created = await tbSignUp({ username, name: name.trim(), email, password })
  if (!created.ok) return json({ error: GENERIC }, { status: 400 })

  const auth = await tbLogin(email, password)
  if (!auth) return json({ error: GENERIC }, { status: 400 })

  setSession(cookies, auth.token, auth.refresh_token)
  return json({ user: { id: auth.record.id, username: auth.record.username, email: auth.record.email } }, { status: 201 })
}
