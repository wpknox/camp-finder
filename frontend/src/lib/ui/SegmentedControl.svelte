<script lang="ts" generics="T extends string">
  let {
    options,
    value = $bindable(),
    ariaLabel,
  }: {
    options: ReadonlyArray<{ value: T; label: string }>
    value: T
    ariaLabel?: string
  } = $props()
</script>

<div class="segmented" role="group" aria-label={ariaLabel}>
  {#each options as opt (opt.value)}
    <button type="button" class:active={value === opt.value} aria-pressed={value === opt.value}
            onclick={() => (value = opt.value)}>{opt.label}</button>
  {/each}
</div>

<style>
  .segmented { display: flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; flex: none; }
  .segmented button { background: var(--paper-deep); color: var(--ink-soft); border: none; padding: 0.32rem 0.6rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; border-right: 1px solid var(--line-strong); transition: background 0.13s var(--ease), color 0.13s var(--ease); }
  .segmented button:last-child { border-right: none; }
  .segmented button.active { background: var(--pine); color: #f4ecd6; }
  .segmented button:hover:not(.active) { background: color-mix(in srgb, var(--paper-deep) 70%, var(--line-strong)); }
</style>
