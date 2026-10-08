# Code-reuse refactor — DONE (2026-10-07, branch `chore/code-reuse-refactor`)

Goal (owner): easy-to-read, easy-to-use code; stop re-making the same thing; feature parity. The original sweep plus a second review were executed as 15 commits, each one task. Implementation was done by subagents and reviewed by Opus before each commit (`pnpm check` 0/0 and tests green at every commit). UI tasks were verified with before/after Playwright screenshots.

| Commit | What | Where it lives now |
|---|---|---|
| `e848796` | One service-token helper + shared `parseJson` | `lib/server/tb.ts`, `lib/json.ts` |
| `ffde69e` | 🐞 **Fix:** tombstoned facilities were still served by `/api/facilities/[id]` and Compare; `isSafeId` guards | `lib/server/facilities.ts` |
| `f41cc9e` | Moderation queue skeleton (admin approve/reject + public submit routes); `/api/admin/suggestions` attaches `current`; merge approve returns `facility_id/facility_name` | `lib/server/moderation.ts` |
| `77ea7d8` | alerts/nearby cache-row helper (alerts' redundant second lookup removed) | `lib/server/cacheRow.ts` |
| `c12b87b` | One haversine (km / m / mi) + `findNearby` | `lib/geo.ts` |
| `4d9f9cf` | Status colors, record source, fee/date formatting | `lib/status.ts`, `lib/source.ts`, `lib/format.ts` |
| `290f073` | Carrier/toilet/tri-state constants; merge choice fields shared client+server | `lib/fields.ts`, `lib/admin/mergeFields.ts` |
| `0f5d7b3` | Shared field validators, `validateEditChanges` (now tested), `campgroundSubmission.ts` split | `lib/validation.ts`, `lib/amenities.ts` |
| `d618c79` | `submitJson` for client → `/api` calls; `credentials: 'include'` removed | `lib/api.ts` |
| `bd9af76` | `ModalShell` + global `.btn`/`.form` styles (7 modals) | `lib/ui/ModalShell.svelte`, `app.css` |
| `ced3cd9` | `SegmentedControl` + `AmenityTriStates` | `lib/ui/`, `lib/campground/` |
| `0e9f324` | DetailPanel single `openModal`; `searchArea` always clears loading | — |
| `e668a0c` | Admin page: one resolver, `MergeComparison` + `EditDiff` (1102 → 640 lines) | `lib/admin/` |
| `a79ef73` | ETL ↔ frontend lockstep fixture test | `fixtures/data-quality.json` |
| `71a3bfe` | Prettier + one-time format | root `package.json`, `.prettierrc` |

## Intentional behavior changes
- Tombstoned facilities 404 by id and disappear from Compare (bug fix).
- Suggest-an-edit rejects negative fees and max < min (matches the new-campground form).
- Every modal portals to `<body>`; Escape closes the topmost modal regardless of focus.
- Confirm-dialog danger button text is cream (a later CSS rule had made it brown); `/reset` inputs use the roomier sign-in sizing.
- Admin edit-diff amenity labels use the canonical wording ("Pets allowed", not "Pets OK").
- Client calls show the form's fallback message on network failure instead of throwing.

## Found, not fixed (pre-existing)
- After a merge is approved, the loser's pending edit suggestions stay visible on `/admin` until refresh (approving one shows "Suggestion not found").
- Suggest-an-edit: a whitespace-only lat/lng/fee field is read as `0` by the `changes` builder.
- Teenybase `insert` responds with `[]`, so submit routes return no new row id.

## Not changed on purpose
- `svelte/store` stores stay (fine under Svelte 5).
- ETL code (already small pure functions); no shared ETL/frontend package (the fixture test covers lockstep instead).
- Teenybase quirk workarounds stay visible in routes/helpers (documented in `CLAUDE.md`).
