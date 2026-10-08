# CampFinder

A map-first PWA for discovering and comparing **Colorado** National Forest and Park Service campgrounds, built around **first-come, first-serve (FCFS)** availability. Live at https://camp-finder.pages.dev (invite-only sign-up).

`fs.usda.gov` has rich campground data but poor discoverability: you have to know a campground's name to find it. CampFinder pulls the same data (RIDB, fs.usda.gov, the NPS API, plus camper submissions) into a map UI. Pan to an area, search it, and compare campgrounds side by side. About 650 campgrounds are loaded.

The app wears the **"Folded Field Map"** identity: a USGS Topo basemap, a muted pigment palette and Fraunces/Hanken/JetBrains Mono type, so it reads like a paper field map (`docs/design-language.md`).

## Features

- **Map-first search:** an explicit "Search this area" trigger; pins are colored by FCFS status.
- **FCFS breakdown:** FCFS vs. reservable site counts, aggregated per campsite.
- **Detail panel:** amenities, fees, official links, elevation, a 7-day weather forecast, cell coverage by carrier (FCC data), things nearby (OpenStreetMap), directions, and on-demand fs.usda.gov alerts. Sparse records carry a data-quality warning.
- **Filter, sort, compare:** FCFS-only, amenities, fees, RV length and cell service filters; a shareable `/compare?ids=…` view.
- **Accounts:** saved campgrounds and 1–5 ratings.
- **Crowdsourcing:** suggest edits, report duplicates, flag deletions and submit missing campgrounds. Everything goes through the admin review queue at `/admin`.

## Stack

SvelteKit (Svelte 5) + Leaflet on Cloudflare Pages · [Teenybase](https://teenybase.com) (Cloudflare Workers + D1) · Node/TypeScript ETL. One pnpm workspace:

```
frontend/   SvelteKit app
backend/    Teenybase schema + Worker
etl/        RIDB / fs.usda.gov / NPS sync + elevation & cell enrichment
docs/       handoff.md (status), design-language.md
```

## Getting started

```bash
pnpm install                  # from the repo root
cd backend && pnpm dev        # Teenybase on :8787
cd frontend && pnpm dev       # app on :5173
cd etl && pnpm sync           # load RIDB data (also: discover, sync-nps)
```

Env-file setup is in `docs/handoff.md`. API keys and the service token stay server-side, and all privileged calls go through SvelteKit server routes. Contributor/agent guide with the full command list: [`CLAUDE.md`](./CLAUDE.md). Original spec: [`campfinder-spec.md`](./campfinder-spec.md).

## Status

Experimental side project, soft-launched. Current state and next steps: `docs/handoff.md`.
