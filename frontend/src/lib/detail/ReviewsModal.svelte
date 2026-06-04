<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn, currentUser } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
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
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3500; display: grid; place-items: center; padding: 1rem; }
  .modal { background: white; border-radius: 12px; width: min(520px, 100%); max-height: 85dvh; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.25rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
  h2 { margin: 0; font-size: 1.1rem; }
  .avg { color: #ca8a04; font-size: 0.85rem; }
  .avg.muted { color: #9ca3af; }
  .x { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #6b7280; }
  .list { overflow-y: auto; padding: 0.75rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1; }
  .review { border-bottom: 1px solid #f3f4f6; padding-bottom: 0.6rem; font-size: 0.875rem; }
  .review.mine { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.6rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .stars { color: #f59e0b; }
  .you { color: #92400e; font-size: 0.75rem; font-weight: 600; }
  .spacer { flex: 1; }
  .date { color: #9ca3af; font-size: 0.8rem; display: block; margin-top: 0.2rem; }
  .notes { margin: 0.3rem 0 0; color: #374151; }
  .empty { color: #9ca3af; font-size: 0.875rem; }
  .link { background: none; border: none; cursor: pointer; font-size: 0.8rem; color: #2563eb; padding: 0; }
  .link.danger { color: #dc2626; }
  .form, .write-cta { margin: 0.5rem 1.25rem 1.25rem; }
  .form { display: flex; flex-direction: column; gap: 0.5rem; }
  .form-label { font-weight: 600; font-size: 0.875rem; margin: 0; }
  .star-pick { display: flex; gap: 0.25rem; }
  .star-pick button { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #d1d5db; padding: 0; }
  .star-pick button.active { color: #f59e0b; }
  textarea, input[type="date"] { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.875rem; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .form-actions .cancel { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.45rem 0.9rem; cursor: pointer; font-size: 0.875rem; }
  .form-actions .submit, .write-cta { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-size: 0.875rem; font-weight: 600; }
  .write-cta { width: calc(100% - 2.5rem); }
  .form-actions .submit:disabled { opacity: 0.6; cursor: default; }
  @media (max-width: 640px) {
    .modal { width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; }
  }
</style>
