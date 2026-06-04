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
      <button role="menuitem" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>

<style>
  .account { position: relative; }
  .trigger { display: flex; align-items: center; gap: 0.4rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.3rem 0.55rem 0.3rem 0.35rem; cursor: pointer; font-size: 0.85rem; color: #166534; }
  .avatar { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #16a34a; color: white; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
  .name { font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .caret { color: #6b7280; font-size: 0.75rem; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); display: flex; flex-direction: column; min-width: 180px; z-index: 3500; overflow: hidden; }
  .who { padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #6b7280; border-bottom: 1px solid #f3f4f6; overflow: hidden; text-overflow: ellipsis; }
  .menu a, .menu button { text-align: left; background: none; border: none; padding: 0.55rem 0.75rem; font-size: 0.875rem; cursor: pointer; color: #111827; text-decoration: none; }
  .menu a:hover, .menu button:hover { background: #f9fafb; }
</style>
