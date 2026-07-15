<script lang="ts">
  import { wmoToWeather, formatElevationFt } from '$lib/weather'

  let { lat, lng, elevationM }: { lat: number; lng: number; elevationM: number | null | undefined } = $props()

  interface Day { date: string; code: number; hi: number; lo: number; precip: number }
  let days = $state<Day[] | null>(null)
  let failed = $state(false)

  const elevFt = $derived(formatElevationFt(elevationM))

  $effect(() => {
    // Re-fetch when the selected facility changes.
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: 'fahrenheit',
      timezone: 'America/Denver',
      forecast_days: '7',
    })
    if (elevationM != null) params.set('elevation', String(elevationM))
    let stale = false
    days = null
    failed = false
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] } }) => {
        if (stale) return
        days = d.daily.time.map((date, i) => ({
          date,
          code: d.daily.weather_code[i],
          hi: Math.round(d.daily.temperature_2m_max[i]),
          lo: Math.round(d.daily.temperature_2m_min[i]),
          precip: d.daily.precipitation_probability_max[i] ?? 0,
        }))
      })
      .catch(() => { if (!stale) failed = true })
    return () => { stale = true }
  })

  function dayName(iso: string): string {
    // Parse as local date (ISO date-only strings are UTC by default).
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
  }
</script>

{#if !failed}
  <section class="weather">
    <h3>{elevFt ? `Weather at ${elevFt}` : 'Weather'}</h3>
    {#if days}
      <div class="strip">
        {#each days as d}
          {@const w = wmoToWeather(d.code)}
          <div class="day" title={w.label}>
            <span class="name">{dayName(d.date)}</span>
            <span class="icon">{w.icon}</span>
            <span class="hi">{d.hi}°</span>
            <span class="lo">{d.lo}°</span>
            <span class="precip">{d.precip}%</span>
          </div>
        {/each}
      </div>
      <p class="credit">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>
    {:else}
      <p class="loading">Loading forecast…</p>
    {/if}
  </section>
{/if}

<style>
  .weather { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .strip { display: flex; gap: 0.25rem; overflow-x: auto; }
  .day {
    flex: 1 1 0;
    min-width: 2.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.4rem 0.15rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper-deep);
  }
  .name { font-family: var(--font-ui); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
  .icon { font-size: 1.15rem; line-height: 1.3; }
  .hi, .lo, .precip { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 0.74rem; }
  .hi { font-weight: 700; color: var(--ink); }
  .lo { color: var(--ink-soft); }
  .precip { color: var(--pine); font-size: 0.66rem; }
  .loading { color: var(--ink-soft); font-size: 0.85rem; }
  .credit { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.4rem 0 0; }
  .credit a { color: var(--ink-faint); }
  /* Small phones: 5 days is enough — hide the last two columns (fetch stays 7). */
  @media (max-width: 480px) {
    .day:nth-child(n + 6) { display: none; }
  }
</style>
