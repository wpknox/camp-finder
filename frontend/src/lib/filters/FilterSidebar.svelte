<!-- frontend/src/lib/filters/FilterSidebar.svelte -->
<script lang="ts">
  import { filters } from './filterStore'
</script>

<aside class="sidebar">
  <h3>Filters</h3>

  <label><input type="checkbox" bind:checked={$filters.fcfsOnly}> First-Come Only</label>
  <label><input type="checkbox" bind:checked={$filters.water}> Potable Water</label>
  <label><input type="checkbox" bind:checked={$filters.toilets}> Has Toilets</label>
  <label><input type="checkbox" bind:checked={$filters.bearBoxes}> Bear Boxes</label>
  <label><input type="checkbox" bind:checked={$filters.petsAllowed}> Pets Allowed</label>

  <div class="field">
    <label>Max fee/night</label>
    <input type="number" min="0" step="5" placeholder="Any"
      value={$filters.maxFee ?? ''}
      on:input={e => filters.update(f => ({ ...f, maxFee: e.currentTarget.value ? +e.currentTarget.value : null }))} />
  </div>

  <div class="field">
    <label>Sort by</label>
    <select bind:value={$filters.sortBy}>
      <option value="name">Name</option>
      <option value="fee">Fee (low to high)</option>
      <option value="fcfs_count">FCFS sites (most first)</option>
    </select>
  </div>
</aside>

<style>
  .sidebar { width: 220px; padding: 1rem; background: #fafafa; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: .65rem; }
  h3 { margin: 0 0 .5rem; font-size: .95rem; }
  label { display: flex; align-items: center; gap: .5rem; font-size: .875rem; cursor: pointer; }
  .field { display: flex; flex-direction: column; gap: .25rem; font-size: .875rem; }
  input[type=number], select { border: 1px solid #d1d5db; border-radius: 6px; padding: .35rem .5rem; font-size: .875rem; }

  @media (max-width: 640px) {
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid #e5e7eb; flex-direction: row; flex-wrap: wrap; }
  }
</style>
