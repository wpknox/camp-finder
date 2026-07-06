# App review notes — 2026-07-04 (Fable)

Things to consider — none are urgent for a local side project, roughly ordered by how much they'd bite later.

## Potential future problems

1. **Merges are irreversible and un-resurrectable — by design, twice over.** An approved merge deletes the loser facility, and `merged_ridb_ids` deliberately blocks the ETL from ever recreating it. One admin misclick = permanent data loss with no undo. Cheap fix: before deleting the loser, store its full record as a JSON snapshot on the merge_suggestions row (`loser_snapshot` column). That gives you a manual undo path and an audit trail for free.

2. **"Fetch all + filter in JS" is load-bearing everywhere** (facilities bbox search, admin queues fetch all 10k-limit facilities *and all users*, compound-WHERE workarounds). Fine at ~592 CO records; becomes slow and expensive (D1 bills per row read) if you ever seed more states. Not worth fixing now, but it's the first wall you'll hit on expansion — and it's really a Teenybase query-language limitation, which feeds into #3.

3. **Teenybase pre-alpha exposure keeps growing.** You've already worked around: no compound WHERE, JSON stringify quirk, register mass-assignment (a real security hole), FK cascade surprises, auth omitting custom fields. The schema is plain SQLite, so an eventual escape hatch (thin hand-rolled Worker over D1) is very feasible — worth keeping in mind as the point solutions accumulate rather than adding more workaround layers.

4. **String-interpolated WHERE clauses** in server code (`where: \`facility_id == '${loserId}'\``). Today the interpolated values are DB-sourced ids, so it's safe, but it's an injection footgun the first time someone interpolates a request-body value. A tiny `tbWhere(field, value)` helper that validates/escapes would close it permanently.

5. **`{@html facility.description}`** in DetailPanel renders scraped/ETL HTML. Edit suggestions can't touch description (verified: whitelist is fees/seasons/amenities), so the only source is fs.usda.gov/RIDB — low risk, but it's third-party HTML rendered raw. Sanitizing at ETL-write time (strip to a tag whitelist) would make it a non-issue forever.

6. **Deployment blockers already in handoff remain the big ones**: publicly reachable TB Worker = self-service `role: admin` via register, plus `ratings.listRule` privacy. Nothing new found there.

## UI — is it unique? Can it improve?

The "Folded Field Map" identity is genuinely distinctive — USGS topo basemap, paper textures, Fraunces + mono type. It doesn't read as a Tailwind template, and the FCFS-first framing is a real differentiator no competitor (Campendium, freecampsites.net, recreation.gov) leads with. Keep leaning on that: FCFS is the product.

Ideas worth considering (lightweight → larger):
- **Marker clustering or zoom-dependent decluttering** — 592 pins overlap badly in dense areas (Front Range). `Leaflet.markercluster` styled as paper badges would fit the identity.
- **"Open now" seasonal cue** — you have `season_start/end`; a subtle "likely closed for season" tint on pins/detail in winter months would be uniquely useful for FCFS trip planning.
- **Shareable state** — `?facility=` deep link exists; adding bbox+filters to the URL makes "here's my shortlist" shareable, cheap win.
- **Compare view is the sleeper feature** — surfacing "Compare" more prominently from the sidebar list (not just the detail panel) could make it the habit loop.
- **PWA offline shell** — you call it a PWA; caching the last search's facilities + tiles for offline use in no-signal forest areas would be the killer feature for the actual use case. Bigger lift; consider after deployment.

## Explicitly NOT recommending
- Reactive map search (explicit is right), auth rework, backend swap right now, or any redesign. The design pass landed well.
