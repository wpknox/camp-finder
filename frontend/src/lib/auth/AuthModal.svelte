<script lang="ts">
  import { auth } from './authStore'

  let { onclose }: { onclose?: () => void } = $props()

  let mode: 'login' | 'register' = $state('login')
  let email = $state('')
  let password = $state('')
  let error = $state('')

  async function submit() {
    error = ''
    try {
      if (mode === 'login') await auth.login(email, password)
      else await auth.register(email, password)
      onclose?.()
    } catch (e: any) {
      error = e?.message ?? 'Authentication failed'
    }
  }
</script>

<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onclose?.() }}>
  <div class="modal">
    <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

    <input type="email"    bind:value={email}    placeholder="Email" />
    <input type="password" bind:value={password} placeholder="Password" />

    {#if error}<p class="error">{error}</p>{/if}

    <button onclick={submit}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>

    <button class="toggle" onclick={() => mode = mode === 'login' ? 'register' : 'login'}>
      {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
    </button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 3000; display: grid; place-items: center; }
  .modal { background: white; border-radius: 12px; padding: 2rem; width: min(380px, 90vw); display: flex; flex-direction: column; gap: .75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  input { border: 1px solid #d1d5db; border-radius: 8px; padding: .6rem .85rem; font-size: .95rem; }
  button { background: #16a34a; color: white; border: none; border-radius: 8px; padding: .65rem; cursor: pointer; font-size: .95rem; font-weight: 600; }
  .toggle { background: none; color: #6b7280; font-weight: 400; font-size: .875rem; padding: 0; }
  .error { color: #dc2626; font-size: .85rem; margin: 0; }
</style>
