<script lang="ts">
  import CompareView from '$lib/compare/CompareView.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Compare Campgrounds — CampFinder</title></svelte:head>

<main class="compare-page">
  <a class="back" href="/">← Back to map</a>
  <span class="eyebrow">Side by side</span>
  <h1>Compare Campgrounds</h1>

  {#if data.facilities.length === 0}
    <p class="empty">No campgrounds selected. Add campgrounds to compare from the map.</p>
  {:else}
    <CompareView facilities={data.facilities} />
  {/if}
</main>

<style>
  .compare-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3.5rem;
    width: 100%;
    overflow-y: auto;
  }
  .back {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--pine);
    text-decoration: none;
  }
  .back:hover { color: var(--pine-deep); text-decoration: underline; text-underline-offset: 2px; }
  .eyebrow { display: block; margin: 1.2rem 0 0.3rem; }
  h1 {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
  }
  .empty {
    color: var(--ink-faint);
    font-size: 0.95rem;
    font-style: italic;
  }
</style>
