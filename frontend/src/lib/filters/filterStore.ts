// frontend/src/lib/filters/filterStore.ts
import { writable, derived } from "svelte/store";
import type { Facility } from "$lib/types";
import { facilities } from "$lib/map/mapStore";

export interface FilterState {
  fcfsOnly: boolean;
  water: boolean;
  toilets: boolean;
  bearBoxes: boolean;
  hasCellService: boolean;
  maxFee: number | null;
  sortBy: "name" | "fee" | "fcfs_count";
}

export const filters = writable<FilterState>({
  fcfsOnly: false,
  water: false,
  toilets: false,
  bearBoxes: false,
  hasCellService: false,
  maxFee: null,
  sortBy: "name",
});

export const filteredFacilities = derived(
  [facilities, filters],
  ([$facilities, $filters]) => {
    let results = $facilities.filter((f) => {
      if ($filters.fcfsOnly && !f.is_fully_fcfs && !f.is_partial_fcfs)
        return false;
      if ($filters.water && !f.amenities.potableWater) return false;
      if ($filters.toilets && f.amenities.toiletType === "none") return false;
      if ($filters.bearBoxes && !f.amenities.bearBoxes) return false;
      if (
        $filters.hasCellService &&
        !(
          f.cell_coverage?.verizon ||
          f.cell_coverage?.att ||
          f.cell_coverage?.tmobile
        )
      )
        return false;
      if (
        $filters.maxFee != null &&
        f.fee_min != null &&
        f.fee_min > $filters.maxFee
      )
        return false;
      return true;
    });

    if ($filters.sortBy === "fee") {
      results.sort((a, b) => (a.fee_min ?? 999) - (b.fee_min ?? 999));
    } else if ($filters.sortBy === "fcfs_count") {
      results.sort((a, b) => b.fcfs_total - a.fcfs_total);
    } else {
      results.sort((a, b) => a.name.localeCompare(b.name));
    }

    return results;
  },
);
