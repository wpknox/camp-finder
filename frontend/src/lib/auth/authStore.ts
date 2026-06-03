import { writable, derived } from 'svelte/store'

export interface AuthUser { id: string; username: string; email: string }

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

  return {
    subscribe,
    /** Hydrate from +layout data (called in +layout.svelte). */
    setUser(user: AuthUser | null) { set(user) },
    async login(email: string, password: string) {
      const data = await post('login', { email, password })
      set(data.user ?? null)
    },
    async register(email: string, name: string, password: string, passwordConfirm: string) {
      const data = await post('register', { email, name, password, passwordConfirm })
      set(data.user ?? null)
    },
    async logout() {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      set(null)
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, ($u) => $u != null)
export const currentUser = derived(auth, ($u) => $u)
