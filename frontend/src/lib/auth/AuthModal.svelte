<script lang="ts">
  import { auth } from "./authStore";

  let { onclose }: { onclose?: () => void } = $props();

  let mode: "login" | "register" = $state("login");
  let email = $state("");
  let password = $state("");
  let error = $state("");

  async function submit() {
    error = "";
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(email, password);
      onclose?.();
    } catch (e: any) {
      error = e?.message ?? "Authentication failed";
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose?.();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose?.();
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
    <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

    <input type="email" bind:value={email} placeholder="Email" />
    <input type="password" bind:value={password} placeholder="Password" />

    {#if error}<p class="error">{error}</p>{/if}

    <button onclick={submit}
      >{mode === "login" ? "Sign in" : "Create account"}</button
    >

    <button
      class="toggle"
      onclick={() => (mode = mode === "login" ? "register" : "login")}
    >
      {mode === "login"
        ? "Need an account? Register"
        : "Already have an account? Sign in"}
    </button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 3000;
    display: grid;
    place-items: center;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    width: min(380px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  input {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0.6rem 0.85rem;
    font-size: 0.95rem;
  }
  button {
    background: #16a34a;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.65rem;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .toggle {
    background: none;
    color: #6b7280;
    font-weight: 400;
    font-size: 0.875rem;
    padding: 0;
  }
  .error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
  }
</style>
