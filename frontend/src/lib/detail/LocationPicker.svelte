<script lang="ts">
  import { untrack } from 'svelte'

  let { lat, lng, onchange }: {
    lat: number
    lng: number
    onchange: (lat: number, lng: number) => void
  } = $props()

  let mapEl: HTMLDivElement
  // Leaflet handles live outside runes — the map is imperative, not reactive state.
  let map: import('leaflet').Map | null = null
  let marker: import('leaflet').Marker | null = null

  function report(pos: { lat: number; lng: number }) {
    onchange(Number(pos.lat.toFixed(5)), Number(pos.lng.toFixed(5)))
  }

  $effect(() => {
    // untrack the initial center: this effect must run ONCE (mount/unmount),
    // not tear the map down on every lat/lng keystroke — the second effect
    // below handles subsequent position changes.
    const initLat = untrack(() => lat)
    const initLng = untrack(() => lng)
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return
      map = L.map(mapEl, { center: [initLat, initLng], zoom: 13 })
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
      }).addTo(map)
      marker = L.marker([initLat, initLng], { draggable: true }).addTo(map)
      marker.on('dragend', () => report(marker!.getLatLng()))
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker!.setLatLng(e.latlng)
        report(e.latlng)
      })
    })()
    return () => {
      cancelled = true
      map?.remove()
      map = null
      marker = null
    }
  })

  // Typed lat/lng edits move the pin. Guard against feedback loops: only move
  // when the position meaningfully differs from where the marker already is.
  $effect(() => {
    if (!map || !marker) return
    const cur = marker.getLatLng()
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      marker.setLatLng([lat, lng])
      map.panTo([lat, lng])
    }
  })
</script>

<div class="picker" bind:this={mapEl}></div>

<style>
  .picker {
    height: 240px;
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    overflow: hidden;
  }
</style>
