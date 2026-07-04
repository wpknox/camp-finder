# Admin Moderation + Crowdsourced Edits & Duplicate Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin role + `/admin` review page, let signed-in users submit facility edit suggestions and duplicate-merge flags, and let an admin approve/reject them (approve = apply the edit / run the merge).

**Architecture:** Two new Teenybase tables (`edit_suggestions`, `merge_suggestions`) with all row rules locked to `false`; every read/write goes through SvelteKit server routes. User submissions use `locals.user` + service token (pattern: `api/alerts/[id]/+server.ts`). Admin actions are gated by a `requireAdmin()` helper that verifies `users.role == 'admin'` server-side via service token — **never** from a cookie or client claim. The merge engine repoints ratings/saves, unions data field-by-field, records the loser's `ridb_id` in `merged_ridb_ids` so ETL never resurrects it, then deletes the loser.

**Tech Stack:** SvelteKit (Svelte 5 runes only), Teenybase (Workers + D1), TypeScript, Vitest.

**User decisions (already made):**
- Admin page + admin-style account are in scope for this phase.
- Email verification is **deferred** (post-deployment); admin is promoted manually via sqlite.
- Instructions are written for Sonnet/Opus-level executor agents — follow the code as given; don't improvise architecture.

---

## Read before starting (executor context — do not skip)

1. **CLAUDE.md rules are hard constraints**, especially: Svelte 5 runes only; Teenybase JSON fields must be `JSON.stringify`-ed on write and parsed on read; **no compound `WHERE`** (`&&`/`AND`/`||` all fail to parse — fetch with high `limit` and filter in JS).
2. **Auth pattern:** httpOnly cookies; `hooks.server.ts` populates `event.locals.user`. Privileged writes derive `user_id` from `locals.user`. `TB_SERVICE_TOKEN` (private env) bypasses all table rules — server-side only.
3. **Design language:** any new UI must follow `docs/design-language.md` ("Folded Field Map"). Match existing components — `AuthModal.svelte` for modal/form styling and its per-field blur validation pattern, `ConfirmDialog.svelte` for confirms.
4. Backend schema lives ONLY in `backend/teenybase.ts`. After changing it: `cd backend && pnpm generate && pnpm migrate`.
5. Run `cd frontend && pnpm check` after every frontend task — 0 errors / 0 warnings expected.

---

### Task 0: Fix latent compound-WHERE bug in the alerts cache read

**Goal:** The alerts cache lookup uses `&&` in a Teenybase WHERE, which Teenybase rejects — so the 24 h cache never hits and every detail-panel open re-scrapes fs.usda.gov.

**Files:**
- Modify: `frontend/src/routes/api/alerts/[id]/+server.ts:19-28`

**Acceptance Criteria:**
- [ ] Cache query uses a single-condition WHERE; freshness is checked in JS.
- [ ] Second open of the same campground detail within 24 h returns `cached: true`.

**Verify:** `curl http://localhost:5173/api/alerts/<facility-id>` twice → second response has `"cached": true`.

**Steps:**

- [ ] **Step 1: Replace the compound WHERE with fetch + JS filter**

Replace lines 17–28 with:

```ts
export const GET: RequestHandler = async ({ params }) => {
  const facilityId = params.id
  const cutoff = Date.now() - CACHE_TTL_MS

  const cacheRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/alerts/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const cache = await cacheRes.json() as { items?: Array<{ content: string; scraped_at: string }> }
  const fresh = cache.items?.find(i => new Date(i.scraped_at).getTime() >= cutoff)

  if (fresh) {
    return json({ content: fresh.content, scraped_at: fresh.scraped_at, cached: true })
  }
```

(Everything below the cache check is unchanged.)

- [ ] **Step 2: Verify manually** — start backend + frontend, curl the route twice (use a facility id from the list curl in `docs/handoff.md`). First: `"cached": false`; second: `"cached": true`.

- [ ] **Step 3: Commit** — `git commit -m "fix(alerts): compound WHERE broke 24h cache; filter freshness in JS"`

---

### Task 1: Schema — `role`, `merged_ridb_ids`, `edit_suggestions`, `merge_suggestions`

**Goal:** All backend schema changes for this phase in one migration pass, plus a manually promoted admin account.

**Files:**
- Modify: `backend/teenybase.ts`
- Modify: `frontend/src/lib/types.ts` (add types)

**Acceptance Criteria:**
- [ ] `pnpm generate && pnpm migrate` succeeds (new migration ≥ 0009).
- [ ] `users` has nullable `role` text column; `facilities` has `merged_ridb_ids` json column.
- [ ] `edit_suggestions` and `merge_suggestions` exist with ALL rules `'false'` (service-token-only).
- [ ] Registering via the API with a `role: "admin"` field in the payload does NOT produce an admin user (see Step 5 — security check).
- [ ] One local account has `role='admin'`.

**Verify:** `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite "SELECT email, role FROM users"` → shows exactly one `admin`.

**Steps:**

- [ ] **Step 1: Add `role` to users and `merged_ridb_ids` to facilities in `backend/teenybase.ts`**

In the `users` table, after `...authFields`:

```ts
        // 'admin' | null. Promoted manually via sqlite; never set through any API.
        { name: "role", type: "text", sqlType: "text" },
```

In `facilities`, after `last_synced`:

```ts
        // JSON array of ridb_ids absorbed by merges — ETL must not re-create these.
        { name: "merged_ridb_ids", type: "json", sqlType: "json" },
```

- [ ] **Step 2: Add the two suggestion tables** (append to `tables` array, before the closing `]`):

```ts
    {
      name: "edit_suggestions",
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: "facility_id", type: "relation", sqlType: "text",
          foreignKey: { table: "facilities", column: "id", onDelete: "CASCADE" } },
        { name: "user_id", type: "relation", sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" } },
        // Partial facility patch: { fee_min?, fee_max?, season_start?, season_end?, amenities?: Partial<Amenities> }
        { name: "changes", type: "json", sqlType: "json", notNull: true },
        { name: "note", type: "text", sqlType: "text" },
        { name: "status", type: "text", sqlType: "text", notNull: true }, // pending | approved | rejected
        { name: "reviewed_by", type: "text", sqlType: "text" },
        { name: "reviewed_at", type: "date", sqlType: "timestamp" },
        { name: "admin_note", type: "text", sqlType: "text" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        { name: "rules", listRule: "false", viewRule: "false",
          createRule: "false", updateRule: "false", deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "merge_suggestions",
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: "facility_a", type: "relation", sqlType: "text",
          foreignKey: { table: "facilities", column: "id", onDelete: "CASCADE" } },
        { name: "facility_b", type: "relation", sqlType: "text",
          foreignKey: { table: "facilities", column: "id", onDelete: "CASCADE" } },
        { name: "user_id", type: "relation", sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" } },
        { name: "note", type: "text", sqlType: "text" },
        { name: "status", type: "text", sqlType: "text", notNull: true }, // pending | approved | rejected
        { name: "reviewed_by", type: "text", sqlType: "text" },
        { name: "reviewed_at", type: "date", sqlType: "timestamp" },
        { name: "admin_note", type: "text", sqlType: "text" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        { name: "rules", listRule: "false", viewRule: "false",
          createRule: "false", updateRule: "false", deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
```

Why rules are all `false`: Teenybase's rule language can't express role checks (role isn't in the JWT), and CLAUDE.md forbids compound WHERE anyway. All access goes through SvelteKit routes using `TB_SERVICE_TOKEN`, which bypasses rules.

- [ ] **Step 3: Migrate** — `cd backend && pnpm generate && pnpm migrate`. Expect a new migration file and clean apply. Backend must be restarted afterwards.

- [ ] **Step 4: Add frontend types** to `frontend/src/lib/types.ts`:

```ts
export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface EditChanges {
  fee_min?: number | null;
  fee_max?: number | null;
  season_start?: string;
  season_end?: string;
  amenities?: Partial<Amenities>;
}

export interface EditSuggestion {
  id: string;
  facility_id: string;
  user_id: string;
  changes: EditChanges;
  note: string;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

export interface MergeSuggestion {
  id: string;
  facility_a: string;
  facility_b: string;
  user_id: string;
  note: string;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}
```

Also add to `Facility`: `merged_ridb_ids?: string[];`

- [ ] **Step 5: SECURITY CHECK — role must not be settable at registration.** Teenybase's `users.createRule` is `'true'` and the Worker is directly reachable on :8787, so test whether register accepts extra fields:

```bash
curl -s http://localhost:8787/api/v1/table/users/register -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"roletest@example.com","username":"roletest","password":"password123","passwordConfirm":"password123","role":"admin"}'
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT email, role FROM users WHERE email='roletest@example.com'"
```

If `role` comes back `admin`, the register endpoint mass-assigns fields. Mitigation (do NOT skip): our own `/api/auth/register` proxy already controls its outbound body, but the Teenybase Worker is directly reachable — add a triggers-based guard or, if Teenybase offers no field-level control, document in `docs/handoff.md` under a **Deployment blockers** heading: "Teenybase register mass-assigns `role` — the Worker must not be publicly reachable in prod until fixed (or add a WAF rule / strip via trigger)." Then neutralize the test row:

```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "UPDATE users SET role=NULL WHERE email='roletest@example.com'"
```

Record the actual outcome (safe / vulnerable + mitigation chosen) in the commit message and handoff.

- [ ] **Step 6: Promote an admin.** Register a `campfinder-admin@example.com` account through the UI (or reuse an existing account), then:

```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "UPDATE users SET role='admin' WHERE email='campfinder-admin@example.com'"
```

Document the account in `docs/handoff.md` Housekeeping.

- [ ] **Step 7: Commit** — `git commit -m "feat(schema): role, merged_ridb_ids, edit/merge suggestion tables"`

---

### Task 2: Server-side admin gate (`requireAdmin`) + admin visibility in the UI

**Goal:** A single trusted way to answer "is this request from an admin?" plus a client-visible (untrusted, display-only) flag so the nav can show an Admin link.

**Files:**
- Create: `frontend/src/lib/server/auth/admin.ts`
- Create: `frontend/src/lib/server/auth/admin.test.ts`
- Modify: `frontend/src/app.d.ts` (add `isAdmin` to `Locals` if `Locals.user` is typed there)
- Modify: `frontend/src/routes/api/auth/me/+server.ts` (include `role` in response)
- Modify: `frontend/src/lib/auth/authStore.ts` + `frontend/src/lib/auth/AccountMenu.svelte` (surface Admin link when `role === 'admin'`)

**Acceptance Criteria:**
- [ ] `requireAdmin(locals)` returns the admin user record or throws a SvelteKit `error(403)`; it fetches `users/view/{id}` with `TB_SERVICE_TOKEN` — it never trusts cookies/JWT/client for the role.
- [ ] `/api/auth/me` response includes `role`; AccountMenu shows an "Admin" link only for admins.
- [ ] Unit tests cover: no user → 401, non-admin → 403, admin → returns record.
- [ ] `pnpm check` and `pnpm test` pass in `frontend/`.

**Verify:** `cd frontend && pnpm test -- admin && pnpm check`

**Steps:**

- [ ] **Step 1: Write failing tests** in `frontend/src/lib/server/auth/admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdmin } from "./admin";

const adminRecord = { id: "u1", email: "a@x.com", role: "admin" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("requireAdmin", () => {
  it("throws 401 when unauthenticated", async () => {
    await expect(requireAdmin({ user: null } as never)).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when role is not admin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...adminRecord, role: null }), { status: 200 }),
    ));
    await expect(requireAdmin({ user: { id: "u1" } } as never)).rejects.toMatchObject({ status: 403 });
  });

  it("returns the record for an admin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(adminRecord), { status: 200 }),
    ));
    await expect(requireAdmin({ user: { id: "u1" } } as never)).resolves.toMatchObject({ role: "admin" });
  });
});
```

Note: `$env/static/*` imports need the existing Vitest alias/mocks setup — check how `jwt.test.ts` / neighbors handle env and copy that approach exactly (if they mock `$env`, do the same; if `admin.ts` must take the URL/token as injectable params for testability, mirror the existing style).

- [ ] **Step 2: Run tests, verify FAIL** — `pnpm test -- admin` → module not found.

- [ ] **Step 3: Implement** `frontend/src/lib/server/auth/admin.ts`:

```ts
import { error } from "@sveltejs/kit";
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";

export interface AdminUser {
  id: string;
  email: string;
  role: string | null;
}

/**
 * Server-side admin gate. Verifies role against the users table with the
 * service token on EVERY call — the JWT and cookies never carry the role,
 * so there is nothing client-forgeable in this path.
 */
export async function requireAdmin(locals: App.Locals): Promise<AdminUser> {
  if (!locals.user) throw error(401, "Unauthenticated");
  const res = await fetch(
    `${PUBLIC_TB_URL}/api/v1/table/users/view/${locals.user.id}`,
    { headers: { Authorization: `Bearer ${TB_SERVICE_TOKEN}` } },
  );
  if (!res.ok) throw error(403, "Forbidden");
  const record = (await res.json()) as AdminUser;
  if (record.role !== "admin") throw error(403, "Forbidden");
  return record;
}
```

- [ ] **Step 4: Run tests, verify PASS** — `pnpm test -- admin`.

- [ ] **Step 5: Surface role for display.** In `/api/auth/me/+server.ts`, fetch the user record the same way (service token) and include `role` in the JSON response. In `authStore.ts` add `role: string | null` to the stored user shape. In `AccountMenu.svelte` add, above the sign-out item, following existing markup/classes:

```svelte
{#if user?.role === 'admin'}
  <a class="menu-item" href="/admin">Admin</a>
{/if}
```

This is display-only convenience — the real gate is `requireAdmin` on the server.

- [ ] **Step 6: `pnpm check` (0/0) then commit** — `git commit -m "feat(auth): server-side requireAdmin gate + admin link in account menu"`

---

### Task 3: Suggestion submission APIs (`/api/suggestions`, `/api/duplicates`)

**Goal:** Signed-in users can submit facility edit suggestions and duplicate flags; both land as `pending` rows written with the service token.

**Files:**
- Create: `frontend/src/routes/api/suggestions/+server.ts`
- Create: `frontend/src/routes/api/duplicates/+server.ts`
- Modify: `frontend/src/lib/server/auth/limiters.ts` (add a suggestion limiter)

**Acceptance Criteria:**
- [ ] `POST /api/suggestions` body `{ facility_id, changes, note? }` → 201 with created row; 401 unauthenticated; 400 on missing facility_id, empty `changes`, or unknown keys in `changes`.
- [ ] `POST /api/duplicates` body `{ facility_a, facility_b, note? }` → 201; 400 if ids missing/equal; 200 no-op `{ duplicate: true }` if a pending suggestion for the same unordered pair exists.
- [ ] Both routes rate-limited (10/15 min per IP) and derive `user_id` from `locals.user` only.
- [ ] `changes` is `JSON.stringify`-ed on write (Teenybase quirk).

**Verify:** curl each route logged-out (401) and with a session cookie (201); confirm rows: `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite "SELECT status, changes FROM edit_suggestions"`

**Steps:**

- [ ] **Step 1: Add limiter** in `limiters.ts`:

```ts
// 10 suggestion submissions / 15 min per IP.
export const suggestionLimiter = createRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
});
```

(Match the call pattern the auth routes use for `authLimiter` — copy how they extract the client IP and return 429.)

- [ ] **Step 2: Implement `frontend/src/routes/api/suggestions/+server.ts`:**

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";
import { suggestionLimiter } from "$lib/server/auth/limiters";
import type { EditChanges } from "$lib/types";

const TB = `${PUBLIC_TB_URL}/api/v1/table/edit_suggestions`;
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

const ALLOWED_KEYS = new Set(["fee_min", "fee_max", "season_start", "season_end", "amenities"]);

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  if (!suggestionLimiter.allow(getClientAddress()))
    return json({ error: "Too many submissions — try again later" }, { status: 429 });

  const { facility_id, changes, note } = (await request.json()) as {
    facility_id?: string; changes?: EditChanges; note?: string;
  };
  if (!facility_id) return json({ error: "facility_id required" }, { status: 400 });
  if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0)
    return json({ error: "changes required" }, { status: 400 });
  const badKey = Object.keys(changes).find((k) => !ALLOWED_KEYS.has(k));
  if (badKey) return json({ error: `Unknown field: ${badKey}` }, { status: 400 });

  const res = await fetch(`${TB}/insert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: {
        facility_id,
        user_id: locals.user.id,
        changes: JSON.stringify(changes), // Teenybase quirk: JSON fields stringified on write
        note: (note ?? "").slice(0, 1000),
        status: "pending",
      },
    }),
  });
  const data = await res.json();
  return json(data, { status: res.ok ? 201 : res.status });
};
```

Adjust the `suggestionLimiter.allow(...)` call to the real API of `createRateLimiter` (read `rateLimit.ts` first — use whatever method/shape `authLimiter` consumers use).

- [ ] **Step 3: Implement `frontend/src/routes/api/duplicates/+server.ts`:**

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";
import { suggestionLimiter } from "$lib/server/auth/limiters";

const TB = `${PUBLIC_TB_URL}/api/v1/table/merge_suggestions`;
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user) return json({ error: "Unauthenticated" }, { status: 401 });
  if (!suggestionLimiter.allow(getClientAddress()))
    return json({ error: "Too many submissions — try again later" }, { status: 429 });

  const { facility_a, facility_b, note } = (await request.json()) as Record<string, string>;
  if (!facility_a || !facility_b)
    return json({ error: "facility_a and facility_b required" }, { status: 400 });
  if (facility_a === facility_b)
    return json({ error: "A campground can't be a duplicate of itself" }, { status: 400 });

  // Dedupe on the unordered pair (no compound WHERE — fetch pending and filter in JS).
  const existingRes = await fetch(`${TB}/list`, {
    method: "POST",
    headers,
    body: JSON.stringify({ where: `status == 'pending'`, limit: 1000 }),
  });
  const existing = (await existingRes.json()) as {
    items?: Array<{ facility_a: string; facility_b: string }>;
  };
  const pair = new Set([facility_a, facility_b]);
  if (existing.items?.some((s) => pair.has(s.facility_a) && pair.has(s.facility_b)))
    return json({ duplicate: true }, { status: 200 });

  const res = await fetch(`${TB}/insert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: {
        facility_a,
        facility_b,
        user_id: locals.user.id,
        note: (note ?? "").slice(0, 1000),
        status: "pending",
      },
    }),
  });
  const data = await res.json();
  return json(data, { status: res.ok ? 201 : res.status });
};
```

- [ ] **Step 4: Manual verify** with curl (grab `cf_access` from browser devtools, pass as `-H 'Cookie: cf_access=...'`): 401 without cookie, 201 with, 400 on bad payloads, row visible in sqlite.

- [ ] **Step 5: `pnpm check`, then commit** — `git commit -m "feat(api): edit-suggestion and duplicate-flag submission routes"`

---

### Task 4: Admin review API — queues, approve/reject edits, and the merge engine

**Goal:** Admin-only endpoints that list pending suggestions and resolve them; approving an edit applies the patch to the facility, approving a merge runs the full merge algorithm.

**Files:**
- Create: `frontend/src/lib/server/admin/merge.ts` (pure merge-field logic, unit-testable)
- Create: `frontend/src/lib/server/admin/merge.test.ts`
- Create: `frontend/src/routes/api/admin/suggestions/+server.ts` (GET queue, POST resolve)
- Create: `frontend/src/routes/api/admin/merges/+server.ts` (GET queue, POST resolve)

**Acceptance Criteria:**
- [ ] All four handlers call `requireAdmin(locals)` first; non-admins get 403.
- [ ] `GET /api/admin/suggestions` → pending edit suggestions with facility name + suggester email joined in (fetch lists, join in JS).
- [ ] `POST /api/admin/suggestions` `{ id, action: "approve"|"reject", admin_note? }` — approve deep-merges `changes` into the facility (amenities merged per-key, not replaced) and marks the row `approved` with `reviewed_by`/`reviewed_at`; reject only marks the row.
- [ ] `POST /api/admin/merges` approve: winner keeps richer data field-by-field; loser's `ridb_id` (+ its own `merged_ridb_ids`) appended to winner's `merged_ridb_ids`; ratings & saved_campgrounds repointed to winner (rows that would violate the per-user unique index are deleted instead); loser's alerts deleted; loser facility deleted; suggestion marked approved.
- [ ] `mergeFacilityFields` unit tests pass.

**Verify:** `cd frontend && pnpm test -- merge && pnpm check`, plus the end-to-end merge scenario in Step 6.

**Steps:**

- [ ] **Step 1: Write failing tests** `frontend/src/lib/server/admin/merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeFacilityFields, pickWinner } from "./merge";

const base = {
  id: "w", ridb_id: "233847", name: "East Portal", lat: 38.5, lng: -107.5,
  forest: "", district: "", description: "", fee_min: null, fee_max: null,
  season_start: "", season_end: "", fcfs_total: 10, reservable_total: 0,
  is_fully_fcfs: true, is_partial_fcfs: false,
  amenities: { potableWater: true, toiletType: "unknown", bearBoxes: false } as never,
  ridb_data_quality: "sparse", fs_url: "", is_closed: false, merged_ridb_ids: [],
};

describe("pickWinner", () => {
  it("prefers numeric RIDB ids over fs- and nps- ids", () => {
    const a = { ...base, ridb_id: "fs-gmug-east-portal" };
    const b = { ...base, id: "b", ridb_id: "233847" };
    expect(pickWinner(a as never, b as never).id).toBe("b");
  });
  it("prefers nps- over fs- when no numeric id", () => {
    const a = { ...base, ridb_id: "fs-x-y" };
    const b = { ...base, id: "b", ridb_id: "nps-blca-1" };
    expect(pickWinner(a as never, b as never).id).toBe("b");
  });
});

describe("mergeFacilityFields", () => {
  it("fills winner nulls/empties from loser", () => {
    const winner = { ...base, fee_min: null, fs_url: "" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", fee_min: 20, fs_url: "https://fs.usda.gov/x" };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.fee_min).toBe(20);
    expect(merged.fs_url).toBe("https://fs.usda.gov/x");
  });
  it("keeps winner values when present", () => {
    const winner = { ...base, fee_min: 15 };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", fee_min: 20 };
    expect(mergeFacilityFields(winner as never, loser as never).fee_min).toBe(15);
  });
  it("merges amenities per-key, loser fills unknown/null", () => {
    const winner = { ...base, amenities: { potableWater: null, toiletType: "unknown" } as never };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b",
      amenities: { potableWater: true, toiletType: "vault" } as never };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.amenities.potableWater).toBe(true);
    expect(merged.amenities.toiletType).toBe("vault");
  });
  it("accumulates merged_ridb_ids from loser id and loser history", () => {
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", merged_ridb_ids: ["nps-old-1"] };
    const merged = mergeFacilityFields(base as never, loser as never);
    expect(merged.merged_ridb_ids).toEqual(expect.arrayContaining(["fs-a-b", "nps-old-1"]));
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm test -- merge`.

- [ ] **Step 3: Implement** `frontend/src/lib/server/admin/merge.ts`:

```ts
import type { Facility, Amenities } from "$lib/types";

/** Source richness: numeric RIDB record > NPS > fs.usda.gov scrape. */
function sourceRank(ridbId: string): number {
  if (ridbId.startsWith("fs-")) return 0;
  if (ridbId.startsWith("nps-")) return 1;
  return 2;
}

export function pickWinner(a: Facility, b: Facility): Facility {
  return sourceRank(b.ridb_id) > sourceRank(a.ridb_id) ? b : a;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "unknown";
}

const SCALAR_FIELDS = [
  "forest", "district", "description", "fee_min", "fee_max",
  "season_start", "season_end", "fs_url",
] as const;

/** Winner's data wins; loser fills gaps. Never touches id/ridb_id/name/lat/lng. */
export function mergeFacilityFields(winner: Facility, loser: Facility): Facility {
  const merged: Facility = { ...winner };

  for (const f of SCALAR_FIELDS) {
    if (isEmpty(merged[f]) && !isEmpty(loser[f])) {
      (merged as Record<string, unknown>)[f] = loser[f];
    }
  }

  // FCFS counts: only fill if winner has none at all (scraped records often lack counts).
  if (merged.fcfs_total == null && merged.reservable_total == null) {
    merged.fcfs_total = loser.fcfs_total;
    merged.reservable_total = loser.reservable_total;
    merged.is_fully_fcfs = loser.is_fully_fcfs;
    merged.is_partial_fcfs = loser.is_partial_fcfs;
  }

  const wa = (winner.amenities ?? {}) as Record<string, unknown>;
  const la = (loser.amenities ?? {}) as Record<string, unknown>;
  const amenities: Record<string, unknown> = { ...wa };
  for (const key of new Set([...Object.keys(wa), ...Object.keys(la)])) {
    if (isEmpty(amenities[key]) && !isEmpty(la[key])) amenities[key] = la[key];
  }
  merged.amenities = amenities as unknown as Amenities;

  merged.merged_ridb_ids = [
    ...new Set([
      ...(winner.merged_ridb_ids ?? []),
      loser.ridb_id,
      ...(loser.merged_ridb_ids ?? []),
    ]),
  ];
  return merged;
}
```

- [ ] **Step 4: Run, verify PASS**, commit the pure logic — `git commit -m "feat(admin): facility merge field logic with tests"`

- [ ] **Step 5: Implement the two admin routes.** Shared shape (all Teenybase calls use the service token; remember: `changes`/`amenities`/`merged_ridb_ids` are JSON strings on read → `JSON.parse`, and must be `JSON.stringify`-ed on write).

`frontend/src/routes/api/admin/suggestions/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";
import { requireAdmin } from "$lib/server/auth/admin";
import type { EditChanges } from "$lib/types";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};
const tb = (path: string) => `${PUBLIC_TB_URL}/api/v1/table/${path}`;

async function tbList<T>(table: string, body: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(tb(`${table}/list`), {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = (await res.json()) as { items?: T[] };
  return data.items ?? [];
}

export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);
  const [pending, facilities, users] = await Promise.all([
    tbList<Record<string, unknown>>("edit_suggestions", { where: "status == 'pending'", order: "created asc", limit: 500 }),
    tbList<{ id: string; name: string }>("facilities", { limit: 10000 }),
    tbList<{ id: string; email: string }>("users", { limit: 10000 }),
  ]);
  const facName = new Map(facilities.map((f) => [f.id, f.name]));
  const userEmail = new Map(users.map((u) => [u.id, u.email]));
  return json(pending.map((s) => ({
    ...s,
    changes: typeof s.changes === "string" ? JSON.parse(s.changes) : s.changes,
    facility_name: facName.get(s.facility_id as string) ?? "(deleted)",
    user_email: userEmail.get(s.user_id as string) ?? "(deleted)",
  })));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);
  const { id, action, admin_note } = (await request.json()) as {
    id?: string; action?: "approve" | "reject"; admin_note?: string;
  };
  if (!id || !action || !["approve", "reject"].includes(action))
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });

  const sugRes = await fetch(tb(`edit_suggestions/view/${id}`), { headers });
  if (!sugRes.ok) return json({ error: "Suggestion not found" }, { status: 404 });
  const sug = (await sugRes.json()) as {
    facility_id: string; status: string; changes: string | EditChanges;
  };
  if (sug.status !== "pending")
    return json({ error: "Already resolved" }, { status: 409 });

  if (action === "approve") {
    const changes: EditChanges =
      typeof sug.changes === "string" ? JSON.parse(sug.changes) : sug.changes;
    const facRes = await fetch(tb(`facilities/view/${sug.facility_id}`), { headers });
    if (!facRes.ok) return json({ error: "Facility not found" }, { status: 404 });
    const facility = (await facRes.json()) as { amenities: string | Record<string, unknown> };

    const { amenities: amenityChanges, ...scalarChanges } = changes;
    const patch: Record<string, unknown> = { ...scalarChanges };
    if (amenityChanges) {
      const current = typeof facility.amenities === "string"
        ? JSON.parse(facility.amenities) : (facility.amenities ?? {});
      patch.amenities = JSON.stringify({ ...current, ...amenityChanges });
    }
    const editRes = await fetch(tb(`facilities/edit/${sug.facility_id}`), {
      method: "POST", headers, body: JSON.stringify(patch),
    });
    if (!editRes.ok)
      return json({ error: `Facility update failed: ${await editRes.text()}` }, { status: 502 });
  }

  await fetch(tb(`edit_suggestions/edit/${id}`), {
    method: "POST", headers,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (admin_note ?? "").slice(0, 1000),
    }),
  });
  return json({ ok: true });
};
```

`frontend/src/routes/api/admin/merges/+server.ts` (GET mirrors the pattern above — pending `merge_suggestions` joined with both facility names/ridb_ids + suggester email; POST below):

```ts
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);
  const { id, action, admin_note, winner_id } = (await request.json()) as {
    id?: string; action?: "approve" | "reject"; admin_note?: string; winner_id?: string;
  };
  if (!id || !action || !["approve", "reject"].includes(action))
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });

  const sugRes = await fetch(tb(`merge_suggestions/view/${id}`), { headers });
  if (!sugRes.ok) return json({ error: "Suggestion not found" }, { status: 404 });
  const sug = (await sugRes.json()) as {
    facility_a: string; facility_b: string; status: string;
  };
  if (sug.status !== "pending") return json({ error: "Already resolved" }, { status: 409 });

  if (action === "approve") {
    const [aRes, bRes] = await Promise.all([
      fetch(tb(`facilities/view/${sug.facility_a}`), { headers }),
      fetch(tb(`facilities/view/${sug.facility_b}`), { headers }),
    ]);
    if (!aRes.ok || !bRes.ok)
      return json({ error: "One of the facilities no longer exists" }, { status: 404 });
    const parseFac = (raw: Record<string, unknown>): Facility => ({
      ...raw,
      amenities: typeof raw.amenities === "string" ? JSON.parse(raw.amenities) : raw.amenities,
      merged_ridb_ids: typeof raw.merged_ridb_ids === "string"
        ? JSON.parse(raw.merged_ridb_ids) : (raw.merged_ridb_ids ?? []),
    }) as unknown as Facility;
    const a = parseFac(await aRes.json());
    const b = parseFac(await bRes.json());

    // Admin may override the winner from the UI; default is source-rank heuristic.
    let winner = pickWinner(a, b);
    if (winner_id === a.id) winner = a;
    if (winner_id === b.id) winner = b;
    const loser = winner.id === a.id ? b : a;
    const merged = mergeFacilityFields(winner, loser);

    // 1. Repoint children (ratings + saved_campgrounds); dedupe on per-user unique index.
    for (const table of ["ratings", "saved_campgrounds"] as const) {
      const [loserRows, winnerRows] = await Promise.all([
        tbList<{ id: string; user_id: string }>(table, { where: `facility_id == '${loser.id}'`, limit: 1000 }),
        tbList<{ id: string; user_id: string }>(table, { where: `facility_id == '${winner.id}'`, limit: 1000 }),
      ]);
      const winnerUsers = new Set(winnerRows.map((r) => r.user_id));
      for (const row of loserRows) {
        if (winnerUsers.has(row.user_id)) {
          // User already has a row on the winner — drop the loser-side duplicate.
          await fetch(tb(`${table}/delete`), {
            method: "POST", headers, body: JSON.stringify({ where: `id == '${row.id}'` }),
          });
        } else {
          await fetch(tb(`${table}/edit/${row.id}`), {
            method: "POST", headers, body: JSON.stringify({ facility_id: winner.id }),
          });
        }
      }
    }

    // 2. Loser's alert cache rows just get dropped (they re-scrape on demand).
    await fetch(tb(`alerts/delete`), {
      method: "POST", headers, body: JSON.stringify({ where: `facility_id == '${loser.id}'` }),
    });

    // 3. Write merged data to the winner.
    const editRes = await fetch(tb(`facilities/edit/${winner.id}`), {
      method: "POST", headers,
      body: JSON.stringify({
        forest: merged.forest, district: merged.district, description: merged.description,
        fee_min: merged.fee_min, fee_max: merged.fee_max,
        season_start: merged.season_start, season_end: merged.season_end,
        fcfs_total: merged.fcfs_total, reservable_total: merged.reservable_total,
        is_fully_fcfs: merged.is_fully_fcfs, is_partial_fcfs: merged.is_partial_fcfs,
        fs_url: merged.fs_url,
        amenities: JSON.stringify(merged.amenities),
        merged_ridb_ids: JSON.stringify(merged.merged_ridb_ids),
      }),
    });
    if (!editRes.ok)
      return json({ error: `Winner update failed: ${await editRes.text()}` }, { status: 502 });

    // 4. Delete the loser LAST (its children were repointed; any stragglers cascade).
    await fetch(tb(`facilities/delete`), {
      method: "POST", headers, body: JSON.stringify({ where: `id == '${loser.id}'` }),
    });
  }

  await fetch(tb(`merge_suggestions/edit/${id}`), {
    method: "POST", headers,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (admin_note ?? "").slice(0, 1000),
    }),
  });
  return json({ ok: true });
};
```

(Both files share `headers`, `tb()`, `tbList()` — copy them locally per file or lift into `$lib/server/admin/tb.ts`; either is fine, be consistent.)

Known limitation (acceptable, document in code comment): the merge is not transactional — if a step fails midway, re-approving is safe-ish because repointing is idempotent, but note it.

- [ ] **Step 6: End-to-end verify with the known real duplicate.** Find the two "East Portal Campground" records:

```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT id, ridb_id, name FROM facilities WHERE name LIKE '%East Portal%'"
```

Save one of them + rate it from a test account, submit a duplicate flag via `/api/duplicates`, approve via `/api/admin/merges` (as the admin account), then confirm: one facility remains, its `merged_ridb_ids` contains the loser's ridb_id, the save + rating still exist and point at the survivor.

- [ ] **Step 7: `pnpm check` + `pnpm test`, commit** — `git commit -m "feat(admin): review APIs — approve/reject edits, duplicate merge engine"`

---

### Task 5: ETL respects `merged_ridb_ids`

**Goal:** After a merge, re-running `pnpm sync` / `pnpm discover` / `pnpm sync-nps` must not resurrect the absorbed record.

**Files:**
- Modify: `etl/src/teenybase.ts` (`upsertFacility`, `listAll`)
- Modify: `etl/src/discover.ts` + `etl/src/sync-nps.ts` (their dedupe uses `listAll` — verify they inherit the fix)
- Test: `etl/tests/` (add `mergedIds.test.ts`)

**Acceptance Criteria:**
- [ ] `upsertFacility` treats a ridb_id found in ANY facility's `merged_ridb_ids` as belonging to that facility → patches it instead of inserting a duplicate.
- [ ] `listAll` exposes `merged_ridb_ids` (parsed to `string[]`) so discover/sync-nps dedupe can consult it.
- [ ] `cd etl && pnpm test` passes.

**Verify:** After the Task 4 East Portal merge, `cd etl && pnpm sync` (and `pnpm sync-nps`) → facility count unchanged, no second East Portal pin.

**Steps:**

- [ ] **Step 1: Write a failing test** for the redirect-resolution helper (pure function, extract it):

```ts
// etl/tests/mergedIds.test.ts
import { describe, it, expect } from "vitest";
import { buildRidbIndex } from "../src/teenybase.js";

describe("buildRidbIndex", () => {
  const rows = [
    { id: "w", ridb_id: "233847", merged_ridb_ids: ["fs-gmug-east-portal", "nps-cure-1"] },
    { id: "x", ridb_id: "fs-pike-lost-park", merged_ridb_ids: [] },
  ];
  it("maps primary ridb_ids to their row id", () => {
    expect(buildRidbIndex(rows).get("233847")).toBe("w");
  });
  it("maps absorbed ridb_ids to the surviving row id", () => {
    expect(buildRidbIndex(rows).get("fs-gmug-east-portal")).toBe("w");
    expect(buildRidbIndex(rows).get("nps-cure-1")).toBe("w");
  });
});
```

- [ ] **Step 2: Implement in `etl/src/teenybase.ts`.** Export the helper and use it in `upsertFacility`:

```ts
export function buildRidbIndex(
  rows: Array<{ id: string; ridb_id: string; merged_ridb_ids?: string[] | null }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(row.ridb_id, row.id);
    for (const absorbed of row.merged_ridb_ids ?? []) index.set(absorbed, row.id);
  }
  return index;
}
```

Change `upsertFacility` to resolve through the index instead of the single-row `where` lookup. Cache the index once per run (build it in `upsertFacilities` from a full `listAll` and pass it down — avoids N list calls AND fixes the miss on merged ids):

```ts
async upsertFacilities(facilities, onProgress?) {
  const all = await this.listAllWithMerged();
  const index = buildRidbIndex(all);
  for (let i = 0; i < facilities.length; i++) {
    const f = facilities[i];
    const existingId = index.get(f.ridb_id);
    if (existingId) {
      // Never overwrite ridb_id: a merged record keeps the survivor's identity.
      const { ridb_id: _drop, ...patch } = f;
      await this.tbFetch(`/table/facilities/edit/${existingId}`, patch);
    } else {
      await this.tbFetch("/table/facilities/insert", { values: f });
      // keep index current within the run
      // (re-list is unnecessary; insert response contains the new id if needed)
    }
    onProgress?.(i + 1, facilities.length);
  }
}
```

Add `listAllWithMerged()` — same as `listAll` but including `merged_ridb_ids` parsed from its JSON string (`typeof v === 'string' ? JSON.parse(v) : (v ?? [])`).

- [ ] **Step 3: Update `discover.ts` and `sync-nps.ts` dedupe.** Read both files first. Wherever they compare against existing records from `listAll()`, switch to `listAllWithMerged()` and skip/patch when the candidate's generated ridb_id (or matched record) resolves through `buildRidbIndex`. Keep the existing name+proximity dedupe as-is — this is additive.

- [ ] **Step 4: Run `pnpm test` in `etl/`** → all pass (existing tests must not regress).

- [ ] **Step 5: Live verify** per **Verify** line above. Then commit — `git commit -m "feat(etl): merged_ridb_ids redirect index prevents resurrecting merged records"`

---

### Task 6: "Suggest an edit" UI in the detail panel

**Goal:** Signed-in users get a "Suggest an edit" affordance in `DetailPanel` opening a modal with fee, season, and amenity fields; submits to `POST /api/suggestions`.

**Files:**
- Create: `frontend/src/lib/detail/SuggestEditModal.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (button + modal mount, near the compare button)

**Acceptance Criteria:**
- [ ] Button visible only when signed in (`$authStore`-equivalent user present); signed-out users see the button but clicking opens the auth modal OR the button is hidden — match whatever `SaveButton.svelte` does for signed-out users (read it first; consistency wins).
- [ ] Modal pre-fills current facility values; only **changed** fields are sent in `changes` (empty diff → submit disabled).
- [ ] Amenity inputs: tri-state (yes / no / unknown) selects for boolean amenities; fee min/max numeric; season start/end text.
- [ ] Per-field blur validation follows the `AuthModal.svelte` pattern; success state thanks the user ("An admin will review your suggestion").
- [ ] Svelte 5 runes only; styling follows `docs/design-language.md` and matches `AuthModal` visually.
- [ ] `pnpm check` 0/0.

**Verify:** In the browser: open a campground → Suggest an edit → change fee to 20 → submit → row appears in `edit_suggestions` with only `{"fee_min":20}` in `changes`.

**Steps:**

- [ ] **Step 1: Read `AuthModal.svelte`, `SaveButton.svelte`, `ConfirmDialog.svelte`** for modal scaffolding, validation, and signed-out handling. Reuse their patterns and CSS variables — do not invent new tokens.

- [ ] **Step 2: Build `SuggestEditModal.svelte`.** Core skeleton (fill in styling from AuthModal; keep the diff logic exactly):

```svelte
<script lang="ts">
  import type { Facility, EditChanges, Amenities } from '$lib/types'

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props()

  const EDITABLE_AMENITIES: Array<{ key: keyof Amenities; label: string }> = [
    { key: 'potableWater', label: 'Potable water' },
    { key: 'bearBoxes', label: 'Bear boxes' },
    { key: 'petsAllowed', label: 'Pets allowed' },
    { key: 'electricHookups', label: 'Electric hookups' },
    { key: 'picnicTables', label: 'Picnic tables' },
    { key: 'fireRings', label: 'Fire rings' },
    { key: 'accessible', label: 'Accessible sites' },
  ]

  function triState(v: boolean | null | undefined): 'yes' | 'no' | 'unknown' {
    return v === true ? 'yes' : v === false ? 'no' : 'unknown'
  }

  let feeMin = $state(facility.fee_min?.toString() ?? '')
  let feeMax = $state(facility.fee_max?.toString() ?? '')
  let seasonStart = $state(facility.season_start ?? '')
  let seasonEnd = $state(facility.season_end ?? '')
  let amenityValues = $state(Object.fromEntries(
    EDITABLE_AMENITIES.map(({ key }) => [key, triState(facility.amenities?.[key] as boolean | null)]),
  ) as Record<string, 'yes' | 'no' | 'unknown'>)
  let note = $state('')
  let submitting = $state(false)
  let submitted = $state(false)
  let errorMsg = $state('')

  let changes = $derived.by(() => {
    const c: EditChanges = {}
    const fMin = feeMin === '' ? null : Number(feeMin)
    const fMax = feeMax === '' ? null : Number(feeMax)
    if (fMin !== (facility.fee_min ?? null)) c.fee_min = fMin
    if (fMax !== (facility.fee_max ?? null)) c.fee_max = fMax
    if (seasonStart !== (facility.season_start ?? '')) c.season_start = seasonStart
    if (seasonEnd !== (facility.season_end ?? '')) c.season_end = seasonEnd
    const amenityDiff: Partial<Amenities> = {}
    for (const { key } of EDITABLE_AMENITIES) {
      const original = triState(facility.amenities?.[key] as boolean | null)
      const current = amenityValues[key]
      if (current !== original) {
        (amenityDiff as Record<string, boolean | null>)[key] =
          current === 'yes' ? true : current === 'no' ? false : null
      }
    }
    if (Object.keys(amenityDiff).length) c.amenities = amenityDiff
    return c
  })
  let hasChanges = $derived(Object.keys(changes).length > 0)

  async function submit() {
    if (!hasChanges || submitting) return
    submitting = true
    errorMsg = ''
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: facility.id, changes, note }),
    })
    submitting = false
    if (res.ok) submitted = true
    else errorMsg = ((await res.json()) as { error?: string }).error ?? 'Something went wrong'
  }
</script>
```

Markup: modal overlay + card (AuthModal structure), fee/season inputs, a three-option segmented control or `<select>` per amenity, note textarea (maxlength 1000), Cancel + "Submit suggestion" (disabled when `!hasChanges`), success view when `submitted`.

- [ ] **Step 3: Wire into `DetailPanel.svelte`** — a `suggestOpen = $state(false)` flag, a button ("✎ Suggest an edit") in the actions area near the compare button, `{#if suggestOpen}<SuggestEditModal {facility} onclose={() => (suggestOpen = false)} />{/if}`. Gate on signed-in state consistent with `SaveButton`.

- [ ] **Step 4: Verify in browser** per **Verify** line; run `pnpm check`. Commit — `git commit -m "feat(ui): suggest-an-edit modal in detail panel"`

---

### Task 7: "Report duplicate" UI

**Goal:** From a campground's detail panel, a signed-in user can flag it as a duplicate of another campground, chosen via a name search.

**Files:**
- Create: `frontend/src/lib/detail/ReportDuplicateModal.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (small "Report duplicate" text-link under the header meta)

**Acceptance Criteria:**
- [ ] Modal shows the current campground as "A", a search box filtering all facilities by name (client-side; fetch `/api/facilities` list already used by the map — reuse the store data if available in context, else fetch), sorted by distance from A, showing distance (km) + ridb_id source badge (RIDB / NPS / USFS-scrape).
- [ ] Selecting a candidate + optional note → `POST /api/duplicates`; success message; `duplicate: true` no-op response shows "Already reported — thanks!".
- [ ] Cannot select the same facility as itself.
- [ ] Svelte 5 runes; design-language styling; `pnpm check` 0/0.

**Verify:** In browser: flag the two East Portal records → row in `merge_suggestions` with correct ids.

**Steps:**

- [ ] **Step 1: Check how facility lists reach components** — read `mapStore.ts` and `+page.svelte` to see whether a full facility list store exists to reuse. If not, `fetch('/api/facilities?north=90&south=-90&east=180&west=-180')` once on modal open (verify the bbox route supports this; read `api/facilities/+server.ts` first and use its actual contract).

- [ ] **Step 2: Build the modal.** Distance helper:

```ts
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
```

State: `query = $state('')`, `selected = $state<Facility | null>(null)`, `note = $state('')`; derived candidate list = facilities minus self, name-filtered by `query`, sorted by `distKm`, capped at 20. Submit posts `{ facility_a: facility.id, facility_b: selected.id, note }`.

- [ ] **Step 3: Wire link into DetailPanel** (subtle text button, e.g. under `.meta`: "Seeing this campground twice? Report a duplicate").

- [ ] **Step 4: Browser verify + `pnpm check`, commit** — `git commit -m "feat(ui): report-duplicate flow with nearby-facility picker"`

---

### Task 8: `/admin` review page

**Goal:** A server-guarded `/admin` page with two queues — Edit suggestions and Duplicate reports — with approve/reject actions.

**Files:**
- Create: `frontend/src/routes/admin/+page.server.ts`
- Create: `frontend/src/routes/admin/+page.svelte`

**Acceptance Criteria:**
- [ ] `+page.server.ts` `load` calls `requireAdmin(locals)` — non-admins get the 403 error page, signed-out get 401. It returns both pending queues (reuse the join logic by calling the two admin GET endpoints via `event.fetch`).
- [ ] Edit queue rows show: campground name, suggester email, submitted date, a **current → proposed** diff per changed field, note; Approve / Reject buttons (reject prompts for optional admin note via `ConfirmDialog` or inline).
- [ ] Merge queue rows show both records (name, ridb_id source badge, distance apart), the heuristic winner pre-selected with a radio to override, Approve (runs merge) / Reject.
- [ ] Actions call the Task 4 POST endpoints, then optimistically remove the row; errors surface inline.
- [ ] Empty states ("No pending suggestions — the queue is clear") in design-language style. Desktop-first is fine; must not be broken on mobile (single column).
- [ ] `pnpm check` 0/0.

**Verify:** Sign in as admin → `/admin` shows the seeded suggestions from Tasks 6–7 verification; approve an edit → facility detail reflects it; sign in as a normal user → `/admin` shows the 403 error page.

**Steps:**

- [ ] **Step 1: `+page.server.ts`:**

```ts
import type { PageServerLoad } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";

export const load: PageServerLoad = async ({ locals, fetch }) => {
  await requireAdmin(locals);
  const [editsRes, mergesRes] = await Promise.all([
    fetch("/api/admin/suggestions"),
    fetch("/api/admin/merges"),
  ]);
  return {
    edits: editsRes.ok ? await editsRes.json() : [],
    merges: mergesRes.ok ? await mergesRes.json() : [],
  };
};
```

- [ ] **Step 2: `+page.svelte`** — `let { data } = $props()`; local `edits = $state([...data.edits])`, `merges = $state([...data.merges])`; two sections with headed cards per item; per-item `resolve(kind, id, action, extra)` helper that POSTs and splices the row out on success. Diff rendering for edits: iterate `Object.entries(suggestion.changes)`; for `amenities` iterate the inner keys; label maps reuse the wording from `AmenityGrid.svelte` if exported, else define locally. Style per `docs/design-language.md` (paper card, Fraunces headings, JetBrains Mono for ridb_ids).

- [ ] **Step 3: Add nothing to public nav** — the Admin link ships in Task 2's AccountMenu change only.

- [ ] **Step 4: Full browser verify** (admin path AND non-admin 403 path), `pnpm check`, commit — `git commit -m "feat(admin): review page with edit + merge queues"`

---

### Task 9: Docs + handoff update

**Goal:** Keep CLAUDE.md and handoff accurate for the next session.

**Files:**
- Modify: `CLAUDE.md` (tables list: add `edit_suggestions`, `merge_suggestions`, `users.role`, `facilities.merged_ridb_ids`; note the all-rules-false + service-token pattern; note `requireAdmin`)
- Modify: `docs/handoff.md` (move items 1–2 from "What's next" into a new done-session block; record admin account email; record Step 5 security-check outcome; note the alerts cache fix; note migration number — prod D1 migration reminder now includes these)

**Acceptance Criteria:**
- [ ] Both docs updated; no stale claims (e.g. "facility rows are ETL/service-token only" gets amended to mention admin-approved edits).

**Verify:** Read both diffs; commit — `git commit -m "docs: admin/moderation phase handoff + CLAUDE.md schema updates"`

---

## Deliberately out of scope (do not build)

- **Email verification / real email sending** — not needed for these features; becomes relevant at public deployment (see plan-level notes). Do not add a mail dependency.
- Multi-admin management UI, audit log table, suggestion editing by admins (approve/reject only), notifying users of review outcomes, N-way merges (pairwise only — chain merges work because `merged_ridb_ids` accumulates).
- Changing `facilities` table rules — they stay `updateRule: 'false'`; admin writes ride the service token.
