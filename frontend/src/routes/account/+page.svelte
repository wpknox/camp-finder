<script lang="ts">
  import { auth, currentUser } from "$lib/auth/authStore";
  import { goto, invalidateAll } from "$app/navigation";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";

  let { data } = $props();

  type Pending =
    | { kind: "unsave"; id: string; name: string }
    | { kind: "delreview"; facilityId: string; name: string }
    | null;
  let pending: Pending = $state(null);

  let verifyState: "idle" | "sending" | "sent" | "error" = $state("idle");
  let verifyError = $state("");

  async function resendVerification() {
    verifyState = "sending";
    const result = await auth.requestVerify();
    if (result.ok) {
      verifyState = "sent";
    } else {
      verifyState = "error";
      verifyError = result.error ?? "Could not send email. Try again later.";
    }
  }

  async function signOut() {
    await auth.logout();
    await goto("/");
  }

  async function confirmAction() {
    const p = pending;
    pending = null;
    if (!p) return;
    if (p.kind === "unsave") {
      await fetch("/api/saved", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: p.id }),
      });
    } else {
      await fetch(`/api/ratings/${p.facilityId}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
    await invalidateAll();
  }
  function stars(n: number) {
    return "★".repeat(n) + "☆".repeat(5 - n);
  }
</script>

<main class="account-page">
  <header>
    <h1>My Account</h1>
    <button class="signout" onclick={signOut}>Sign out</button>
  </header>

  <section class="profile">
    <div>
      <span class="label">Display name</span><span
        >{data.account.name || "—"}</span
      >
    </div>
    <div><span class="label">Email</span><span>{data.account.email}</span></div>
    <div>
      <span class="label">Status</span>
      {#if $currentUser?.email_verified}
        <span class="verified">Email verified ✓</span>
      {:else if verifyState === "sent"}
        <span class="verify-msg">Sent — check your inbox.</span>
      {:else if verifyState === "error"}
        <span class="verify-msg error">{verifyError}</span>
      {:else}
        <button
          class="link resend"
          onclick={resendVerification}
          disabled={verifyState === "sending"}
        >
          {verifyState === "sending" ? "Sending…" : "Resend verification email"}
        </button>
      {/if}
    </div>
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
            {#if s.facility}<a class="link" href={`/?facility=${s.facility.id}`}
                >View on map</a
              >{/if}
            <button
              class="link danger"
              onclick={() =>
                (pending = {
                  kind: "unsave",
                  id: s.id,
                  name: s.facility?.name ?? "this campground",
                })}>Remove</button
            >
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
              <span class="name"
                >{r.facility?.name ?? "Unknown campground"}</span
              >
              {#if r.notes}<p class="notes">"{r.notes}"</p>{/if}
            </div>
            {#if r.facility}<a
                class="link"
                href={`/?facility=${r.facility.id}&reviews=1`}>Edit</a
              >{/if}
            <button
              class="link danger"
              onclick={() =>
                (pending = {
                  kind: "delreview",
                  facilityId: r.facility_id,
                  name: r.facility?.name ?? "this campground",
                })}>Delete</button
            >
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
    oncancel={() => (pending = null)}
  />
{/if}

<style>
  .account-page {
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3.5rem;
    width: 100%;
    overflow-y: auto;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--line);
  }
  h1 {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 600;
    margin: 0;
  }
  h2 {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
  }
  .signout {
    background: var(--paper-deep);
    color: var(--ink);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: background 0.13s var(--ease);
  }
  .signout:hover {
    background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong));
  }
  /* Profile reads as a stamped record card. */
  .profile {
    margin: 1.5rem 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-left: 3px solid var(--pine);
    border-radius: var(--radius);
    padding: 1rem 1.1rem;
  }
  .profile > div {
    display: flex;
    gap: 1rem;
    align-items: baseline;
  }
  .label {
    width: 130px;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .profile > div > span:last-child {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--ink);
  }
  section {
    margin-top: 2rem;
  }
  .muted {
    color: var(--ink-faint);
    font-size: 0.9rem;
    font-style: italic;
    margin: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rows li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.7rem 0.85rem;
    font-size: 0.9rem;
    transition: border-color 0.13s var(--ease), box-shadow 0.13s var(--ease);
  }
  .rows li:hover {
    border-color: var(--line-strong);
    box-shadow: var(--shadow-sm);
  }
  .review-row {
    align-items: flex-start;
  }
  .rev-main {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
  }
  .stars {
    font-family: var(--font-mono);
    color: #a8731a;
    letter-spacing: 0.05em;
  }
  .name {
    font-weight: 600;
    color: var(--ink);
  }
  .notes {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.85rem;
    font-style: italic;
  }
  .spacer {
    flex: 1;
  }
  .link {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--pine);
    text-decoration: none;
    padding: 0;
    transition: color 0.13s var(--ease);
  }
  .link:hover {
    color: var(--pine-deep);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link.danger {
    color: var(--rust);
  }
  .link.danger:hover {
    color: #832e12;
  }
  .verified {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--moss);
    font-weight: 600;
  }
  .verify-msg {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .verify-msg.error {
    color: var(--rust);
  }
  .link.resend {
    font-size: 0.85rem;
  }
</style>
