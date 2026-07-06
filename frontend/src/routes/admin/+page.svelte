<script lang="ts">
  import { untrack } from "svelte";
  import type { Facility, Amenities } from "$lib/types";

  interface EditRow {
    id: string;
    facility_id: string;
    facility_name: string;
    user_email: string;
    changes: Record<string, unknown>;
    note: string;
    created: string;
    current: Facility | null;
  }

  interface MergeRow {
    id: string;
    facility_a: string;
    facility_a_name: string;
    facility_a_ridb_id: string;
    facility_a_data: Facility | null;
    facility_b: string;
    facility_b_name: string;
    facility_b_ridb_id: string;
    facility_b_data: Facility | null;
    user_email: string;
    note: string;
    created: string;
  }

  /** Fields the admin can pick a side for during a merge. Mirrors the
   * server-only `ChoiceField` union in `$lib/server/admin/merge.ts` — kept as
   * a local const list here because that module is server-only. */
  const CHOICE_FIELDS = [
    "name",
    "location",
    "forest",
    "district",
    "description",
    "fee_min",
    "fee_max",
    "season_start",
    "season_end",
    "fcfs",
    "fs_url",
  ] as const;
  type ChoiceField = (typeof CHOICE_FIELDS)[number];
  type Side = "a" | "b";

  const CHOICE_FIELD_LABELS: Record<ChoiceField, string> = {
    name: "Name",
    location: "Location",
    forest: "Forest",
    district: "District",
    description: "Description",
    fee_min: "Fee min ($/night)",
    fee_max: "Fee max ($/night)",
    season_start: "Season start",
    season_end: "Season end",
    fcfs: "FCFS counts",
    fs_url: "FS URL",
  };

  /** Render a facility's value for a given choice field, for the comparison grid. */
  function fieldDisplay(facility: Facility | null, field: ChoiceField): string {
    if (!facility) return "(deleted)";
    if (field === "location") {
      return `${facility.lat.toFixed(5)}, ${facility.lng.toFixed(5)}`;
    }
    if (field === "fcfs") {
      return `${facility.fcfs_total ?? 0} fcfs / ${facility.reservable_total ?? 0} reservable`;
    }
    if (field === "description") {
      const d = facility.description;
      if (!d) return "—";
      return d.length > 140 ? `${d.slice(0, 140)}…` : d;
    }
    const v = (facility as unknown as Record<string, unknown>)[field];
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  let { data }: { data: { edits: EditRow[]; merges: MergeRow[] } } = $props();

  // Snapshot once on load — rows are spliced locally on approve/reject rather
  // than re-derived from `data`, so reading props inside the initializer must
  // be untracked (see SuggestEditModal.svelte for the established pattern).
  let edits = $state(untrack(() => [...data.edits]));
  let merges = $state(untrack(() => [...data.merges]));

  const AMENITY_LABELS: Record<string, string> = {
    potableWater: "Potable Water",
    bearBoxes: "Bear Boxes",
    petsAllowed: "Pets OK",
    electricHookups: "Electric",
    picnicTables: "Picnic Tables",
    fireRings: "Fire Rings",
    accessible: "Accessible",
  };

  const FIELD_LABELS: Record<string, string> = {
    fee_min: "Fee min ($/night)",
    fee_max: "Fee max ($/night)",
    season_start: "Season start",
    season_end: "Season end",
  };

  function fieldLabel(key: string): string {
    return FIELD_LABELS[key] ?? key;
  }

  function fmtValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "(none)";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  function fmtDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function ridbSourceBadge(ridbId: string): string {
    if (ridbId.startsWith("fs-")) return "USFS";
    if (ridbId.startsWith("nps-")) return "NPS";
    return "RIDB";
  }

  // Per-row transient UI state, keyed by suggestion id.
  let rejecting = $state<Record<string, boolean>>({});
  let notes = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let busy = $state<Record<string, boolean>>({});

  // Per-merge master side ('a' | 'b') and per-field side overrides. Default:
  // "all A", per the plan. Initialized once from the `merges` snapshot.
  let winnerSide = $state<Record<string, Side>>(
    Object.fromEntries(untrack(() => merges).map((m) => [m.id, "a" as Side])),
  );
  let fieldSide = $state<Record<string, Record<ChoiceField, Side>>>(
    Object.fromEntries(
      untrack(() => merges).map((m) => [
        m.id,
        Object.fromEntries(CHOICE_FIELDS.map((f) => [f, "a" as Side])) as Record<
          ChoiceField,
          Side
        >,
      ]),
    ),
  );
  let expanded = $state<Record<string, boolean>>({});
  // True once the admin engages with the field chooser (expands the grid or
  // clicks a side). Until then approve omits field_choices entirely, so the
  // engine keeps its default gap-fill — an untouched all-'winner' map would
  // be treated as explicit choices and silently skip filling from the loser.
  let touched = $state<Record<string, boolean>>({});

  // Dismissible success notices shown above each queue after an approve,
  // keyed by the resolved suggestion id.
  interface SuccessNotice {
    id: string;
    facility_id: string;
    facility_name: string;
  }
  let mergeSuccesses = $state<SuccessNotice[]>([]);
  let editSuccesses = $state<SuccessNotice[]>([]);

  function dismissSuccess(id: string) {
    mergeSuccesses = mergeSuccesses.filter((s) => s.id !== id);
    editSuccesses = editSuccesses.filter((s) => s.id !== id);
  }

  function useAllOfSide(rowId: string, side: Side) {
    touched = { ...touched, [rowId]: true };
    winnerSide = { ...winnerSide, [rowId]: side };
    fieldSide = {
      ...fieldSide,
      [rowId]: Object.fromEntries(CHOICE_FIELDS.map((f) => [f, side])) as Record<
        ChoiceField,
        Side
      >,
    };
  }

  function setFieldSide(rowId: string, field: ChoiceField, side: Side) {
    touched = { ...touched, [rowId]: true };
    fieldSide = {
      ...fieldSide,
      [rowId]: { ...fieldSide[rowId], [field]: side },
    };
  }

  function canApproveMerge(row: MergeRow): boolean {
    return row.facility_a_data !== null && row.facility_b_data !== null;
  }

  function toggleExpand(rowId: string) {
    if (!expanded[rowId]) touched = { ...touched, [rowId]: true };
    expanded = { ...expanded, [rowId]: !expanded[rowId] };
  }

  async function resolveEdit(row: EditRow, action: "approve" | "reject") {
    if (busy[row.id]) return;
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const res = await fetch("/api/admin/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          admin_note: notes[row.id] ?? "",
        }),
      });
      if (res.ok) {
        edits = edits.filter((e) => e.id !== row.id);
        if (action === "approve") {
          const body = (await res.json().catch(() => ({}))) as {
            facility_id?: string;
            facility_name?: string;
          };
          editSuccesses = [
            ...editSuccesses,
            {
              id: row.id,
              facility_id: body.facility_id ?? "",
              facility_name: body.facility_name ?? row.facility_name,
            },
          ];
        }
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errors = { ...errors, [row.id]: body.error ?? "Something went wrong" };
      }
    } catch {
      errors = { ...errors, [row.id]: "Something went wrong" };
    } finally {
      busy = { ...busy, [row.id]: false };
    }
  }

  async function resolveMerge(row: MergeRow, action: "approve" | "reject") {
    if (busy[row.id]) return;
    if (action === "approve" && !canApproveMerge(row)) return;
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const winner = winnerSide[row.id];
      const winnerId = winner === "a" ? row.facility_a : row.facility_b;
      const fieldChoices = fieldSide[row.id];
      const field_choices =
        action === "approve" && touched[row.id]
          ? Object.fromEntries(
              CHOICE_FIELDS.map((f) => [f, fieldChoices[f] === winner ? "winner" : "loser"]),
            )
          : undefined;

      const res = await fetch("/api/admin/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          admin_note: notes[row.id] ?? "",
          winner_id: action === "approve" ? winnerId : undefined,
          field_choices,
        }),
      });
      if (res.ok) {
        merges = merges.filter((m) => m.id !== row.id);
        if (action === "approve") {
          const body = (await res.json().catch(() => ({}))) as {
            winner_id?: string;
            winner_name?: string;
          };
          mergeSuccesses = [
            ...mergeSuccesses,
            {
              id: row.id,
              facility_id: body.winner_id ?? "",
              facility_name: body.winner_name ?? "the surviving campground",
            },
          ];
        }
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errors = { ...errors, [row.id]: body.error ?? "Something went wrong" };
      }
    } catch {
      errors = { ...errors, [row.id]: "Something went wrong" };
    } finally {
      busy = { ...busy, [row.id]: false };
    }
  }
</script>

<svelte:head>
  <title>Admin Review — CampFinder</title>
</svelte:head>

{#snippet successBanner(success: SuccessNotice, prefix: string)}
  <div class="success-notice" role="status">
    <span class="success-text">{prefix} <strong>{success.facility_name}</strong> ✓</span>
    {#if success.facility_id}
      <a class="success-link" href={`/?facility=${success.facility_id}`}>View campground →</a>
    {/if}
    <button
      type="button"
      class="success-dismiss"
      aria-label="Dismiss"
      onclick={() => dismissSuccess(success.id)}
    >
      ✕
    </button>
  </div>
{/snippet}

<main class="admin">
  <header class="page-header">
    <span class="eyebrow">Ranger's desk</span>
    <h1>Admin Review</h1>
    <p class="sub">Crowdsourced edits and duplicate reports awaiting a decision.</p>
  </header>

  <section class="queue">
    <h2>Edit suggestions <span class="count">{edits.length}</span></h2>

    {#each editSuccesses as success (success.id)}
      {@render successBanner(success, "Edit applied to")}
    {/each}

    {#if edits.length === 0}
      <p class="empty">No pending suggestions — the queue is clear.</p>
    {:else}
      <div class="cards">
        {#each edits as row (row.id)}
          <article class="card">
            <div class="card-head">
              <h3>{row.facility_name}</h3>
              <span class="meta">
                {row.user_email} · {fmtDate(row.created)}
              </span>
            </div>

            <div class="diff">
              {#each Object.entries(row.changes) as [key, value]}
                {#if key === "amenities" && value && typeof value === "object"}
                  {#each Object.entries(value as Record<string, unknown>) as [aKey, aVal]}
                    <div class="diff-row">
                      <span class="diff-field">{AMENITY_LABELS[aKey] ?? aKey}</span>
                      <span class="diff-current">
                        {fmtValue(row.current?.amenities?.[aKey as keyof Amenities])}
                      </span>
                      <span class="diff-arrow">→</span>
                      <span class="diff-proposed">{fmtValue(aVal)}</span>
                    </div>
                  {/each}
                {:else}
                  <div class="diff-row">
                    <span class="diff-field">{fieldLabel(key)}</span>
                    <span class="diff-current">
                      {fmtValue(row.current ? row.current[key as keyof Facility] : undefined)}
                    </span>
                    <span class="diff-arrow">→</span>
                    <span class="diff-proposed">{fmtValue(value)}</span>
                  </div>
                {/if}
              {/each}
            </div>

            {#if row.note}
              <p class="note">"{row.note}"</p>
            {/if}

            {#if errors[row.id]}
              <p class="error" role="alert">{errors[row.id]}</p>
            {/if}

            {#if rejecting[row.id]}
              <div class="reject-form">
                <input
                  type="text"
                  placeholder="Optional note to the submitter…"
                  bind:value={notes[row.id]}
                  maxlength="1000"
                />
                <div class="actions">
                  <button
                    class="cancel"
                    type="button"
                    onclick={() => (rejecting = { ...rejecting, [row.id]: false })}
                  >
                    Back
                  </button>
                  <button
                    class="danger"
                    type="button"
                    disabled={busy[row.id]}
                    onclick={() => resolveEdit(row, "reject")}
                  >
                    Confirm reject
                  </button>
                </div>
              </div>
            {:else}
              <div class="actions">
                <button
                  class="cancel"
                  type="button"
                  disabled={busy[row.id]}
                  onclick={() => (rejecting = { ...rejecting, [row.id]: true })}
                >
                  Reject
                </button>
                <button
                  class="primary"
                  type="button"
                  disabled={busy[row.id]}
                  onclick={() => resolveEdit(row, "approve")}
                >
                  Approve
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="queue">
    <h2>Duplicate reports <span class="count">{merges.length}</span></h2>

    {#each mergeSuccesses as success (success.id)}
      {@render successBanner(success, "Merged into")}
    {/each}

    {#if merges.length === 0}
      <p class="empty">No pending duplicate reports — the queue is clear.</p>
    {:else}
      <div class="cards">
        {#each merges as row (row.id)}
          {@const winner = winnerSide[row.id]}
          {@const deleted = !canApproveMerge(row)}
          <article class="card">
            <div class="card-head">
              <h3>{row.facility_a_name} <span class="vs">vs</span> {row.facility_b_name}</h3>
              <span class="meta">{row.user_email} · {fmtDate(row.created)}</span>
            </div>

            <div class="merge-pair">
              <button
                type="button"
                class="merge-side"
                class:selected={winner === "a"}
                onclick={() => useAllOfSide(row.id, "a")}
              >
                <span class="side-name">{row.facility_a_name}</span>
                <span class="badge">{ridbSourceBadge(row.facility_a_ridb_id)}</span>
                <span class="ridb-id">{row.facility_a_ridb_id}</span>
                {#if !row.facility_a_data}<span class="deleted-tag">deleted</span>{/if}
              </button>
              <button
                type="button"
                class="use-all-hint"
                onclick={() => toggleExpand(row.id)}
              >
                {expanded[row.id] ? "Hide field comparison ▾" : "Compare fields ▸"}
              </button>
              <button
                type="button"
                class="merge-side"
                class:selected={winner === "b"}
                onclick={() => useAllOfSide(row.id, "b")}
              >
                <span class="side-name">{row.facility_b_name}</span>
                <span class="badge">{ridbSourceBadge(row.facility_b_ridb_id)}</span>
                <span class="ridb-id">{row.facility_b_ridb_id}</span>
                {#if !row.facility_b_data}<span class="deleted-tag">deleted</span>{/if}
              </button>
            </div>

            {#if deleted}
              <p class="winner-hint error-hint">
                One of these facilities was deleted since the report was filed — this merge
                can't be approved.
              </p>
            {:else if expanded[row.id]}
              <div class="field-grid">
                <div class="field-grid-head">
                  <span></span>
                  <span>A · {row.facility_a_name}</span>
                  <span>B · {row.facility_b_name}</span>
                </div>
                {#each CHOICE_FIELDS as field (field)}
                  <div class="field-grid-row">
                    <span class="field-name">{CHOICE_FIELD_LABELS[field]}</span>
                    <button
                      type="button"
                      class="field-value"
                      class:selected={fieldSide[row.id][field] === "a"}
                      onclick={() => setFieldSide(row.id, field, "a")}
                    >
                      {fieldDisplay(row.facility_a_data, field)}
                    </button>
                    <button
                      type="button"
                      class="field-value"
                      class:selected={fieldSide[row.id][field] === "b"}
                      onclick={() => setFieldSide(row.id, field, "b")}
                    >
                      {fieldDisplay(row.facility_b_data, field)}
                    </button>
                  </div>
                {/each}
              </div>
              <p class="winner-hint">
                Winner ({winner === "a" ? "A" : "B"}) keeps its record with the field choices
                above; amenities deep-merge automatically; the loser is deleted.
              </p>
            {:else}
              <p class="winner-hint">
                Winner ({winner === "a" ? "A" : "B"}) keeps its record; the loser's data fills
                gaps for unpicked fields, then is deleted.
              </p>
            {/if}

            {#if row.note}
              <p class="note">"{row.note}"</p>
            {/if}

            {#if errors[row.id]}
              <p class="error" role="alert">{errors[row.id]}</p>
            {/if}

            {#if rejecting[row.id]}
              <div class="reject-form">
                <input
                  type="text"
                  placeholder="Optional note to the submitter…"
                  bind:value={notes[row.id]}
                  maxlength="1000"
                />
                <div class="actions">
                  <button
                    class="cancel"
                    type="button"
                    onclick={() => (rejecting = { ...rejecting, [row.id]: false })}
                  >
                    Back
                  </button>
                  <button
                    class="danger"
                    type="button"
                    disabled={busy[row.id]}
                    onclick={() => resolveMerge(row, "reject")}
                  >
                    Confirm reject
                  </button>
                </div>
              </div>
            {:else}
              <div class="actions">
                <button
                  class="cancel"
                  type="button"
                  disabled={busy[row.id]}
                  onclick={() => (rejecting = { ...rejecting, [row.id]: true })}
                >
                  Reject
                </button>
                <button
                  class="primary"
                  type="button"
                  disabled={busy[row.id] || !canApproveMerge(row)}
                  onclick={() => resolveMerge(row, "approve")}
                >
                  Approve merge
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .admin {
    max-width: 880px;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 2.25rem;
  }
  .page-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.72rem;
    color: var(--ink-faint);
    font-weight: 600;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.9rem;
    font-weight: 600;
    color: var(--ink);
  }
  .sub {
    margin: 0.15rem 0 0;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }

  .queue {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .queue h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink-soft);
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.05rem 0.55rem;
  }
  .empty {
    color: var(--ink-faint);
    font-size: 0.9rem;
    font-style: italic;
    margin: 0;
    padding: 1.25rem;
    background: var(--paper-2);
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .card {
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 86%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .card-head {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .card-head h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--ink);
  }
  .vs {
    color: var(--ink-faint);
    font-weight: 400;
    font-size: 0.85em;
  }
  .meta {
    font-size: 0.78rem;
    color: var(--ink-faint);
  }

  .diff {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border-top: 1px solid var(--line);
    padding-top: 0.6rem;
  }
  .diff-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto auto auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .diff-field {
    color: var(--ink-soft);
    font-weight: 600;
  }
  .diff-current {
    font-family: var(--font-mono);
    color: var(--ink-faint);
    text-decoration: line-through;
  }
  .diff-arrow {
    color: var(--ink-faint);
  }
  .diff-proposed {
    font-family: var(--font-mono);
    color: var(--pine-deep);
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    font-style: italic;
  }

  .merge-pair {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
    border-top: 1px solid var(--line);
    padding-top: 0.7rem;
  }
  .merge-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    align-items: flex-start;
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.7rem 0.8rem;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: border-color 0.13s var(--ease), background 0.13s var(--ease);
  }
  .merge-side.selected {
    border-color: var(--moss);
    background: color-mix(in srgb, var(--moss) 12%, var(--paper-deep));
  }
  .use-all-hint {
    align-self: center;
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--ink-soft);
    font-family: var(--font-mono);
    font-size: 0.74rem;
    cursor: pointer;
    padding: 0.3rem 0.4rem;
    white-space: nowrap;
    transition: color 0.13s var(--ease);
  }
  .use-all-hint:hover {
    color: var(--pine-deep);
  }
  .side-name {
    font-weight: 600;
    color: var(--ink);
    font-size: 0.92rem;
  }
  .badge {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-soft);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
  }
  .ridb-id {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
  .deleted-tag {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--rust);
  }
  .winner-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .winner-hint.error-hint {
    color: var(--rust);
    font-style: italic;
  }

  .field-grid {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.6rem;
  }
  .field-grid-head {
    display: grid;
    grid-template-columns: minmax(110px, 0.9fr) 1fr 1fr;
    gap: 0.5rem;
    padding: 0 0.1rem 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 1px solid var(--line);
  }
  .field-grid-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.9fr) 1fr 1fr;
    gap: 0.5rem;
    align-items: stretch;
    padding: 0.15rem 0;
  }
  .field-name {
    display: flex;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .field-value {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    line-height: 1.3;
    transition: border-color 0.13s var(--ease), background 0.13s var(--ease);
  }
  .field-value.selected {
    border-color: var(--moss);
    background: color-mix(in srgb, var(--moss) 14%, var(--paper));
    color: var(--pine-deep);
    font-weight: 600;
  }
  .field-value:hover:not(.selected) {
    border-color: var(--line-strong);
  }

  .error {
    color: var(--rust);
    font-size: 0.85rem;
    margin: 0;
  }

  .success-notice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: color-mix(in srgb, var(--moss) 10%, var(--paper-2));
    border: 1px solid color-mix(in srgb, var(--moss) 45%, var(--line));
    border-radius: 12px;
    padding: 0.65rem 0.9rem;
    box-shadow: var(--shadow-sm);
    font-size: 0.88rem;
    color: var(--ink);
  }
  .success-text {
    flex: 1;
  }
  .success-text strong {
    font-weight: 600;
    color: var(--pine-deep);
  }
  .success-link {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--pine-deep);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--pine-deep) 45%, transparent);
    transition: border-color 0.13s var(--ease);
  }
  .success-link:hover {
    border-bottom-color: var(--pine-deep);
  }
  .success-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--ink-faint);
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    transition: color 0.13s var(--ease);
  }
  .success-dismiss:hover {
    color: var(--ink);
  }

  .reject-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .reject-form input {
    background: var(--paper-deep);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 0.5rem 0.7rem;
    font-size: 0.85rem;
    color: var(--ink);
    font-family: inherit;
  }
  .reject-form input:focus {
    outline: none;
    border-color: var(--moss);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .actions button {
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.13s var(--ease), transform 0.08s var(--ease);
  }
  .actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .cancel {
    background: var(--paper-deep);
    color: var(--ink);
    border: 1px solid var(--line-strong);
  }
  .cancel:hover:not(:disabled) {
    background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong));
  }
  .primary {
    background: var(--pine);
    color: #f4ecd6;
    border: 1px solid var(--pine-deep);
  }
  .primary:hover:not(:disabled) {
    background: var(--pine-deep);
  }
  .danger {
    background: var(--rust);
    color: #f4ecd6;
    border: 1px solid #832e12;
  }
  .danger:hover:not(:disabled) {
    background: #832e12;
  }

  @media (max-width: 640px) {
    .diff-row {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
    .merge-pair {
      flex-direction: column;
    }
    .field-grid-head,
    .field-grid-row {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
    .field-grid-head span:first-child {
      display: none;
    }
  }
</style>
