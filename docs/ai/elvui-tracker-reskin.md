# The Elv skin — ElvUI's panel language on the tracker (0.2.92)

Danny, 2026-10-29: "reimagine this without ANY world of warcraft context… take inspirations from it to
make our edit mode even better… a theme edit option to be Elv-like. the crisp, clean borders, bars,
textures, fonts. this profile mode would be a complete re-skin in the ElvUI style."

So: what does ElvUI actually *do*, styled down to parts a MapleStory CV tracker can use, no game
vocabulary attached? This note records what we took now, and what's worth taking later.

## Where the look comes from (read from the source, permission on file)

ElvUI's entire visual identity is a handful of defaults plus one discipline:

- **Two greys and an edge.** `backdropcolor` (0.1, 0.1, 0.1) = #1a1a1a panels; `backdropfadecolor`
  (0.06, 0.06, 0.06 @ 0.8) = the translucent near-black glass; borders land at #1a1a1a–#4f4f4f
  depending on mode. Everything else is accent-on-dark.
- **One signature accent.** `valuecolor` = (0.09, 0.52, 0.82) = **#1785D1** — numbers, highlights,
  selected text. One blue, used sparingly, carries the whole brand.
- **Flat textures.** `normTex = 'ElvUI Norm'` — status bars are flat fills inside a 1 px bordered
  track, no gradients, no gloss. Depth comes from the border, not the paint.
- **Crisp geometry.** Pixel-perfect mode snaps every frame to physical pixels; borders are 1 px,
  corners are square. Softness is deliberately absent.
- **Condensed type.** Expressway for UI, PT Sans Narrow for names/labels — small sizes, tight
  spacing, clean at 10–12 px.

## What 0.2.92 took

| ElvUI idea | Tracker implementation |
|---|---|
| Theme carries the look | `themes.js` themes now have an optional `sk` panel style; the new **Elv preset** is exactly ElvUI's palette (#0f0f0f / #1a1a1a / #3f3f3f / **#1785d1**) and sets `sk:"elv"` |
| Editor picks the style | Theme editor gained **Panel style: Glass / Elv (crisp)**; any custom palette can wear the re-skin; it round-trips through `clean()`/`encode()` so share codes and `.mstheme` files carry it |
| One source of truth drives every surface | `body.skin-elv` toggled in the tracker window (`themeShow`) and the overlay window (rides the 500 ms push as `th.sk`) — same class, two stylesheets |
| Square + crisp + flat | `.skin-elv` blocks in index.html/overlay.html: radius 0 on cards/buttons/inputs/scrollbars/bars, `backdrop-filter:none`, card shadows off, bars on dark tracks, focus-view gradients flattened |
| ElvUI's fonts | PT Sans Narrow bundled (`app/fonts/`, ParaType free font licence, note beside the files) — condensed, clean, ElvUI's own secondary face; system fallbacks `Arial Narrow` |
| Movers say where they are | Live **x/y chip** (`#ovxy`) over the card you drag, resize (`%`) or nudge — desktop pixels, the same numbers the x/y inputs keep; hidden on release / after a nudge beat |

Not taken on purpose: ElvUI's near-black *borders* (they read against the game world, not against our
own dark page — we keep a visible grey edge), and no shadows on overlay cards (authentic; per-card
opacity covers bright maps).

## Edit-mode ledger (ElvUI's Toggle Anchors heritage, WoW-free)

Already in (0.2.74–0.2.82): picker panel with per-widget eye/size/opacity/x-y/reset, magnetic snap to
edges/centres/cards with alignment guides (LibSimpleSticky's behaviour), edit-gated alignment grid with
centre axes, grid rounding on drop, corner grip + Ctrl+scroll + slider resize, arrow nudge, Esc=Done,
row-hover spotlight, arm-then-confirm resets, layout profiles with share codes.

New in 0.2.92: the live readout chip.

## Worth stealing later (design parking lot)

1. **Datatext panels** — ElvUI's tiny info slots (gold, fps, time) are the same shape as our overlay
   cards but composable *inside* one panel: a row of mini-readouts under the main card. Cheap win for
   Simple view.
2. **Style filters ≈ our conditions engine** — the triggers→actions *shape* (watch a number, act on the UI) is what
   0.2.78/0.2.91's conditions already implement per card. Correction from the full code review
   (docs/ai/elvui-code-review.md): ElvUI's Nameplate Style Filter engine was removed in v14+, so don't model further
   work on it — the concept lives on better in our own conditions.
3. **Install wizard** — ElvUI's first-run steps (scale → theme → done) would give the tracker a
   first-boot path: pick a view, pick a theme, grant nothing else.
4. **Per-element alpha in one place** — ElvUI exposes global opacity for backdrops; we already have
   per-card opacity in the overlay; a window-level "see-through" for Simple view exists. Enough.
5. **Profile "skins" as first-class exports** — setup codes already ride theme+sk; a one-click
   "Danny's Elv" builtin profile (layout + Elv theme) is a five-minute add when wanted.
