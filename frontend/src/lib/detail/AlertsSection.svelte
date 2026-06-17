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
    margin: 1.2rem 0;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }
  h3 {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 0.55rem;
  }
  .status {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .error {
    color: var(--rust);
  }
  .content {
    background: color-mix(in srgb, var(--rust) 10%, var(--paper-2));
    border-left: 3px solid var(--rust);
    border-radius: 0 8px 8px 0;
    padding: 0.65rem 0.85rem;
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--ink);
  }
  .content p {
    margin: 0 0 0.5rem;
  }
  .content p:last-child {
    margin-bottom: 0;
  }
  .timestamp {
    font-family: var(--font-mono);
    color: var(--ink-faint);
    font-size: 0.7rem;
    margin: 0.4rem 0 0;
  }
</style>
