# Code-reuse refactor — sweep findings & plan

Goal (owner): easy-to-read, easy-to-use code; stop re-making the same thing. Findings come from a read-only sweep on 2026-10-07 (greps across `frontend/src` + `etl/src`). **Nothing below is implemented yet.** Branch: `chore/code-reuse-refactor` (from `main` after PR #4).

Already done in PR #4 as the pattern to copy: `frontend/src/lib/admin/` (`QueueSection`, `ReviewCard`, `PasswordResetCard`, `types.ts`) replaced four copy-pasted queue sections in `routes/admin/+page.svelte`.

Suggested order (one commit per item; keep `pnpm check` 0/0 and `pnpm test` green at each step):

## A. Server routes (lowest risk, includes a bug fix) — do first

1. **One service-token helper.** `lib/server/admin/tb.ts` already exports `tbHeaders`, `tb()`, `tbList()`. Yet `api/suggestions`, `api/deletions`, `api/duplicates`, `api/campground-suggestions`, `api/alerts/[id]`, `api/nearby/[id]` and `lib/server/auth/{admin,users}.ts` each rebuild `Bearer ${TB_SERVICE_TOKEN}` headers. Move to a single `lib/server/tb.ts` (keep the "why service token" comment) and import it everywhere.
2. **`parseJson<T>(v, fallback)`** is copy-pasted in `api/admin/merges` and `api/admin/suggestions`, with variants in `api/admin/campground-suggestions`, `api/nearby/[id]`, `compare/+page.server.ts`. One shared helper.
3. **`parseFacility()`** — turning a raw facility row into a `Facility` (parse `amenities` + `cell_coverage` JSON strings) is hand-written in `api/facilities`, `api/facilities/[id]`, `compare/+page.server.ts`, and the admin routes. One function.
4. **🐞 Likely bug:** `api/facilities/[id]/+server.ts` and `compare/+page.server.ts` do **not** filter `is_deleted` (only the bbox route does), so a tombstoned campground can still be fetched by id / shown in Compare. Reproduce first, then fix via a shared "public facility" helper so the filter can't be forgotten. Add a test.
5. **Admin GET joins:** the four `api/admin/*` list routes all fetch rows, join facilities + users in memory, and attach `user_email` / `facility_name`. Extract a join helper (this is also where the "submitter attribution" wishlist item would naturally land).

## B. Frontend forms/modals (biggest payoff)

6. **`ModalShell.svelte`** — `AuthModal`, `SuggestEditModal`, `ReportDuplicateModal`, `FlagDeletionModal`, `SubmitCampgroundModal`, `ReviewsModal`, `ConfirmDialog` each re-declare overlay, card, `modal-in` animation, Escape/click-outside, `.primary`, `.cancel`, `.spinner`, `.field-error` (~70 CSS lines each). Shell owns overlay/card/close/eyebrow/title; shared button + field-error classes go in `app.css` (the admin components, modals and `CampgroundForm` each restyle `.primary`/`.cancel` today).
7. **`submitJson(url, body)`** in `lib/api.ts` returning `{ ok, status, data, error }` — replaces the `submitting` / `errorMsg` / `fetch(... credentials: 'include')` / `?? 'Something went wrong'` block (14 `credentials` sites, 9 error-line copies; `admin/+page.svelte` has its own variants too).
8. **`SegmentedControl.svelte`** (`options`, `bind:value`) + one exported `triState()`. Today: `SuggestEditModal` hand-writes three buttons per amenity and per carrier plus its own `triState()`; `CampgroundForm` loops; `campgroundSubmission.ts` has another `triState()`; the Toilets selector added in PR #4 is the same markup in both forms. Consider having `SuggestEditModal` reuse `CampgroundForm`'s amenity section.

## C. Smaller duplicates

9. **`lib/geo.ts`** — haversine exists 3× (`campgroundSubmission.ts` km, `server/overpass.ts` meters, private copy in `ReportDuplicateModal`).
10. **Date formatting** — `fmtDate` in admin page + ad-hoc `toLocaleDateString` in `AlertsSection` / `WeatherStrip` → `lib/format.ts`.
11. **`admin/+page.svelte` (~1150 lines)** — extract `MergeComparison.svelte` (~150 markup + ~120 CSS lines) and `EditDiff.svelte`; page becomes wiring only.
12. **ETL ↔ frontend copies** (`scoreDataQuality`, default amenities object, "MUST stay in lockstep"): don't build a shared package; add a fixture-based test in each package instead.

## Not worth changing
- Teenybase quirks (stringified JSON writes, no compound WHERE) are documented in `CLAUDE.md` and each route already has one workaround; wrapping further hides them.
- Not yet examined: `FilterSidebar.svelte` (505 lines), `DetailPanel.svelte` (376), `routes/account/+page.svelte` (336), ETL scripts (ETL is already small pure functions). Sweep these before deciding.

## Ground rules
- Svelte 5 runes only (see `CLAUDE.md`); follow `docs/design-language.md` for any UI touched.
- Behavior-preserving except item 4. Verify UI refactors in a browser (Playwright) — the PR #4 admin refactor passed `pnpm check`/tests but was never eyeballed.
- Reuse existing `$derived` values; don't hardcode what's already in scope.
