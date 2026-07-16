<script lang="ts">
  import type { CellCoverage } from '$lib/types'

  let { coverage }: { coverage: CellCoverage | null | undefined } = $props()

  const CARRIERS: Array<{ key: 'verizon' | 'att' | 'tmobile'; label: string }> = [
    { key: 'verizon', label: 'Verizon' },
    { key: 'att', label: 'AT&T' },
    { key: 'tmobile', label: 'T-Mobile' },
  ]
</script>

{#if coverage}
  <section class="cell">
    <h3>Cell signal</h3>
    <div class="chips">
      {#each CARRIERS as c}
        <span class="chip" class:on={coverage[c.key] === true}>
          {coverage[c.key] === true ? '●' : '○'} {c.label}
        </span>
      {/each}
    </div>
    <p class="caption">
      FCC-reported 4G data coverage{coverage.as_of ? ` · as of ${coverage.as_of}` : ''}
      {#if coverage.user_edited?.length}· includes camper reports{/if}
    </p>
  </section>
{/if}

<style>
  .cell { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .chips { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .chip {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    padding: 0.22rem 0.65rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--ink-faint);
    background: var(--paper-deep);
  }
  .chip.on {
    color: var(--pine-deep);
    border-color: color-mix(in srgb, var(--moss) 50%, transparent);
    background: color-mix(in srgb, var(--moss) 18%, var(--paper-2));
  }
  .caption { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.45rem 0 0; }
</style>
