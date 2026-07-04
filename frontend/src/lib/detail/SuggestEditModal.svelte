<script lang="ts">
  import { untrack } from 'svelte'
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

  // Snapshot the facility once at open — the form edits a copy, not live props.
  const initial = untrack(() => facility)
  let feeMin = $state(initial.fee_min?.toString() ?? '')
  let feeMax = $state(initial.fee_max?.toString() ?? '')
  let seasonStart = $state(initial.season_start ?? '')
  let seasonEnd = $state(initial.season_end ?? '')
  let amenityValues = $state(Object.fromEntries(
    EDITABLE_AMENITIES.map(({ key }) => [key, triState(initial.amenities?.[key] as boolean | null)]),
  ) as Record<string, 'yes' | 'no' | 'unknown'>)
  let note = $state('')
  let submitting = $state(false)
  let submitted = $state(false)
  let errorMsg = $state('')

  // Inline validation, only surfaced after blur — mirrors AuthModal's pattern.
  let touched = $state({ feeMin: false, feeMax: false })
  function touch(field: keyof typeof touched) {
    touched = { ...touched, [field]: true }
  }
  const feeMinError = $derived(
    feeMin !== '' && Number.isNaN(Number(feeMin)) ? 'Enter a valid number.' : '',
  )
  const feeMaxError = $derived(
    feeMax !== '' && Number.isNaN(Number(feeMax)) ? 'Enter a valid number.' : '',
  )
  const feesValid = $derived(!feeMinError && !feeMaxError)

  let changes = $derived.by(() => {
    const c: EditChanges = {}
    if (!feesValid) return c
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
    touched = { feeMin: true, feeMax: true }
    if (!hasChanges || submitting || !feesValid) return
    submitting = true
    errorMsg = ''
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ facility_id: facility.id, changes, note }),
      })
      if (res.ok) submitted = true
      else errorMsg = ((await res.json()) as { error?: string }).error ?? 'Something went wrong'
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
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Suggest an edit — ${facility.name}`}>
    <span class="eyebrow">Field correction</span>
    <h2>Suggest an edit — {facility.name}</h2>

    {#if submitted}
      <p class="success">Thanks — an admin will review your suggestion.</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else}
      <form class="edit-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <div class="row-2">
          <div class="field">
            <label for="fee-min">Fee min ($/night)</label>
            <input
              id="fee-min"
              type="text"
              inputmode="decimal"
              bind:value={feeMin}
              onblur={() => touch('feeMin')}
              placeholder="e.g. 15"
              class:invalid={touched.feeMin && feeMinError}
              aria-invalid={touched.feeMin && !!feeMinError}
            />
            {#if touched.feeMin && feeMinError}<p class="field-error">{feeMinError}</p>{/if}
          </div>
          <div class="field">
            <label for="fee-max">Fee max ($/night)</label>
            <input
              id="fee-max"
              type="text"
              inputmode="decimal"
              bind:value={feeMax}
              onblur={() => touch('feeMax')}
              placeholder="e.g. 25"
              class:invalid={touched.feeMax && feeMaxError}
              aria-invalid={touched.feeMax && !!feeMaxError}
            />
            {#if touched.feeMax && feeMaxError}<p class="field-error">{feeMaxError}</p>{/if}
          </div>
        </div>

        <div class="row-2">
          <div class="field">
            <label for="season-start">Season start</label>
            <input id="season-start" type="text" bind:value={seasonStart} placeholder="e.g. May 15" />
          </div>
          <div class="field">
            <label for="season-end">Season end</label>
            <input id="season-end" type="text" bind:value={seasonEnd} placeholder="e.g. Sept 30" />
          </div>
        </div>

        <div class="amenities">
          <span class="section-label">Amenities</span>
          {#each EDITABLE_AMENITIES as { key, label } (key)}
            <div class="amenity-row">
              <span class="amenity-label">{label}</span>
              <div class="segmented">
                <button type="button" class:active={amenityValues[key] === 'yes'}
                        onclick={() => (amenityValues = { ...amenityValues, [key]: 'yes' })}>Yes</button>
                <button type="button" class:active={amenityValues[key] === 'no'}
                        onclick={() => (amenityValues = { ...amenityValues, [key]: 'no' })}>No</button>
                <button type="button" class:active={amenityValues[key] === 'unknown'}
                        onclick={() => (amenityValues = { ...amenityValues, [key]: 'unknown' })}>Unknown</button>
              </div>
            </div>
          {/each}
        </div>

        <div class="field">
          <label for="note">Note <span class="ink-faint">(sources, details — optional)</span></label>
          <textarea id="note" bind:value={note} maxlength="1000" rows="3"
                    placeholder="e.g. Verified on site 6/2026, water spigot near site 4 is shut off"></textarea>
        </div>

        {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

        <div class="actions">
          <button class="cancel" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!hasChanges || submitting}>
            {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
            {submitting ? 'Submitting…' : 'Submit suggestion'}
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
  .row-2 { display: flex; gap: 0.75rem; }
  .row-2 .field { flex: 1; min-width: 0; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  label { font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
  .ink-faint { font-weight: 400; color: var(--ink-faint); }
  input, textarea { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 9px; padding: 0.55rem 0.75rem; font-size: 0.9rem; width: 100%; box-sizing: border-box; color: var(--ink); font-family: inherit; transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); }
  input::placeholder, textarea::placeholder { color: var(--ink-faint); }
  input:focus, textarea:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  input.invalid { border-color: var(--rust); }
  input.invalid:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--rust) 22%, transparent); }
  textarea { resize: vertical; }
  .field-error { color: var(--rust); font-size: 0.78rem; margin: 0; }
  .amenities { display: flex; flex-direction: column; gap: 0.55rem; border-top: 1px solid var(--line); padding-top: 0.8rem; }
  .section-label { font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
  .amenity-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  .amenity-label { font-size: 0.86rem; color: var(--ink); }
  .segmented { display: flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; }
  .segmented button { background: var(--paper-deep); color: var(--ink-soft); border: none; padding: 0.32rem 0.6rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; border-right: 1px solid var(--line-strong); transition: background 0.13s var(--ease), color 0.13s var(--ease); }
  .segmented button:last-child { border-right: none; }
  .segmented button.active { background: var(--pine); color: #f4ecd6; }
  .segmented button:hover:not(.active) { background: color-mix(in srgb, var(--paper-deep) 70%, var(--line-strong)); }
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
    .row-2 { flex-direction: column; }
  }
</style>
