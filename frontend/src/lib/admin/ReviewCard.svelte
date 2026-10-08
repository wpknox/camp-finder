<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open,
    ontoggle,
    title,
    meta,
    headExtra,
    children,
    error = "",
    busy = false,
    approveLabel,
    approveDisabled = false,
    approveTone = "primary",
    onapprove,
    onreject,
  }: {
    open: boolean;
    ontoggle: () => void;
    title: Snippet;
    meta?: Snippet;
    /** Always-visible extras under the meta line (e.g. "View on map" links). */
    headExtra?: Snippet;
    /** Card body — only rendered while expanded. */
    children: Snippet;
    error?: string;
    busy?: boolean;
    approveLabel: string;
    approveDisabled?: boolean;
    approveTone?: "primary" | "danger";
    onapprove: () => void;
    /** Called with the optional note to the submitter. */
    onreject: (note: string) => void;
  } = $props();

  let rejecting = $state(false);
  let note = $state("");
</script>

<article class="card">
  <div class="card-head">
    <h3>
      <button type="button" class="toggle" aria-expanded={open} onclick={ontoggle}>
        <span class="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span class="title">{@render title()}</span>
      </button>
    </h3>
    {#if meta}<span class="meta">{@render meta()}</span>{/if}
    {#if headExtra}<div class="head-extra">{@render headExtra()}</div>{/if}
  </div>

  {#if open}
    <div class="card-body">
      {@render children()}

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      {#if rejecting}
        <div class="reject-form">
          <input
            type="text"
            placeholder="Optional note to the submitter…"
            bind:value={note}
            maxlength="1000"
          />
          <div class="actions">
            <button class="btn btn-secondary" type="button" onclick={() => (rejecting = false)}>Back</button>
            <button class="btn btn-danger" type="button" disabled={busy} onclick={() => onreject(note)}>
              Confirm reject
            </button>
          </div>
        </div>
      {:else}
        <div class="actions">
          <button class="btn btn-secondary" type="button" disabled={busy} onclick={() => (rejecting = true)}>
            Reject
          </button>
          <button
            class="btn {approveTone === 'danger' ? 'btn-danger' : 'btn-primary'}"
            type="button"
            disabled={busy || approveDisabled}
            onclick={onapprove}
          >
            {approveLabel}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .card {
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 86%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    padding: 1.1rem 1.4rem;
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
  .toggle {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .toggle:hover .chev {
    color: var(--pine-deep);
  }
  .chev {
    flex-shrink: 0;
    width: 1em;
    font-size: 0.85em;
    color: var(--ink-faint);
    transition: color 0.13s var(--ease);
  }
  .title {
    min-width: 0;
  }
  .meta {
    font-size: 0.78rem;
    color: var(--ink-faint);
    padding-left: 1.5rem;
  }
  .head-extra {
    padding-left: 1.5rem;
  }
  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
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
    box-shadow: none;
  }
</style>
