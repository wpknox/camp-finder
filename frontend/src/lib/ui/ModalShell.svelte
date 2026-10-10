<script lang="ts" module>
  // Open shells, oldest first. Only the topmost one reacts to Escape, so a
  // confirm/auth dialog stacked on the reviews modal closes alone.
  const openShells: symbol[] = [];
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { portal } from "./portal";

  let {
    title,
    eyebrow,
    ariaLabel,
    accent,
    width = "460px",
    maxHeight,
    role = "dialog",
    zIndex = 4000,
    padding = "1.9rem",
    gap = "0.7rem",
    flat = false,
    animate = true,
    overflow,
    fullscreenMobile = false,
    variant = "form",
    onclose,
    header,
    children,
  }: {
    title?: string;
    eyebrow?: string;
    ariaLabel: string;
    /** CSS color for the left "notebook binding" stripe; omit for none. */
    accent?: string;
    /** Max card width (CSS length); the card is always capped at 100%. */
    width?: string;
    /** Max card height (CSS length). Setting it also makes the card scroll and
     *  go full-width at <=640px. */
    maxHeight?: string;
    role?: "dialog" | "alertdialog";
    zIndex?: number;
    padding?: string;
    gap?: string;
    /** Plain paper-2 card instead of the faint paper gradient. */
    flat?: boolean;
    /** Play the modal-in entrance animation. */
    animate?: boolean;
    /** CSS `overflow` of the card. Defaults to auto when maxHeight is set. */
    overflow?: string;
    /** Edge-to-edge sheet (100dvh, square corners) at <=640px. */
    fullscreenMobile?: boolean;
    /** Header typography: "form" = compact eyebrow + 1.35rem title (field
     *  modals); "auth" = global eyebrow + 1.55rem title. */
    variant?: "form" | "auth";
    onclose: () => void;
    /** Replaces the eyebrow + title block (e.g. a title with a close button). */
    header?: Snippet;
    children: Snippet;
  } = $props();

  const id = Symbol("modal");
  $effect(() => {
    openShells.push(id);
    return () => {
      const i = openShells.indexOf(id);
      if (i >= 0) openShells.splice(i, 1);
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && openShells[openShells.length - 1] === id) onclose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="overlay"
  role="presentation"
  use:portal
  style:z-index={zIndex}
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
>
  <div
    class="card modal-card"
    class:flat
    class:animate
    class:accented={!!accent}
    class:capped={!!maxHeight}
    class:fullscreen={fullscreenMobile}
    {role}
    aria-modal="true"
    aria-label={ariaLabel}
    style:--accent={accent}
    style:--ms-width={width}
    style:--ms-gap={gap}
    style:padding
    style:max-height={maxHeight}
    style:overflow={overflow ?? (maxHeight ? "auto" : undefined)}
  >
    {#if header}
      {@render header()}
    {:else}
      {#if eyebrow}
        <span class="eyebrow" class:eyebrow-form={variant === "form"}>{eyebrow}</span>
      {/if}
      {#if title}
        <h2 class:h2-auth={variant === "auth"}>{title}</h2>
      {/if}
    {/if}
    {@render children()}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(35, 28, 14, 0.5);
    backdrop-filter: blur(2px);
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .card {
    position: relative;
    background: linear-gradient(
      180deg,
      var(--paper-2),
      color-mix(in srgb, var(--paper-2) 86%, var(--paper))
    );
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    width: min(var(--ms-width), 100%);
    display: flex;
    flex-direction: column;
    gap: var(--ms-gap);
    box-shadow: var(--shadow-lg);
  }
  .card.flat {
    background: var(--paper-2);
  }
  .card.animate {
    animation: modal-in 0.32s var(--ease);
  }
  /* A spine down the left edge — like a field-notebook binding. */
  .card.accented::before {
    content: "";
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 4px;
    border-radius: 4px;
    background: var(--accent);
  }
  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  .eyebrow {
    margin-top: 0.1rem;
  }
  .eyebrow-form {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.72rem;
    color: var(--ink-faint);
    font-weight: 600;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 600;
    line-height: 1.2;
  }
  h2.h2-auth {
    font-size: 1.55rem;
    line-height: 1.12;
  }

  @media (max-width: 640px) {
    .card.capped {
      width: 100%;
      max-height: 92vh !important;
    }
    .card.fullscreen {
      width: 100%;
      max-height: 100dvh !important;
      height: 100dvh;
      border-radius: 0;
    }
  }
</style>
