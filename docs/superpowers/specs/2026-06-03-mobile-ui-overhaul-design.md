# Mobile UI Overhaul — Design

Date: 2026-06-03
Scope: Fix three mobile usability problems. Desktop behavior unchanged.

## Problem

On a phone-width viewport (≤640px):
1. The results list pushes the "Search this area" button off-screen — with many
   campgrounds the user must scroll to the bottom to find it again.
2. The filter checkboxes + max-fee + sort look cramped/odd stacked at full width.
3. Tapping a campground opens a partial panel; on mobile it should take over the
   whole screen and be dismissible by both the X and a swipe-down gesture.

## Changes

### 1. FilterSidebar.svelte — collapsible filters + pinned search
- Add `let filtersOpen = $state(false)`.
- Wrap the checkboxes, max-fee field, and sort select in a `.filter-body` that is
  shown only when `filtersOpen` on mobile. A tappable `.filter-toggle` header
  (`▸/▾ Filters`) toggles it.
- Mobile sidebar becomes a fixed-height column: toggle (fixed) → search button
  (fixed) → results list (scrolls, `flex: 1; min-height: 0; overflow-y: auto`).
  The "Search this area" button sits **above** the results list so it never
  scrolls away.
- Desktop (`min-width: 641px`): CSS forces `.filter-body` visible and hides
  `.filter-toggle`; layout otherwise unchanged.

### 2. DetailPanel.svelte — full-screen takeover + swipe-down dismiss
- Mobile CSS: `.panel` becomes `position: fixed; inset: 0; width: 100vw;
  height: 100dvh; z-index` above the map; hide the desktop resize handle.
- Add a top drag handle (grabber bar). Pointer logic: on pointerdown record
  startY; on pointermove translate the panel down by `max(0, currentY - startY)`;
  on pointerup, if dragged past ~120px (or fast flick) call `onclose()`, else
  snap back to `translateY(0)`. Applies on mobile only (handle hidden on desktop).
- Keep the existing X button working everywhere.
- Desktop resizable side-panel behavior is untouched.

### 3. No data-model / API changes.

## Testing
- Playwright at 390×844: verify search button visible with a full results list;
  filters collapse/expand; detail panel fills screen; swipe-down and X both close.
- `pnpm check` clean; existing tests still pass.
