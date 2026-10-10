/** Dismissible banner shown above a queue after an approve. */
export interface SuccessNotice {
  id: string;
  facility_id: string;
  facility_name: string;
}

import type { Facility } from "$lib/types";
import type { ChoiceField } from "./mergeFields";

export type Side = "a" | "b";

export interface EditRow {
  id: string;
  facility_id: string;
  facility_name: string;
  user_email: string;
  changes: Record<string, unknown>;
  note: string;
  created: string;
  current: Facility | null;
}

export interface MergeRow {
  id: string;
  facility_a: string;
  facility_a_name: string;
  facility_a_ridb_id: string;
  facility_a_data: Facility | null;
  facility_b: string;
  facility_b_name: string;
  facility_b_ridb_id: string;
  facility_b_data: Facility | null;
  user_email: string;
  note: string;
  created: string;
}

/** Per-merge chooser state, owned by the page and mutated by MergeComparison. */
export interface MergeChoice {
  /** Master side: the surviving record. Default "all A". */
  winner: Side;
  fieldSide: Record<ChoiceField, Side>;
  expanded: boolean;
  /**
   * True once the admin engages with the field chooser (expands the grid or
   * clicks a side). Until then approve omits field_choices entirely, so the
   * engine keeps its default gap-fill — an untouched all-'winner' map would
   * be treated as explicit choices and silently skip filling from the loser.
   */
  touched: boolean;
}
