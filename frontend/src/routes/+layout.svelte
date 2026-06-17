<script lang="ts">
  import "../app.css";
  import { auth, isLoggedIn } from "$lib/auth/authStore";
  import AccountMenu from "$lib/auth/AccountMenu.svelte";
  import AuthModal from "$lib/auth/AuthModal.svelte";

  let { children, data } = $props();
  let showAuth = $state(false);

  // Hydrate the client auth store from server layout data on every load.
  $effect(() => {
    auth.setUser(data.user);
  });
</script>

<nav class="topnav">
  <a class="brand" href="/">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path
          d="M12 3.5 21 20H3z"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          d="M12 8.5 16.5 17H7.5z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </span>
    <span class="brand-text">
      <span class="brand-name">CampFinder</span>
      <span class="brand-sub mono">CO · first-come field guide</span>
    </span>
  </a>
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
  .topnav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    border-bottom: 1px solid var(--line-strong);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--paper-2) 92%, transparent),
        color-mix(in srgb, var(--paper) 96%, transparent)
      );
    box-shadow: var(--shadow-sm);
    height: 56px;
    box-sizing: border-box;
    position: relative;
    /* Sits above the map (Leaflet panes/controls reach ~1000) so the account
       dropdown — trapped inside this stacking context — is clickable, but
       below the detail panel (2000) and modal overlays (3500/4000). */
    z-index: 1200;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    text-decoration: none;
    color: var(--pine);
  }
  .brand-mark {
    display: grid;
    place-content: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--pine);
    color: #f1e8d2;
    box-shadow: var(--shadow-sm);
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }
  .brand-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.22rem;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .brand-sub {
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
    margin-top: 2px;
  }
  .signin {
    background: var(--pine);
    color: #f1e8d2;
    border: 1px solid var(--pine-deep);
    border-radius: var(--radius);
    padding: 0.42rem 1rem;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
    transition:
      background 0.15s var(--ease),
      transform 0.08s var(--ease);
  }
  .signin:hover {
    background: var(--pine-deep);
  }
  .signin:active {
    transform: translateY(1px);
  }
  /* App shell now sits below the 56px nav. */
  .app-shell {
    display: flex;
    height: calc(100dvh - 56px);
    overflow: hidden;
  }
  @media (max-width: 640px) {
    .topnav {
      padding: 0 0.75rem;
      height: 52px;
    }
    .app-shell {
      height: calc(100dvh - 52px);
    }
    .brand-name {
      font-size: 1.08rem;
    }
    .brand-sub {
      display: none;
    }
    /* Stack the sidebar above the map instead of side-by-side, so a
       full-width sidebar no longer squeezes the map to zero. */
    .app-shell {
      flex-direction: column;
    }
  }
</style>
