<!-- frontend/src/lib/detail/AlertsSection.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'

  export let facilityId: string

  let loading = true
  let content: string | null = null
  let scraped_at: string | null = null
  let error = false

  onMount(async () => {
    try {
      const res = await fetch(`/api/alerts/${facilityId}`)
      const data = await res.json()
      content = data.content
      scraped_at = data.scraped_at
    } catch {
      error = true
    } finally {
      loading = false
    }
  })

  $: dateStr = scraped_at ? new Date(scraped_at).toLocaleDateString() : ''
</script>

<section class="alerts">
  <h3>Alerts & Closures</h3>

  {#if loading}
    <p class="status">Checking for alerts…</p>
  {:else if error}
    <p class="status error">Could not load alerts. Check the official page for current conditions.</p>
  {:else if content}
    <div class="content">{content}</div>
    <p class="timestamp">Last checked: {dateStr}</p>
  {:else}
    <p class="status">No active alerts found.</p>
  {/if}
</section>

<style>
  .alerts { margin: 1rem 0; }
  h3 { font-size: .95rem; margin: 0 0 .5rem; }
  .status { color: #666; font-size: .85rem; }
  .error { color: #dc2626; }
  .content { background: #fef2f2; border-left: 3px solid #ef4444; padding: .6rem .85rem; border-radius: 0 8px 8px 0; font-size: .85rem; white-space: pre-wrap; }
  .timestamp { color: #999; font-size: .75rem; margin: .25rem 0 0; }
</style>
