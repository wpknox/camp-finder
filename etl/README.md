# CampFinder ETL

Node/TypeScript scripts that sync campground data into Teenybase. See the
root `CLAUDE.md` and `docs/handoff.md` for project-level context.

## FCC cell-coverage data (`pnpm enrich-cell`)

1. Go to https://broadbandmap.fcc.gov/data-download → **By Provider** tab.
2. Pick the latest vintage. For each provider — **Verizon** (131425),
   **AT&T Mobility** (130077), **T-Mobile** (130403) — under Mobile Broadband,
   state **Colorado**, technology **4G LTE**, download
   **Hexagon Coverage - GeoPackage**. (The FCC dropped the plain H3 CSV option;
   the GeoPackage is a SQLite db with the same res-9 hex IDs in `h3_res9_id`.)
3. Extract outdoor-stationary hex IDs into the CSVs the script expects
   (`etl/data/fcc/` is gitignored — files are large):

   ```sh
   # per file: att / verizon / tmobile ↔ its bdc_08_<providerid>_*.gpkg
   tbl=$(sqlite3 "$f" "SELECT table_name FROM gpkg_contents LIMIT 1;")
   { echo "h3_res9_id"; sqlite3 "$f" \
     "SELECT DISTINCT h3_res9_id FROM $tbl;"; } \
     > etl/data/fcc/<carrier>.csv
   ```

   Do NOT filter on `environmnt` — each hex appears under exactly one value
   (1 = covered even in-vehicle, 0 = outdoor-only fringe), so covered
   outdoors = the union of both. Filtering to 0 keeps only fringe hexes and
   wrongly marks metro areas as uncovered.
4. Run `pnpm enrich-cell --as-of YYYY-MM` (the vintage from step 2).

Carriers listed in a facility's `cell_coverage.user_edited` came from
admin-approved user reports and are never overwritten. FCC refreshes data
roughly twice a year — rerun then.
