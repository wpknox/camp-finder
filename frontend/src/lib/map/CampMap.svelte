<script lang="ts">
  import { onMount } from "svelte";
  import type { Facility } from "$lib/types";
  import { searchPending } from "./mapStore";

  let { onselect }: { onselect?: (f: Facility) => void } = $props();

  let mapEl: HTMLDivElement = $state(null!);
  let L: any = $state(null);
  let map: any = $state(null);
  let pinsLayer: any = $state(null);
  let pendingView: [number, number] | null = null;

  onMount(() => {
    (async () => {
      L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");

      map = L.map(mapEl, { center: [39.55, -105.78], zoom: 8 });

      // Apply a flyTo requested before the map finished loading.
      if (pendingView) { map.setView(pendingView, 12); pendingView = null; }

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      pinsLayer = L.markerClusterGroup({ maxClusterRadius: 40 });
      map.addLayer(pinsLayer);

      map.on("moveend", () => searchPending.set(true));
    })();

    return () => map?.remove();
  });

  export function renderPins(facilityList: Facility[]) {
    if (!L || !pinsLayer) return;
    pinsLayer.clearLayers();

    for (const f of facilityList) {
      const fillColor = f.is_closed
        ? "#ef4444"
        : f.is_fully_fcfs
          ? "#22c55e"
          : f.is_partial_fcfs
            ? "#eab308"
            : "#3b82f6";

      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 9,
        fillColor,
        color: "#fff",
        weight: 2,
        fillOpacity: 0.9,
      });
      const label = f.is_closed ? `⛔ CLOSED — ${f.name}` : f.name;
      marker.bindTooltip(label, { permanent: false, direction: "top" });
      marker.on("click", () => onselect?.(f));
      pinsLayer.addLayer(marker);
    }
  }

  export function getMapBounds(): {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null {
    if (!map) return null;
    const b = map.getBounds();
    return {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    };
  }

  export function flyTo(lat: number, lng: number) {
    if (!map) { pendingView = [lat, lng]; return; }
    map.setView([lat, lng], 12);
  }
</script>

<div bind:this={mapEl} class="map-root"></div>

<style>
  .map-root {
    height: 100%;
    width: 100%;
  }
</style>
