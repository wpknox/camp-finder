<script lang="ts">
  import CampMap from '$lib/map/CampMap.svelte'
  import DetailPanel from '$lib/detail/DetailPanel.svelte'
  import FilterSidebar from '$lib/filters/FilterSidebar.svelte'
  import { selectedFacility, searchPending, facilities, isLoading } from '$lib/map/mapStore'
  import { filteredFacilities } from '$lib/filters/filterStore'
  import type { Facility } from '$lib/types'

  let campMap: CampMap = $state(null!)

  $effect(() => {
    if (campMap) campMap.renderPins($filteredFacilities)
  })

  async function searchArea() {
    const bounds = campMap?.getMapBounds()
    if (!bounds) return

    isLoading.set(true)
    searchPending.set(false)

    const params = new URLSearchParams({
      north: String(bounds.north), south: String(bounds.south),
      east: String(bounds.east),  west: String(bounds.west),
    })

    const res = await fetch(`/api/facilities?${params}`)
    const data: Facility[] = await res.json()

    facilities.set(data)
    campMap.renderPins(data)
    isLoading.set(false)
  }
</script>

<FilterSidebar />

<div class="map-wrap">
  <CampMap bind:this={campMap} onselect={(f) => selectedFacility.set(f)} />

  <div class="search-bar">
    {#if $searchPending}
      <button class="search-btn" onclick={searchArea} disabled={$isLoading}>
        {$isLoading ? 'Searching…' : 'Search this area'}
      </button>
    {/if}
  </div>

  <div class="legend">
    <span class="dot green"></span> Fully FCFS
    <span class="dot yellow"></span> Partial FCFS
    <span class="dot blue"></span> Reservable only
  </div>
</div>

{#if $selectedFacility}
  <DetailPanel facility={$selectedFacility} onclose={() => selectedFacility.set(null)} />
{/if}

<style>
  .map-wrap  { position: relative; flex: 1; min-width: 0; }
  .search-bar { position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 1000; }
  .search-btn {
    background: white; border: none; border-radius: 24px;
    padding: .6rem 1.4rem; font-size: .95rem; font-weight: 600;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer;
  }
  .legend {
    position: absolute; bottom: 1rem; left: 1rem; z-index: 1000;
    background: white; border-radius: 8px; padding: .5rem .75rem;
    font-size: .8rem; display: flex; gap: .75rem; align-items: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .dot.green  { background: #22c55e; }
  .dot.yellow { background: #eab308; }
  .dot.blue   { background: #3b82f6; }
</style>
