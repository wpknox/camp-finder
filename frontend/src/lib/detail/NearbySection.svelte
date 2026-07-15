<script lang="ts">
  import { onMount } from 'svelte'

  let { facilityId }: { facilityId: string } = $props()

  interface Poi { name: string; category: 'trailhead' | 'grocery' | 'fuel'; lat: number; lng: number; distance_m: number }

  let loading = $state(true)
  let pois = $state<Poi[] | null>(null)

  const ICONS: Record<Poi['category'], string> = { trailhead: '⛰️', grocery: '🛒', fuel: '⛽' }

  function miles(m: number): string {
    return `${(m / 1609.34).toFixed(1)} mi`
  }
  function dirUrl(p: Poi): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
  }

  // Re-fetch whenever the selected facility changes — the DetailPanel
  // instance is reused across campgrounds, so onMount alone would leave
  // stale POIs from the previously viewed facility.
  $effect(() => {
    facilityId; // track
    pois = null
    loading = true
    load()
  })

  async function load() {
    const id = facilityId
    try {
      const res = await fetch(`/api/nearby/${id}`)
      const data = await res.json()
      // Ignore a response for a facility we've since navigated away from.
      if (id === facilityId) pois = data.pois
    } catch {
      if (id === facilityId) pois = null
    } finally {
      if (id === facilityId) loading = false
    }
  }
</script>

{#if loading || (pois && pois.length > 0)}
  <section class="nearby">
    <h3>Nearby</h3>
    {#if loading}
      <p class="status">Looking around…</p>
    {:else if pois}
      <ul>
        {#each pois as p}
          <li>
            <span class="icon">{ICONS[p.category]}</span>
            <a href={dirUrl(p)} target="_blank" rel="noopener">{p.name}</a>
            <span class="dist">{miles(p.distance_m)}</span>
          </li>
        {/each}
      </ul>
      <p class="credit">Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>
    {/if}
  </section>
{/if}

<style>
  .nearby { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .status { color: var(--ink-soft); font-size: 0.85rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.86rem; }
  .icon { flex: none; }
  li a { color: var(--pine); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dist { margin-left: auto; font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink-faint); font-size: 0.76rem; flex: none; }
  .credit { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.5rem 0 0; }
  .credit a { color: var(--ink-faint); }
</style>
