<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, currentUser } from "./authStore";

  let open = $state(false);

  // Signed-in indicator: show the display name the user registered with,
  // falling back to the email's local-part. The avatar shows its first
  // letter so it's obvious the user is logged in.
  let displayName = $derived(
    $currentUser?.name?.trim() || ($currentUser?.email?.split("@")[0] ?? ""),
  );
  let initial = $derived(displayName.charAt(0).toUpperCase() || "?");

  async function signOut() {
    open = false;
    await auth.logout();
    await goto("/");
  }
</script>

<div class="account">
  <button class="trigger" onclick={() => (open = !open)} aria-expanded={open}>
    <span class="avatar">{initial}</span>
    <span class="name">{displayName}</span>
    <span class="caret">▾</span>
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="who">{$currentUser?.email}</div>
      <a href="/account" role="menuitem" onclick={() => (open = false)}>My account</a>
      {#if $currentUser?.role === 'admin'}
        <a href="/admin" role="menuitem" onclick={() => (open = false)}>Admin</a>
      {/if}
      <button role="menuitem" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>

<style>
  .account { position: relative; }
  .trigger { display: flex; align-items: center; gap: 0.45rem; background: var(--paper-2); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.3rem 0.6rem 0.3rem 0.35rem; cursor: pointer; font-size: 0.85rem; color: var(--pine); box-shadow: var(--shadow-sm); transition: background 0.15s var(--ease); }
  .trigger:hover { background: var(--paper-deep); }
  .avatar { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--pine); color: #f1e8d2; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 600; flex-shrink: 0; }
  .name { font-weight: 600; color: var(--ink); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .caret { color: var(--ink-faint); font-size: 0.75rem; }
  .menu { position: absolute; right: 0; top: calc(100% + 6px); background: var(--paper-2); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; min-width: 190px; z-index: 3500; overflow: hidden; }
  .who { padding: 0.55rem 0.8rem; font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-soft); border-bottom: 1px solid var(--line); overflow: hidden; text-overflow: ellipsis; }
  .menu a, .menu button { text-align: left; background: none; border: none; padding: 0.6rem 0.8rem; font-size: 0.875rem; cursor: pointer; color: var(--ink); text-decoration: none; transition: background 0.12s var(--ease); }
  .menu a:hover, .menu button:hover { background: var(--paper-deep); }
</style>
