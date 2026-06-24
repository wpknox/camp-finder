<script lang="ts">
  import CampMap from "$lib/map/CampMap.svelte";
  import DetailPanel from "$lib/detail/DetailPanel.svelte";
  import FilterSidebar from "$lib/filters/FilterSidebar.svelte";
  import CompareTray from "$lib/compare/CompareTray.svelte";
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

    // Wait for the map to finish loading (Leaflet imports async), then
    // center on the facility and silently run an area search so it — and
    // its nearby campgrounds — actually get markers.
    for (let i = 0; i < 50; i++) {
      if (campMap?.getMapBounds()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    campMap?.flyTo(f.lat, f.lng);
    await searchArea();
  });

  function pickFacility(f: Facility) {
    selectedFacility.set(f);
    campMap?.flyTo(f.lat, f.lng);
  }

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

<FilterSidebar onSearch={searchArea} onpick={pickFacility} />

<div class="map-wrap">
  <CampMap
    bind:this={campMap}
    onselect={(f) => selectedFacility.set(f)}
    onbackgroundclick={() => selectedFacility.set(null)}
  />

  <div class="legend">
    <span class="legend-title eyebrow">Map key</span>
    <span class="row"><span class="dot moss"></span> Fully first-come</span>
    <span class="row"><span class="dot ochre"></span> Partial first-come</span>
    <span class="row"><span class="dot lake"></span> Reservable only</span>
    <span class="row"><span class="dot rust"></span> Closed</span>
  </div>

  <CompareTray />
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
  @media (max-width: 640px) {
    /* In the stacked mobile layout, keep the map from collapsing under
       the sidebar above it. */
    .map-wrap {
      min-height: 67vh;
    }
  }
  .legend {
    position: absolute;
    bottom: 1.1rem;
    left: 1.1rem;
    z-index: 1000;
    background: color-mix(in srgb, var(--paper-2) 94%, transparent);
    backdrop-filter: blur(2px);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 0.6rem 0.8rem;
    font-size: 0.78rem;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    gap: 0.32rem;
    align-items: flex-start;
    box-shadow: var(--shadow-md);
  }
  .legend-title {
    margin-bottom: 0.15rem;
  }
  .legend .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dot {
    display: inline-block;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px #f4ecd6;
  }
  .dot.moss {
    background: var(--moss);
  }
  .dot.ochre {
    background: var(--ochre);
  }
  .dot.lake {
    background: var(--lake);
  }
  .dot.rust {
    background: var(--rust);
  }
  @media (max-width: 640px) {
    /* On phones the legend competes with the pinned search UI — make it
       compact and tuck it to the corner. */
    .legend {
      bottom: 0.6rem;
      left: 0.6rem;
      padding: 0.45rem 0.6rem;
      font-size: 0.7rem;
      gap: 0.22rem;
    }
  }
</style>
