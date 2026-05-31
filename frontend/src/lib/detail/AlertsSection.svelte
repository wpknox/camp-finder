<script lang="ts">
  import { onMount } from "svelte";

  let { facilityId }: { facilityId: string } = $props();

  let loading = $state(true);
  let content: string | null = $state(null);
  let scraped_at: string | null = $state(null);
  let error = $state(false);

  let dateStr = $derived(
    scraped_at ? new Date(scraped_at).toLocaleDateString() : "",
  );

  onMount(async () => {
    try {
      const res = await fetch(`/api/alerts/${facilityId}`);
      const data = await res.json();
      content = data.content;
      scraped_at = data.scraped_at;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });
</script>

<section class="alerts">
  <h3>Alerts & Closures</h3>

  {#if loading}
    <p class="status">Checking for alerts…</p>
  {:else if error}
    <p class="status error">
      Could not load alerts. Check the official page for current conditions.
    </p>
  {:else if content}
    <div class="content">
      {#each [...new Set(content.split('\n\n').map(s => s.trim()).filter(s => s))] as paragraph}
        <p>{paragraph}</p>
      {/each}
    </div>
    <p class="timestamp">Last checked: {dateStr}</p>
  {:else}
    <p class="status">No active alerts found.</p>
  {/if}
</section>

<style>
  .alerts {
    margin: 1rem 0;
  }
  h3 {
    font-size: 0.95rem;
    margin: 0 0 0.5rem;
  }
  .status {
    color: #666;
    font-size: 0.85rem;
  }
  .error {
    color: #dc2626;
  }
  .content {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    padding: 0.6rem 0.85rem;
    border-radius: 0 8px 8px 0;
    font-size: 0.85rem;
    color: #1a1a1a;
  }
  .content p {
    margin: 0 0 0.5rem;
  }
  .content p:last-child {
    margin-bottom: 0;
  }
  .timestamp {
    color: #999;
    font-size: 0.75rem;
    margin: 0.25rem 0 0;
  }
</style>
