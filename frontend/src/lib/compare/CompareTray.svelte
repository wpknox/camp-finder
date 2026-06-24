<script lang="ts">
  import { compareList, MAX_COMPARE } from "./compareStore";

  // Build the /compare link from the current list, preserving order.
  let compareUrl = $derived(`/compare?ids=${$compareList.map((c) => c.id).join(",")}`);
  let canCompare = $derived($compareList.length >= 2);
</script>

{#if $compareList.length > 0}
  <div class="tray" role="region" aria-label="Compare list">
    <div class="tray-head">
      <span class="eyebrow">Compare</span>
      <span class="count mono">{$compareList.length}/{MAX_COMPARE}</span>
      <button class="clear" onclick={() => compareList.clear()}>Clear</button>
    </div>

    <ul class="chips">
      {#each $compareList as c (c.id)}
        <li class="chip">
          <span class="chip-name" title={c.name}>{c.name}</span>
          <button
            class="chip-x"
            aria-label={`Remove ${c.name} from compare`}
            onclick={() => compareList.remove(c.id)}>✕</button
          >
        </li>
      {/each}
    </ul>

    {#if canCompare}
      <a class="go" href={compareUrl}>Compare {$compareList.length} →</a>
    {:else}
      <p class="hint">Add one more to compare</p>
    {/if}
  </div>
{/if}

<style>
  .tray {
    position: absolute;
    bottom: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1500;
    width: min(420px, calc(100% - 2rem));
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 90%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
    padding: 0.7rem 0.85rem 0.8rem;
    animation: tray-in 0.32s var(--ease);
  }
  /* A clipboard "clip" tab at the top center for the field-kit feel. */
  .tray::before {
    content: "";
    position: absolute;
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 54px;
    height: 9px;
    border-radius: 5px 5px 3px 3px;
    background: var(--line-strong);
    border: 1px solid var(--ink-faint);
  }
  @keyframes tray-in {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .tray-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.55rem;
  }
  .count {
    font-size: 0.72rem;
    color: var(--ink-soft);
  }
  .clear {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    transition: color 0.13s var(--ease);
  }
  .clear:hover {
    color: var(--rust);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .chips {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    background: var(--paper-deep);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 0.2rem 0.3rem 0.2rem 0.6rem;
    font-size: 0.78rem;
  }
  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
    color: var(--ink);
  }
  .chip-x {
    flex-shrink: 0;
    display: grid;
    place-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink-faint) 22%, transparent);
    color: var(--ink-soft);
    font-size: 0.62rem;
    cursor: pointer;
    transition: background 0.13s var(--ease), color 0.13s var(--ease);
  }
  .chip-x:hover {
    background: var(--rust);
    color: #f4ecd6;
  }
  .go {
    display: block;
    text-align: center;
    background: var(--pine);
    color: #f4ecd6;
    border: 1px solid var(--pine-deep);
    border-radius: var(--radius);
    padding: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
    box-shadow: var(--shadow-sm);
    transition: background 0.15s var(--ease);
  }
  .go:hover {
    background: var(--pine-deep);
    color: #f4ecd6;
  }
  .hint {
    margin: 0;
    text-align: center;
    font-size: 0.76rem;
    font-style: italic;
    color: var(--ink-faint);
  }
  @media (max-width: 640px) {
    .tray {
      bottom: 0.6rem;
      width: calc(100% - 1.2rem);
    }
    .chip-name {
      max-width: 120px;
    }
  }
</style>
