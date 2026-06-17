<script lang="ts">
  import { onMount } from "svelte";
  import type { Facility } from "$lib/types";
  import { searchPending } from "./mapStore";

  let {
    onselect,
    onbackgroundclick,
  }: { onselect?: (f: Facility) => void; onbackgroundclick?: () => void } =
    $props();

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
      if (pendingView) {
        map.setView(pendingView, 12);
        pendingView = null;
      }

      // USGS Topo basemap (no API key) — renders as a folded paper quad map
      // with contours, shaded relief, and forest boundaries. This is the core
      // "handheld map, not a computer map" choice. The warm CSS filter on
      // .leaflet-tile-pane (app.css) ages it toward paper. Fall back to
      // OpenTopoMap if USGS is unreachable.
      const usgsTopo = L.tileLayer(
        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            'Map: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
          maxZoom: 16,
          maxNativeZoom: 16,
        },
      );
      usgsTopo.on("tileerror", function fallback() {
        usgsTopo.off("tileerror", fallback);
        usgsTopo.remove();
        L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          attribution:
            'Map: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
          maxZoom: 17,
        }).addTo(map);
      });
      usgsTopo.addTo(map);

      pinsLayer = L.markerClusterGroup({
        maxClusterRadius: 46,
        iconCreateFunction: (cluster: any) =>
          L.divIcon({
            html: `<div>${cluster.getChildCount()}</div>`,
            className: "camp-cluster",
            iconSize: L.point(40, 40),
          }),
      });
      map.addLayer(pinsLayer);

      map.on("moveend", () => searchPending.set(true));
      // Clicking the map background (not a marker — Leaflet fires marker
      // clicks separately) dismisses the open detail panel.
      map.on("click", () => onbackgroundclick?.());
    })();

    return () => map?.remove();
  });

  export function renderPins(facilityList: Facility[]) {
    if (!L || !pinsLayer) return;
    pinsLayer.clearLayers();

    for (const f of facilityList) {
      // Earthy pigments — mirror docs/design-language.md status colors and the
      // sidebar statusColor(). Cream stroke so pins read on the topo paper.
      const fillColor = f.is_closed
        ? "#a23a17" // rust
        : f.is_fully_fcfs
          ? "#5f7d34" // moss
          : f.is_partial_fcfs
            ? "#c8932f" // ochre
            : "#356b7d"; // lake

      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 8,
        fillColor,
        color: "#f4ecd6",
        weight: 2.5,
        fillOpacity: 1,
        opacity: 1,
      });
      const label = f.is_closed ? `⛔ CLOSED — ${f.name}` : f.name;
      marker.bindTooltip(label, {
        permanent: false,
        direction: "top",
        className: f.is_closed ? "closed-tip" : "",
      });
      // Gentle grow on hover for a tactile, hand-placed feel.
      marker.on("mouseover", () => marker.setRadius(11));
      marker.on("mouseout", () => marker.setRadius(8));
      marker.on("click", (e: any) => {
        // Stop the event reaching the map so the background-click handler
        // (which clears the selection) doesn't immediately undo the select.
        L.DomEvent.stopPropagation(e);
        onselect?.(f);
      });
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
    if (!map) {
      pendingView = [lat, lng];
      return;
    }
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
