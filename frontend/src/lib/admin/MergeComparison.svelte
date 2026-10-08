<script lang="ts">
  import type { Facility } from "$lib/types";
  import { sourceLabel } from "$lib/source";
  import { CHOICE_FIELDS, CHOICE_FIELD_LABELS, type ChoiceField } from "./mergeFields";
  import type { MergeChoice, MergeRow, Side } from "./types";

  let { row, choice = $bindable() }: { row: MergeRow; choice: MergeChoice } = $props();

  const deleted = $derived(row.facility_a_data === null || row.facility_b_data === null);
  const winnerLabel = $derived(choice.winner === "a" ? "A" : "B");

  /** Render a facility's value for a given choice field, for the comparison grid. */
  function fieldDisplay(facility: Facility | null, field: ChoiceField): string {
    if (!facility) return "(deleted)";
    if (field === "location") {
      return `${facility.lat.toFixed(5)}, ${facility.lng.toFixed(5)}`;
    }
    if (field === "fcfs") {
      return `${facility.fcfs_total ?? 0} fcfs / ${facility.reservable_total ?? 0} reservable`;
    }
    if (field === "description") {
      const d = facility.description;
      if (!d) return "—";
      return d.length > 140 ? `${d.slice(0, 140)}…` : d;
    }
    const v = (facility as unknown as Record<string, unknown>)[field];
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  function useAllOfSide(side: Side) {
    choice.touched = true;
    choice.winner = side;
    choice.fieldSide = Object.fromEntries(CHOICE_FIELDS.map((f) => [f, side])) as Record<
      ChoiceField,
      Side
    >;
  }

  function setFieldSide(field: ChoiceField, side: Side) {
    choice.touched = true;
    choice.fieldSide[field] = side;
  }

  function toggleExpand() {
    if (!choice.expanded) choice.touched = true;
    choice.expanded = !choice.expanded;
  }

  const sides = $derived([
    {
      side: "a" as Side,
      name: row.facility_a_name,
      ridbId: row.facility_a_ridb_id,
      data: row.facility_a_data,
    },
    {
      side: "b" as Side,
      name: row.facility_b_name,
      ridbId: row.facility_b_ridb_id,
      data: row.facility_b_data,
    },
  ]);
</script>

<div class="merge-pair">
  {#each sides as s, i (s.side)}
    {#if i === 1}
      <button type="button" class="use-all-hint" onclick={toggleExpand}>
        {choice.expanded ? "Hide field comparison ▾" : "Compare fields ▸"}
      </button>
    {/if}
    <button
      type="button"
      class="merge-side"
      class:selected={choice.winner === s.side}
      onclick={() => useAllOfSide(s.side)}
    >
      <span class="side-name">{s.name}</span>
      <span class="badge">{sourceLabel(s.ridbId)}</span>
      <span class="ridb-id">{s.ridbId}</span>
      {#if !s.data}<span class="deleted-tag">deleted</span>{/if}
    </button>
  {/each}
</div>

{#if deleted}
  <p class="winner-hint error-hint">
    One of these facilities was deleted since the report was filed — this merge can't be approved.
  </p>
{:else if choice.expanded}
  <div class="field-grid">
    <div class="field-grid-head">
      <span></span>
      <span>A · {row.facility_a_name}</span>
      <span>B · {row.facility_b_name}</span>
    </div>
    {#each CHOICE_FIELDS as field (field)}
      <div class="field-grid-row">
        <span class="field-name">{CHOICE_FIELD_LABELS[field]}</span>
        {#each sides as s (s.side)}
          <button
            type="button"
            class="field-value"
            class:selected={choice.fieldSide[field] === s.side}
            onclick={() => setFieldSide(field, s.side)}
          >
            {fieldDisplay(s.data, field)}
          </button>
        {/each}
      </div>
    {/each}
  </div>
  <p class="winner-hint">
    Winner ({winnerLabel}) keeps its record with the field choices above; amenities deep-merge
    automatically; the loser is deleted.
  </p>
{:else}
  <p class="winner-hint">
    Winner ({winnerLabel}) keeps its record; the loser's data fills gaps for unpicked fields, then
    is deleted.
  </p>
{/if}

<style>
  .merge-pair {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
    border-top: 1px solid var(--line);
    padding-top: 0.7rem;
  }
  .merge-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    align-items: flex-start;
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.7rem 0.8rem;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition:
      border-color 0.13s var(--ease),
      background 0.13s var(--ease);
  }
  .merge-side.selected {
    border-color: var(--moss);
    background: color-mix(in srgb, var(--moss) 12%, var(--paper-deep));
  }
  .use-all-hint {
    align-self: center;
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--ink-soft);
    font-family: var(--font-mono);
    font-size: 0.74rem;
    cursor: pointer;
    padding: 0.3rem 0.4rem;
    white-space: nowrap;
    transition: color 0.13s var(--ease);
  }
  .use-all-hint:hover {
    color: var(--pine-deep);
  }
  .side-name {
    font-weight: 600;
    color: var(--ink);
    font-size: 0.92rem;
  }
  .badge {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-soft);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
  }
  .ridb-id {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
  .deleted-tag {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--rust);
  }
  .winner-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .winner-hint.error-hint {
    color: var(--rust);
    font-style: italic;
  }

  .field-grid {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.6rem;
  }
  .field-grid-head {
    display: grid;
    grid-template-columns: minmax(110px, 0.9fr) 1fr 1fr;
    gap: 0.5rem;
    padding: 0 0.1rem 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 1px solid var(--line);
  }
  .field-grid-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.9fr) 1fr 1fr;
    gap: 0.5rem;
    align-items: stretch;
    padding: 0.15rem 0;
  }
  .field-name {
    display: flex;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .field-value {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    line-height: 1.3;
    transition:
      border-color 0.13s var(--ease),
      background 0.13s var(--ease);
  }
  .field-value.selected {
    border-color: var(--moss);
    background: color-mix(in srgb, var(--moss) 14%, var(--paper));
    color: var(--pine-deep);
    font-weight: 600;
  }
  .field-value:hover:not(.selected) {
    border-color: var(--line-strong);
  }

  @media (max-width: 640px) {
    .merge-pair {
      flex-direction: column;
    }
    .field-grid-head,
    .field-grid-row {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
    .field-grid-head span:first-child {
      display: none;
    }
  }
</style>
