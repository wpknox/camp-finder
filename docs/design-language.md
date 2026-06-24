# CampFinder Design Language — "Folded Field Map"

The guiding feeling: **a worn paper USGS quad map crossed with a ranger's field
journal.** The user should feel like they're unfolding a topographic map on a
tailgate — not staring at a SaaS dashboard. Earthy, organic, almost paperlike.
Nothing about it should read as "a computer map."

This file is the source of truth for the visual identity. Read it before any UI
work and keep it in sync when the system evolves.

## Principles

1. **Paper, not screen.** Backgrounds are aged cream with grain, never flat
   white. Panels sit on the paper like layered cards with soft, warm shadows.
2. **Drawn, not bordered.** Hairlines look like pencil/pen on paper (`--line`),
   not crisp 1px `#e5e7eb` UI dividers.
3. **Muted earth, not neon.** No `#16a34a` / `#3b82f6` / `#ef4444`. Every hue is
   desaturated toward pigment — moss, ochre, lake, rust, clay.
4. **Instruments in mono.** Coordinates, elevations, counts, fees — anything
   that reads as "data off an instrument" — set in the monospace face.
5. **Restraint over flash.** Motion is slow and organic (ease, never bounce).
   One well-staged reveal beats scattered micro-interactions.

## Type

Loaded via Google Fonts in `app.html`.

| Role | Family | Notes |
|------|--------|-------|
| Display / headings | **Fraunces** | Soft, organic serif w/ optical sizing. Wonky/soft axes give the hand-set feel. Use for `h1`–`h3`, brand, section titles. |
| UI / body | **Hanken Grotesk** | Warm humanist sans. Default for body, labels, buttons. NOT Inter. |
| Data / mono | **JetBrains Mono** | Coordinates, elevation, fees, FCFS counts, the map key. |

CSS vars: `--font-display`, `--font-ui`, `--font-mono`.

Headings use Fraunces with slightly tightened tracking. Uppercased micro-labels
(section eyebrows) use Hanken Grotesk with wide letter-spacing.

## Color tokens

Defined in `app.css` `:root`. Always reference the variable, never the hex.

```
--paper        #ece3cf   aged map paper (app background)
--paper-2      #f5efdf   lighter paper (panels, cards)
--paper-deep   #e0d4b8   recessed wells (inputs, list hover)
--ink          #2e2719   primary text (dark brown-black)
--ink-soft     #5d5340   secondary text
--ink-faint    #8a7c64   tertiary / placeholder
--line         #cdbd9b   hairline borders (pencil)
--line-strong  #b3a37c   stronger rules

--pine         #44542f   primary brand green (buttons, brand)
--pine-deep    #333f21   hover/active green
--moss         #5f7d34   status: fully FCFS
--ochre        #c8932f   status: partial FCFS
--lake         #356b7d   status: reservable only
--rust         #a23a17   status: closed / danger
--clay         #b5651d   warm accent / highlights
```

### Status → color (markers, dots, badges — keep in lockstep everywhere)

| Status | Token | Used in |
|--------|-------|---------|
| Fully FCFS | `--moss` | map markers, sidebar dots, FCFS badge |
| Partial FCFS | `--ochre` | "" |
| Reservable only | `--lake` | "" |
| Closed | `--rust` | markers, sidebar dots, closed banner |

The single source for marker colors is `CampMap.renderPins`; the sidebar
`statusColor()` and any badges must mirror it.

## The basemap (most important single choice)

Leaflet tile layer = **USGS Topo** (no API key):
`https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}`

It renders as a folded paper topographic quad — contours, shaded relief, forest
boundaries — which *is* the "handheld map" feeling. A subtle warm CSS filter on
the tile pane (`sepia`/`saturate`/`brightness`) pushes it further toward aged
paper without hurting legibility. Attribution: "USGS The National Map".
(Alternative if USGS is ever down: OpenTopoMap, CC-BY-SA.)

## Texture & atmosphere

- **Grain overlay**: a faint SVG `feTurbulence` noise layer over the paper
  background (very low opacity) — class/utility in `app.css`.
- **Contour motif**: faint topographic-contour SVG used as a low-opacity
  background flourish on panels (sidebar, detail header).
- **Layered-paper shadows**: warm, soft (`rgba(46,39,25,…)`), never the default
  cool gray box-shadow.
- **Edges**: panels read as paper laid on paper — subtle borders in `--line`
  plus a soft shadow, optionally a torn/deckled top edge on the detail panel.

## Motion

- Easing: `cubic-bezier(.22,.61,.36,1)` (organic ease-out). Never bounce/elastic.
- Page load: staggered fade-up on sidebar result rows (`animation-delay`).
- Panel: slide/settle in. Markers: gentle scale on hover.

## Components quick-ref

- **Buttons (primary)**: `--pine` fill, paper text, soft shadow, mono or
  semibold Hanken label. Hover → `--pine-deep`.
- **Inputs/selects**: `--paper-deep` well, `--line` border, focus ring in moss.
- **Cards/panels**: `--paper-2`, `--line` hairline, layered-paper shadow.
- **Map key / legend**: styled like a map's printed key card — mono labels,
  paper background, pencil border.
