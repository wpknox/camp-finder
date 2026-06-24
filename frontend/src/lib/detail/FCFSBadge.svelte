<script lang="ts">
  let {
    fcfs_total,
    reservable_total,
    is_fully_fcfs,
  }: {
    fcfs_total: number;
    reservable_total: number;
    is_fully_fcfs: boolean;
  } = $props();

  let total = $derived(fcfs_total + reservable_total);
  let label = $derived(
    total === 0
      ? "Site data unavailable"
      : is_fully_fcfs
        ? `${fcfs_total}/${total} First-Come, First-Serve`
        : `${fcfs_total}/${total} FCFS sites`,
  );
  let color = $derived(
    is_fully_fcfs ? "green" : fcfs_total > 0 ? "yellow" : "blue",
  );
</script>

<div class="badge badge-{color}">
  {label}
</div>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    border: 1px solid;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 0.75rem 0;
  }
  .badge::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .badge-green {
    background: color-mix(in srgb, var(--moss) 16%, var(--paper-2));
    border-color: color-mix(in srgb, var(--moss) 45%, transparent);
    color: var(--pine-deep);
  }
  .badge-yellow {
    background: color-mix(in srgb, var(--ochre) 18%, var(--paper-2));
    border-color: color-mix(in srgb, var(--ochre) 50%, transparent);
    color: #876213;
  }
  .badge-blue {
    background: color-mix(in srgb, var(--lake) 14%, var(--paper-2));
    border-color: color-mix(in srgb, var(--lake) 45%, transparent);
    color: var(--lake);
  }
</style>
