import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { emailLimiter } from '$lib/server/auth/limiters'
import { getUserById } from '$lib/server/auth/users'
import { signToken, VERIFY_TTL_MS } from '$lib/server/auth/tokens'
import { sendEmail, verifyEmail } from '$lib/server/email'

export const POST: RequestHandler = async ({ locals, url, getClientAddress }) => {
  if (!locals.user) return json({ error: 'Sign in first.' }, { status: 401 })
  if (!emailLimiter.check(getClientAddress()).allowed) {
    return json({ error: 'Too many requests, try again later.' }, { status: 429 })
  }
  const user = await getUserById(locals.user.id)
  if (!user) return json({ error: 'Account not found.' }, { status: 404 })
  if (user.email_verified === true || user.email_verified === 1) return json({ ok: true, already: true })

  const token = await signToken({ uid: user.id, purpose: 'verify' }, user.updated, VERIFY_TTL_MS)
  const sent = await sendEmail({ to: user.email, ...verifyEmail(url.origin, token) })
  return sent ? json({ ok: true }) : json({ error: 'Could not send email. Try again later.' }, { status: 500 })
}
