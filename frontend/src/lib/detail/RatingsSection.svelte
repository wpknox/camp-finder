<script lang="ts">
  import { onMount } from 'svelte'
  import { auth } from '$lib/auth/authStore'
  import AuthModal from '$lib/auth/AuthModal.svelte'
  import type { Rating } from '$lib/types'

  let { facilityId }: { facilityId: string } = $props()

  let ratings: Rating[] = $state([])
  let showAuth = $state(false)
  let score = $state(0)
  let notes = $state('')
  let visited_at = $state('')
  let submitting = $state(false)

  let avgScore = $derived(
    ratings.length
      ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1)
      : null
  )

  onMount(loadRatings)

  async function loadRatings() {
    const res = await fetch(`/api/ratings/${facilityId}`)
    ratings = await res.json()
  }

  async function submit() {
    if (!$auth.model) { showAuth = true; return }
    if (score < 1 || score > 5) return
    submitting = true
    await fetch(`/api/ratings/${facilityId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${$auth.token}`,
      },
      body: JSON.stringify({ score, notes, visited_at, user_id: $auth.model.id }),
    })
    score = 0; notes = ''; visited_at = ''
    await loadRatings()
    submitting = false
  }
</script>

<section class="ratings">
  <h3>
    Community Ratings
    {#if avgScore}<span class="avg">★ {avgScore} ({ratings.length})</span>{/if}
  </h3>

  {#each ratings as r}
    <div class="rating-row">
      <span class="stars">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
      {#if r.visited_at}<span class="date">{r.visited_at}</span>{/if}
      {#if r.notes}<p class="notes">{r.notes}</p>{/if}
    </div>
  {/each}

  {#if ratings.length === 0}<p class="empty">No reviews yet.</p>{/if}

  <div class="form">
    <p class="form-label">Leave a review</p>
    <div class="star-pick">
      {#each [1,2,3,4,5] as s}
        <button class:active={s <= score} onclick={() => score = s}>{s <= score ? '★' : '☆'}</button>
      {/each}
    </div>
    <input type="date" bind:value={visited_at} placeholder="Date visited" />
    <textarea bind:value={notes} placeholder="Notes (optional)" rows="2"></textarea>
    <button class="submit-btn" onclick={submit} disabled={submitting || score === 0}>
      {$auth.model ? (submitting ? 'Submitting…' : 'Submit review') : 'Sign in to review'}
    </button>
  </div>
</section>

{#if showAuth}
  <AuthModal onclose={() => showAuth = false} />
{/if}

<style>
  .ratings { margin: 1rem 0; }
  h3 { font-size: .95rem; margin: 0 0 .5rem; display: flex; align-items: center; gap: .5rem; }
  .avg { color: #ca8a04; font-size: .85rem; }
  .rating-row { border-bottom: 1px solid #f3f4f6; padding: .5rem 0; font-size: .85rem; }
  .stars { color: #f59e0b; }
  .date { color: #9ca3af; font-size: .8rem; margin-left: .5rem; }
  .notes { margin: .25rem 0 0; color: #374151; }
  .empty { color: #9ca3af; font-size: .85rem; }
  .form { margin-top: 1rem; display: flex; flex-direction: column; gap: .5rem; }
  .form-label { font-size: .85rem; font-weight: 600; margin: 0; }
  .star-pick { display: flex; gap: .25rem; }
  .star-pick button { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #d1d5db; padding: 0; }
  .star-pick button.active { color: #f59e0b; }
  textarea, input[type=date] { border: 1px solid #d1d5db; border-radius: 8px; padding: .5rem .75rem; font-size: .875rem; resize: vertical; }
  .submit-btn { background: #16a34a; color: white; border: none; border-radius: 8px; padding: .55rem; cursor: pointer; font-size: .875rem; font-weight: 600; }
  .submit-btn:disabled { opacity: .6; cursor: default; }
</style>
