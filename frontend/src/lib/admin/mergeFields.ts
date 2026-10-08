// Pure module: shared by the server merge logic and the admin UI. No $env / server imports.

/** Fields the admin can pick a side for during a merge. */
export const CHOICE_FIELDS = [
  "name",
  "location",
  "forest",
  "district",
  "description",
  "fee_min",
  "fee_max",
  "season_start",
  "season_end",
  "fcfs",
  "fs_url",
] as const;

export type ChoiceField = (typeof CHOICE_FIELDS)[number];

export type FieldChoices = Partial<Record<ChoiceField, "winner" | "loser">>;

export const CHOICE_FIELD_LABELS: Record<ChoiceField, string> = {
  name: "Name",
  location: "Location",
  forest: "Forest",
  district: "District",
  description: "Description",
  fee_min: "Fee min ($/night)",
  fee_max: "Fee max ($/night)",
  season_start: "Season start",
  season_end: "Season end",
  fcfs: "FCFS counts",
  fs_url: "FS URL",
};
