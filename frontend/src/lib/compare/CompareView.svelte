<script lang="ts">
  import type { Facility } from '$lib/types'

  let { facilities }: { facilities: Facility[] } = $props()

  const rows: Array<{ label: string; key: (f: Facility) => string }> = [
    { label: 'Forest',       key: f => f.forest || '—' },
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
  .compare-wrap { overflow-x: auto; padding: 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; }
  th, td { padding: .6rem .85rem; border: 1px solid #e5e7eb; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  .row-label { color: #6b7280; font-weight: 500; white-space: nowrap; }
  tr.highlight td { background: #fefce8; }
</style>
