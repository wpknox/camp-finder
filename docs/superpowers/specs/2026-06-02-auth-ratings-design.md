# Auth + Ratings Design

**Status:** Approved — ready for implementation planning
**Date:** 2026-06-02

## Goal

Turn CampFinder's half-built auth and ratings into a working, secure account
system. A guest can browse and read; a logged-in user can save campgrounds and
leave reviews tied to their account. Login is a modal; account management gets a
dedicated `/account` page. Reading/writing reviews moves into a dedicated modal
instead of living inline in the detail panel.

This pass also **fixes a currently-broken registration flow** (see Findings) and
hardens the security model.

## Findings (from probing the running backend)

1. **Registration is broken today.** Teenybase `users` sign-up requires
   `username` (`^[a-zA-Z][a-zA-Z0-9_]*$`, ≤32 chars) **and** `name` (NOT NULL),
   plus `email`, `password`, `passwordConfirm`. The current `authStore.register`
   only sends `email`/`password`, so every sign-up 400s.
2. **Teenybase returns the session in the JSON body** — `{ token, refresh_token,
   record, verified }` — with **no `Set-Cookie`**, despite the `authCookie`
   config. This is ideal for our model: the SvelteKit proxy wraps the returned
   token in its own httpOnly cookies and has full control.
3. **A `refresh_token` and `/refresh-token` endpoint exist**; access tokens live
   1 hour. Enables silent server-side refresh instead of hourly re-login.
4. `login-password` accepts **either email or username** as `identity` (verified)
   — so login-by-email works while `username` stays hidden.
5. Bonus endpoints exist but are **out of scope** (no email delivery wired up):
   `request-password-reset`, `confirm-password-reset`, `request-verification`,
   `confirm-verification`, `change-password`, `google-login`, `oauth/:provider`.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Session/token security | **httpOnly cookie + server proxy** — token never in client JS; `user_id` derived server-side |
| 2 | Session lifetime | **Access + refresh cookies**, silent refresh in `hooks.server.ts` |
| 3 | Auth UI surface | **Modal login/register + `/account` page**, fully mobile-friendly |
| 4 | Reviews UX | Detail panel = **compact summary**; **modal** holds full list + write/edit form |
| 5 | Review identity | **One review per user per campground**, editable (upsert), DB-enforced |
| 6 | Account hardening | **Pragmatic baseline** — password rules, enumeration guard, rate limiting; **no** email verification |
| 7 | Access model | **Guest = read-only**; write/save/account = logged-in only |

## Architecture

The browser never holds a token. Identity lives in two httpOnly cookies;
SvelteKit server routes are the only thing that talks to Teenybase with a Bearer
token.

```
┌─ Browser (Svelte) ──────────────────────────────────────────┐
│  • No token in JS. Auth state = a `user` object              │
│    (id, name, username, email) hydrated from the server.     │
│  • Calls SvelteKit routes with credentials: 'include'.       │
└───────────────┬──────────────────────────────────────────────┘
                │  httpOnly cookies: cf_access (1h), cf_refresh (30d)
┌───────────────▼─ SvelteKit server (+server.ts, hooks) ───────┐
│  • hooks.server.ts: read cf_access → locals.user;            │
│    if expired, silent /refresh-token → reset cookies.        │
│  • /api/auth/*  → proxy login/register/logout/me             │
│  • /api/saved, /api/ratings → derive user_id from locals,    │
│    attach Bearer from cookie, never trust client user_id.    │
└───────────────┬──────────────────────────────────────────────┘
                │  Authorization: Bearer <token from cookie>
┌───────────────▼─ Teenybase (Workers + D1) ──────────────────┐
│  • Auth endpoints, ratings/saved tables with RLS rules.      │
└──────────────────────────────────────────────────────────────┘
```

### Capability matrix (enforced in UI **and** server-side)

| Action | Guest | Logged in |
|---|---|---|
| View map, search, filter, compare | ✅ | ✅ |
| Open detail panel; FCFS/amenities/alerts | ✅ | ✅ |
| **Read** reviews (open reviews modal) | ✅ | ✅ |
| Write/edit/delete a review | 🔒 → login modal | ✅ |
| Save campground (+ notes) | 🔒 → login modal | ✅ |
| `/account` page | 🔒 → redirect home | ✅ |

### Privileged-write request flow (e.g. submit review)

Client POSTs to `/api/ratings/[facilityId]` with `credentials: 'include'` and
**no `user_id`** → hook has populated `locals.user` from `cf_access` → route uses
`locals.user.id` as `user_id` and the cookie's token as the Bearer → Teenybase.
A logged-out request has no `locals.user` → route returns 401 → UI opens the
login modal.

## Backend schema changes (`backend/teenybase.ts`)

Both require `pnpm generate && pnpm migrate`.

1. **Composite unique constraint** on `ratings(user_id, facility_id)` — makes
   "edit your review" a true upsert and prevents duplicate rows at the DB level.
2. **Tighten `ratings` create rule** to pin ownership (defense-in-depth on top of
   the server route):

   ```
   createRule: "auth.uid != null"   →   "auth.uid == user_id"
   updateRule: "auth.uid == user_id"  (unchanged)
   deleteRule: "auth.uid == user_id"  (unchanged)
   listRule / viewRule: "true"        (unchanged — public read)
   ```

3. **No change** to `saved_campgrounds` rules (already correctly scoped to
   `auth.uid == user_id`). The broken client compound-`&&` WHERE is fixed by
   moving the query server-side.
4. **No change** to the `users` table — it already has `username`, `name`,
   `email`, `email_verified`, `role`, `meta`. We just send `username` + `name`
   on sign-up (the current bug).

## SvelteKit server layer

### `src/hooks.server.ts` (new) — runs every request

```
1. Read cf_access cookie.
2. If present & valid → decode → locals.user = { id, name, username, email }
3. Else if cf_refresh present:
     POST Teenybase /refresh-token → new {token, refresh_token}
     → re-set both httpOnly cookies → locals.user = record
4. Else → locals.user = null (guest)
```

### Auth proxy routes (`src/routes/api/auth/...`) — only place cookies are written

| Route | Method | Behavior |
|---|---|---|
| `/api/auth/register` | POST | Validate input → derive `username` → TB `sign-up` then `login-password` → set cookies → return safe `record` |
| `/api/auth/login` | POST | Rate-limit → TB `login-password` → set cookies → return `record` |
| `/api/auth/logout` | POST | TB `logout` (best-effort) → clear both cookies |
| `/api/auth/me` | GET | Return `locals.user` (or null) for client hydration |

### Privileged write proxies — identity from `locals`, never the body

| Route | Replaces | Notes |
|---|---|---|
| `/api/ratings/[facilityId]` POST | existing (trusts body `user_id`) | **Upsert**: find existing row for `(locals.user.id, facilityId)`; edit if present else insert. `user_id` from `locals.user.id`. |
| `/api/ratings/[facilityId]` DELETE | — | Delete own review. |
| `/api/saved` GET/POST/DELETE | direct client TB calls in `SaveButton` | List/toggle saves for `locals.user`; fixes broken compound-WHERE. |

### `src/routes/+layout.server.ts` (new)

Exposes `locals.user` to all pages so the nav knows login state on first paint
(no flash of logged-out state).

### Username derivation (server-side, on register)

Teenybase `username` must match `^[a-zA-Z][a-zA-Z0-9_]*$`, ≤32 chars, and be
unique. The user never sees it. Derive from the email local-part (or display
name): lowercase, strip to `[a-z0-9_]`, ensure it starts with a letter, truncate
to leave room, append a short random suffix (e.g. `_a3f9`) for uniqueness. The
public-facing identity on reviews is the **display name** (`name`), not the
username.

### Validation & safety

- Password ≥ 8 chars; confirm must match; valid email format — validated in
  `/register` before hitting Teenybase.
- **Generic auth errors**: login/register failures return
  `"Invalid email or password"` (never "email taken") to prevent enumeration.
- **Rate limiting**: in-memory sliding window per-IP on `/login` + `/register`
  (e.g. 10 attempts / 15 min). *Follow-up note:* in-memory is fine for
  single-instance dev; production on Workers should back this with KV or a
  Durable Object.
- Route-param / `where` values validated before interpolation — no injection
  into Teenybase `where` clauses.
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax`, scoped `path=/`.

## Client & UI components

### `src/routes/+layout.svelte` (reworked) — top nav

```
┌────────────────────────────────────────────────────────────┐
│  🏕 CampFinder                       [ Account ▾ ] / [Sign in]│
└────────────────────────────────────────────────────────────┘
│  sidebar │            map                                    │
```

- Guest → "Sign in" (opens AuthModal).
- Logged in → "Account ▾" → *My account* (`/account`), *Sign out*.
- Mobile (<640px): nav collapses to a compact account icon; small height so the
  map stays dominant.

### `authStore.ts` (rewritten)

No token. Holds only `user: { id, name, username, email } | null`, hydrated from
`+layout.server.ts` data / `/api/auth/me`. Methods `login`, `register`, `logout`,
`refresh()` all call the SvelteKit `/api/auth/*` routes with
`credentials: 'include'`. `isLoggedIn` / `currentUser` derived stores remain.

### `AuthModal.svelte` (reworked)

- Register: Email, Display name, Password, Confirm.
- Login: Email, Password.
- Inline validation (length, match), generic error display, loading state,
  mobile sizing. Callback props `onclose` + `onsuccess` (so the triggering
  action can resume after login).

### `/account/+page.svelte` + `+page.server.ts` (new) — guarded (guests redirected)

```
My Account
  Display name: Alex    Email: alex@…           [ Sign out ]
─ Saved campgrounds (N) ───────────────────────
  • Moraine Park CG      [view on map] [remove]
  • Gates of Lodore CG   [view on map] [remove]
─ My reviews (N) ──────────────────────────────
  ★★★★☆  Piñon Flats — "…"   [edit] [delete]
```

"View on map" navigates home and flies to the facility. Mobile: sections stack.

### `detail/RatingsSection.svelte` (reworked → compact summary)

Shows `★ 4.2 (12)` + most-recent snippet + a "See all reviews" button (guest and
authed) that opens the reviews modal. No inline form.

### `detail/ReviewsModal.svelte` (new)

- Scrollable full review list + write/edit area.
- Guest: list only; "Write a review" → close modal, open AuthModal.
- Logged in, no review yet: write form (stars, visited date, notes).
- Logged in, already reviewed: their review pinned on top with Edit/Delete; form
  pre-fills on edit (upsert).
- Full-screen on mobile, centered card on desktop.

### `saved/SaveButton.svelte` (reworked)

Calls `/api/saved` (server proxy) instead of Teenybase directly; opens AuthModal
when guest. Fixes the broken compound-WHERE.

### `ConfirmDialog.svelte` (new) — destructive-action confirmation

Small reusable dialog (Cancel / Confirm), focus-trapped, Escape = cancel.
Used for:

- Removing a saved campground (`/account` + `SaveButton` un-save).
- Deleting a review (reviews modal + `/account`).

Copy e.g. *"Remove Moraine Park Campground from your saved list?"* /
*"Delete your review of Piñon Flats? This can't be undone."*

## Error handling

- **Auth failure** → generic `"Invalid email or password"` (no enumeration);
  validation errors are specific and inline.
- **Rate-limited** → 429 → *"Too many attempts, try again in a few minutes."*
- **Expired session mid-action** → hook attempts silent refresh; if the refresh
  token is also dead → privileged route returns 401 → UI opens login modal and
  resumes the action via `onsuccess` where possible.
- **Teenybase 5xx / down** → user-facing *"Something went wrong, please try
  again"*; never expose raw TB errors or `where`/SQL.
- **Write failure (save/review)** → optimistic UI rolls back; inline/toast error.

## Testing

- **Unit (vitest, frontend / `lib/server`)**: username derivation (charset,
  length, uniqueness suffix), input validators (password, email), rate-limiter
  window, upsert-decision (insert vs edit).
- **Server route tests**: mock Teenybase fetch; assert cookies set
  httpOnly/Secure/SameSite; assert `user_id` comes from `locals` and a spoofed
  body `user_id` is ignored; assert generic error mapping.
- **Manual / Playwright E2E** (as with the search UX): register → cookies set, no
  token in `localStorage`; logged-out save/review → login modal; review upsert
  (write then edit = one row); delete/remove → confirm dialog; guest can read but
  not write reviews; `/account` redirects guests; mobile viewport check (nav +
  modal + account page).
- **Security spot-checks**: `document.cookie` does **not** expose
  `cf_access`/`cf_refresh`; a crafted POST with a fake `user_id` is rejected by
  both the route and the DB rule.

## Out of scope (future)

- Email verification & password reset (endpoints exist; need email delivery).
- OAuth / Google login (endpoints exist).
- KV/Durable-Object-backed rate limiter for production.
- Account deletion / data export.
