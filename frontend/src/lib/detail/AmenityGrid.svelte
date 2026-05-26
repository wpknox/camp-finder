<!-- frontend/src/lib/detail/AmenityGrid.svelte -->
<script lang="ts">
  import type { Amenities } from '$lib/types'
  export let amenities: Amenities

  $: items = [
    { icon: '💧', label: 'Potable Water',  show: amenities.potableWater },
    { icon: amenities.toiletType === 'flush' ? '🚽' : '🪣',
      label: amenities.toiletType === 'flush' ? 'Flush Toilet'
           : amenities.toiletType === 'vault' ? 'Vault Toilet'
           : amenities.toiletType === 'none'  ? 'No Toilet' : null,
      show: amenities.toiletType !== 'unknown' },
    { icon: '🐻', label: 'Bear Boxes',     show: amenities.bearBoxes },
    { icon: '🚗', label: 'Drive-up',       show: amenities.driveUp },
    { icon: '📏', label: `Max RV: ${amenities.maxRvLength}ft`, show: amenities.maxRvLength != null },
    { icon: '⚡', label: 'Electric',       show: amenities.electricHookups },
    { icon: '🐕', label: 'Pets OK',        show: amenities.petsAllowed },
    { icon: '🔥', label: 'Fire Rings',     show: amenities.fireRings },
    { icon: '🪑', label: 'Picnic Tables',  show: amenities.picnicTables },
    { icon: '♿', label: 'Accessible',     show: amenities.accessible },
  ].filter(i => i.show && i.label)
</script>

{#if items.length > 0}
  <div class="grid">
    {#each items as item}
      <div class="item">
        <span class="icon">{item.icon}</span>
        <span class="label">{item.label}</span>
      </div>
    {/each}
  </div>
{:else}
  <p class="empty">Amenity details not available</p>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: .5rem; margin: .75rem 0; }
  .item { display: flex; align-items: center; gap: .4rem; font-size: .82rem; background: #f8f8f8; padding: .4rem .6rem; border-radius: 8px; }
  .icon { font-size: 1rem; }
  .empty { color: #999; font-size: .85rem; }
</style>
