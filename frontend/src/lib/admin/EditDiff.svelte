<script lang="ts">
  import type { Facility, Amenities } from "$lib/types";
  import { CARRIERS, EDITABLE_AMENITIES, type CarrierKey } from "$lib/fields";
  import LocationDiffMap from "./LocationDiffMap.svelte";
  import type { EditRow } from "./types";

  let { row }: { row: EditRow } = $props();

  const AMENITY_LABELS: Record<string, string> = {
    ...Object.fromEntries(EDITABLE_AMENITIES.map((a) => [a.key, a.label])),
    toiletType: "Toilets",
  };

  const CARRIER_LABELS: Record<string, string> = Object.fromEntries(
    CARRIERS.map((c) => [c.key, `${c.label} coverage`]),
  );

  const FIELD_LABELS: Record<string, string> = {
    fee_min: "Fee min ($/night)",
    fee_max: "Fee max ($/night)",
    season_start: "Season start",
    season_end: "Season end",
    fcfs_total: "FCFS sites",
    reservable_total: "Reservable sites",
    is_closed: "Closed",
    lat: "Latitude",
    lng: "Longitude",
    cell_coverage: "Cell coverage",
  };

  function fmtValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "(none)";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  /** One flattened label / current / proposed row per changed value. */
  const rows = $derived(
    Object.entries(row.changes).flatMap(
      ([key, value]): { label: string; current: unknown; proposed: unknown }[] => {
        if (key === "amenities" && value && typeof value === "object") {
          return Object.entries(value as Record<string, unknown>).map(([aKey, aVal]) => ({
            label: AMENITY_LABELS[aKey] ?? aKey,
            current: row.current?.amenities?.[aKey as keyof Amenities],
            proposed: aVal,
          }));
        }
        if (key === "cell_coverage" && value && typeof value === "object") {
          return Object.entries(value as Record<string, unknown>).map(([cKey, cVal]) => ({
            label: CARRIER_LABELS[cKey] ?? cKey,
            current: row.current?.cell_coverage?.[cKey as CarrierKey],
            proposed: cVal,
          }));
        }
        return [
          {
            label: FIELD_LABELS[key] ?? key,
            current: row.current ? row.current[key as keyof Facility] : undefined,
            proposed: value,
          },
        ];
      },
    ),
  );

  const propLat = $derived(row.changes.lat);
  const propLng = $derived(row.changes.lng);
</script>

<div class="diff">
  {#each rows as r}
    <div class="diff-row">
      <span class="diff-field">{r.label}</span>
      <span class="diff-current">{fmtValue(r.current)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-proposed">{fmtValue(r.proposed)}</span>
    </div>
  {/each}
</div>

{#if typeof propLat === "number" && typeof propLng === "number" && row.current}
  <LocationDiffMap
    fromLat={row.current.lat}
    fromLng={row.current.lng}
    toLat={propLat}
    toLng={propLng}
  />
{/if}

<style>
  .diff {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border-top: 1px solid var(--line);
    padding-top: 0.6rem;
  }
  .diff-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto auto auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .diff-field {
    color: var(--ink-soft);
    font-weight: 600;
  }
  .diff-current {
    font-family: var(--font-mono);
    color: var(--ink-faint);
    text-decoration: line-through;
  }
  .diff-arrow {
    color: var(--ink-faint);
  }
  .diff-proposed {
    font-family: var(--font-mono);
    color: var(--pine-deep);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .diff-row {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
