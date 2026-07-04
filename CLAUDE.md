# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CampFinder is a map-first web app for discovering and comparing National Forest campgrounds. The core value prop is surfacing first-come, first-serve (FCFS) availability and amenity data from RIDB in a usable UI — the USDA Forest Service website (`fs.usda.gov`) has the data but terrible discoverability.

See `campfinder-spec.md` for the full brainstorm spec including data models, UI/UX notes, build order, and open questions.

## Package Manager

pnpm with workspaces. Root `pnpm-workspace.yaml` covers `frontend/`, `backend/`, `etl/`. Run `pnpm install` from the repo root to install all packages at once.

## Commands

| Where | Command | Purpose |
|---|---|---|
| `frontend/` | `pnpm dev` | SvelteKit app on :5173 |
| `frontend/` | `pnpm check` / `pnpm test` | svelte-check (0/0 expected) / Vitest |
| `backend/` | `pnpm dev` | Teenybase (Workers+D1) on :8787 |
| `backend/` | `pnpm generate && pnpm migrate` | Regenerate + apply SQL migrations after schema changes |
| `etl/` | `pnpm sync` / `pnpm discover` / `pnpm sync-nps` | RIDB sync / fs.usda.gov scrape / NPS API sync |
| `etl/` | `pnpm test` | Vitest (ETL normalize/scrape tests) |

See `docs/handoff.md` for current project status, env-file setup, and session history.

## Planned Stack

| Layer | Technology |
|---|---|
| Frontend | SvelteKit + vanilla Leaflet + OpenStreetMap tiles |
| Backend / DB | Teenybase (Cloudflare Workers + D1 / SQLite at the edge) |
| ETL | Node/TypeScript script |
| Map tiles | OpenStreetMap (free) + USGS Topo WMS (toggleable) |
| Primary data | RIDB API (`ridb.recreation.gov/api/v1/`) |
| Scraped data | `fs.usda.gov` (on-demand, alerts only) |

Teenybase was chosen over PocketBase because this is a side project with no production pressure. Everything runs on Cloudflare (Pages + Workers + D1), the free tier is generous, and no VPS is required. The tradeoff is that Teenybase is pre-alpha (v0.0.x) — API instability is acceptable for an experimental project.

## Repository Structure (Planned)

```
camp-finder/
  frontend/          # SvelteKit app (Cloudflare Pages)
  backend/           # Teenybase project (Cloudflare Workers + D1)
  etl/               # RIDB sync script (Node/TypeScript)
  campfinder-spec.md
```

## Key Architectural Decisions

### RIDB API key stays server-side
All RIDB calls go through a SvelteKit server route (`+server.ts`) to proxy requests. This keeps the API key out of client bundles and allows caching headers to be set.

### FCFS data lives at campsite level, not facility level
RIDB stores reservability per-campsite. The ETL must call `GET /facilities/{id}/campsites` and aggregate:
- `fcfs_total` = count where `CampsiteReservable == false`
- `reservable_total` = count where `CampsiteReservable == true`
- `is_fully_fcfs` / `is_partial_fcfs` flags derived from counts

### Amenities are normalized at ETL time
RIDB amenity field names are inconsistent across forests. The ETL normalizes everything into a fixed JSON schema (see `campfinder-spec.md` → Amenities JSON Schema). Unknown fields default to `null`/`"unknown"` rather than being omitted.

### Svelte 5 runes — mandatory, no legacy syntax
All `.svelte` files use Svelte 5 syntax; never Svelte 4 patterns.
- State: `let x = $state(0)` — not `let x = 0`
- Props: `let { prop } = $props()` — not `export let prop`
- Derived: `let y = $derived(x * 2)` — not `$: y = x * 2`
- Effects: `$effect(() => { ... })` — not `$: { ... }`
- Events: `onclick={fn}` — not `on:click={fn}`
- Slots: `{@render children()}` — not `<slot />`
- Event dispatch: callback props (`onclose`, `onselect`) — not `createEventDispatcher`

### No PocketBase anywhere
The project switched from PocketBase to Teenybase early on. Zero PocketBase SDK usage — all backend calls are plain `fetch()` to the Teenybase REST API.

### Map marker colors (single source: `CampMap.renderPins`)
🔴 Closed · 🟢 Fully FCFS · 🟡 Partial FCFS · 🔵 Reservable only. Keep sidebar dots/badges in lockstep with marker colors.

### Teenybase quirks (do not deviate)
- **JSON fields must be stringified on write** (`JSON.stringify(amenities)`) and parsed on read. Sending a plain object 400s.
- **No compound WHERE** — `&&`/`AND` both fail with parse errors. Fetch with a high `limit` and filter in the SvelteKit server route (fine at ~592 records). See `frontend/src/routes/api/facilities/+server.ts`.

### Alerts are on-demand scraped, not synced
`fs.usda.gov` alerts (road closures, fire restrictions) are scraped only when a user opens a campground detail panel — via a SvelteKit server route. Results are cached in the Teenybase `alerts` table; refresh if `scraped_at` is older than 24 hours. Fail gracefully: if the scrape errors, show a message rather than blocking the panel.

### Map search is explicit, not reactive
The "Search this area" button is a deliberate user trigger — the map does not auto-query on pan/zoom. This reduces API load and matches intentional use.

### Data quality warning
If a facility's `ridb_data_quality == "sparse"` (heuristic: amenities JSON has fewer than 5 fields populated), show a visible warning in the detail panel and prompt the user to check the official `fs.usda.gov` page.

## Teenybase Tables

Defined in `backend/teenybase.ts` — the single source of truth for the entire backend schema.

- `users` — auth table with email/password + JWT, plus a nullable `role` text column (`'admin'` | null). Row-level security: users can only read/update their own record. **`role` is promoted manually via sqlite, never through any API** — Teenybase register mass-assigns fields, so the role is never trusted from the JWT/cookie (see `requireAdmin` below).
- `facilities` — normalized campground records synced from RIDB (includes `amenities` JSON, FCFS counts, `ridb_data_quality`, and `merged_ridb_ids` — a JSON array of ridb_ids absorbed by admin duplicate-merges so the ETL never resurrects them). Public read (`listRule: 'true'`); ETL writes via service token, and admin-approved crowdsourced edits/merges write via the service token through server routes (the table's `updateRule` stays `'false'`).
- `alerts` — scraped fs.usda.gov notices, keyed to facility, with `scraped_at` for 24hr cache invalidation. Public read; SvelteKit server route writes via service token.
- `ratings` — user-submitted 1–5 scores. Public read; auth required to create (`createRule: 'auth.uid != null'`).
- `saved_campgrounds` — authenticated user favorites. Private: all operations require `auth.uid == user_id`.
- `edit_suggestions` — crowdsourced facility-edit submissions (`changes` JSON patch, `status` pending|approved|rejected, reviewer fields). **ALL rules `'false'`** — every read/write goes through SvelteKit server routes using `TB_SERVICE_TOKEN` (Teenybase's rule language can't express role checks and can't do compound WHERE).
- `merge_suggestions` — user-flagged duplicate pairs (`facility_a`/`facility_b`, `status`, reviewer fields). **ALL rules `'false'`**, same service-token-only access pattern.

## Auth Pattern

Auth is **httpOnly-cookie based — no token is ever exposed to client JS**. SvelteKit server routes (`/api/auth/{register,login,logout,me}`) proxy Teenybase and set httpOnly `cf_access` + `cf_refresh` cookies; `hooks.server.ts` decodes `cf_access`, silently refreshes when expired, and populates `event.locals.user`. Privileged writes (save, rate) are proxied through server routes (`/api/saved`, `/api/ratings/[facilityId]`) that derive `user_id` from `locals.user` — never trusted from the client. The `TB_SERVICE_TOKEN` (from `.dev.vars` / `.prod.vars`) is used server-side only (ETL writes, alert cache writes, all suggestion/merge table access) and never exposed to the client.

### Admin gate — `requireAdmin` (server-side only)
`frontend/src/lib/server/auth/admin.ts` exports `requireAdmin(locals)`, the single trusted way to answer "is this an admin request?". It re-fetches `users/view/{id}` with `TB_SERVICE_TOKEN` and checks `role === 'admin'` on **every** call — the role is never carried in the JWT/cookie (Teenybase register mass-assigns fields, so a client-supplied role can't be trusted). Returns the admin record or throws `error(401)`/`error(403)`. All `/api/admin/*` routes and the `/admin` page `load` call it first. `/api/auth/me` surfaces `role` display-only so `AccountMenu` can show an Admin link — that is convenience, not a gate.

## Build Order

Development follows the phases in `campfinder-spec.md`:

1. **Phase 1** — ETL script: RIDB → normalize → Teenybase
2. **Phase 2** — SvelteKit scaffold, Leaflet map, "Search this area" → pins
3. **Phase 3** — Detail panel (FCFS, amenities, alerts scrape, links)
4. **Phase 4** — Filter/sort sidebar
5. **Phase 5** — Compare view (`/compare?ids=...`)
6. **Phase 6** — Auth + saved campgrounds
7. **Phase 7** — Crowdsourced ratings/reviews

## Open Questions (Unresolved at Project Start)

- Which National Forests to seed first (Colorado focus?)
- ETL language: Node/TypeScript vs C# console app
- Hosting: VPS (DigitalOcean/Hetzner) vs Cloudflare Pages + Workers
- Anonymous ratings in v1 or auth-required from the start?
- Mobile-first vs desktop-first initial design pass
