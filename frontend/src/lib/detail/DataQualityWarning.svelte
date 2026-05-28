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
    background: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    padding: 0.6rem 0.85rem;
    font-size: 0.85rem;
    margin: 0.75rem 0;
  }
  a {
    color: #92400e;
  }
</style>
