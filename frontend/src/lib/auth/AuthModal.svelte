<script lang="ts">
  import { auth } from "./authStore";

  let { onclose, onsuccess }: { onclose?: () => void; onsuccess?: () => void } = $props();

  let mode: "login" | "register" = $state("login");
  let email = $state("");
  let name = $state("");
  let password = $state("");
  let passwordConfirm = $state("");
  let error = $state("");
  let submitting = $state(false);

  async function submit() {
    error = "";
    if (mode === "register") {
      if (!name.trim()) { error = "Display name is required."; return; }
      if (password.length < 8) { error = "Password must be at least 8 characters."; return; }
      if (password !== passwordConfirm) { error = "Passwords do not match."; return; }
    }
    submitting = true;
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(email, name, password, passwordConfirm);
      onsuccess?.();
      onclose?.();
    } catch (e: any) {
      error = e?.message ?? "Authentication failed";
    } finally {
      submitting = false;
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
    <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

    <input type="email" bind:value={email} placeholder="Email" autocomplete="email" />
    {#if mode === "register"}
      <input type="text" bind:value={name} placeholder="Display name" autocomplete="name" />
    {/if}
    <input type="password" bind:value={password} placeholder="Password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
    {#if mode === "register"}
      <input type="password" bind:value={passwordConfirm} placeholder="Confirm password" autocomplete="new-password" />
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <button class="primary" onclick={submit} disabled={submitting}>
      {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
    </button>

    <button class="toggle" onclick={() => { mode = mode === "login" ? "register" : "login"; error = ""; }}>
      {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
    </button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 3000; display: grid; place-items: center; padding: 1rem; }
  .modal { background: white; border-radius: 12px; padding: 2rem; width: min(380px, 100%); display: flex; flex-direction: column; gap: 0.75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  input { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.6rem 0.85rem; font-size: 0.95rem; }
  .primary { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.65rem; cursor: pointer; font-size: 0.95rem; font-weight: 600; }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .toggle { background: none; border: none; color: #6b7280; font-weight: 400; font-size: 0.875rem; padding: 0; cursor: pointer; }
  .error { color: #dc2626; font-size: 0.85rem; margin: 0; }
</style>
