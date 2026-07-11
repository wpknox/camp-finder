<script lang="ts">
  let { fromLat, fromLng, toLat, toLng }: {
    fromLat: number
    fromLng: number
    toLat: number
    toLng: number
  } = $props()

  let mapEl: HTMLDivElement

  // Read-only before/after view: props are fixed for the life of the card, so
  // a single mount/unmount effect is all we need (no reactive sync).
  $effect(() => {
    let cancelled = false
    let map: import('leaflet').Map | null = null
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return
      map = L.map(mapEl, { attributionControl: false })
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
      }).addTo(map)
      // Leaflet path options need literal colors — hexes match app.css
      // (--ink-faint current, --rust proposed).
      L.polyline(
        [[fromLat, fromLng], [toLat, toLng]],
        { color: '#8a7c64', weight: 1.5, dashArray: '5 5' },
      ).addTo(map)
      L.circleMarker([fromLat, fromLng], {
        radius: 7, color: '#8a7c64', fillColor: '#8a7c64', fillOpacity: 0.7, weight: 2,
      }).addTo(map).bindTooltip('Current')
      L.circleMarker([toLat, toLng], {
        radius: 7, color: '#a23a17', fillColor: '#a23a17', fillOpacity: 0.85, weight: 2,
      }).addTo(map).bindTooltip('Proposed')
      map.fitBounds(
        L.latLngBounds([[fromLat, fromLng], [toLat, toLng]]).pad(0.35),
        { maxZoom: 14 },
      )
    })()
    return () => {
      cancelled = true
      map?.remove()
      map = null
    }
  })
</script>

<div class="wrap">
  <div class="diff-map" bind:this={mapEl}></div>
  <p class="legend">
    <span class="dot current" aria-hidden="true"></span> Current
    <span class="dot proposed" aria-hidden="true"></span> Proposed
  </p>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .diff-map {
    height: 220px;
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    overflow: hidden;
  }
  .legend {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.proposed {
    margin-left: 0.6rem;
  }
  .dot.current {
    background: var(--ink-faint);
  }
  .dot.proposed {
    background: var(--rust);
  }
</style>
