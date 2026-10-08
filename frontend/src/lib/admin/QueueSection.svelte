<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SuccessNotice } from "./types";

  let {
    title,
    count,
    emptyText = "No pending items — the queue is clear.",
    successes = [],
    successPrefix = "Done:",
    ondismiss,
    onexpandall,
    oncollapseall,
    children,
  }: {
    title: string;
    /** Omit for sections that aren't a queue (no count pill, no empty state). */
    count?: number;
    emptyText?: string;
    successes?: SuccessNotice[];
    successPrefix?: string;
    ondismiss?: (id: string) => void;
    onexpandall?: () => void;
    oncollapseall?: () => void;
    children: Snippet;
  } = $props();
</script>

<section class="queue">
  <div class="queue-head">
    <h2>
      {title}
      {#if count !== undefined}<span class="count">{count}</span>{/if}
    </h2>
    {#if count !== undefined && count > 1 && onexpandall && oncollapseall}
      <span class="bulk">
        <button type="button" onclick={oncollapseall}>Collapse all</button>
        <button type="button" onclick={onexpandall}>Expand all</button>
      </span>
    {/if}
  </div>

  {#each successes as success (success.id)}
    <div class="success-notice" role="status">
      <span class="success-text">{successPrefix} <strong>{success.facility_name}</strong> ✓</span>
      {#if success.facility_id}
        <a class="success-link" href={`/?facility=${success.facility_id}`}>View campground →</a>
      {/if}
      <button
        type="button"
        class="success-dismiss"
        aria-label="Dismiss"
        onclick={() => ondismiss?.(success.id)}
      >
        ✕
      </button>
    </div>
  {/each}

  {#if count === 0}
    <p class="empty">{emptyText}</p>
  {:else if count === undefined}
    {@render children()}
  {:else}
    <div class="cards">
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .queue {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .queue-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .queue h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink-soft);
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.05rem 0.55rem;
  }
  .bulk {
    display: flex;
    gap: 0.9rem;
  }
  .bulk button {
    background: none;
    border: none;
    padding: 0.2rem 0;
    font-family: var(--font-mono);
    font-size: 0.74rem;
    color: var(--ink-soft);
    cursor: pointer;
    transition: color 0.13s var(--ease);
  }
  .bulk button:hover {
    color: var(--pine-deep);
  }
  .empty {
    color: var(--ink-faint);
    font-size: 0.9rem;
    font-style: italic;
    margin: 0;
    padding: 1.25rem;
    background: var(--paper-2);
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .success-notice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: color-mix(in srgb, var(--moss) 10%, var(--paper-2));
    border: 1px solid color-mix(in srgb, var(--moss) 45%, var(--line));
    border-radius: 12px;
    padding: 0.65rem 0.9rem;
    box-shadow: var(--shadow-sm);
    font-size: 0.88rem;
    color: var(--ink);
  }
  .success-text {
    flex: 1;
  }
  .success-text strong {
    font-weight: 600;
    color: var(--pine-deep);
  }
  .success-link {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--pine-deep);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--pine-deep) 45%, transparent);
    transition: border-color 0.13s var(--ease);
  }
  .success-link:hover {
    border-bottom-color: var(--pine-deep);
  }
  .success-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--ink-faint);
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    transition: color 0.13s var(--ease);
  }
  .success-dismiss:hover {
    color: var(--ink);
  }
</style>
