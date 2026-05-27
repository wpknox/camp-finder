<script lang="ts">
  import CompareView from '$lib/compare/CompareView.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Compare Campgrounds — CampFinder</title></svelte:head>

<main style="max-width: 900px; margin: 0 auto; padding: 1rem">
  <a href="/" style="font-size:.875rem; color:#16a34a">← Back to map</a>
  <h1 style="font-size:1.25rem; margin:.75rem 0">Compare Campgrounds</h1>

  {#if data.facilities.length === 0}
    <p>No campgrounds selected. Add campgrounds to compare from the map.</p>
  {:else}
    <CompareView facilities={data.facilities} />
  {/if}
</main>
