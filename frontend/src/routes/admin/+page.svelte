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
    facility_b: string;
    facility_b_name: string;
    facility_b_ridb_id: string;
    user_email: string;
    note: string;
    created: string;
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
  let winnerOverride = $state<Record<string, string>>({});

  function heuristicWinner(m: MergeRow): string {
    // Mirrors pickWinner()'s sourceRank: numeric RIDB > NPS > fs.usda.gov scrape.
    const rank = (ridbId: string) =>
      ridbId.startsWith("fs-") ? 0 : ridbId.startsWith("nps-") ? 1 : 2;
    return rank(m.facility_b_ridb_id) > rank(m.facility_a_ridb_id)
      ? m.facility_b
      : m.facility_a;
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
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const res = await fetch("/api/admin/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          admin_note: notes[row.id] ?? "",
          winner_id:
            action === "approve"
              ? (winnerOverride[row.id] ?? heuristicWinner(row))
              : undefined,
        }),
      });
      if (res.ok) {
        merges = merges.filter((m) => m.id !== row.id);
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

<main class="admin">
  <header class="page-header">
    <span class="eyebrow">Ranger's desk</span>
    <h1>Admin Review</h1>
    <p class="sub">Crowdsourced edits and duplicate reports awaiting a decision.</p>
  </header>

  <section class="queue">
    <h2>Edit suggestions <span class="count">{edits.length}</span></h2>

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

    {#if merges.length === 0}
      <p class="empty">No pending duplicate reports — the queue is clear.</p>
    {:else}
      <div class="cards">
        {#each merges as row (row.id)}
          {@const winner = winnerOverride[row.id] ?? heuristicWinner(row)}
          <article class="card">
            <div class="card-head">
              <h3>{row.facility_a_name} <span class="vs">vs</span> {row.facility_b_name}</h3>
              <span class="meta">{row.user_email} · {fmtDate(row.created)}</span>
            </div>

            <div class="merge-pair">
              <label class="merge-side" class:selected={winner === row.facility_a}>
                <input
                  type="radio"
                  name={`winner-${row.id}`}
                  checked={winner === row.facility_a}
                  onchange={() =>
                    (winnerOverride = { ...winnerOverride, [row.id]: row.facility_a })}
                />
                <span class="side-name">{row.facility_a_name}</span>
                <span class="badge">{ridbSourceBadge(row.facility_a_ridb_id)}</span>
                <span class="ridb-id">{row.facility_a_ridb_id}</span>
              </label>
              <label class="merge-side" class:selected={winner === row.facility_b}>
                <input
                  type="radio"
                  name={`winner-${row.id}`}
                  checked={winner === row.facility_b}
                  onchange={() =>
                    (winnerOverride = { ...winnerOverride, [row.id]: row.facility_b })}
                />
                <span class="side-name">{row.facility_b_name}</span>
                <span class="badge">{ridbSourceBadge(row.facility_b_ridb_id)}</span>
                <span class="ridb-id">{row.facility_b_ridb_id}</span>
              </label>
            </div>
            <p class="winner-hint">Winner keeps its record; the loser's data fills gaps, then is deleted.</p>

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
                  disabled={busy[row.id]}
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
    gap: 0.75rem;
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
    transition: border-color 0.13s var(--ease), background 0.13s var(--ease);
  }
  .merge-side.selected {
    border-color: var(--moss);
    background: color-mix(in srgb, var(--moss) 12%, var(--paper-deep));
  }
  .merge-side input {
    margin: 0;
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
  .winner-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }

  .error {
    color: var(--rust);
    font-size: 0.85rem;
    margin: 0;
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
  }
</style>
