<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, currentUser } from "./authStore";

  let open = $state(false);

  async function signOut() {
    open = false;
    await auth.logout();
    await goto("/");
  }
</script>

<div class="account">
  <button class="trigger" onclick={() => (open = !open)} aria-expanded={open}>
    Account ▾
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="who">{$currentUser?.email}</div>
      <a href="/account" role="menuitem" onclick={() => (open = false)}>My account</a>
      <button role="menuitem" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>

<style>
  .account { position: relative; }
  .trigger { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.35rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); display: flex; flex-direction: column; min-width: 180px; z-index: 3500; overflow: hidden; }
  .who { padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #6b7280; border-bottom: 1px solid #f3f4f6; overflow: hidden; text-overflow: ellipsis; }
  .menu a, .menu button { text-align: left; background: none; border: none; padding: 0.55rem 0.75rem; font-size: 0.875rem; cursor: pointer; color: #111827; text-decoration: none; }
  .menu a:hover, .menu button:hover { background: #f9fafb; }
</style>
