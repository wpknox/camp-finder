import { json } from '@sveltejs/kit'
import { getRoleForDisplay } from '$lib/server/auth/admin'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ user: null })

  const role = await getRoleForDisplay(locals)
  return json({ user: { ...locals.user, role } })
}
