<!-- frontend/src/lib/detail/FCFSBadge.svelte -->
<script lang="ts">
  export let fcfs_total: number
  export let reservable_total: number
  export let is_fully_fcfs: boolean

  $: total = fcfs_total + reservable_total
  $: label = total === 0 ? 'Site data unavailable'
           : is_fully_fcfs ? `${fcfs_total}/${total} First-Come, First-Serve`
           : `${fcfs_total}/${total} FCFS sites`
  $: color = is_fully_fcfs ? 'green' : fcfs_total > 0 ? 'yellow' : 'blue'
</script>

<div class="badge badge-{color}">
  {label}
</div>

<style>
  .badge { display: inline-block; padding: .35rem .75rem; border-radius: 20px; font-size: .85rem; font-weight: 600; margin: .75rem 0; }
  .badge-green  { background: #dcfce7; color: #15803d; }
  .badge-yellow { background: #fef9c3; color: #a16207; }
  .badge-blue   { background: #dbeafe; color: #1d4ed8; }
</style>
