<script lang="ts">
  import type { Facility } from '$lib/types'
  import { formatElevationFt } from '$lib/weather'

  let { facilities }: { facilities: Facility[] } = $props()

  const rows: Array<{ label: string; key: (f: Facility) => string }> = [
    { label: 'Forest',       key: f => f.forest || '—' },
    { label: 'Elevation',    key: f => formatElevationFt(f.elevation_m) ?? '?' },
    { label: 'FCFS Sites',   key: f => f.fcfs_total > 0 ? `${f.fcfs_total}/${f.fcfs_total + f.reservable_total}` : 'None' },
    { label: 'Fee/night',    key: f => f.fee_min == null ? '?' : f.fee_min === 0 ? 'Free' : `$${f.fee_min}` },
    { label: 'Water',        key: f => f.amenities.potableWater ? '✓' : '—' },
    { label: 'Toilet',       key: f => f.amenities.toiletType === 'unknown' ? '?' : f.amenities.toiletType },
    { label: 'Bear Boxes',   key: f => f.amenities.bearBoxes ? '✓' : '—' },
    { label: 'Pets',         key: f => f.amenities.petsAllowed ? '✓' : '—' },
    { label: 'Max RV',       key: f => f.amenities.maxRvLength ? `${f.amenities.maxRvLength}ft` : '—' },
    { label: 'Electric',     key: f => f.amenities.electricHookups ? '✓' : '—' },
    { label: 'Fire Rings',   key: f => f.amenities.fireRings ? '✓' : '—' },
    { label: 'Accessible',   key: f => f.amenities.accessible ? '✓' : '—' },
  ]
</script>

<div class="compare-wrap">
  <table>
    <thead>
      <tr>
        <th></th>
        {#each facilities as f}
          <th><a href={f.fs_url || '#'} target="_blank">{f.name}</a></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        {@const values = facilities.map(f => row.key(f))}
        {@const allSame = new Set(values).size === 1}
        <tr class:highlight={!allSame}>
          <td class="row-label">{row.label}</td>
          {#each values as v}
            <td>{v}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .compare-wrap {
    overflow-x: auto;
    padding: 0.5rem 0 1rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--paper-2);
    box-shadow: var(--shadow-sm);
  }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; }
  th, td { padding: .65rem .9rem; border-bottom: 1px solid var(--line); text-align: left; }
  td:not(.row-label), th:not(:first-child) {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  /* Column dividers between campgrounds, drawn light like pencil. */
  th + th, td + td { border-left: 1px solid var(--line); }
  thead th {
    position: sticky;
    top: 0;
    background: var(--paper-deep);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    border-bottom: 1px solid var(--line-strong);
  }
  thead th a { color: var(--pine); text-decoration: none; }
  thead th a:hover { color: var(--pine-deep); text-decoration: underline; text-underline-offset: 2px; }
  tbody tr:last-child td { border-bottom: none; }
  .row-label {
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  /* Rows where the campgrounds differ get a soft ochre wash to draw the eye. */
  tr.highlight td { background: color-mix(in srgb, var(--ochre) 12%, transparent); }
  tr.highlight .row-label { color: #876213; }
</style>
