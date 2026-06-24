# CampFinder

A map-first PWA for discovering and comparing **Colorado** National Forest (and Park Service) campgrounds — with a focus on **first-come, first-serve (FCFS)** availability, amenities, and ease of use on both desktop and mobile.

The USDA Forest Service site (`fs.usda.gov`) has rich campground data but poor discoverability: you have to already know a campground's name to find it. CampFinder surfaces the same data (sourced from RIDB, fs.usda.gov, and the NPS API) in a usable, map-driven UI — pan to an area, search it, and compare campgrounds side by side. ~592 Colorado campgrounds are currently seeded.

The whole app wears the **"Folded Field Map"** visual identity — an earthy, paper-topographic look (USGS Topo basemap, muted pigment palette, Fraunces/Hanken/JetBrains Mono type) so it reads like a handheld field map rather than a computer map. See `docs/design-language.md`.

## Features

- **Map-first search** — the map *is* the interface. Pan/zoom and hit **"Search this area"** (an explicit trigger, not auto-querying) to drop campground pins.
- **FCFS breakdown** — per-campground totals: FCFS count, reservable count, and fully/partially-FCFS flags, derived at the campsite level.
- **Amenity grid** — glanceable icons for water, toilets, bear boxes, drive-up, max RV length, pets, hookups, and more.
- **Detail panel** — fees, official `fs.usda.gov` links, and on-demand alert scraping (road closures, fire restrictions) cached for 24h.
- **Data-quality warnings** — sparse RIDB records are flagged with a prompt to check the official page.
- **Filter & sort** — FCFS-only, amenities, fee range, max RV length; sort by rating, fee, or FCFS count.
- **Compare view** — URL-shareable side-by-side comparison (`/compare?ids=...`).
- **Auth & saved campgrounds** — httpOnly-cookie based auth; authenticated users can save favorites.
- **Crowdsourced ratings** — user-submitted 1–5 scores.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | SvelteKit (Svelte 5 runes) + vanilla Leaflet + OpenStreetMap tiles |
| Backend / DB | [Teenybase](https://github.com/) (Cloudflare Workers + D1 / SQLite at the edge) |
| ETL | Node / TypeScript |
| Map tiles | USGS Topo basemap (OpenTopoMap fallback) + OpenStreetMap |
| Data sources | RIDB API (`ridb.recreation.gov`), `fs.usda.gov` scrape, NPS API |
| Hosting | Cloudflare Pages + Workers + D1 |

## Repository Structure

```
camp-finder/
  frontend/          # SvelteKit app (Cloudflare Pages)
  backend/           # Teenybase project (Cloudflare Workers + D1)
  etl/               # RIDB sync / fs.usda.gov scrape / NPS sync (Node/TypeScript)
  campfinder-spec.md # Full brainstorm spec (data models, UI/UX, build order)
  docs/handoff.md    # Project status & session history
```

## Getting Started

This is a pnpm workspace. Install everything from the repo root:

```bash
pnpm install
```

Then run each package as needed:

| Where | Command | Purpose |
|---|---|---|
| `frontend/` | `pnpm dev` | SvelteKit app on `:5173` |
| `frontend/` | `pnpm check` | svelte-check |
| `frontend/` | `pnpm test` | Vitest |
| `backend/` | `pnpm dev` | Teenybase (Workers + D1) on `:8787` |
| `backend/` | `pnpm generate && pnpm migrate` | Regenerate + apply SQL migrations after schema changes |
| `etl/` | `pnpm sync` | RIDB → normalize → Teenybase (~270 CO facilities) |
| `etl/` | `pnpm discover` | `fs.usda.gov` scrape (FCFS-only campgrounds not in RIDB) |
| `etl/` | `pnpm sync-nps` | NPS API sync (8 CO parks; idempotent, dedupes) |
| `etl/` | `pnpm test` | Vitest (ETL normalize/scrape tests) |

### Environment

The RIDB API key and Teenybase service token are kept **server-side only** (`.dev.vars` / `.prod.vars`) and never exposed to client bundles. All RIDB calls and privileged writes are proxied through SvelteKit server routes. See `docs/handoff.md` for env-file setup.

## Architecture Notes

- **RIDB key stays server-side** — proxied through SvelteKit `+server.ts` routes for caching and secrecy.
- **FCFS lives at the campsite level** — the ETL aggregates `GET /facilities/{id}/campsites` into facility-level counts.
- **Amenities are normalized at ETL time** into a fixed JSON schema; unknown fields default to `null`/`"unknown"`.
- **Alerts are on-demand scraped**, not synced — cached in the `alerts` table, refreshed if older than 24h.
- **Auth is httpOnly-cookie based** — no token ever reaches client JS; server routes derive `user_id` from session.

See [`CLAUDE.md`](./CLAUDE.md) and [`campfinder-spec.md`](./campfinder-spec.md) for the full design rationale.

## Status

Experimental side project. See `docs/handoff.md` for current status and session history.
