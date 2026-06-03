<script lang="ts">
  import '../app.css'
  import { auth, isLoggedIn } from '$lib/auth/authStore'
  import AccountMenu from '$lib/auth/AccountMenu.svelte'
  import AuthModal from '$lib/auth/AuthModal.svelte'

  let { children, data } = $props()
  let showAuth = $state(false)

  // Hydrate the client auth store from server layout data on every load.
  $effect(() => { auth.setUser(data.user) })
</script>

<nav class="topnav">
  <a class="brand" href="/">🏕 CampFinder</a>
  {#if $isLoggedIn}
    <AccountMenu />
  {:else}
    <button class="signin" onclick={() => (showAuth = true)}>Sign in</button>
  {/if}
</nav>

<div class="app-shell">
  {@render children()}
</div>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} />
{/if}

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .topnav { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; border-bottom: 1px solid #e5e7eb; background: white; height: 48px; box-sizing: border-box; }
  .brand { font-weight: 700; font-size: 1rem; color: #166534; text-decoration: none; }
  .signin { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.35rem 0.9rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
  /* App shell now sits below the 48px nav. */
  .app-shell { display: flex; height: calc(100dvh - 48px); overflow: hidden; }
  @media (max-width: 640px) {
    .topnav { padding: 0.5rem 0.75rem; }
    .brand { font-size: 0.9rem; }
  }
</style>
