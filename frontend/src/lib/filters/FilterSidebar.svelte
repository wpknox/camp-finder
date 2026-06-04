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

  // Mirrors the map marker colors (see CampMap.renderPins).
  function statusColor(f: Facility) {
    if (f.is_closed) return "#ef4444";
    if (f.is_fully_fcfs) return "#22c55e";
    if (f.is_partial_fcfs) return "#eab308";
    return "#3b82f6";
  }
</script>

<aside class="sidebar">
  <button
    class="filter-toggle"
    onclick={() => (filtersOpen = !filtersOpen)}
    aria-expanded={filtersOpen}
  >
    <span class="filter-caret">{filtersOpen ? "▾" : "▸"}</span> Filters
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
      Results{$filteredFacilities.length
        ? ` (${$filteredFacilities.length})`
        : ""}
    </div>
    <ul class="result-list">
      {#each $filteredFacilities as f (f.id)}
        <li>
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
      {$isLoading ? "Searching…" : "Search this area"}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 220px;
    padding: 1rem;
    background: #fafafa;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .filter-toggle {
    margin: 0;
    padding: 0;
    background: none;
    border: none;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    text-align: left;
    color: inherit;
  }
  .filter-caret {
    font-size: 0.7rem;
    color: #6b7280;
  }
  /* Desktop: filters always visible, toggle is just a static heading. */
  .filter-body {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }
  input[type="number"],
  select {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-size: 0.875rem;
  }
  .results {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 0.25rem;
    border-top: 1px solid #e5e7eb;
    padding-top: 0.5rem;
  }
  .results-head {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 0.35rem;
  }
  .result-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.45rem;
    cursor: pointer;
    text-align: left;
    font-size: 0.8rem;
  }
  .result-item:hover {
    background: #eef2ff;
  }
  .result-item.active {
    background: #dbeafe;
    font-weight: 600;
  }
  .r-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
  }
  .r-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .r-meta {
    color: #6b7280;
    font-size: 0.75rem;
    flex-shrink: 0;
  }
  .result-empty {
    color: #9ca3af;
    font-size: 0.8rem;
    padding: 0.4rem 0;
  }
  .search-section {
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .search-btn {
    width: 100%;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
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
      border-bottom: 1px solid #e5e7eb;
      flex-direction: column;
      /* Fixed-height region stacked above the map. Filters + search stay
         pinned; only the results list inside scrolls. */
      height: 45vh;
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
