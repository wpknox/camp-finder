import { writable, derived } from 'svelte/store'

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
    const res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Authentication failed')
    return data
  }

  /** Re-fetch the current user from the server (picks up email_verified/role changes). */
  async function refresh() {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
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
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      set(null)
    },
    async requestReset(email: string) {
      await post('request-reset', { email })
    },
    async requestVerify(): Promise<{ ok: boolean; error?: string }> {
      const res = await fetch('/api/auth/request-verify', { method: 'POST', credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error ?? 'Could not send email. Try again later.' }
      }
      return { ok: true }
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, ($u) => $u != null)
export const currentUser = derived(auth, ($u) => $u)
