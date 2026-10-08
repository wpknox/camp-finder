<script lang="ts">
  import { submitJson } from '$lib/api'
  import { untrack } from 'svelte'
  import CampgroundForm from './CampgroundForm.svelte'
  import {
    emptyDraft,
    draftErrors,
    draftToSubmission,
    validateSourceUrl,
  } from '$lib/campgroundSubmission'

  let { lat, lng, onclose }: { lat: number; lng: number; onclose: () => void } = $props()

  // Snapshot the starting position once at open.
  let draft = $state(untrack(() => emptyDraft(lat, lng)))
  let sourceUrl = $state('')
  let note = $state('')
  let showAllErrors = $state(false)
  let submitting = $state(false)
  let submitted = $state(false)
  let errorMsg = $state('')

  const errors = $derived(draftErrors(draft))
  const valid = $derived(Object.keys(errors).length === 0)
  const sourceError = $derived(validateSourceUrl(sourceUrl.trim()) ?? '')
  let sourceTouched = $state(false)

  async function submit() {
    showAllErrors = true
    sourceTouched = true
    if (!valid || sourceError || submitting) return
    submitting = true
    errorMsg = ''
    try {
      const r = await submitJson('/api/campground-suggestions', {
        submission: draftToSubmission(draft),
        source_url: sourceUrl.trim(),
        note,
      })
      if (r.ok) submitted = true
      else errorMsg = r.error
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
  <div class="modal" role="dialog" aria-modal="true" aria-label="Suggest a campground">
    <span class="eyebrow">New campground</span>
    <h2>Suggest a campground</h2>

    {#if submitted}
      <p class="success">Thanks — an admin will review your campground before it appears on the map.</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else}
      <form class="edit-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <CampgroundForm bind:draft {errors} {showAllErrors} idPrefix="submit" />

        <div class="field">
          <label for="submit-source">Source link <span class="ink-faint">(optional)</span></label>
          <input
            id="submit-source"
            type="url"
            bind:value={sourceUrl}
            onblur={() => (sourceTouched = true)}
            placeholder="https://www.fs.usda.gov/..."
            class:invalid={sourceTouched && !!sourceError}
            aria-invalid={sourceTouched && !!sourceError}
          />
          {#if sourceTouched && sourceError}<p class="field-error">{sourceError}</p>{/if}
          <p class="hint">Where did you find it? An fs.usda.gov or recreation.gov page helps us verify.</p>
        </div>

        <div class="field">
          <label for="submit-note">Notes for the reviewer <span class="ink-faint">(optional)</span></label>
          <textarea id="submit-note" bind:value={note} maxlength="1000" rows="3"
                    placeholder="e.g. Visited 6/2026, dispersed-style sites along the creek"></textarea>
        </div>

        {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

        <div class="actions">
          <button class="cancel" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!valid || submitting}>
            {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
            {submitting ? 'Submitting…' : 'Submit campground'}
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
    width: min(500px, 100%);
    max-height: min(92vh, 860px);
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
    background: var(--moss);
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
  input, textarea { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 9px; padding: 0.55rem 0.75rem; font-size: 0.9rem; width: 100%; box-sizing: border-box; color: var(--ink); font-family: inherit; transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); }
  input::placeholder, textarea::placeholder { color: var(--ink-faint); }
  input:focus, textarea:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  input.invalid { border-color: var(--rust); }
  textarea { resize: vertical; }
  .field-error { color: var(--rust); font-size: 0.78rem; margin: 0; }
  .hint { margin: 0; font-size: 0.78rem; color: var(--ink-faint); line-height: 1.4; }
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
