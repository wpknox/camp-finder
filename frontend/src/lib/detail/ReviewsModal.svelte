<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn, currentUser } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
  import { portal } from "$lib/ui/portal";
  import type { Rating } from "$lib/types";

  let {
    facilityId,
    facilityName,
    onclose,
  }: { facilityId: string; facilityName: string; onclose: () => void } = $props();

  let reviews: Rating[] = $state([]);
  let showAuth = $state(false);
  let showWriteForm = $state(false);
  let confirmingDelete = $state(false);

  let score = $state(0);
  let notes = $state("");
  let visited_at = $state("");
  let submitting = $state(false);

  let myReview = $derived(
    $currentUser ? reviews.find((r) => r.user_id === $currentUser.id) ?? null : null,
  );
  let otherReviews = $derived(
    $currentUser ? reviews.filter((r) => r.user_id !== $currentUser.id) : reviews,
  );
  let avg = $derived(
    reviews.length ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1) : null,
  );

  onMount(load);
  async function load() {
    const res = await fetch(`/api/ratings/${facilityId}`);
    reviews = await res.json();
  }

  function startWrite() {
    if (!$isLoggedIn) { showAuth = true; return; }
    score = myReview?.score ?? 0;
    notes = myReview?.notes ?? "";
    visited_at = myReview?.visited_at ?? "";
    showWriteForm = true;
  }

  async function submit() {
    if (score < 1 || score > 5) return;
    submitting = true;
    await fetch(`/api/ratings/${facilityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ score, notes, visited_at }),
    });
    submitting = false;
    showWriteForm = false;
    await load();
  }

  async function doDelete() {
    confirmingDelete = false;
    await fetch(`/api/ratings/${facilityId}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  function stars(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }
</script>

<div class="overlay" role="presentation"
  use:portal
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Reviews for ${facilityName}`}>
    <header>
      <div>
        <h2>{facilityName}</h2>
        {#if avg}<span class="avg">★ {avg} · {reviews.length} review{reviews.length === 1 ? "" : "s"}</span>
        {:else}<span class="avg muted">No reviews yet</span>{/if}
      </div>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </header>

    <div class="list">
      {#if myReview && !showWriteForm}
        <div class="review mine">
          <div class="row">
            <span class="stars">{stars(myReview.score)}</span>
            <span class="you">Your review</span>
            <span class="spacer"></span>
            <button class="link" onclick={startWrite}>Edit</button>
            <button class="link danger" onclick={() => (confirmingDelete = true)}>Delete</button>
          </div>
          {#if myReview.visited_at}<span class="date">Visited {myReview.visited_at}</span>{/if}
          {#if myReview.notes}<p class="notes">{myReview.notes}</p>{/if}
        </div>
      {/if}

      {#each otherReviews as r}
        <div class="review">
          <span class="stars">{stars(r.score)}</span>
          {#if r.visited_at}<span class="date">Visited {r.visited_at}</span>{/if}
          {#if r.notes}<p class="notes">{r.notes}</p>{/if}
        </div>
      {/each}

      {#if reviews.length === 0}<p class="empty">Be the first to review this campground.</p>{/if}
    </div>

    {#if showWriteForm}
      <div class="form">
        <p class="form-label">{myReview ? "Edit your review" : "Write a review"}</p>
        <div class="star-pick">
          {#each [1, 2, 3, 4, 5] as s}
            <button class:active={s <= score} onclick={() => (score = s)}>{s <= score ? "★" : "☆"}</button>
          {/each}
        </div>
        <input type="date" bind:value={visited_at} />
        <textarea bind:value={notes} placeholder="Notes (optional)" rows="3"></textarea>
        <div class="form-actions">
          <button class="cancel" onclick={() => (showWriteForm = false)}>Cancel</button>
          <button class="submit" onclick={submit} disabled={submitting || score === 0}>
            {submitting ? "Saving…" : "Save review"}
          </button>
        </div>
      </div>
    {:else if !myReview}
      <button class="write-cta" onclick={startWrite}>
        {$isLoggedIn ? "+ Write a review" : "Sign in to write a review"}
      </button>
    {/if}
  </div>
</div>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={() => { showAuth = false; startWrite(); }} />
{/if}
{#if confirmingDelete}
  <ConfirmDialog
    message={`Delete your review of ${facilityName}? This can't be undone.`}
    confirmLabel="Delete"
    onconfirm={doDelete}
    oncancel={() => (confirmingDelete = false)} />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(35, 28, 14, 0.5); backdrop-filter: blur(2px); z-index: 3500; display: grid; place-items: center; padding: 1rem; }
  .modal { background: var(--paper-2); border: 1px solid var(--line-strong); border-radius: 14px; width: min(520px, 100%); max-height: 85dvh; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.35rem 1.35rem 0.85rem; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-family: var(--font-display); font-size: 1.4rem; font-weight: 600; }
  .avg { font-family: var(--font-mono); color: #a8731a; font-size: 0.8rem; }
  .avg.muted { color: var(--ink-faint); font-style: italic; }
  .x { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--ink-soft); transition: color 0.13s var(--ease); }
  .x:hover { color: var(--ink); }
  .list { overflow-y: auto; padding: 0.85rem 1.35rem; display: flex; flex-direction: column; gap: 0.85rem; flex: 1; }
  .review { border-bottom: 1px solid var(--line); padding-bottom: 0.7rem; font-size: 0.875rem; color: var(--ink-soft); }
  .review.mine { background: color-mix(in srgb, var(--ochre) 14%, var(--paper-2)); border: 1px solid color-mix(in srgb, var(--ochre) 45%, transparent); border-radius: 8px; padding: 0.7rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .stars { font-family: var(--font-mono); color: #a8731a; letter-spacing: 0.05em; }
  .you { color: #7c5a10; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .spacer { flex: 1; }
  .date { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.72rem; display: block; margin-top: 0.25rem; }
  .notes { margin: 0.35rem 0 0; color: var(--ink); line-height: 1.5; }
  .empty { color: var(--ink-faint); font-size: 0.875rem; font-style: italic; }
  .link { background: none; border: none; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: var(--pine); padding: 0; transition: color 0.13s var(--ease); }
  .link:hover { color: var(--pine-deep); text-decoration: underline; }
  .link.danger { color: var(--rust); }
  .link.danger:hover { color: #832e12; }
  .form, .write-cta { margin: 0.5rem 1.35rem 1.35rem; }
  .form { display: flex; flex-direction: column; gap: 0.55rem; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.9rem; }
  .form-label { font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; margin: 0; }
  .star-pick { display: flex; gap: 0.3rem; }
  .star-pick button { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--line-strong); padding: 0; transition: color 0.1s var(--ease), transform 0.08s var(--ease); }
  .star-pick button:hover { transform: scale(1.12); }
  .star-pick button.active { color: #c8932f; }
  textarea, input[type="date"] { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 8px; padding: 0.55rem 0.75rem; font-size: 0.875rem; color: var(--ink); resize: vertical; }
  textarea:focus, input[type="date"]:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .form-actions .cancel { background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.45rem 0.95rem; cursor: pointer; font-size: 0.875rem; font-weight: 600; transition: background 0.13s var(--ease); }
  .form-actions .cancel:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .form-actions .submit, .write-cta { background: var(--pine); color: #f4ecd6; border: 1px solid var(--pine-deep); border-radius: var(--radius); padding: 0.58rem 0.95rem; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: var(--shadow-sm); transition: background 0.13s var(--ease); }
  .form-actions .submit:hover:not(:disabled), .write-cta:hover { background: var(--pine-deep); }
  .write-cta { width: calc(100% - 2.7rem); }
  .form-actions .submit:disabled { opacity: 0.6; cursor: default; }
  @media (max-width: 640px) {
    .modal { width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; }
  }
</style>
