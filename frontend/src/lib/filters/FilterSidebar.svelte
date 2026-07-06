<script lang="ts">
  import { filters, filteredFacilities } from "./filterStore";
  import { isLoading, selectedFacility } from "$lib/map/mapStore";
  import type { Facility } from "$lib/types";

  let {
    onSearch,
    onpick,
  }: { onSearch: () => void; onpick: (f: Facility) => void } = $props();

  // Mobile-only: filters and the results list each collapse behind a tappable
  // header so the sidebar stays short and the map keeps the room. Desktop CSS
  // forces both open and hides the toggles.
  let filtersOpen = $state(false);
  let resultsOpen = $state(false);

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

<aside
  class="sidebar"
  class:filters-open={filtersOpen}
  class:results-open={resultsOpen}
>
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

    <div class="field sort-field">
      <label for="filter-sort-by">Sort by</label>
      <select id="filter-sort-by" bind:value={$filters.sortBy}>
        <option value="name">Name</option>
        <option value="fee">Fee (low to high)</option>
        <option value="fcfs_count">FCFS sites (most first)</option>
      </select>
    </div>
  </div>

  <div class="results">
    <button
      class="results-head"
      onclick={() => (resultsOpen = !resultsOpen)}
      aria-expanded={resultsOpen}
    >
      <span class="results-caret">{resultsOpen ? "▾" : "▸"}</span>
      <span class="eyebrow">Found</span>
      {#if $filteredFacilities.length}
        <span class="count mono">{$filteredFacilities.length}</span>
        <span class="count-label">campgrounds</span>
      {/if}
      <span class="results-hint">tap to browse</span>
    </button>
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
    /* It's a <button> for the mobile disclosure; strip the chrome. Desktop
       leaves it as a static-looking heading (see min-width:641px below). */
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  /* Caret + "tap to browse" hint are mobile-only affordances. */
  .results-caret,
  .results-hint {
    display: none;
  }
  .results-caret {
    font-size: 0.7rem;
    color: var(--ink-faint);
  }
  .results-hint {
    margin-left: auto;
    font-size: 0.7rem;
    font-style: italic;
    color: var(--ink-faint);
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
    /* Desktop never collapses filters or results; the toggles aren't
       interactive and the list is always shown. */
    .filter-caret {
      display: none;
    }
    .filter-toggle,
    .results-head {
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
      /* Content-sized and compact by default (toggle + search + count), so the
         map gets the room. flex:none so the map's min-height (67vh) can't
         shrink it. Opening filters or the results list switches to a bounded
         height whose inner region scrolls. */
      flex: none;
      height: auto;
      gap: 0.5rem;
      transition: height 0.2s var(--ease);
    }
    /* Bounded heights when a disclosure is open; the map below may clip while
       the user refines/browses. Both-open gets a little extra. */
    /* The list is opened on purpose to browse, so let it dominate the screen
       (the map below clips while browsing). */
    .sidebar.results-open {
      height: 78vh;
    }
    .sidebar.filters-open {
      height: 62vh;
    }
    .sidebar.filters-open.results-open {
      height: 82vh;
    }

    /* Order: filter toggle, filter body, search, results. */
    .filter-toggle {
      order: 0;
      flex: none;
    }
    .filter-body {
      order: 1;
      flex: none;
      display: none;
    }
    /* When expanded, the filter body is sized to its own content — it should
       not flex-grow to fill the bounded sidebar height (that left a big empty
       gap before the search button when results stayed collapsed). It can
       still shrink and scroll if content ever exceeds the available space. */
    .filter-body.open {
      display: flex;
      flex: 0 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    /* Sort only reorders the (now secondary) list — drop it on mobile. */
    .sort-field {
      display: none;
    }
    .search-section {
      order: 2;
      flex: none;
      padding-top: 0;
      border-top: none;
    }
    /* Search button is more compact on mobile so it doesn't dominate. */
    .search-btn {
      padding: 0.42rem;
      font-size: 0.82rem;
    }
    .results {
      order: 3;
      flex: none;
      min-height: 0;
      margin-top: 0;
    }
    .results-head {
      margin-bottom: 0;
    }
    .results-caret,
    .results-hint {
      display: inline;
    }
    /* List is collapsed by default; the count stays visible in the header. */
    .result-list {
      display: none;
    }
    .sidebar.results-open .results {
      flex: 1 1 0;
    }
    .sidebar.results-open .results-head {
      margin-bottom: 0.5rem;
    }
    .sidebar.results-open .result-list {
      display: block;
    }
    /* Hide the "tap to browse" hint once the list is open. */
    .sidebar.results-open .results-hint {
      display: none;
    }
  }
</style>
