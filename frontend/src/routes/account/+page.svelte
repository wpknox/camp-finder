<script lang="ts">
  import { auth } from "$lib/auth/authStore";
  import { goto } from "$app/navigation";

  let { data } = $props();

  async function signOut() {
    await auth.logout();
    await goto("/");
  }
</script>

<main class="account-page">
  <header>
    <h1>My Account</h1>
    <button class="signout" onclick={signOut}>Sign out</button>
  </header>

  <section class="profile">
    <div><span class="label">Display name</span><span>{data.account.name || "—"}</span></div>
    <div><span class="label">Email</span><span>{data.account.email}</span></div>
  </section>

  <section class="placeholder">
    <h2>Saved campgrounds</h2>
    <p class="muted">Your saved campgrounds will appear here.</p>
  </section>

  <section class="placeholder">
    <h2>My reviews</h2>
    <p class="muted">Reviews you've written will appear here.</p>
  </section>
</main>

<style>
  .account-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; width: 100%; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 1.4rem; margin: 0; }
  .signout { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .profile { margin: 1.25rem 0 2rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .profile > div { display: flex; gap: 1rem; }
  .label { width: 120px; color: #6b7280; font-size: 0.875rem; }
  .placeholder h2 { font-size: 1rem; margin: 1.5rem 0 0.4rem; }
  .muted { color: #9ca3af; font-size: 0.9rem; margin: 0; }
</style>
