# Mockups

Visual direction for Riskrask v3 — **"Command Console"** aesthetic.

## Files

| File | What |
|---|---|
| `command-console.html` | Standalone mockup page. Loads `world.svg`, renders 42 territories with hex markers + unit silhouettes, and a dossier sidebar. User-provided. |
| `command-console-screenshot.png` | Earlier exploration with colored-dot nodes. Use as tonal reference only. |
| `world.svg` | 2000×1280 world map outline + continent boundaries. Also staged at `apps/web/public/assets/world.svg`. |

The mockup's JS/SVG layout is a sketch — many node coordinates are off. The **real territory positions** come from `archive/riskindex-v2-mobile.html` (inside `TERR_DATA`) and will be ported to `packages/engine/src/board.ts` in Track B. The UI consumes those canonical positions.

## What to take from the mockup

- Palette: `#070809` base, single hot accent, muted faction colors (USA slate blue, RUS signal red, CHN amber, EU sage).
- Fonts: Space Grotesk display, JetBrains Mono labels/keys, Inter body.
- Layout: `72px | 1fr | 380px` grid with `56px` topbar and `48px` statusbar.
- Left rail: MAP / ARMY / INTEL / DIPL / LOG / HELP vertical nav.
- Stage HUDs at four corners (theatre, coordinates, legend).
- Phase tab bar at top-center: Draft / Deploy / Attack / Fortify / End.
- Zoom control at bottom-right.
- Dossier: Commander crest card, phase hero (DEPLOY headline + readouts + progress + Confirm/Cancel), Powers list (me row subtly highlighted), Intel feed.
- Statusbar: LINK / TICK / LAT / WINDOW counters.
- Territory marker: hex shell outlined in faction color, unit silhouette top half, troop count bottom half, underline divider.
- Selected territory: hot-accent ring + crosshair + callout annotation.

## What to ignore

- `command-console.html`'s hard-coded territory layout (coordinates are placeholders).
- The "Tweaks" dev panel (not shipping).
- Specific copy like "Gen. H. Vance" — we'll use player display names from `profiles`.
- The 40-turn cap in the topbar — no turn cap in v3.
