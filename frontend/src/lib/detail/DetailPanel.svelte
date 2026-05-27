<script lang="ts">
  import type { Facility } from '$lib/types'
  import FCFSBadge from './FCFSBadge.svelte'
  import AmenityGrid from './AmenityGrid.svelte'
  import AlertsSection from './AlertsSection.svelte'
  import DataQualityWarning from './DataQualityWarning.svelte'
  import { compareIds } from '$lib/compare/compareStore'
  import SaveButton from '$lib/saved/SaveButton.svelte'
  import RatingsSection from './RatingsSection.svelte'

  let { facility, onclose }: { facility: Facility; onclose?: () => void } = $props()

  let nearbyMapsUrl = $derived(`https://www.google.com/maps/search/hiking+trails/@${facility.lat},${facility.lng},12z`)
  let reserveUrl    = $derived(`https://www.recreation.gov/camping/campgrounds/${facility.ridb_id}`)
  let feeStr = $derived(
    facility.fee_min == null ? 'Fee unknown'
    : facility.fee_min === 0   ? 'Free'
    : facility.fee_min === facility.fee_max ? `$${facility.fee_min}/night`
    : `$${facility.fee_min}–$${facility.fee_max}/night`
  )
  let isComparing = $derived($compareIds.includes(facility.id))
</script>

<aside class="panel">
  <button class="close-btn" onclick={() => onclose?.()} aria-label="Close">✕</button>

  <div class="panel-content">
    <header>
      <h2>{facility.name}</h2>
      <p class="meta">{facility.forest}{facility.district ? ` · ${facility.district}` : ''}</p>
      <p class="fee">{feeStr}</p>
      <SaveButton facilityId={facility.id} />
    </header>

    <FCFSBadge fcfs_total={facility.fcfs_total} reservable_total={facility.reservable_total}
               is_fully_fcfs={facility.is_fully_fcfs} />

    <button
      class="compare-btn"
      onclick={() => isComparing ? compareIds.remove(facility.id) : compareIds.add(facility.id)}
    >
      {isComparing ? '✓ In Compare' : '+ Compare'}
    </button>

    {#if $compareIds.length >= 2}
      <a class="compare-link" href="/compare?ids={$compareIds.join(',')}">
        View comparison ({$compareIds.length} campgrounds) →
      </a>
    {/if}

    <AmenityGrid amenities={facility.amenities} />

    <AlertsSection facilityId={facility.id} />

    {#if facility.ridb_data_quality !== 'rich'}
      <DataQualityWarning quality={facility.ridb_data_quality} fsUrl={facility.fs_url} />
    {/if}

    <div class="links">
      {#if facility.fs_url}
        <a href={facility.fs_url} target="_blank" rel="noopener">View on fs.usda.gov ↗</a>
      {/if}
      <a href={reserveUrl} target="_blank" rel="noopener">Reserve on recreation.gov ↗</a>
      <a href={nearbyMapsUrl} target="_blank" rel="noopener">Nearby activities (Google Maps) ↗</a>
    </div>

    <RatingsSection facilityId={facility.id} />
  </div>
</aside>

<style>
  .panel {
    position: fixed;
    background: white;
    overflow-y: auto;
    z-index: 2000;
    box-shadow: -2px 0 12px rgba(0,0,0,0.15);
    top: 0; right: 0; bottom: 0;
    width: min(420px, 100vw);
  }
  @media (max-width: 640px) {
    .panel { top: 40%; left: 0; right: 0; bottom: 0; width: 100%; border-radius: 16px 16px 0 0; }
  }
  .close-btn {
    position: sticky; top: 0; float: right;
    background: none; border: none; font-size: 1.2rem; cursor: pointer;
    padding: 1rem; z-index: 1;
  }
  .panel-content { padding: 1rem 1.25rem 2rem; }
  h2 { margin: 0 0 .25rem; font-size: 1.2rem; }
  .meta { margin: 0; color: #666; font-size: .9rem; }
  .fee { margin: .5rem 0 0; font-weight: 600; }
  .links { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; font-size: .9rem; }
  .links a { color: #16a34a; }
  .compare-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: .4rem .85rem; cursor: pointer; font-size: .85rem; }
  .compare-link { display: block; color: #16a34a; font-size: .875rem; margin: .5rem 0; }
</style>
