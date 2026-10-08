<script lang="ts">
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte'
  import { EDITABLE_AMENITIES, TOILET_OPTIONS, TRI_OPTIONS, type EditableAmenityKey } from '$lib/fields'
  import type { ToiletType, TriState } from '$lib/types'

  let {
    values = $bindable(),
    toiletType = $bindable(),
  }: {
    values: Record<EditableAmenityKey, TriState>
    toiletType: ToiletType
  } = $props()
</script>

<div class="amenity-row">
  <span class="amenity-label">Toilets</span>
  <SegmentedControl options={TOILET_OPTIONS} bind:value={toiletType} ariaLabel="Toilets" />
</div>
{#each EDITABLE_AMENITIES as { key, label } (key)}
  <div class="amenity-row">
    <span class="amenity-label">{label}</span>
    <SegmentedControl options={TRI_OPTIONS} bind:value={values[key]} ariaLabel={label} />
  </div>
{/each}

<style>
  .amenity-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .amenity-label { font-size: 0.86rem; color: var(--ink); }
</style>
