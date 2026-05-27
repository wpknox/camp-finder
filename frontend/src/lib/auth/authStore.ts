// frontend/src/lib/auth/authStore.ts
import { writable, derived } from 'svelte/store'
import { browser } from '$app/environment'
import { PUBLIC_TB_URL } from '$env/static/public'

interface AuthModel { id: string; email: string; name?: string }
interface AuthState { model: AuthModel | null; token: string | null }

function loadStored(): AuthState {
  if (!browser) return { model: null, token: null }
  try {
    const raw = localStorage.getItem('cf_auth')
    return raw ? JSON.parse(raw) : { model: null, token: null }
  } catch { return { model: null, token: null } }
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(loadStored())

  function persist(state: AuthState) {
    if (browser) localStorage.setItem('cf_auth', JSON.stringify(state))
    set(state)
  }

  async function authRequest(path: string, body: Record<string, string>) {
    const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json() as { message?: string }
      throw new Error(err.message ?? 'Authentication failed')
    }
    return res.json() as Promise<{ token: string; record: AuthModel }>
  }

  return {
    subscribe,
    async login(email: string, password: string) {
      const data = await authRequest('login-password', { identity: email, password })
      persist({ model: data.record, token: data.token })
    },
    async register(email: string, password: string) {
      await authRequest('sign-up', { email, password, passwordConfirm: password })
      const data = await authRequest('login-password', { identity: email, password })
      persist({ model: data.record, token: data.token })
    },
    logout() {
      if (browser) localStorage.removeItem('cf_auth')
      set({ model: null, token: null })
    },
    getToken(): string | null {
      let t: string | null = null
      update(s => { t = s.token; return s })
      return t
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, $auth => $auth.model != null)
export const currentUser = derived(auth, $auth => $auth.model)
