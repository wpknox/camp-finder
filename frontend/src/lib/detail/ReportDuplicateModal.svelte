<script lang="ts">
  import { untrack } from 'svelte'
  import type { Facility } from '$lib/types'

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props()

  // Snapshot the facility once at open — mirrors SuggestEditModal's pattern to
  // avoid the state_referenced_locally warning.
  const initial = untrack(() => facility)

  let query = $state('')
  let selected = $state<Facility | null>(null)
  let note = $state('')
  let candidates = $state<Facility[]>([])
  let loading = $state(true)
  let loadError = $state('')
  let submitting = $state(false)
  let submitted = $state(false)
  let alreadyReported = $state(false)
  let errorMsg = $state('')

  function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371,
      dLat = ((b.lat - a.lat) * Math.PI) / 180,
      dLng = ((b.lng - a.lng) * Math.PI) / 180
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
  }

  function sourceBadge(ridbId: string): string {
    if (ridbId.startsWith('nps-')) return 'NPS'
    if (ridbId.startsWith('fs-')) return 'USFS'
    return 'RIDB'
  }

  async function loadCandidates() {
    loading = true
    loadError = ''
    try {
      const res = await fetch('/api/facilities?north=90&south=-90&east=180&west=-180')
      if (!res.ok) {
        loadError = 'Could not load campgrounds — try again later.'
        return
      }
      candidates = (await res.json()) as Facility[]
    } catch {
      loadError = 'Could not load campgrounds — try again later.'
    } finally {
      loading = false
    }
  }

  loadCandidates()

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    return candidates
      .filter((f) => f.id !== initial.id)
      .filter((f) => (q === '' ? true : f.name.toLowerCase().includes(q)))
      .map((f) => ({ f, km: distKm(initial, f) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 20)
  })

  async function submit() {
    if (!selected || submitting) return
    submitting = true
    errorMsg = ''
    try {
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ facility_a: initial.id, facility_b: selected.id, note }),
      })
      if (res.status === 201) {
        submitted = true
      } else if (res.ok) {
        const data = (await res.json()) as { duplicate?: boolean }
        if (data.duplicate) alreadyReported = true
        else submitted = true
      } else {
        errorMsg = ((await res.json()) as { error?: string }).error ?? 'Something went wrong'
      }
    } catch {
      errorMsg = 'Something went wrong'
    } finally {
      submitting = false
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Report duplicate — ${initial.name}`}>
    <span class="eyebrow">Duplicate report</span>
    <h2>Report duplicate — {initial.name}</h2>

    {#if submitted}
      <p class="success">Thanks — an admin will review this pair.</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else if alreadyReported}
      <p class="success">Already reported — thanks!</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else}
      <form class="edit-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
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
            {#each filtered as { f, km } (f.id)}
              <li>
                <button
                  type="button"
                  class="candidate"
                  class:active={selected?.id === f.id}
                  onclick={() => (selected = f)}
                >
                  <span class="candidate-name">{f.name}</span>
                  <span class="candidate-meta">
                    <span class="badge">{sourceBadge(f.ridb_id)}</span>
                    <span class="dist">{km.toFixed(1)} km</span>
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
            placeholder="e.g. Same location, different RIDB listing"
          ></textarea>
        </div>

        {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

        <div class="actions">
          <button class="cancel" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!selected || submitting}>
            {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
            {submitting ? 'Submitting…' : 'Report duplicate'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(35, 28, 14, 0.5); backdrop-filter: blur(2px); z-index: 4000; display: grid; place-items: center; padding: 1rem; }
  .modal {
    position: relative;
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 86%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    padding: 1.9rem;
    width: min(460px, 100%);
    max-height: min(86vh, 720px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    box-shadow: var(--shadow-lg);
    animation: modal-in 0.32s var(--ease);
  }
  .modal::before {
    content: "";
    position: absolute;
    left: 0; top: 14px; bottom: 14px;
    width: 4px;
    border-radius: 4px;
    background: var(--pine);
  }
  @keyframes modal-in {
    from { opacity: 0; transform: translateY(10px) scale(0.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .eyebrow { margin-top: 0.1rem; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72rem; color: var(--ink-faint); font-weight: 600; }
  h2 { margin: 0 0 0.4rem; font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; line-height: 1.2; }
  .edit-form { display: flex; flex-direction: column; gap: 0.9rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  label { font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
  .ink-faint { font-weight: 400; color: var(--ink-faint); }
  .section-label { font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
  .facility-a { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--ink); }
  input, textarea { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 9px; padding: 0.55rem 0.75rem; font-size: 0.9rem; width: 100%; box-sizing: border-box; color: var(--ink); font-family: inherit; transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); }
  input::placeholder, textarea::placeholder { color: var(--ink-faint); }
  input:focus, textarea:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  textarea { resize: vertical; }
  .hint { margin: 0; font-size: 0.85rem; color: var(--ink-faint); }
  .candidates { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; max-height: 260px; overflow-y: auto; border: 1px solid var(--line); border-radius: 9px; padding: 0.4rem; }
  .candidates .empty { padding: 0.5rem; font-size: 0.85rem; color: var(--ink-faint); }
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
    transition: background 0.13s var(--ease), border-color 0.13s var(--ease);
  }
  .candidate:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .candidate.active { border-color: var(--pine); background: color-mix(in srgb, var(--moss) 16%, var(--paper-2)); }
  .candidate-name { font-size: 0.86rem; color: var(--ink); }
  .candidate-meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
  .badge { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; color: var(--ink-soft); background: var(--paper); border: 1px solid var(--line-strong); border-radius: 5px; padding: 0.1rem 0.35rem; }
  .dist { font-family: var(--font-mono); font-size: 0.76rem; color: var(--ink-faint); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.2rem; }
  .cancel { background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.6rem 1rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.13s var(--ease); }
  .cancel:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .primary { display: flex; align-items: center; justify-content: center; gap: 0.45rem; background: var(--pine); color: #f4ecd6; border: 1px solid var(--pine-deep); border-radius: 9px; padding: 0.6rem 1.1rem; cursor: pointer; font-size: 0.9rem; font-weight: 600; box-shadow: var(--shadow-sm); transition: background 0.15s var(--ease), transform 0.08s var(--ease); }
  .primary:hover:not(:disabled) { background: var(--pine-deep); }
  .primary:active:not(:disabled) { transform: translateY(1px); }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(244, 236, 214, 0.4); border-top-color: #f4ecd6; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: var(--rust); font-size: 0.85rem; margin: 0; }
  .success { font-size: 0.95rem; color: var(--ink); line-height: 1.5; }

  @media (max-width: 640px) {
    .modal { width: 100%; max-height: 92vh; }
  }
</style>
