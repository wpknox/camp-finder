<!-- frontend/src/lib/detail/DetailPanel.svelte (stub — full implementation in Task 21) -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Facility } from '$lib/types'
  export let facility: Facility
  const dispatch = createEventDispatcher()
</script>

<aside class="panel-stub">
  <button on:click={() => dispatch('close')}>✕</button>
  <h2>{facility.name}</h2>
</aside>

<style>
  .panel-stub { position: fixed; right: 0; top: 0; width: 360px; height: 100%; background: white; padding: 1rem; box-shadow: -2px 0 8px rgba(0,0,0,0.15); z-index: 2000; overflow-y: auto; }
</style>
