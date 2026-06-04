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

  onMount(async () => {
    await load();
    if (autoOpen) showModal = true;
  });
  async function load() {
    const res = await fetch(`/api/ratings/${facilityId}`);
    reviews = await res.json();
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
  .ratings { margin: 1rem 0; }
  h3 { font-size: 0.95rem; margin: 0 0 0.5rem; }
  .summary { margin: 0; font-size: 0.9rem; }
  .avg { color: #ca8a04; font-weight: 600; }
  .snippet { margin: 0.35rem 0 0; color: #6b7280; font-size: 0.85rem; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: #9ca3af; font-size: 0.85rem; margin: 0; }
  .see-all { margin-top: 0.6rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
</style>
