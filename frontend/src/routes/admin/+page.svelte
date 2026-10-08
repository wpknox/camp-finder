<script lang="ts">
  import { untrack } from "svelte";
  import type { CampgroundSubmission } from "$lib/types";
  import CampgroundForm from "$lib/campground/CampgroundForm.svelte";
  import {
    draftFromSubmission,
    draftErrors,
    draftToSubmission,
    validateSourceUrl,
    type CampgroundDraft,
  } from "$lib/campgroundSubmission";
  import { submitJson } from "$lib/api";
  import EditDiff from "$lib/admin/EditDiff.svelte";
  import MergeComparison from "$lib/admin/MergeComparison.svelte";
  import PasswordResetCard from "$lib/admin/PasswordResetCard.svelte";
  import QueueSection from "$lib/admin/QueueSection.svelte";
  import ReviewCard from "$lib/admin/ReviewCard.svelte";
  import type { EditRow, MergeChoice, MergeRow, SuccessNotice } from "$lib/admin/types";
  import { formatDate } from "$lib/format";
  import { sourceLabel } from "$lib/source";
  import { CHOICE_FIELDS, type ChoiceField } from "$lib/admin/mergeFields";

  interface DeletionRow {
    id: string;
    facility_id: string | null;
    facility_name: string;
    facility_ridb_id: string;
    user_email: string;
    note: string;
    created: string;
  }

  interface CampgroundRow {
    id: string;
    user_id: string;
    submission: CampgroundSubmission | null;
    source_url: string | null;
    note: string;
    created: string;
    user_email: string;
    nearby: { id: string; name: string; km: number }[];
  }

  type Queue = "campgrounds" | "edits" | "merges" | "deletions";
  type Action = "approve" | "reject";

  let {
    data,
  }: {
    data: {
      edits: EditRow[];
      merges: MergeRow[];
      deletions: DeletionRow[];
      campgrounds: CampgroundRow[];
    };
  } = $props();

  // Snapshot once on load — rows are spliced locally on approve/reject rather
  // than re-derived from `data`, so reading props inside the initializer must
  // be untracked (see SuggestEditModal.svelte for the established pattern).
  let edits = $state(untrack(() => [...data.edits]));
  let merges = $state(untrack(() => [...data.merges]));
  let deletions = $state(untrack(() => [...data.deletions]));
  let campgrounds = $state(untrack(() => [...data.campgrounds]));

  // Editable per-row copies of each suggested campground. Rows whose stored
  // submission couldn't be parsed get no draft (only Reject is available).
  let drafts = $state<Record<string, CampgroundDraft>>(
    untrack(() =>
      Object.fromEntries(
        data.campgrounds
          .filter((c) => c.submission !== null)
          .map((c) => [c.id, draftFromSubmission(c.submission as CampgroundSubmission)]),
      ),
    ),
  );
  let sourceUrls = $state<Record<string, string>>(
    untrack(() => Object.fromEntries(data.campgrounds.map((c) => [c.id, c.source_url ?? ""]))),
  );

  // Per-merge chooser state (see MergeChoice). Default: "all A", per the plan.
  // Initialized once from the `merges` snapshot.
  let choices = $state<Record<string, MergeChoice>>(
    Object.fromEntries(
      untrack(() => merges).map((m) => [
        m.id,
        {
          winner: "a",
          fieldSide: Object.fromEntries(CHOICE_FIELDS.map((f) => [f, "a"])) as MergeChoice["fieldSide"],
          expanded: false,
          touched: false,
        } satisfies MergeChoice,
      ]),
    ),
  );

  const fmtDate = (iso: string): string =>
    formatDate(iso, { year: "numeric", month: "short", day: "numeric" });

  // Per-row transient UI state, keyed by suggestion id.
  let errors = $state<Record<string, string>>({});
  let busy = $state<Record<string, boolean>>({});

  // Dismissible success notices shown above each queue after an approve.
  // Suggestion ids are unique across queues, so dismiss filters every list.
  let successes = $state<Record<Queue, SuccessNotice[]>>({
    campgrounds: [],
    edits: [],
    merges: [],
    deletions: [],
  });
  function dismissSuccess(id: string) {
    for (const q of Object.keys(successes) as Queue[]) {
      successes[q] = successes[q].filter((s) => s.id !== id);
    }
  }

  // Card collapse state — cards start expanded; `collapsed` only records overrides.
  let collapsed = $state<Record<string, boolean>>({});
  const isOpen = (id: string) => !collapsed[id];
  function toggleOpen(id: string) {
    collapsed = { ...collapsed, [id]: !collapsed[id] };
  }
  function setAllOpen(ids: string[], open: boolean) {
    collapsed = { ...collapsed, ...Object.fromEntries(ids.map((id) => [id, !open])) };
  }

  const canApproveMerge = (row: MergeRow) =>
    row.facility_a_data !== null && row.facility_b_data !== null;

  interface ResolveBody {
    ok?: boolean;
    facility_id?: string;
    facility_name?: string;
    error?: string;
  }

  /**
   * POST a moderation decision, then drop the row (`onResolved`) and, on
   * approve, push a success notice. `notice` maps the response body to the
   * notice's facility link/name; `appendFacilityId` adds the failing facility
   * to the error message when the server names one.
   */
  async function resolve(
    endpoint: string,
    queue: Queue,
    rowId: string,
    payload: { action: Action } & Record<string, unknown>,
    opts: {
      onResolved: () => void;
      notice: (body: ResolveBody) => { facility_id: string; facility_name: string };
      appendFacilityId?: boolean;
    },
  ) {
    if (busy[rowId]) return;
    busy = { ...busy, [rowId]: true };
    errors = { ...errors, [rowId]: "" };
    const res = await submitJson<ResolveBody>(endpoint, payload);
    if (res.ok) {
      opts.onResolved();
      if (payload.action === "approve") {
        successes[queue] = [...successes[queue], { id: rowId, ...opts.notice(res.data ?? {}) }];
      }
    } else {
      const facilityId = res.data?.facility_id;
      errors = {
        ...errors,
        [rowId]: opts.appendFacilityId && facilityId ? `${res.error} (facility ${facilityId})` : res.error,
      };
    }
    busy = { ...busy, [rowId]: false };
  }

  /** Notice from the response body, falling back to `name` when it has none. */
  const noticeFrom = (name: string) => (body: ResolveBody) => ({
    facility_id: body.facility_id ?? "",
    facility_name: body.facility_name ?? name,
  });

  const resolveEdit = (row: EditRow, action: Action, note = "") =>
    resolve("/api/admin/suggestions", "edits", row.id, { id: row.id, action, admin_note: note }, {
      onResolved: () => (edits = edits.filter((e) => e.id !== row.id)),
      notice: noticeFrom(row.facility_name),
    });

  function resolveMerge(row: MergeRow, action: Action, note = "") {
    if (action === "approve" && !canApproveMerge(row)) return;
    const choice = choices[row.id];
    const winnerId = choice.winner === "a" ? row.facility_a : row.facility_b;
    // field_choices only once the chooser was touched — see MergeChoice.touched.
    const field_choices =
      action === "approve" && choice.touched
        ? Object.fromEntries(
            CHOICE_FIELDS.map((f: ChoiceField) => [
              f,
              choice.fieldSide[f] === choice.winner ? "winner" : "loser",
            ]),
          )
        : undefined;
    return resolve(
      "/api/admin/merges",
      "merges",
      row.id,
      {
        id: row.id,
        action,
        admin_note: note,
        winner_id: action === "approve" ? winnerId : undefined,
        field_choices,
      },
      {
        onResolved: () => (merges = merges.filter((m) => m.id !== row.id)),
        notice: noticeFrom("the surviving campground"),
      },
    );
  }

  const resolveDeletion = (row: DeletionRow, action: Action, note = "") =>
    resolve("/api/admin/deletions", "deletions", row.id, { id: row.id, action, admin_note: note }, {
      onResolved: () => (deletions = deletions.filter((d) => d.id !== row.id)),
      notice: () => ({ facility_id: "", facility_name: row.facility_name }),
    });

  function resolveCampground(row: CampgroundRow, action: Action, note = "") {
    if (action === "approve" && !drafts[row.id]) return;
    return resolve(
      "/api/admin/campground-suggestions",
      "campgrounds",
      row.id,
      action === "approve"
        ? {
            id: row.id,
            action,
            submission: draftToSubmission(drafts[row.id]),
            source_url: (sourceUrls[row.id] ?? "").trim(),
          }
        : { id: row.id, action, admin_note: note },
      {
        onResolved: () => (campgrounds = campgrounds.filter((c) => c.id !== row.id)),
        notice: noticeFrom(drafts[row.id]?.name ?? row.submission?.name ?? "campground"),
        appendFacilityId: true,
      },
    );
  }
</script>

<svelte:head>
  <title>Admin Review — CampFinder</title>
</svelte:head>

<main class="admin">
  <div class="admin-inner">
    <header class="page-header">
      <span class="eyebrow">Ranger's desk</span>
      <h1>Admin Review</h1>
      <p class="sub">New campgrounds, edits, duplicate reports and deletion flags awaiting a decision.</p>
    </header>

    <PasswordResetCard />

    <QueueSection
      title="Suggested campgrounds"
      count={campgrounds.length}
      emptyText="No suggested campgrounds — the queue is clear."
      successes={successes.campgrounds}
      successPrefix="Added"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(campgrounds.map((c) => c.id), true)}
      oncollapseall={() => setAllOpen(campgrounds.map((c) => c.id), false)}
    >
      {#each campgrounds as row (row.id)}
        {@const draft = drafts[row.id]}
        {@const draftErrs = draft ? draftErrors(draft) : {}}
        {@const srcErr = validateSourceUrl((sourceUrls[row.id] ?? "").trim())}
        {@const invalid = !draft || Object.keys(draftErrs).length > 0 || srcErr !== null}
        <ReviewCard
          open={isOpen(row.id)}
          ontoggle={() => toggleOpen(row.id)}
          error={errors[row.id]}
          busy={busy[row.id]}
          approveLabel="Approve &amp; add to map"
          approveDisabled={invalid}
          onapprove={() => resolveCampground(row, "approve")}
          onreject={(note) => resolveCampground(row, "reject", note)}
        >
          {#snippet title()}{draft?.name?.trim() || row.submission?.name || "(unnamed)"}{/snippet}
          {#snippet meta()}
            <span class="badge">User</span> · {row.user_email} · {fmtDate(row.created)}
            {#if row.nearby.length > 0}· <span class="dup-tag">possible duplicate</span>{/if}
          {/snippet}

          {#if row.nearby.length > 0}
            <div class="dup-warning" role="note">
              <strong>Possible duplicate — within 1.5 km:</strong>
              <ul>
                {#each row.nearby as n (n.id)}
                  <li>
                    <span>{n.name} — {n.km.toFixed(2)} km</span>
                    <a class="map-link" href={`/?facility=${n.id}`} target="_blank" rel="noopener">
                      View on map ↗
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if row.source_url}
            <a
              class="map-link"
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Submitter's source link ↗
            </a>
          {/if}
          {#if row.note}
            <p class="note">"{row.note}"</p>
          {/if}

          {#if draft}
            <CampgroundForm
              bind:draft={drafts[row.id]}
              errors={draftErrs}
              showAdminFields
              showAllErrors
              idPrefix={`card-${row.id}`}
            />
            <div class="source-field">
              <label for={`card-${row.id}-source`}>Source link</label>
              <input
                id={`card-${row.id}-source`}
                type="url"
                placeholder="https://…"
                bind:value={sourceUrls[row.id]}
              />
              {#if srcErr}
                <p class="error" role="alert">{srcErr}</p>
              {/if}
            </div>
          {:else}
            <p class="winner-hint error-hint">
              This submission couldn't be read — reject it to clear it from the queue.
            </p>
          {/if}
        </ReviewCard>
      {/each}
    </QueueSection>

    <QueueSection
      title="Edit suggestions"
      count={edits.length}
      emptyText="No pending suggestions — the queue is clear."
      successes={successes.edits}
      successPrefix="Edit applied to"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(edits.map((e) => e.id), true)}
      oncollapseall={() => setAllOpen(edits.map((e) => e.id), false)}
    >
      {#each edits as row (row.id)}
        <ReviewCard
          open={isOpen(row.id)}
          ontoggle={() => toggleOpen(row.id)}
          error={errors[row.id]}
          busy={busy[row.id]}
          approveLabel="Approve"
          onapprove={() => resolveEdit(row, "approve")}
          onreject={(note) => resolveEdit(row, "reject", note)}
        >
          {#snippet title()}{row.facility_name}{/snippet}
          {#snippet meta()}{row.user_email} · {fmtDate(row.created)}{/snippet}
          {#snippet headExtra()}
            {#if row.current}
              <a class="map-link" href={`/?facility=${row.facility_id}`} target="_blank" rel="noopener">
                View on map ↗
              </a>
            {/if}
          {/snippet}

          <EditDiff {row} />

          {#if row.note}
            <p class="note">"{row.note}"</p>
          {/if}
        </ReviewCard>
      {/each}
    </QueueSection>

    <QueueSection
      title="Duplicate reports"
      count={merges.length}
      emptyText="No pending duplicate reports — the queue is clear."
      successes={successes.merges}
      successPrefix="Merged into"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(merges.map((m) => m.id), true)}
      oncollapseall={() => setAllOpen(merges.map((m) => m.id), false)}
    >
      {#each merges as row (row.id)}
        {@const deleted = !canApproveMerge(row)}
        <ReviewCard
          open={isOpen(row.id)}
          ontoggle={() => toggleOpen(row.id)}
          error={errors[row.id]}
          busy={busy[row.id]}
          approveLabel="Approve merge"
          approveDisabled={deleted}
          onapprove={() => resolveMerge(row, "approve")}
          onreject={(note) => resolveMerge(row, "reject", note)}
        >
          {#snippet title()}{row.facility_a_name} <span class="vs">vs</span> {row.facility_b_name}{/snippet}
          {#snippet meta()}{row.user_email} · {fmtDate(row.created)}{/snippet}
          {#snippet headExtra()}
            <span class="map-links">
              {#if row.facility_a_data}
                <a class="map-link" href={`/?facility=${row.facility_a}`} target="_blank" rel="noopener">
                  A on map ↗
                </a>
              {/if}
              {#if row.facility_b_data}
                <a class="map-link" href={`/?facility=${row.facility_b}`} target="_blank" rel="noopener">
                  B on map ↗
                </a>
              {/if}
            </span>
          {/snippet}

          <MergeComparison {row} bind:choice={choices[row.id]} />

          {#if row.note}
            <p class="note">"{row.note}"</p>
          {/if}
        </ReviewCard>
      {/each}
    </QueueSection>

    <QueueSection
      title="Deletion flags"
      count={deletions.length}
      emptyText="No pending deletion flags — the queue is clear."
      successes={successes.deletions}
      successPrefix="Removed"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(deletions.map((d) => d.id), true)}
      oncollapseall={() => setAllOpen(deletions.map((d) => d.id), false)}
    >
      {#each deletions as row (row.id)}
        <ReviewCard
          open={isOpen(row.id)}
          ontoggle={() => toggleOpen(row.id)}
          error={errors[row.id]}
          busy={busy[row.id]}
          approveLabel="Delete campground"
          approveTone="danger"
          approveDisabled={!row.facility_id}
          onapprove={() => resolveDeletion(row, "approve")}
          onreject={(note) => resolveDeletion(row, "reject", note)}
        >
          {#snippet title()}{row.facility_name}{/snippet}
          {#snippet meta()}
            {#if row.facility_ridb_id}
              <span class="badge">{sourceLabel(row.facility_ridb_id)}</span> ·
            {/if}
            {row.user_email} · {fmtDate(row.created)}
          {/snippet}
          {#snippet headExtra()}
            {#if row.facility_id}
              <a class="map-link" href={`/?facility=${row.facility_id}`} target="_blank" rel="noopener">
                View on map ↗
              </a>
            {/if}
          {/snippet}

          <p class="note">"{row.note}"</p>

          {#if !row.facility_id}
            <p class="winner-hint error-hint">
              This facility was already removed (merge or prior deletion) — reject to clear the flag.
            </p>
          {/if}
        </ReviewCard>
      {/each}
    </QueueSection>
  </div>
</main>

<style>
  /* .app-shell (layout) is a fixed-height flex row with overflow:hidden for
     the map screen — the admin page must be its own scroll container. */
  .admin {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
  .admin-inner {
    max-width: 880px;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 2.25rem;
  }
  .map-links {
    display: flex;
    gap: 0.9rem;
  }
  .map-link {
    width: fit-content;
    font-family: var(--font-mono);
    font-size: 0.76rem;
    color: var(--pine-deep);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--pine-deep) 45%, transparent);
    transition: border-color 0.13s var(--ease);
  }
  .map-link:hover {
    border-bottom-color: var(--pine-deep);
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


  .vs {
    color: var(--ink-faint);
    font-weight: 400;
    font-size: 0.85em;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    font-style: italic;
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
  .winner-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
  }
  .winner-hint.error-hint {
    color: var(--rust);
    font-style: italic;
  }

  .error {
    color: var(--rust);
    font-size: 0.85rem;
    margin: 0;
  }


  .dup-warning {
    background: color-mix(in srgb, var(--ochre, #b9852c) 14%, var(--paper-2));
    border: 1px solid color-mix(in srgb, var(--ochre, #b9852c) 55%, var(--line));
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .dup-warning ul {
    margin: 0.35rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .dup-warning li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.8rem;
  }
  .source-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .source-field label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .source-field input {
    background: var(--paper-deep);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 0.5rem 0.7rem;
    font-size: 0.85rem;
    color: var(--ink);
    font-family: inherit;
  }
  .source-field input:focus {
    outline: none;
    border-color: var(--moss);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent);
  }



  .dup-tag {
    color: var(--ochre, #b9852c);
    font-weight: 600;
  }
</style>
