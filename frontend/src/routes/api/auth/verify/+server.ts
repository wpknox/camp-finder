import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { decodeToken, verifyToken } from '$lib/server/auth/tokens'
import { getUserById, updateUser } from '$lib/server/auth/users'

export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token') ?? ''
  const decoded = decodeToken(token)
  const user = decoded ? await getUserById(decoded.uid) : null

  if (user && (user.email_verified === true || user.email_verified === 1)) {
    throw redirect(303, '/?verified=1') // idempotent re-click
  }

  const payload = user ? await verifyToken(token, 'verify', user.updated) : null
  if (!user || !payload) throw redirect(303, '/?verified=0')

  const ok = await updateUser(user.id, { email_verified: true })
  throw redirect(303, ok ? '/?verified=1' : '/?verified=0')
}
