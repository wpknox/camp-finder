<script lang="ts">
  import { untrack } from "svelte";
  import type { Facility, Amenities, CampgroundSubmission } from "$lib/types";
  import CampgroundForm from "$lib/campground/CampgroundForm.svelte";
  import {
    draftFromSubmission,
    draftErrors,
    draftToSubmission,
    validateSourceUrl,
    type CampgroundDraft,
  } from "$lib/campgroundSubmission";
  import LocationDiffMap from "$lib/admin/LocationDiffMap.svelte";
  import PasswordResetCard from "$lib/admin/PasswordResetCard.svelte";
  import QueueSection from "$lib/admin/QueueSection.svelte";
  import ReviewCard from "$lib/admin/ReviewCard.svelte";
  import type { SuccessNotice } from "$lib/admin/types";

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

  const AMENITY_LABELS: Record<string, string> = {
    potableWater: "Potable Water",
    toiletType: "Toilets",
    bearBoxes: "Bear Boxes",
    petsAllowed: "Pets OK",
    electricHookups: "Electric",
    picnicTables: "Picnic Tables",
    fireRings: "Fire Rings",
    accessible: "Accessible",
  };

  const CARRIER_LABELS: Record<string, string> = {
    verizon: "Verizon coverage",
    att: "AT&T coverage",
    tmobile: "T-Mobile coverage",
  };

  const FIELD_LABELS: Record<string, string> = {
    fee_min: "Fee min ($/night)",
    fee_max: "Fee max ($/night)",
    season_start: "Season start",
    season_end: "Season end",
    fcfs_total: "FCFS sites",
    reservable_total: "Reservable sites",
    is_closed: "Closed",
    lat: "Latitude",
    lng: "Longitude",
    cell_coverage: "Cell coverage",
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
    if (ridbId.startsWith("user-")) return "User";
    return "RIDB";
  }

  // Per-row transient UI state, keyed by suggestion id.
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
  let mergeSuccesses = $state<SuccessNotice[]>([]);
  let editSuccesses = $state<SuccessNotice[]>([]);
  let deletionSuccesses = $state<SuccessNotice[]>([]);
  let campgroundSuccesses = $state<SuccessNotice[]>([]);

  // Card collapse state — cards start expanded; `collapsed` only records overrides.
  let collapsed = $state<Record<string, boolean>>({});
  const isOpen = (id: string) => !collapsed[id];
  function toggleOpen(id: string) {
    collapsed = { ...collapsed, [id]: !collapsed[id] };
  }
  function setAllOpen(ids: string[], open: boolean) {
    collapsed = { ...collapsed, ...Object.fromEntries(ids.map((id) => [id, !open])) };
  }

  function dismissSuccess(id: string) {
    mergeSuccesses = mergeSuccesses.filter((s) => s.id !== id);
    editSuccesses = editSuccesses.filter((s) => s.id !== id);
    deletionSuccesses = deletionSuccesses.filter((s) => s.id !== id);
    campgroundSuccesses = campgroundSuccesses.filter((s) => s.id !== id);
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

  async function resolveEdit(row: EditRow, action: "approve" | "reject", note = "") {
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
          admin_note: note,
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

  async function resolveMerge(row: MergeRow, action: "approve" | "reject", note = "") {
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
          admin_note: note,
          winner_id: action === "approve" ? winnerId : undefined,
          field_choices,
        }),
      });
      if (res.ok) {
        merges = merges.filter((m) => m.id !== row.id);
        if (action === "approve") {
          const body = (await res.json().catch(() => ({}))) as {
            facility_id?: string;
            facility_name?: string;
          };
          mergeSuccesses = [
            ...mergeSuccesses,
            {
              id: row.id,
              facility_id: body.facility_id ?? "",
              facility_name: body.facility_name ?? "the surviving campground",
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

  async function resolveDeletion(row: DeletionRow, action: "approve" | "reject", note = "") {
    if (busy[row.id]) return;
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const res = await fetch("/api/admin/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          admin_note: note,
        }),
      });
      if (res.ok) {
        deletions = deletions.filter((d) => d.id !== row.id);
        if (action === "approve") {
          deletionSuccesses = [
            ...deletionSuccesses,
            { id: row.id, facility_id: "", facility_name: row.facility_name },
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

  async function resolveCampground(row: CampgroundRow, action: "approve" | "reject", note = "") {
    if (busy[row.id]) return;
    if (action === "approve" && !drafts[row.id]) return;
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const res = await fetch("/api/admin/campground-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? {
                id: row.id,
                action,
                submission: draftToSubmission(drafts[row.id]),
                source_url: (sourceUrls[row.id] ?? "").trim(),
              }
            : { id: row.id, action, admin_note: note },
        ),
      });
      if (res.ok) {
        campgrounds = campgrounds.filter((c) => c.id !== row.id);
        if (action === "approve") {
          const body = (await res.json().catch(() => ({}))) as {
            facility_id?: string;
            facility_name?: string;
          };
          campgroundSuccesses = [
            ...campgroundSuccesses,
            {
              id: row.id,
              facility_id: body.facility_id ?? "",
              facility_name:
                body.facility_name ?? drafts[row.id]?.name ?? row.submission?.name ?? "campground",
            },
          ];
        }
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          facility_id?: string;
        };
        const msg = body.error ?? "Something went wrong";
        errors = {
          ...errors,
          [row.id]: body.facility_id ? `${msg} (facility ${body.facility_id})` : msg,
        };
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
      successes={campgroundSuccesses}
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
      successes={editSuccesses}
      successPrefix="Edit applied to"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(edits.map((e) => e.id), true)}
      oncollapseall={() => setAllOpen(edits.map((e) => e.id), false)}
    >
      {#each edits as row (row.id)}
        {@const propLat = row.changes.lat}
        {@const propLng = row.changes.lng}
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
              {:else if key === "cell_coverage" && value && typeof value === "object"}
                {#each Object.entries(value as Record<string, unknown>) as [cKey, cVal]}
                  <div class="diff-row">
                    <span class="diff-field">{CARRIER_LABELS[cKey] ?? cKey}</span>
                    <span class="diff-current">
                      {fmtValue(row.current?.cell_coverage?.[cKey as "verizon" | "att" | "tmobile"])}
                    </span>
                    <span class="diff-arrow">→</span>
                    <span class="diff-proposed">{fmtValue(cVal)}</span>
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

          {#if typeof propLat === "number" && typeof propLng === "number" && row.current}
            <LocationDiffMap
              fromLat={row.current.lat}
              fromLng={row.current.lng}
              toLat={propLat}
              toLng={propLng}
            />
          {/if}

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
      successes={mergeSuccesses}
      successPrefix="Merged into"
      ondismiss={dismissSuccess}
      onexpandall={() => setAllOpen(merges.map((m) => m.id), true)}
      oncollapseall={() => setAllOpen(merges.map((m) => m.id), false)}
    >
      {#each merges as row (row.id)}
        {@const winner = winnerSide[row.id]}
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
            <button type="button" class="use-all-hint" onclick={() => toggleExpand(row.id)}>
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
        </ReviewCard>
      {/each}
    </QueueSection>

    <QueueSection
      title="Deletion flags"
      count={deletions.length}
      emptyText="No pending deletion flags — the queue is clear."
      successes={deletionSuccesses}
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
              <span class="badge">{ridbSourceBadge(row.facility_ridb_id)}</span> ·
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

  .dup-tag {
    color: var(--ochre, #b9852c);
    font-weight: 600;
  }
</style>
