import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { getRoleForDisplay } from '$lib/server/auth/admin'
import { getUserById } from '$lib/server/auth/users'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ user: null })

  const [role, record] = await Promise.all([
    getRoleForDisplay(locals),
    getUserById(locals.user.id).catch(() => null),
  ])
  const email_verified = record?.email_verified === true || record?.email_verified === 1
  // Mirrors the sendEmail() console-fallback condition in $lib/server/email.ts.
  const email_enabled = !!env.RESEND_API_KEY
  return json({ user: { ...locals.user, role, email_verified, email_enabled } })
}
