import { writable, derived } from 'svelte/store'
import { submitJson } from '../api'

export interface AuthUser {
  id: string
  username: string
  email: string
  name?: string | null
  role?: string | null
  email_verified?: boolean
  email_enabled?: boolean
}

function createAuthStore() {
  const { subscribe, set } = writable<AuthUser | null>(null)

  async function post(path: string, body: Record<string, string>) {
    const r = await submitJson<{ user?: AuthUser }>(`/api/auth/${path}`, body, { fallbackError: 'Authentication failed' })
    if (!r.ok) throw new Error(r.error)
    return r.data ?? {}
  }

  /** Re-fetch the current user from the server (picks up email_verified/role changes). */
  async function refresh() {
    const res = await fetch('/api/auth/me')
    const data = (await res.json().catch(() => ({}))) as { user?: AuthUser }
    set(data.user ?? null)
    return data.user ?? null
  }

  return {
    subscribe,
    /** Hydrate from +layout data (called in +layout.svelte). */
    setUser(user: AuthUser | null) { set(user) },
    refresh,
    async login(email: string, password: string) {
      const data = await post('login', { email, password })
      set(data.user ?? null)
      // login/register responses omit email_verified/role — pull the full record.
      if (data.user) await refresh()
    },
    async register(email: string, name: string, password: string, passwordConfirm: string, inviteCode: string) {
      const data = await post('register', { email, name, password, passwordConfirm, inviteCode })
      set(data.user ?? null)
      if (data.user) await refresh()
    },
    async logout() {
      await submitJson('/api/auth/logout')
      set(null)
    },
    async requestReset(email: string) {
      await post('request-reset', { email })
    },
    async requestVerify(): Promise<{ ok: boolean; error?: string }> {
      const r = await submitJson<{ ok?: boolean }>('/api/auth/request-verify', undefined, {
        fallbackError: 'Could not send email. Try again later.',
      })
      if (!r.ok || !r.data?.ok) return { ok: false, error: r.error }
      return { ok: true }
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, ($u) => $u != null)
export const currentUser = derived(auth, ($u) => $u)
