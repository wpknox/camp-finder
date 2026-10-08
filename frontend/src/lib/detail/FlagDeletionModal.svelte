<script lang="ts">
  import { submitJson } from '$lib/api'
  import { untrack } from 'svelte'
  import type { Facility } from '$lib/types'
  import ModalShell from '$lib/ui/ModalShell.svelte'

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props()

  // Snapshot the facility once at open — mirrors SuggestEditModal's pattern.
  const initial = untrack(() => facility)

  let reason = $state('')
  let submitting = $state(false)
  let submitted = $state(false)
  let alreadyFlagged = $state(false)
  let errorMsg = $state('')
  const reasonValid = $derived(reason.trim().length > 0)

  async function submit() {
    if (!reasonValid || submitting) return
    submitting = true
    errorMsg = ''
    try {
      const r = await submitJson<{ duplicate?: boolean }>('/api/deletions', { facility_id: initial.id, reason })
      if (r.status === 201) {
        submitted = true
      } else if (r.ok) {
        if (r.data?.duplicate) alreadyFlagged = true
        else submitted = true
      } else {
        errorMsg = r.error
      }
    } finally {
      submitting = false
    }
  }
</script>

<ModalShell
  eyebrow="Deletion flag"
  title={`Flag for deletion — ${initial.name}`}
  ariaLabel={`Flag for deletion — ${initial.name}`}
  accent="var(--rust)"
  maxHeight="min(86vh, 720px)"
  {onclose}
>
  {#if submitted}
    <p class="success">Thanks — an admin will review this flag.</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else if alreadyFlagged}
    <p class="success">Already flagged — thanks!</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else}
    <form class="form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <p class="hint">
        Use this if this record isn't a real campground (bad data import, day-use
        area, trailhead…). An admin reviews every flag before anything is removed.
      </p>
      <div class="field">
        <label for="reason">Why should this be removed? <span class="ink-faint">(required)</span></label>
        <textarea
          id="reason"
          bind:value={reason}
          maxlength="1000"
          rows="4"
          placeholder="e.g. This is a trailhead, not a campground — no overnight sites"
        ></textarea>
      </div>

      {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

      <div class="actions">
        <button class="btn btn-secondary" type="button" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={!reasonValid || submitting}>
          {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
          {submitting ? 'Submitting…' : 'Flag for deletion'}
        </button>
      </div>
    </form>
  {/if}
</ModalShell>

<style>
  .hint { font-size: 0.85rem; color: var(--ink-soft); line-height: 1.45; }
</style>
