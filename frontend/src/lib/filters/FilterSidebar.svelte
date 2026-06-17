<script lang="ts">
  import { filters, filteredFacilities } from "./filterStore";
  import { isLoading, selectedFacility } from "$lib/map/mapStore";
  import type { Facility } from "$lib/types";

  let {
    onSearch,
    onpick,
  }: { onSearch: () => void; onpick: (f: Facility) => void } = $props();

  // Mobile-only: filters collapse behind a tappable header so the sidebar
  // stays short. Desktop CSS forces the body open and hides the toggle.
  let filtersOpen = $state(false);

  function feeLabel(f: Facility) {
    if (f.fee_min === 0) return "Free";
    if (f.fee_min != null) return `$${f.fee_min}`;
    return "—";
  }

  // Mirrors the map marker colors (see CampMap.renderPins) — earthy pigments.
  function statusColor(f: Facility) {
    if (f.is_closed) return "var(--rust)";
    if (f.is_fully_fcfs) return "var(--moss)";
    if (f.is_partial_fcfs) return "var(--ochre)";
    return "var(--lake)";
  }
</script>

<aside class="sidebar">
  <button
    class="filter-toggle"
    onclick={() => (filtersOpen = !filtersOpen)}
    aria-expanded={filtersOpen}
  >
    <span class="filter-caret">{filtersOpen ? "▾" : "▸"}</span>
    <span class="eyebrow">Refine</span>
    <span class="filter-title">Filters</span>
  </button>

  <div class="filter-body" class:open={filtersOpen}>
    <label
      ><input type="checkbox" bind:checked={$filters.fcfsOnly} /> First-Come Only</label
    >
    <label
      ><input type="checkbox" bind:checked={$filters.water} /> Potable Water</label
    >
    <label
      ><input type="checkbox" bind:checked={$filters.toilets} /> Has Toilets</label
    >
    <label
      ><input type="checkbox" bind:checked={$filters.bearBoxes} /> Bear Boxes</label
    >
    <label
      ><input type="checkbox" bind:checked={$filters.petsAllowed} /> Pets Allowed</label
    >

    <div class="field">
      <label for="filter-max-fee">Max fee/night</label>
      <input
        id="filter-max-fee"
        type="number"
        min="0"
        step="5"
        placeholder="Any"
        value={$filters.maxFee ?? ""}
        oninput={(e) =>
          filters.update((f) => ({
            ...f,
            maxFee: e.currentTarget.value ? +e.currentTarget.value : null,
          }))}
      />
    </div>

    <div class="field">
      <label for="filter-sort-by">Sort by</label>
      <select id="filter-sort-by" bind:value={$filters.sortBy}>
        <option value="name">Name</option>
        <option value="fee">Fee (low to high)</option>
        <option value="fcfs_count">FCFS sites (most first)</option>
      </select>
    </div>
  </div>

  <div class="results">
    <div class="results-head">
      <span class="eyebrow">Found</span>
      {#if $filteredFacilities.length}
        <span class="count mono">{$filteredFacilities.length}</span>
        <span class="count-label">campgrounds</span>
      {/if}
    </div>
    <ul class="result-list">
      {#each $filteredFacilities as f, i (f.id)}
        <li style="--i: {i}">
          <button
            class="result-item"
            class:active={$selectedFacility?.id === f.id}
            onclick={() => onpick(f)}
          >
            <span
              class="r-dot"
              style="background: {statusColor(f)}"
              title={f.is_closed
                ? "Closed"
                : f.is_fully_fcfs
                  ? "Fully first-come, first-served"
                  : f.is_partial_fcfs
                    ? "Partially first-come, first-served"
                    : "Reservable only"}
            ></span>
            <span class="r-name">{f.name}</span>
            <span class="r-meta">{feeLabel(f)}</span>
          </button>
        </li>
      {:else}
        <li class="result-empty">Search the map to list campgrounds here.</li>
      {/each}
    </ul>
  </div>

  <div class="search-section">
    <button class="search-btn" onclick={onSearch} disabled={$isLoading}>
      {#if $isLoading}
        Surveying area…
      {:else}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
          <path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        Search this area
      {/if}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 256px;
    padding: 1.1rem 1rem;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--paper-2) 70%, transparent),
        color-mix(in srgb, var(--paper-2) 40%, transparent)
      );
    border-right: 1px solid var(--line-strong);
    box-shadow: inset -10px 0 18px -16px rgba(46, 39, 25, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .filter-toggle {
    margin: 0;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    text-align: left;
    color: inherit;
  }
  .filter-title {
    font-family: var(--font-display);
    font-size: 1.18rem;
    font-weight: 600;
    color: var(--ink);
  }
  .filter-caret {
    font-size: 0.7rem;
    color: var(--ink-faint);
  }
  /* Desktop: filters always visible, toggle is just a static heading. */
  .filter-body {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.875rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .field label {
    font-weight: 600;
    color: var(--ink-soft);
  }
  .results {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 0.1rem;
    border-top: 1px solid var(--line);
    padding-top: 0.7rem;
  }
  .results-head {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .results-head .count {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--pine);
  }
  .count-label {
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .result-list {
    list-style: none;
    margin: 0 -0.25rem;
    padding: 0 0.25rem;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .result-list li {
    animation: fade-up 0.4s var(--ease) backwards;
    animation-delay: calc(var(--i) * 22ms);
  }
  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 0.45rem 0.5rem;
    cursor: pointer;
    text-align: left;
    font-size: 0.82rem;
    color: var(--ink);
    transition:
      background 0.13s var(--ease),
      border-color 0.13s var(--ease);
  }
  .result-item:hover {
    background: color-mix(in srgb, var(--paper-deep) 70%, transparent);
  }
  .result-item.active {
    background: var(--paper-deep);
    border-color: var(--line-strong);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }
  .r-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1.5px #f4ecd6;
  }
  .r-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .r-meta {
    font-family: var(--font-mono);
    color: var(--ink-soft);
    font-size: 0.72rem;
    flex-shrink: 0;
  }
  .result-empty {
    color: var(--ink-faint);
    font-size: 0.82rem;
    line-height: 1.5;
    padding: 0.6rem 0.3rem;
  }
  .search-section {
    padding-top: 0.8rem;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .search-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    background: var(--pine);
    color: #f4ecd6;
    border: 1px solid var(--pine-deep);
    border-radius: var(--radius);
    padding: 0.6rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition:
      background 0.15s var(--ease),
      transform 0.08s var(--ease);
  }
  .search-btn:hover:not(:disabled) {
    background: var(--pine-deep);
  }
  .search-btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .search-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (min-width: 641px) {
    /* Desktop never collapses filters and the toggle isn't interactive. */
    .filter-caret {
      display: none;
    }
    .filter-toggle {
      cursor: default;
    }
  }
  @media (max-width: 640px) {
    .sidebar {
      width: 100%;
      box-sizing: border-box;
      border-right: none;
      border-bottom: 1px solid var(--line-strong);
      flex-direction: column;
      /* Fixed-height region stacked above the map. Filters + search stay
         pinned; only the results list inside scrolls. */
      height: 33vh;
      gap: 0.5rem;
    }
    /* Collapse the filter body on mobile until the user opens it. */
    .filter-body {
      display: none;
    }
    .filter-body.open {
      display: flex;
    }
    /* Order so the search button sits directly under the filters and the
       results list takes the remaining (scrollable) space below it. */
    .filter-toggle {
      order: 0;
      flex: none;
    }
    .filter-body {
      order: 1;
      flex: none;
    }
    /* When expanded, let the filters scroll within the fixed-height
       sidebar instead of pushing the search button / results off-screen. */
    .filter-body.open {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    .search-section {
      order: 2;
      flex: none;
      padding-top: 0;
      border-top: none;
    }
    .results {
      order: 3;
      flex: 1 1 auto;
      min-height: 0;
      margin-top: 0;
    }
  }
</style>
