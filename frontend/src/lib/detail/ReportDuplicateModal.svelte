<script lang="ts">
  import { submitJson } from "$lib/api";
  import { untrack } from "svelte";
  import type { Facility } from "$lib/types";
  import { distanceMiles } from "$lib/geo";
  import { sourceLabel } from "$lib/source";
  import ModalShell from "$lib/ui/ModalShell.svelte";

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props();

  // Snapshot the facility once at open — mirrors SuggestEditModal's pattern to
  // avoid the state_referenced_locally warning.
  const initial = untrack(() => facility);

  let query = $state("");
  let selected = $state<Facility | null>(null);
  let note = $state("");
  let candidates = $state<Facility[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let submitting = $state(false);
  let submitted = $state(false);
  let alreadyReported = $state(false);
  let errorMsg = $state("");

  async function loadCandidates() {
    loading = true;
    loadError = "";
    try {
      const res = await fetch("/api/facilities?north=90&south=-90&east=180&west=-180");
      if (!res.ok) {
        loadError = "Could not load campgrounds — try again later.";
        return;
      }
      candidates = (await res.json()) as Facility[];
    } catch {
      loadError = "Could not load campgrounds — try again later.";
    } finally {
      loading = false;
    }
  }

  loadCandidates();

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((f) => f.id !== initial.id)
      .filter((f) => (q === "" ? true : f.name.toLowerCase().includes(q)))
      .map((f) => ({ f, mi: distanceMiles(initial, f) }))
      .sort((a, b) => a.mi - b.mi)
      .slice(0, 20);
  });

  async function submit() {
    if (!selected || submitting) return;
    submitting = true;
    errorMsg = "";
    try {
      const r = await submitJson<{ duplicate?: boolean }>("/api/duplicates", {
        facility_a: initial.id,
        facility_b: selected.id,
        note,
      });
      if (r.status === 201) {
        submitted = true;
      } else if (r.ok) {
        if (r.data?.duplicate) alreadyReported = true;
        else submitted = true;
      } else {
        errorMsg = r.error;
      }
    } finally {
      submitting = false;
    }
  }
</script>

<ModalShell
  eyebrow="Duplicate report"
  title={`Report duplicate — ${initial.name}`}
  ariaLabel={`Report duplicate — ${initial.name}`}
  accent="var(--pine)"
  maxHeight="min(86vh, 720px)"
  {onclose}
>
  {#if submitted}
    <p class="success">Thanks — an admin will review this pair.</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else if alreadyReported}
    <p class="success">Already reported — thanks!</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else}
    <form
      class="form"
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div class="field">
        <span class="section-label">A</span>
        <p class="facility-a">{initial.name}</p>
      </div>

      <div class="field">
        <label for="dup-search">B — search for the duplicate</label>
        <input
          id="dup-search"
          type="text"
          bind:value={query}
          placeholder="Search campgrounds by name…"
          autocomplete="off"
        />
      </div>

      {#if loading}
        <p class="hint">Loading campgrounds…</p>
      {:else if loadError}
        <p class="error" role="alert">{loadError}</p>
      {:else}
        <ul class="candidates">
          {#each filtered as { f, mi } (f.id)}
            <li>
              <button
                type="button"
                class="candidate"
                class:active={selected?.id === f.id}
                onclick={() => (selected = f)}
              >
                <span class="candidate-name">{f.name}</span>
                <span class="candidate-meta">
                  <span class="badge">{sourceLabel(f.ridb_id)}</span>
                  <span class="dist">{mi.toFixed(1)} mi</span>
                </span>
              </button>
            </li>
          {:else}
            <li class="empty">No matching campgrounds.</li>
          {/each}
        </ul>
      {/if}

      <div class="field">
        <label for="note">Note <span class="ink-faint">(optional)</span></label>
        <textarea
          id="note"
          bind:value={note}
          maxlength="1000"
          rows="3"
          placeholder="e.g. Same location, different RIDB listing"></textarea>
      </div>

      {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

      <div class="actions">
        <button class="btn btn-secondary" type="button" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={!selected || submitting}>
          {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
          {submitting ? "Submitting…" : "Report duplicate"}
        </button>
      </div>
    </form>
  {/if}
</ModalShell>

<style>
  .section-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .facility-a {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
  }
  .hint {
    font-size: 0.85rem;
    line-height: normal;
  }
  .candidate {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    background: var(--paper-deep);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 0.5rem 0.7rem;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition:
      background 0.13s var(--ease),
      border-color 0.13s var(--ease);
  }
  .candidates {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 0.4rem;
  }
  .candidates .empty {
    padding: 0.5rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
  }
  .candidate:hover {
    background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong));
  }
  .candidate.active {
    border-color: var(--pine);
    background: color-mix(in srgb, var(--moss) 16%, var(--paper-2));
  }
  .candidate-name {
    font-size: 0.86rem;
    color: var(--ink);
  }
  .candidate-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .badge {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--ink-soft);
    background: var(--paper);
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    padding: 0.1rem 0.35rem;
  }
  .dist {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    color: var(--ink-faint);
  }
</style>
