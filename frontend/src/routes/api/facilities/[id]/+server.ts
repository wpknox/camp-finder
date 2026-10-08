import { json, error } from '@sveltejs/kit'
import { getPublicFacility, isSafeId } from '$lib/server/facilities'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  if (!isSafeId(params.id)) throw error(404, 'Not found')
  const f = await getPublicFacility(params.id)
  if (!f) throw error(404, 'Not found')
  return json(f)
}
