<script lang="ts">
  import { onMount } from 'svelte'
  import type { Facility } from '$lib/types'
  import { searchPending } from './mapStore'

  let { onselect }: { onselect?: (f: Facility) => void } = $props()

  let mapEl: HTMLDivElement = $state(null!)
  let L: any = $state(null)
  let map: any = $state(null)
  let pinsLayer: any = $state(null)
  let boundsRect: any = $state(null)

  $effect(() => {
    if (!map || !L) return
    if ($searchPending) {
      const bounds = map.getBounds()
      if (boundsRect) {
        boundsRect.setBounds(bounds)
      } else {
        boundsRect = L.rectangle(bounds, {
          color: '#2563eb',
          weight: 2,
          dashArray: '6 4',
          fillColor: '#2563eb',
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(map)
      }
    } else {
      if (boundsRect) {
        boundsRect.remove()
        boundsRect = null
      }
    }
  })

  onMount(() => {
    ;(async () => {
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      await import('leaflet.markercluster')
      await import('leaflet.markercluster/dist/MarkerCluster.css')
      await import('leaflet.markercluster/dist/MarkerCluster.Default.css')

      map = L.map(mapEl, { center: [39.55, -105.78], zoom: 8 })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      pinsLayer = L.markerClusterGroup({ maxClusterRadius: 40 })
      map.addLayer(pinsLayer)

      map.on('moveend', () => {
        searchPending.set(true)
        if (boundsRect) boundsRect.setBounds(map.getBounds())
      })
    })()

    return () => map?.remove()
  })

  export function renderPins(facilityList: Facility[]) {
    if (!L || !pinsLayer) return
    pinsLayer.clearLayers()

    for (const f of facilityList) {
      const fillColor = f.is_closed     ? '#ef4444'
                      : f.is_fully_fcfs ? '#22c55e'
                      : f.is_partial_fcfs ? '#eab308'
                      : '#3b82f6'

      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 9, fillColor, color: '#fff', weight: 2, fillOpacity: 0.9,
      })
      const label = f.is_closed ? `⛔ CLOSED — ${f.name}` : f.name
      marker.bindTooltip(label, { permanent: false, direction: 'top' })
      marker.on('click', () => onselect?.(f))
      pinsLayer.addLayer(marker)
    }
  }

  export function getMapBounds(): { north: number; south: number; east: number; west: number } | null {
    if (!map) return null
    const b = map.getBounds()
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
  }
</script>

<div bind:this={mapEl} class="map-root"></div>

<style>
  .map-root { height: 100%; width: 100%; }
</style>
