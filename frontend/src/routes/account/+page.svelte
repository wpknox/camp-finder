<script lang="ts">
  import { auth } from "$lib/auth/authStore";
  import { goto, invalidateAll } from "$app/navigation";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";

  let { data } = $props();

  type Pending =
    | { kind: "unsave"; id: string; name: string }
    | { kind: "delreview"; facilityId: string; name: string }
    | null;
  let pending: Pending = $state(null);

  async function signOut() { await auth.logout(); await goto("/"); }

  async function confirmAction() {
    const p = pending; pending = null;
    if (!p) return;
    if (p.kind === "unsave") {
      await fetch("/api/saved", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ id: p.id }),
      });
    } else {
      await fetch(`/api/ratings/${p.facilityId}`, { method: "DELETE", credentials: "include" });
    }
    await invalidateAll();
  }
  function stars(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }
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

  <section>
    <h2>Saved campgrounds ({data.saved.length})</h2>
    {#if data.saved.length === 0}
      <p class="muted">You haven't saved any campgrounds yet.</p>
    {:else}
      <ul class="rows">
        {#each data.saved as s}
          <li>
            <span class="name">{s.facility?.name ?? "Unknown campground"}</span>
            <span class="spacer"></span>
            {#if s.facility}<a class="link" href={`/?facility=${s.facility.id}`}>View on map</a>{/if}
            <button class="link danger" onclick={() => (pending = { kind: "unsave", id: s.id, name: s.facility?.name ?? "this campground" })}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>My reviews ({data.reviews.length})</h2>
    {#if data.reviews.length === 0}
      <p class="muted">You haven't written any reviews yet.</p>
    {:else}
      <ul class="rows">
        {#each data.reviews as r}
          <li class="review-row">
            <div class="rev-main">
              <span class="stars">{stars(r.score)}</span>
              <span class="name">{r.facility?.name ?? "Unknown campground"}</span>
              {#if r.notes}<p class="notes">"{r.notes}"</p>{/if}
            </div>
            {#if r.facility}<a class="link" href={`/?facility=${r.facility.id}&reviews=1`}>Edit</a>{/if}
            <button class="link danger" onclick={() => (pending = { kind: "delreview", facilityId: r.facility_id, name: r.facility?.name ?? "this campground" })}>Delete</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

{#if pending}
  <ConfirmDialog
    message={pending.kind === "unsave"
      ? `Remove ${pending.name} from your saved list?`
      : `Delete your review of ${pending.name}? This can't be undone.`}
    confirmLabel={pending.kind === "unsave" ? "Remove" : "Delete"}
    onconfirm={confirmAction}
    oncancel={() => (pending = null)} />
{/if}

<style>
  .account-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; width: 100%; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 1.4rem; margin: 0; }
  h2 { font-size: 1rem; margin: 1.75rem 0 0.5rem; }
  .signout { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .profile { margin: 1.25rem 0 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .profile > div { display: flex; gap: 1rem; }
  .label { width: 120px; color: #6b7280; font-size: 0.875rem; }
  .muted { color: #9ca3af; font-size: 0.9rem; margin: 0; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .rows li { display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid #f3f4f6; padding: 0.5rem 0; font-size: 0.9rem; }
  .review-row { align-items: flex-start; }
  .rev-main { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  .stars { color: #f59e0b; }
  .name { font-weight: 500; }
  .notes { margin: 0; color: #6b7280; font-size: 0.85rem; font-style: italic; }
  .spacer { flex: 1; }
  .link { background: none; border: none; cursor: pointer; font-size: 0.825rem; color: #2563eb; text-decoration: none; padding: 0; }
  .link.danger { color: #dc2626; }
</style>
