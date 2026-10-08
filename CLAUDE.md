# CLAUDE.md

CampFinder: map-first web app for comparing National Forest campgrounds, surfacing first-come-first-serve (FCFS) availability + amenities from RIDB. Deployed (Pages `camp-finder.pages.dev` + Teenybase Worker + prod D1; deploys are manual). Status, env files, secrets and session history: `docs/handoff.md`. Original spec: `campfinder-spec.md` (repo root).

## Layout & commands

pnpm workspaces — `pnpm install` at the root. `frontend/` SvelteKit + vanilla Leaflet (Pages) · `backend/` Teenybase (Workers + D1) · `etl/` Node/TS sync scripts · `fixtures/` shared ETL↔frontend test fixtures · `docs/`.

| Where | Command | Purpose |
|---|---|---|
| `frontend/` | `pnpm dev` / `pnpm check` / `pnpm test` | :5173 / svelte-check (0/0 expected) / Vitest |
| `backend/` | `pnpm dev` | Teenybase on :8787 |
| `backend/` | `pnpm generate && pnpm migrate` | After schema changes (see migrate trap below) |
| `backend/` | `pnpm deploy` / `pnpm secrets-upload` | Prod Worker / push `.prod.vars` secrets |
| `etl/` | `pnpm sync` / `discover` / `sync-nps` | RIDB / fs.usda.gov scrape / NPS API |
| `etl/` | `pnpm enrich-elevation` / `enrich-cell` / `test` | Enrichment (cell needs `etl/data/fcc/`) / Vitest |
| root | `pnpm format` / `format:check` | Prettier (backend `*.jsonc` excluded) |

**UI work:** read `docs/design-language.md` ("Folded Field Map" palette, type, textures) first; all new UI must match it.

## Rules

- **Svelte 5 runes only** — `$state`/`$derived`/`$effect`/`$props`, `onclick=`, `{@render children()}`, callback props (`onclose`). Never `export let`, `$:`, `on:click`, `<slot />`, `createEventDispatcher`.
- **No PocketBase.** Backend calls are `fetch()` to Teenybase REST, always via `tbFetch()` (below).
- **Status colors** come only from `STATUS_META` / `facilityStatus()` in `lib/status.ts` (🔴 closed · 🟢 fully FCFS · 🟡 partial · 🔵 reservable). Never hardcode.
- **Pages functions are not Node.** Use web APIs only in server code (`atob`/`TextDecoder`, never `Buffer`).
- **Secrets stay server-side.** RIDB and Teenybase service calls go through SvelteKit `+server.ts` routes.
- **FCFS is per-campsite in RIDB**: the ETL aggregates `/facilities/{id}/campsites` into `fcfs_total`/`reservable_total`/`is_fully_fcfs`/`is_partial_fcfs`. Amenities are normalized at ETL time into a fixed schema; unknowns are `null`/`"unknown"`, never omitted.
- **Alerts** are scraped from fs.usda.gov on detail-panel open, cached in `alerts` for 24h; a failed scrape shows a message, never blocks the panel.
- **Map search is explicit** ("Search this area"), never auto-queried on pan/zoom.
- **Sparse data** (`ridb_data_quality == "sparse"`) shows a warning + link to the fs.usda.gov page.

## Teenybase quirks (do not deviate)

- **All Teenybase HTTP goes through `tbFetch()`** (`lib/server/tbFetch.ts`; `tb()`/`tbList` wrap it). It adds `X-TB-Key` + CF Access headers. Prod 403s without them; local doesn't enforce the guard, so a raw `fetch()` passes locally and breaks in prod.
- **JSON fields: stringify on write, parse on read** (`parseJson` in `lib/json.ts`, `parseFacility` in `lib/server/facilities.ts`). A plain object 400s.
- **No compound WHERE** (`&&`/`AND` fail). Fetch with a high `limit` and filter in the route (see `listPublicFacilities()`). Ids interpolated into WHERE must pass `isSafeId()`.
- **`pnpm migrate` (`teeny deploy --local`) is unreliable locally.** Apply DDL to the served sqlite by hand and verify with real requests.

## Shared code (reuse before writing new)

- **`frontend/src/lib/server/`:** `tbFetch.ts` (base URL + guard headers), `tb.ts` (`tbHeaders`/`tb()`/`tbList`/`tbView`; the only reader of `TB_SERVICE_TOKEN`), `facilities.ts` (public non-tombstoned reads; the `is_deleted` filter lives only here), `moderation.ts` (pending queues, joins, submit guard), `cacheRow.ts` (alerts/nearby cache rows), `email.ts` (Resend; without `RESEND_API_KEY` it logs, so local reset/verify links are in the dev-server log), `auth/limiters.ts` (rate limits).
- **`frontend/src/lib/`:** `fields.ts` (amenity/carrier/toilet/tri-state constants), `validation.ts`, `amenities.ts` (`scoreDataQuality`, lockstepped with the ETL by `fixtures/data-quality.json`), `status.ts`, `source.ts` (ridb_id prefix → source), `format.ts`, `geo.ts`, `api.ts` (`submitJson` for client → `/api`).
- **UI:** `lib/ui/ModalShell.svelte` (every modal), `ConfirmDialog.svelte`, `SegmentedControl.svelte`; global `.btn*` and `.form` styles in `app.css`.
- Pure TS under `lib/` uses **relative imports**; Vitest doesn't resolve `$lib`.

## Schema & auth

Schema lives in `backend/teenybase.ts`. Non-obvious parts:
- `users.role` (`'admin'` | null) is set **only by hand via sqlite**, never through an API (register mass-assigns fields).
- `facilities`: public read; `updateRule` is `'false'`. The ETL and admin-approved edits/merges write with the service token. `merged_ridb_ids` keeps the ETL from resurrecting merged duplicates.
- `edit_suggestions`, `merge_suggestions`, `campground_suggestions`: **all rules `'false'`**, accessed only by server routes with the service token. An approved campground becomes a facility with `ridb_id = "user-<id>"`; the ETL treats `user-`/`fs-`/`nps-` rows as absorb/enrich, never duplicate.
- `ratings` (auth create), `saved_campgrounds` (`auth.uid == user_id`), `alerts` (service-token write).

Auth uses httpOnly cookies (`cf_access`/`cf_refresh`); no token ever reaches client JS. `hooks.server.ts` decodes/refreshes the cookies into `locals.user`. Write routes derive `user_id` from `locals.user`, never from the client. **Admin gate:** `requireAdmin(locals)` (`lib/server/auth/admin.ts`) re-fetches the user with the service token and checks `role` on every call; all `/api/admin/*` routes and the `/admin` load call it first. The `role` returned by `/api/auth/me` is for display only.
