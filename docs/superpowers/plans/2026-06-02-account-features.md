# Account Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of the auth foundation, deliver the account-tied UX: a reviews modal (read for everyone, write/edit/delete for logged-in users, one editable review per campground), confirmation dialogs on destructive actions, and an `/account` dashboard listing the user's saved campgrounds and reviews.

**Architecture:** Purely additive over Plan 1. The detail panel shows a compact review summary; a new `ReviewsModal` holds the full list + write/edit form, hitting the cookie-based `/api/ratings/[facilityId]` routes built in Plan 1. A reusable `ConfirmDialog` guards deletes/removes. The `/account` page's placeholder sections are filled in by extending its server loader. A DB unique constraint hardens the one-review-per-user rule.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), Teenybase (schema change + migration), Vitest.

**Companion spec:** `docs/superpowers/specs/2026-06-02-auth-ratings-design.md`
**Depends on:** `docs/superpowers/plans/2026-06-02-auth-foundation.md` (must be complete — provides `/api/ratings` upsert/delete, `/api/saved`, cookie auth, `locals.user`, `/account` shell).

**Prerequisite check:** Confirm Plan 1 is merged/complete: `frontend/src/routes/api/saved/+server.ts` exists, `/api/ratings/[facilityId]/+server.ts` has POST/DELETE using `locals.user`, and `cd frontend && pnpm check` is clean.

---

### Task 1: Harden the ratings table (unique constraint + create rule)

**Files:**
- Modify: `backend/teenybase.ts`

The upsert in Plan 1 already enforces one-review-per-user at the application layer. This adds DB-level defense-in-depth.

- [ ] **Step 1: Pre-check for existing duplicate ratings**

A unique index will fail to apply if duplicates already exist. Check:
```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT user_id, facility_id, COUNT(*) c FROM ratings GROUP BY user_id, facility_id HAVING c > 1;"
```
Expected: no rows. If any appear, delete the older duplicates (keep the most recent `created`) via the service token before continuing.

- [ ] **Step 2: Add the composite unique index + tighten createRule**

In `backend/teenybase.ts`, in the `ratings` table object, add an `indexes` array (sibling of `fields`/`triggers`):
```ts
      indexes: [
        {
          name: "ratings_user_facility_unique",
          unique: true,
          fields: ["user_id", "facility_id"],
        },
      ],
```
And in the `ratings` `rules` extension, change:
```ts
          createRule: "auth.uid != null",
```
to:
```ts
          createRule: "auth.uid == user_id",
```

- [ ] **Step 3: Generate + apply the migration**

Run:
```bash
cd backend && pnpm generate && pnpm migrate
```
Expected: a new `migrations/0007_*.sql` is generated and applied with no errors.

- [ ] **Step 4: Verify the constraint**

With the dev servers running and logged in (from Plan 1), submit a review for a campground, then submit again with a different score. Expected: still exactly one review row for you (the upsert edits it). Then verify a raw duplicate insert is rejected:
```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='ratings_user_facility_unique';"
```
Expected: the unique index is listed.

- [ ] **Step 5: Commit**

```bash
git add backend/teenybase.ts
git commit -m "feat(backend): unique (user_id, facility_id) on ratings + pin create rule"
```

---

### Task 2: Reusable `ConfirmDialog`

**Files:**
- Create: `frontend/src/lib/ui/ConfirmDialog.svelte`

- [ ] **Step 1: Create `ConfirmDialog.svelte`**

```svelte
<script lang="ts">
  let {
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = true,
    onconfirm,
    oncancel,
  }: {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let cancelBtn: HTMLButtonElement | null = $state(null);
  $effect(() => { cancelBtn?.focus(); });
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) oncancel(); }}
  onkeydown={(e) => { if (e.key === 'Escape') oncancel(); }}
>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-label={message}>
    <p class="msg">{message}</p>
    <div class="actions">
      <button bind:this={cancelBtn} class="cancel" onclick={oncancel}>{cancelLabel}</button>
      <button class="confirm" class:danger onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 4000; display: grid; place-items: center; padding: 1rem; }
  .dialog { background: white; border-radius: 12px; padding: 1.5rem; width: min(360px, 100%); display: flex; flex-direction: column; gap: 1rem; }
  .msg { margin: 0; font-size: 0.95rem; color: #111827; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .actions button { border-radius: 8px; padding: 0.45rem 0.9rem; font-size: 0.875rem; cursor: pointer; border: 1px solid #d1d5db; background: white; }
  .cancel { color: #374151; }
  .confirm { background: #2563eb; color: white; border-color: #2563eb; font-weight: 600; }
  .confirm.danger { background: #dc2626; border-color: #dc2626; }
</style>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/ui/ConfirmDialog.svelte
git commit -m "feat(ui): reusable ConfirmDialog for destructive actions"
```

---

### Task 3: `ReviewsModal` (read + write/edit/delete)

**Files:**
- Create: `frontend/src/lib/detail/ReviewsModal.svelte`

Reads all reviews (public GET). Logged-in users get a write/edit form (upsert) and can delete their own review (via ConfirmDialog). Guests see the list and a "Write a review" button that opens the AuthModal.

- [ ] **Step 1: Create `ReviewsModal.svelte`**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn, currentUser } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";
  import type { Rating } from "$lib/types";

  let {
    facilityId,
    facilityName,
    onclose,
  }: { facilityId: string; facilityName: string; onclose: () => void } = $props();

  let reviews: Rating[] = $state([]);
  let showAuth = $state(false);
  let showWriteForm = $state(false);
  let confirmingDelete = $state(false);

  let score = $state(0);
  let notes = $state("");
  let visited_at = $state("");
  let submitting = $state(false);

  let myReview = $derived(
    $currentUser ? reviews.find((r) => r.user_id === $currentUser.id) ?? null : null,
  );
  let otherReviews = $derived(
    $currentUser ? reviews.filter((r) => r.user_id !== $currentUser.id) : reviews,
  );
  let avg = $derived(
    reviews.length ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1) : null,
  );

  onMount(load);
  async function load() {
    const res = await fetch(`/api/ratings/${facilityId}`);
    reviews = await res.json();
  }

  function startWrite() {
    if (!$isLoggedIn) { showAuth = true; return; }
    score = myReview?.score ?? 0;
    notes = myReview?.notes ?? "";
    visited_at = myReview?.visited_at ?? "";
    showWriteForm = true;
  }

  async function submit() {
    if (score < 1 || score > 5) return;
    submitting = true;
    await fetch(`/api/ratings/${facilityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ score, notes, visited_at }),
    });
    submitting = false;
    showWriteForm = false;
    await load();
  }

  async function doDelete() {
    confirmingDelete = false;
    await fetch(`/api/ratings/${facilityId}`, { method: "DELETE", credentials: "include" });
    await load();
  }

  function stars(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }
</script>

<div class="overlay" role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Reviews for ${facilityName}`}>
    <header>
      <div>
        <h2>{facilityName}</h2>
        {#if avg}<span class="avg">★ {avg} · {reviews.length} review{reviews.length === 1 ? "" : "s"}</span>
        {:else}<span class="avg muted">No reviews yet</span>{/if}
      </div>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </header>

    <div class="list">
      {#if myReview && !showWriteForm}
        <div class="review mine">
          <div class="row">
            <span class="stars">{stars(myReview.score)}</span>
            <span class="you">Your review</span>
            <span class="spacer"></span>
            <button class="link" onclick={startWrite}>Edit</button>
            <button class="link danger" onclick={() => (confirmingDelete = true)}>Delete</button>
          </div>
          {#if myReview.visited_at}<span class="date">Visited {myReview.visited_at}</span>{/if}
          {#if myReview.notes}<p class="notes">{myReview.notes}</p>{/if}
        </div>
      {/if}

      {#each otherReviews as r}
        <div class="review">
          <span class="stars">{stars(r.score)}</span>
          {#if r.visited_at}<span class="date">Visited {r.visited_at}</span>{/if}
          {#if r.notes}<p class="notes">{r.notes}</p>{/if}
        </div>
      {/each}

      {#if reviews.length === 0}<p class="empty">Be the first to review this campground.</p>{/if}
    </div>

    {#if showWriteForm}
      <div class="form">
        <p class="form-label">{myReview ? "Edit your review" : "Write a review"}</p>
        <div class="star-pick">
          {#each [1, 2, 3, 4, 5] as s}
            <button class:active={s <= score} onclick={() => (score = s)}>{s <= score ? "★" : "☆"}</button>
          {/each}
        </div>
        <input type="date" bind:value={visited_at} />
        <textarea bind:value={notes} placeholder="Notes (optional)" rows="3"></textarea>
        <div class="form-actions">
          <button class="cancel" onclick={() => (showWriteForm = false)}>Cancel</button>
          <button class="submit" onclick={submit} disabled={submitting || score === 0}>
            {submitting ? "Saving…" : "Save review"}
          </button>
        </div>
      </div>
    {:else if !myReview}
      <button class="write-cta" onclick={startWrite}>
        {$isLoggedIn ? "+ Write a review" : "Sign in to write a review"}
      </button>
    {/if}
  </div>
</div>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={() => { showAuth = false; startWrite(); }} />
{/if}
{#if confirmingDelete}
  <ConfirmDialog
    message={`Delete your review of ${facilityName}? This can't be undone.`}
    confirmLabel="Delete"
    onconfirm={doDelete}
    oncancel={() => (confirmingDelete = false)} />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3500; display: grid; place-items: center; padding: 1rem; }
  .modal { background: white; border-radius: 12px; width: min(520px, 100%); max-height: 85dvh; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.25rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
  h2 { margin: 0; font-size: 1.1rem; }
  .avg { color: #ca8a04; font-size: 0.85rem; }
  .avg.muted { color: #9ca3af; }
  .x { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #6b7280; }
  .list { overflow-y: auto; padding: 0.75rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1; }
  .review { border-bottom: 1px solid #f3f4f6; padding-bottom: 0.6rem; font-size: 0.875rem; }
  .review.mine { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.6rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .stars { color: #f59e0b; }
  .you { color: #92400e; font-size: 0.75rem; font-weight: 600; }
  .spacer { flex: 1; }
  .date { color: #9ca3af; font-size: 0.8rem; display: block; margin-top: 0.2rem; }
  .notes { margin: 0.3rem 0 0; color: #374151; }
  .empty { color: #9ca3af; font-size: 0.875rem; }
  .link { background: none; border: none; cursor: pointer; font-size: 0.8rem; color: #2563eb; padding: 0; }
  .link.danger { color: #dc2626; }
  .form, .write-cta { margin: 0.5rem 1.25rem 1.25rem; }
  .form { display: flex; flex-direction: column; gap: 0.5rem; }
  .form-label { font-weight: 600; font-size: 0.875rem; margin: 0; }
  .star-pick { display: flex; gap: 0.25rem; }
  .star-pick button { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #d1d5db; padding: 0; }
  .star-pick button.active { color: #f59e0b; }
  textarea, input[type="date"] { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.875rem; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .form-actions .cancel { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.45rem 0.9rem; cursor: pointer; font-size: 0.875rem; }
  .form-actions .submit, .write-cta { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; font-size: 0.875rem; font-weight: 600; }
  .write-cta { width: calc(100% - 2.5rem); }
  .form-actions .submit:disabled { opacity: 0.6; cursor: default; }
  @media (max-width: 640px) {
    .modal { width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; }
  }
</style>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/detail/ReviewsModal.svelte
git commit -m "feat(reviews): ReviewsModal with read/write/edit/delete + upsert"
```

---

### Task 4: `RatingsSection` → compact summary that opens the modal

**Files:**
- Modify (rewrite): `frontend/src/lib/detail/RatingsSection.svelte`

Replaces the inline form (the Plan 1 stopgap) with a compact summary + "See all reviews" button that opens `ReviewsModal`.

- [ ] **Step 1: Rewrite `RatingsSection.svelte`**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import ReviewsModal from "./ReviewsModal.svelte";
  import type { Rating } from "$lib/types";

  let { facilityId, facilityName }: { facilityId: string; facilityName: string } = $props();

  let reviews: Rating[] = $state([]);
  let showModal = $state(false);

  let avg = $derived(
    reviews.length ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1) : null,
  );
  let mostRecent = $derived(reviews[0] ?? null);

  onMount(load);
  async function load() {
    const res = await fetch(`/api/ratings/${facilityId}`);
    reviews = await res.json();
  }
</script>

<section class="ratings">
  <h3>Community Reviews</h3>
  {#if avg}
    <p class="summary"><span class="avg">★ {avg}</span> · {reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
    {#if mostRecent?.notes}<p class="snippet">"{mostRecent.notes}"</p>{/if}
  {:else}
    <p class="empty">No reviews yet.</p>
  {/if}
  <button class="see-all" onclick={() => (showModal = true)}>
    {avg ? "See all reviews" : "Write a review"}
  </button>
</section>

{#if showModal}
  <ReviewsModal
    {facilityId}
    {facilityName}
    onclose={() => { showModal = false; load(); }} />
{/if}

<style>
  .ratings { margin: 1rem 0; }
  h3 { font-size: 0.95rem; margin: 0 0 0.5rem; }
  .summary { margin: 0; font-size: 0.9rem; }
  .avg { color: #ca8a04; font-weight: 600; }
  .snippet { margin: 0.35rem 0 0; color: #6b7280; font-size: 0.85rem; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: #9ca3af; font-size: 0.85rem; margin: 0; }
  .see-all { margin-top: 0.6rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
</style>
```

- [ ] **Step 2: Update `DetailPanel.svelte` to pass `facilityName`**

`RatingsSection` now needs `facilityName`. Find where `DetailPanel.svelte` renders `<RatingsSection ... />` and ensure both props are passed:
```svelte
<RatingsSection facilityId={facility.id} facilityName={facility.name} />
```
(If it previously passed only `facilityId`, add `facilityName={facility.name}`.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Verify**

Open a campground: panel shows compact summary (or "No reviews yet"). Click "See all reviews" → modal opens with the list. As a guest you can read; "Sign in to write a review" opens the auth modal. Logged in: write → edit → delete (with confirm) all work and the panel summary updates after close.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/detail/RatingsSection.svelte frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(reviews): compact summary in detail panel, full list in modal"
```

---

### Task 5: `/account` — saved campgrounds + my reviews sections

**Files:**
- Modify: `frontend/src/routes/account/+page.server.ts`
- Modify (rewrite): `frontend/src/routes/account/+page.svelte`
- Create: `frontend/src/routes/api/facilities/[id]/+server.ts`

Fill the placeholder sections. The loader joins the user's saved/review rows to facility names via a single facilities fetch. "View on map" links to `/?facility=<id>`; a tiny by-id facility endpoint supports that (wired into the home page in Task 6).

- [ ] **Step 1: Create the by-id facility endpoint `api/facilities/[id]/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit'
import { PUBLIC_TB_URL } from '$env/static/public'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `id == '${params.id}'`, limit: 1 }),
  })
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> }
  const f = data.items?.[0]
  if (!f) throw error(404, 'Not found')
  if (typeof f.amenities === 'string') {
    try { f.amenities = JSON.parse(f.amenities) } catch { /* leave as-is */ }
  }
  return json(f)
}
```

- [ ] **Step 2: Extend `account/+page.server.ts`**

Replace the file with:
```ts
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { ACCESS_COOKIE } from '$lib/server/auth/session'

interface FacilityLite { id: string; name: string; lat: number; lng: number }

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) throw redirect(303, '/')
  const token = cookies.get(ACCESS_COOKIE)!
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // Display name (not in JWT).
  let name = ''
  const me = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/view/${locals.user.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (me.ok) name = ((await me.json()) as { name?: string }).name ?? ''

  // Facility id → {name, lat, lng} map (single fetch; ~600 rows at current scale).
  const facRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/list`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 10000 }),
  })
  const facItems = ((await facRes.json()) as { items?: FacilityLite[] }).items ?? []
  const facMap = new Map(facItems.map((f) => [f.id, f]))

  // Saved campgrounds (scoped to the user by their token).
  const savedRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/list`, {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ where: `user_id == '${locals.user.id}'`, limit: 1000 }),
  })
  const savedItems = ((await savedRes.json()) as { items?: Array<{ id: string; facility_id: string }> }).items ?? []
  const saved = savedItems.map((s) => ({ id: s.id, facility: facMap.get(s.facility_id) ?? null }))

  // The user's reviews (ratings list is public; filter to this user).
  const revRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/ratings/list`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `user_id == '${locals.user.id}'`, order: 'created desc', limit: 500 }),
  })
  const revItems = ((await revRes.json()) as { items?: Array<{ id: string; facility_id: string; score: number; notes: string; visited_at: string }> }).items ?? []
  const reviews = revItems.map((r) => ({ ...r, facility: facMap.get(r.facility_id) ?? null }))

  return { account: { ...locals.user, name }, saved, reviews }
}
```

- [ ] **Step 3: Rewrite `account/+page.svelte`**

```svelte
<script lang="ts">
  import { auth } from "$lib/auth/authStore";
  import { goto, invalidateAll } from "$app/navigation";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";

  let { data } = $props();

  type Pending =
    | { kind: "unsave"; id: string; name: string }
    | { kind: "delreview"; facilityId: string; name: string }
    | null;
  let pending: Pending = $state(null);

  async function signOut() { await auth.logout(); await goto("/"); }

  async function confirmAction() {
    const p = pending; pending = null;
    if (!p) return;
    if (p.kind === "unsave") {
      await fetch("/api/saved", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ id: p.id }),
      });
    } else {
      await fetch(`/api/ratings/${p.facilityId}`, { method: "DELETE", credentials: "include" });
    }
    await invalidateAll();
  }
  function stars(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }
</script>

<main class="account-page">
  <header>
    <h1>My Account</h1>
    <button class="signout" onclick={signOut}>Sign out</button>
  </header>

  <section class="profile">
    <div><span class="label">Display name</span><span>{data.account.name || "—"}</span></div>
    <div><span class="label">Email</span><span>{data.account.email}</span></div>
  </section>

  <section>
    <h2>Saved campgrounds ({data.saved.length})</h2>
    {#if data.saved.length === 0}
      <p class="muted">You haven't saved any campgrounds yet.</p>
    {:else}
      <ul class="rows">
        {#each data.saved as s}
          <li>
            <span class="name">{s.facility?.name ?? "Unknown campground"}</span>
            <span class="spacer"></span>
            {#if s.facility}<a class="link" href={`/?facility=${s.facility.id}`}>View on map</a>{/if}
            <button class="link danger" onclick={() => (pending = { kind: "unsave", id: s.id, name: s.facility?.name ?? "this campground" })}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>My reviews ({data.reviews.length})</h2>
    {#if data.reviews.length === 0}
      <p class="muted">You haven't written any reviews yet.</p>
    {:else}
      <ul class="rows">
        {#each data.reviews as r}
          <li class="review-row">
            <div class="rev-main">
              <span class="stars">{stars(r.score)}</span>
              <span class="name">{r.facility?.name ?? "Unknown campground"}</span>
              {#if r.notes}<p class="notes">"{r.notes}"</p>{/if}
            </div>
            {#if r.facility}<a class="link" href={`/?facility=${r.facility.id}&reviews=1`}>Edit</a>{/if}
            <button class="link danger" onclick={() => (pending = { kind: "delreview", facilityId: r.facility_id, name: r.facility?.name ?? "this campground" })}>Delete</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

{#if pending}
  <ConfirmDialog
    message={pending.kind === "unsave"
      ? `Remove ${pending.name} from your saved list?`
      : `Delete your review of ${pending.name}? This can't be undone.`}
    confirmLabel={pending.kind === "unsave" ? "Remove" : "Delete"}
    onconfirm={confirmAction}
    oncancel={() => (pending = null)} />
{/if}

<style>
  .account-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; width: 100%; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 1.4rem; margin: 0; }
  h2 { font-size: 1rem; margin: 1.75rem 0 0.5rem; }
  .signout { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .profile { margin: 1.25rem 0 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .profile > div { display: flex; gap: 1rem; }
  .label { width: 120px; color: #6b7280; font-size: 0.875rem; }
  .muted { color: #9ca3af; font-size: 0.9rem; margin: 0; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .rows li { display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid #f3f4f6; padding: 0.5rem 0; font-size: 0.9rem; }
  .review-row { align-items: flex-start; }
  .rev-main { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  .stars { color: #f59e0b; }
  .name { font-weight: 500; }
  .notes { margin: 0; color: #6b7280; font-size: 0.85rem; font-style: italic; }
  .spacer { flex: 1; }
  .link { background: none; border: none; cursor: pointer; font-size: 0.825rem; color: #2563eb; text-decoration: none; padding: 0; }
  .link.danger { color: #dc2626; }
</style>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Verify**

Logged in with at least one saved campground and one review: `/account` lists both with names. "Remove" → ConfirmDialog → row disappears after confirm. "Delete" on a review → ConfirmDialog → row disappears. "View on map" / "Edit" links navigate home with the query params (wired in Task 6).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/account/+page.server.ts frontend/src/routes/account/+page.svelte frontend/src/routes/api/facilities/[id]/+server.ts
git commit -m "feat(account): saved campgrounds + my reviews with confirm dialogs"
```

---

### Task 6: Home-page deep links (`?facility=`, `?reviews=1`)

**Files:**
- Modify: `frontend/src/lib/map/CampMap.svelte` (add a `flyTo` method)
- Modify: `frontend/src/routes/+page.svelte` (handle the query params)

Makes the `/account` "View on map" and "Edit" links land on the right campground.

- [ ] **Step 1: Add a `flyTo` export to `CampMap.svelte`**

After the existing `getMapBounds` export, add:
```ts
  export function flyTo(lat: number, lng: number) {
    if (!map) return;
    map.setView([lat, lng], 12);
  }
```

- [ ] **Step 2: Handle query params in `+page.svelte`**

Add to the `<script>` (after the existing imports), using SvelteKit's `page` store:
```ts
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  onMount(async () => {
    const facilityId = $page.url.searchParams.get("facility");
    if (!facilityId) return;
    const res = await fetch(`/api/facilities/${facilityId}`);
    if (!res.ok) return;
    const f: Facility = await res.json();
    selectedFacility.set(f);
    campMap?.flyTo(f.lat, f.lng);
    // If the detail panel exposes the reviews modal via ?reviews=1, the
    // DetailPanel reads the same param on mount (see note below).
  });
```

Note on `?reviews=1`: the simplest implementation is for `DetailPanel.svelte` to check `$page.url.searchParams.get('reviews') === '1'` on mount and, if set, open the reviews modal by setting the same `showModal` state used by `RatingsSection` — OR, more cheaply, have `RatingsSection` accept an `autoOpen` prop. To keep this task self-contained, add an `autoOpen` prop to `RatingsSection` (default false) that sets `showModal = true` in its `onMount`, and pass `autoOpen={$page.url.searchParams.get('reviews') === '1'}` from `DetailPanel`. Update `RatingsSection.svelte`:
```ts
  let { facilityId, facilityName, autoOpen = false }: { facilityId: string; facilityName: string; autoOpen?: boolean } = $props();
  // ...in onMount, after load(): if (autoOpen) showModal = true;
```
and in `DetailPanel.svelte`:
```svelte
<RatingsSection facilityId={facility.id} facilityName={facility.name} autoOpen={$page.url.searchParams.get('reviews') === '1'} />
```
(Import `page` in `DetailPanel.svelte`: `import { page } from '$app/stores'`.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Verify**

From `/account`, click "View on map" on a saved campground → home page opens, map centers on it, detail panel opens. Click "Edit" on a review → home opens with the reviews modal already showing your review in edit-ready state.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/map/CampMap.svelte frontend/src/routes/+page.svelte frontend/src/lib/detail/RatingsSection.svelte frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(account): deep links from account to map + reviews modal"
```

---

### Task 7: End-to-end verification + security spot-checks

**Files:** none (verification only)

- [ ] **Step 1: Unit tests + type-check**

Run: `cd frontend && pnpm test && pnpm check`
Expected: all tests pass; 0 errors, 0 warnings.

- [ ] **Step 2: Playwright E2E (both servers running)**

1. Register a fresh user; open a campground → "See all reviews" → write a review → confirm it shows as "Your review".
2. Edit it (different score/notes) → confirm still one review, updated.
3. Delete it → ConfirmDialog → confirm → review gone.
4. Save two campgrounds; go to `/account` → both listed; write a review → appears under "My reviews".
5. `/account` → "Remove" a saved campground → ConfirmDialog → removed.
6. `/account` → "View on map" → lands on the campground with the panel open.
7. `/account` → "Edit" a review → home opens with the reviews modal in edit state.
8. Log out → open the same campground as a guest → reviews are readable; "Sign in to write a review" opens the auth modal; Save opens the auth modal.

- [ ] **Step 3: Security spot-checks**

1. `evaluate` in the browser console: `document.cookie` does **not** contain `cf_access`/`cf_refresh`.
2. With the dev servers running, craft a direct POST that tries to spoof another user_id and confirm it's ignored/rejected:
```bash
# Logged-out POST to the review route → 401
curl -i http://localhost:5173/api/ratings/<facility_id> -X POST \
  -H 'Content-Type: application/json' -d '{"score":5,"notes":"x"}'
```
Expected: `401 Unauthenticated`. (The route derives `user_id` from the cookie, so a body `user_id` is impossible to inject.)
3. Confirm the DB unique index rejects duplicate (user, facility) ratings (from Task 1 Step 4).

- [ ] **Step 4: Clean up E2E data**

Delete the E2E user and its saved/review rows via the service token. Verify counts return to baseline.

- [ ] **Step 5: Update handoff doc**

In `docs/handoff.md`: mark ratings/reviews UI complete (reviews modal, one editable review per user, account dashboard with saved + reviews, confirm dialogs). Move these out of "What's next". Commit:
```bash
git add docs/handoff.md
git commit -m "docs: record account features completion in handoff"
```

---

## Self-review notes (for the implementer)

- **Spec coverage (this plan):** one-review-per-user DB constraint + create-rule (Task 1); ConfirmDialog on destructive actions (Tasks 2, 4, 5); panel summary + reviews modal split (Tasks 3, 4); guest-read / auth-write enforced in the modal (Task 3, server already enforces); `/account` saved + reviews with view-on-map/edit deep links (Tasks 5, 6); security spot-checks (Task 7).
- **Depends on Plan 1** for: `/api/ratings` upsert/delete, `/api/saved`, `locals.user`, cookie auth, `Rating` type, `/account` shell. Verify the prerequisite check before starting.
- **`?reviews=1` deep link** uses an `autoOpen` prop on `RatingsSection` (Task 6) rather than cross-component state — keeps the wiring local.
- **DetailPanel edits** (Tasks 4, 6) assume `DetailPanel.svelte` renders `<RatingsSection>` and has `facility` in scope; confirm the exact prop names when editing.
