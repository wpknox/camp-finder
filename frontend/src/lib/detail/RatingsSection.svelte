<script lang="ts">
  import { onMount } from "svelte";
  import ReviewsModal from "./ReviewsModal.svelte";
  import type { Rating } from "$lib/types";

  let { facilityId, facilityName, autoOpen = false }: { facilityId: string; facilityName: string; autoOpen?: boolean } = $props();

  let reviews: Rating[] = $state([]);
  let showModal = $state(false);

  let avg = $derived(
    reviews.length ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1) : null,
  );
  let mostRecent = $derived(reviews[0] ?? null);

  // Re-fetch whenever the selected facility changes — the DetailPanel
  // instance is reused across campgrounds, so onMount alone would leave
  // stale reviews from the previously viewed facility.
  $effect(() => {
    facilityId; // track
    reviews = [];
    load();
  });

  onMount(() => { if (autoOpen) showModal = true; });
  async function load() {
    const id = facilityId;
    const res = await fetch(`/api/ratings/${id}`);
    const data = await res.json();
    // Ignore a response for a facility we've since navigated away from.
    if (id === facilityId) reviews = data;
  }
</script>

<section class="ratings">
  <h3>Community Reviews</h3>
  {#if avg}
    <p class="summary"><span class="avg">★ {avg}</span> · {reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
    {#if mostRecent?.notes}<p class="snippet">"{mostRecent.notes}"</p>{/if}
  {:else}
    <p class="empty">No reviews yet.</p>
  {/if}
  <button class="see-all" onclick={() => (showModal = true)}>
    {avg ? "See all reviews" : "Write a review"}
  </button>
</section>

{#if showModal}
  <ReviewsModal
    {facilityId}
    {facilityName}
    onclose={() => { showModal = false; load(); }} />
{/if}

<style>
  .ratings { margin: 1.2rem 0 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .summary { margin: 0; font-size: 0.9rem; color: var(--ink-soft); }
  .avg { font-family: var(--font-mono); color: #a8731a; font-weight: 600; }
  .snippet { margin: 0.4rem 0 0; color: var(--ink-soft); font-size: 0.85rem; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: var(--ink-faint); font-size: 0.85rem; margin: 0; }
  .see-all { margin-top: 0.7rem; background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.45rem 0.9rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: background 0.13s var(--ease); }
  .see-all:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
</style>
