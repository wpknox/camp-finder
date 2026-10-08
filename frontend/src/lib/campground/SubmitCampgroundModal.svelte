<script lang="ts">
  import { submitJson } from '$lib/api'
  import { untrack } from 'svelte'
  import CampgroundForm from './CampgroundForm.svelte'
  import ModalShell from '$lib/ui/ModalShell.svelte'
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

<ModalShell
  eyebrow="New campground"
  title="Suggest a campground"
  ariaLabel="Suggest a campground"
  accent="var(--moss)"
  width="500px"
  maxHeight="min(92vh, 860px)"
  {onclose}
>
  {#if submitted}
    <p class="success">Thanks — an admin will review your campground before it appears on the map.</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else}
    <form class="form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
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
        <button class="btn btn-secondary" type="button" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={!valid || submitting}>
          {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
          {submitting ? 'Submitting…' : 'Submit campground'}
        </button>
      </div>
    </form>
  {/if}
</ModalShell>
