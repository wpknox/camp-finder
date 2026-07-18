# PR #3 rollout — exact steps after code review

Do these **in order** once you've approved the code on PR #3
(`feat/post-launch-features`). Order matters: `main` auto-deploys the
frontend, and the new frontend 500s against the old backend schema.

## 1. Deploy the backend schema (BEFORE merging)

The branch adds `nearby_pois` (table) and `facilities.cell_coverage` +
`facilities.elevation_m` (columns). Prod deploy has the X-TB-Key
settings-sync quirk (see handoff 2026-07-07):

```sh
cd backend
npx wrangler secret delete TB_SHARED_SECRET   # unblock teeny's settings sync
pnpm deploy                                    # teeny deploy --remote (needs .prod.vars)
pnpm secrets-upload                            # restore the X-TB-Key guard
```

Verify with a **real request**, not the migration ledger (teeny's ledger can
say yes while the table is missing):

```sh
curl -s -H "X-TB-Key: $TB_SHARED_SECRET" \
  "https://backend.misty-cell-863d.workers.dev/api/v1/table/nearby_pois/list?limit=1"
# want: JSON (even empty), NOT "Table not found"
```

## 2. Run both enrichments against prod

Edit `etl/.env` to point at prod (values from your secrets worksheet):

```
TB_API_URL=https://backend.misty-cell-863d.workers.dev
TB_SERVICE_TOKEN=<prod service token>
TB_SHARED_SECRET=<prod X-TB-Key secret>
```

Then:

```sh
cd etl
pnpm enrich-elevation            # Open-Meteo, keyless, idempotent
pnpm enrich-cell --as-of 2025-12 # uses etl/data/fcc/*.csv already on this machine
```

Notes:
- The FCC CSVs are already extracted in `etl/data/fcc/` (gitignored). If they
  are ever lost, re-extract from `~/Downloads/bdc_08_*.gpkg` per the runbook
  in `etl/README.md` — and do NOT filter on `environmnt` (see handoff
  2026-07-17: coverage is the union of both values).
- Expect ~649 facilities in prod (local has 588). Both scripts are idempotent
  and `enrich-cell` never overwrites camper-reported (`user_edited`) carriers.
- **Afterward, restore the local values in `etl/.env`** so a future local run
  doesn't hit prod by accident.

## 3. Merge PR #3

Merge on GitHub → Cloudflare Pages auto-builds and deploys `main`.
(If the merge is blocked by "Cannot update the protected ref", see handoff
2026-07-11: ruleset 18509008 should only have `deletion` + `non_fast_forward`.)

## 4. Smoke-check prod (camp-finder.pages.dev)

- [ ] Detail panel on a Denver-area park (e.g. Cherry Creek State Park):
      elevation in the header, 7-day weather strip, Cell Signal shows all
      three carriers ● with "as of 2025-12", divider before the Overview text.
- [ ] "Has Cell Service" filter: tick it after a search — count should drop
      to very roughly a third; a metro park stays, deep-wilderness ones drop.
- [ ] Get directions links (Google everywhere; Apple too if you're on iOS).
- [ ] Things Nearby section populates on a detail panel (first open may take
      a few seconds — Overpass on cache miss; section hiding entirely means
      Overpass failed, just retry later).
- [ ] Compare view: Elevation and Cell Signal rows render.
- [ ] Mobile width: sidebar filter collapse still opens/closes cleanly with
      the new checkbox.

## 5. Tidy up

- Delete `~/Downloads/bdc_us_*_supporting_data_*` folders (wrong FCC files,
  useless). Keep the three `bdc_08_*.gpkg` only if you want to re-extract
  without re-downloading.
- FCC refreshes data ~twice a year — around **Jan and Jul 2027** re-run the
  `etl/README.md` runbook with the new vintage.
