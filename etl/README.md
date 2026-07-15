# CampFinder ETL

Node/TypeScript scripts that sync campground data into Teenybase. See the
root `CLAUDE.md` and `docs/handoff.md` for project-level context.

## FCC cell-coverage data (`pnpm enrich-cell`)

1. Go to https://broadbandmap.fcc.gov/data-download → **Mobile** → Coverage data.
2. Pick the latest vintage. For each provider — **Verizon**, **AT&T Mobility**,
   **T-Mobile** — download the Colorado **4G LTE Mobile Broadband** coverage file
   in the **H3 hexagon (resolution 9)** CSV format.
3. Unzip and save as `etl/data/fcc/verizon.csv`, `etl/data/fcc/att.csv`,
   `etl/data/fcc/tmobile.csv` (gitignored — files are large).
4. Run `pnpm enrich-cell --as-of YYYY-MM` (the vintage from step 2).

Carriers listed in a facility's `cell_coverage.user_edited` came from
admin-approved user reports and are never overwritten. FCC refreshes data
roughly twice a year — rerun then.
