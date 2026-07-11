<script lang="ts">
  import { untrack } from 'svelte'
  import type { Facility } from '$lib/types'

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
      const res = await fetch('/api/deletions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ facility_id: initial.id, reason }),
      })
      if (res.status === 201) {
        submitted = true
      } else if (res.ok) {
        const data = (await res.json()) as { duplicate?: boolean }
        if (data.duplicate) alreadyFlagged = true
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
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Flag for deletion — ${initial.name}`}>
    <span class="eyebrow">Deletion flag</span>
    <h2>Flag for deletion — {initial.name}</h2>

    {#if submitted}
      <p class="success">Thanks — an admin will review this flag.</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else if alreadyFlagged}
      <p class="success">Already flagged — thanks!</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else}
      <form class="edit-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
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
          <button class="cancel" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!reasonValid || submitting}>
            {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
            {submitting ? 'Submitting…' : 'Flag for deletion'}
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
    background: var(--rust);
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
  textarea { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 9px; padding: 0.55rem 0.75rem; font-size: 0.9rem; width: 100%; box-sizing: border-box; color: var(--ink); font-family: inherit; transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); resize: vertical; }
  textarea::placeholder { color: var(--ink-faint); }
  textarea:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  .hint { margin: 0; font-size: 0.85rem; color: var(--ink-soft); line-height: 1.45; }
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
