<script lang="ts">
  let { quality, fsUrl }: { quality: "sparse" | "unknown"; fsUrl: string } =
    $props();
</script>

<div class="warning">
  ⚠️ Limited data available for this campground.
  {#if fsUrl}
    <a href={fsUrl} target="_blank" rel="noopener">Check the official page</a> for
    full details.
  {:else}
    Check the fs.usda.gov page for full details.
  {/if}
</div>

<style>
  .warning {
    background: color-mix(in srgb, var(--clay) 13%, var(--paper-2));
    border: 1px solid color-mix(in srgb, var(--clay) 42%, transparent);
    border-left: 3px solid var(--clay);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
    line-height: 1.5;
    margin: 0.9rem 0;
  }
  a {
    color: var(--clay);
    font-weight: 600;
  }
</style>
