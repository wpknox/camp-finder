<script lang="ts">
  import CampMap from "$lib/map/CampMap.svelte";
  import DetailPanel from "$lib/detail/DetailPanel.svelte";
  import FilterSidebar from "$lib/filters/FilterSidebar.svelte";
  import {
    selectedFacility,
    searchPending,
    facilities,
    isLoading,
  } from "$lib/map/mapStore";
  import { filteredFacilities } from "$lib/filters/filterStore";
  import type { Facility } from "$lib/types";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  let campMap: CampMap = $state(null!);

  $effect(() => {
    if (campMap) campMap.renderPins($filteredFacilities);
  });

  onMount(async () => {
    const facilityId = $page.url.searchParams.get("facility");
    if (!facilityId) return;
    const res = await fetch(`/api/facilities/${facilityId}`);
    if (!res.ok) return;
    const f: Facility = await res.json();
    selectedFacility.set(f);
    campMap?.flyTo(f.lat, f.lng);
  });

  async function searchArea() {
    const bounds = campMap?.getMapBounds();
    if (!bounds) return;

    isLoading.set(true);
    searchPending.set(false);

    const params = new URLSearchParams({
      north: String(bounds.north),
      south: String(bounds.south),
      east: String(bounds.east),
      west: String(bounds.west),
    });

    const res = await fetch(`/api/facilities?${params}`);
    const data: Facility[] = await res.json();

    facilities.set(data);
    campMap.renderPins(data);
    isLoading.set(false);
  }
</script>

<FilterSidebar onSearch={searchArea} />

<div class="map-wrap">
  <CampMap bind:this={campMap} onselect={(f) => selectedFacility.set(f)} />

  <div class="legend">
    <span class="dot green"></span> Fully FCFS
    <span class="dot yellow"></span> Partial FCFS
    <span class="dot blue"></span> Reservable only
    <span class="dot red"></span> Closed
  </div>
</div>

{#if $selectedFacility}
  <DetailPanel
    facility={$selectedFacility}
    onclose={() => selectedFacility.set(null)}
  />
{/if}

<style>
  .map-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .legend {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    z-index: 1000;
    background: white;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .dot.green {
    background: #22c55e;
  }
  .dot.yellow {
    background: #eab308;
  }
  .dot.blue {
    background: #3b82f6;
  }
  .dot.red {
    background: #ef4444;
  }
</style>
