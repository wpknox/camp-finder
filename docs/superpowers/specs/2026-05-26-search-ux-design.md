# Search UX — Sidebar Button + Viewport Overlay

**Date:** 2026-05-26

## Problem

The "Search this area" button currently floats over the center of the map, which is awkward on desktop. There is also no visual indication of what area will be searched when the button is pressed.

## Design

### 1. Button placement — sidebar, bottom (with staleness hint)

Move "Search this area" to the bottom of `FilterSidebar.svelte`, pinned below the filter controls. The button is always visible.

When the map moves (pan or zoom) after the last search, a small hint appears directly above the button:

> ⚠ Map moved — results may be out of date

This hint disappears once a new search is run. The `searchPending` store already tracks this state, so it can drive both the hint text and the button highlight.

### 2. Viewport bounding box overlay

When `searchPending` is true (map has moved since last search), render a dashed rectangle on the Leaflet map that outlines the current viewport bounds. This tells the user exactly what area will be queried.

**Implementation:**
- Add a `L.rectangle` layer to `CampMap.svelte` drawn from `map.getBounds()`
- Style: dashed blue border (`#2563eb`), low-opacity blue fill, no interactive handles
- Show the rectangle only when `searchPending` is true; remove it after a search completes
- Update the rectangle on every `moveend` event (same event that sets `searchPending`)

**Future extension note:** The rectangle is intentionally read-only for now. A future iteration could make it draggable/resizable (Leaflet's `L.rectangle` supports `draggable` and edit plugins like `leaflet-draw`) to let users define a custom bbox that differs from the viewport. The API already speaks bbox, so no backend changes would be needed.

### 3. Removing the floating button from the map

Delete the `.search-bar` overlay div and its absolute-positioned styles from `+page.svelte`. The button moves entirely into the sidebar.

## Component changes

| File | Change |
|---|---|
| `frontend/src/lib/filters/FilterSidebar.svelte` | Accept `searchPending` store + `onSearch` callback prop; render hint + button at bottom |
| `frontend/src/lib/map/CampMap.svelte` | Add/remove viewport rectangle layer when `searchPending` changes |
| `frontend/src/routes/+page.svelte` | Remove floating `.search-bar` div; wire `onSearch` and `searchPending` to sidebar |

## Out of scope

- Draggable/resizable bbox (future)
- Radius-based (circle) search
- Auto-search on pan (explicitly not desired — search is intentional)
