# Moderation polish — field-level merge chooser + fresh detail fetch

Branch: `feat/admin-moderation` (continue on it). Rule: `pnpm check` in `frontend/` must be 0 errors / 0 warnings before every commit; `pnpm test` green.

## User decisions (already made — see docs/handoff.md "Pending work")
- Admin makes ALL merge field choices; submitter only flags "same".
- Per-field A/B selection must include `name` and location (`lat`+`lng` travel together as one "location" choice).
- Admin merge UI: side-by-side A|B, master "use all of A / use all of B" toggle that sets every field's default, then per-field overrides.
- TDD the engine (`frontend/src/lib/server/admin/merge.ts` + `merge.test.ts`).
- Detail panel fetches the single facility fresh on open (fixes stale-cache gotcha).

## Task 1 — Merge engine + API: per-field selection
Files: `frontend/src/lib/server/admin/merge.ts`, `frontend/src/lib/server/admin/merge.test.ts`, `frontend/src/routes/api/admin/merges/+server.ts`

- New signature: `mergeFacilityFields(winner, loser, choices?)` where `choices` is `Partial<Record<ChoiceField, 'winner' | 'loser'>>`.
- `ChoiceField` = `'name' | 'location' | 'forest' | 'district' | 'description' | 'fee_min' | 'fee_max' | 'season_start' | 'season_end' | 'fcfs' | 'fs_url'`.
  - `'location'` sets `lat` + `lng` together. `'fcfs'` sets `fcfs_total`, `reservable_total`, `is_fully_fcfs`, `is_partial_fcfs` together.
  - `'loser'` copies the loser's value even if empty and even for `name`/`location` (explicit admin choice wins over gap-fill).
  - Fields absent from `choices` keep today's behavior: winner's value, gap-filled from loser when winner's is empty.
- Amenities stay deep-merged per-key exactly as today (not part of choices).
- `merged_ridb_ids` accumulation, `pickWinner`, `isEmpty` unchanged.
- API `POST /api/admin/merges` approve: accept optional `field_choices` (validate keys/values; 400 on bad); pass to engine; the winner-facility edit body must now also include `name`, `lat`, `lng` when they may have changed (add them to the edit payload unconditionally).
- API `GET /api/admin/merges`: for each pending suggestion, include full parsed facility objects `facility_a_data` and `facility_b_data` (all choice-relevant fields + amenities + ridb_id + id) so the UI can render side-by-side without extra fetches. Keep existing `*_name`/`*_ridb_id` fields for compatibility.
- TDD: write failing tests first (explicit loser choice incl. empty value, name/location/fcfs group behavior, default gap-fill unchanged, mixed choices).

## Task 2 — Admin merge UI: side-by-side A|B chooser
Files: `frontend/src/routes/admin/+page.svelte` (merge-queue section)

- Replace the current approve control with an expandable side-by-side comparison per suggestion: two columns (A and B) listing each ChoiceField's value from `facility_a_data`/`facility_b_data` (label empty values as "—").
- Master toggle "Use all of A" / "Use all of B" sets: `winner_id` = that facility AND every field choice to that side. Per-field radio/click overrides flip individual fields afterward.
- On approve, POST `{ id, action:'approve', winner_id, field_choices }` where field_choices maps each ChoiceField → 'winner'|'loser' relative to the chosen winner (translate A/B → winner/loser client-side).
- Default state on expand: A selected everywhere (or the pickWinner-equivalent side if easy — A is fine).
- Follow docs/design-language.md ("Folded Field Map") and existing admin page styles; Svelte 5 runes only.
- Reject flow unchanged.

## Task 3 — Detail panel fresh fetch on open
Files: `frontend/src/routes/+page.svelte` (and only if necessary `frontend/src/lib/map/mapStore.ts`)

- When `selectedFacility` becomes set (panel opens / selection changes to a new facility id), fetch `/api/facilities/{id}` and update `selectedFacility` with the fresh record (guard against races: ignore stale responses if selection changed; don't loop the effect on its own set()).
- If the fetch 404s (facility merged away), close the panel gracefully.
- No change to the explicit "Search this area" model — pins may stay stale by design.
