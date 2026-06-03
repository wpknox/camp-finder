import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { ACCESS_COOKIE } from '$lib/server/auth/session'

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) throw redirect(303, '/')

  // The display name isn't in the JWT; fetch the user's own record.
  let name = ''
  const token = cookies.get(ACCESS_COOKIE)
  if (token) {
    const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/view/${locals.user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const rec = (await res.json()) as { name?: string }
      name = rec.name ?? ''
    }
  }

  return { account: { ...locals.user, name } }
}
