# Design guide (site + Grind Tracker)

Read this before changing any look, layout or UI copy. It records what the code does today and what Danny has asked for
(dated calls live in [decisions.md](decisions.md); grep it before proposing a new look). Goal in Danny's words: it should
feel **"far too professional for what it is"**: crisp, calm, nothing jarring. ElvUI is the core inspiration (clean panels,
user-movable parts, everything themeable).

**Golden rule: use the existing tokens and classes. If you need a new color, size or component, ask first and put it in
`src/styles.css` (site) or `tracker/app/index.html` (tracker), never inline in a page or JS string.**

## 1. Where things live

| What | File |
|---|---|
| All site CSS (tokens, cards, buttons, modals, animations, nav, landing pages) | `src/styles.css` (one file, ~1200 lines, grep by class) |
| Page markup | `src/pages/<page>.html`; shell in `src/index.html` |
| Page logic | `src/js/` files (index in [site.md](site.md)) |
| Settings modal + theme picker | `src/js/70-theme.js`, `src/js/74-profiles.js` |
| Sidebar sprites | `src/js/71-navside.js` |
| Section landing pages | `src/js/77-landing.js` (CSS: end of styles.css, `.lp*`) |
| Tracker CSS (inline `<style>`) | `tracker/app/index.html` |
| Tracker themes (shared with site) | `tracker/app/themes.js` (inlined into the site by `70-theme.js`) |
| Built output | `dist/index.html`: never edit, never read whole |

## 2. Color: theme tokens

Everything is a CSS variable on `:root` (`src/styles.css` top). **Never hard-code a hex color in a component.** Light values
first, dark values are the same names under `prefers-color-scheme` and `[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #e7ddf9 | #1f1931 | Page background, inputs, inset wells, modal body |
| `--panel` | #f7f1ff | #2a2243 | Cards, table wrappers, anything sitting on `--bg` |
| `--ink` | #2a2142 | #f0eafd | Body text |
| `--muted` | #685c94 | #b6aad8 | Secondary text, labels, hints |
| `--line` | #cfbff0 | #453a64 | Every border and divider (1px) |
| `--accent` | #7d58d6 | #d2bffb | Links, selected state, primary buttons, section titles |
| `--accent-soft` | #dccbfa | #41346a | Selected row, hover wash, highlight bands |
| `--leaf` / `--leaf-soft` | green | green | Good / profit / "in stock" |
| `--warn` / `--warn-soft` | amber | amber | Estimates, caution, stale data |
| `--bad` | red | red | Loss, errors only |
| `--shadow` | soft | soft | Cards that need lift (`.card.hero`) |

- Text on an accent fill uses `var(--on-accent, var(--panel))`.
- Tints: `color-mix(in srgb, var(--accent) 16%, transparent)`, not a new hex.
- Users can recolor everything (Settings > Colours, presets "Default" and "Purple"). A hard-coded color won't follow the
  theme and will look broken in someone's dark theme. The tracker's "Default" preset must match the site tokens;
  `tracker/tests/core.test.js` fails if they drift, so a site recolor must also update `tracker/app/themes.js`, the
  `:root` fallback in `tracker/app/index.html` and the window colors in `tracker/app/main.js`.
- Meaning, not decoration: green = good, amber = estimate/warning, red = bad. Don't use them for variety.

**Don't:** `color:#7d58d6`, `background:#fff`, `border:1px solid #ccc`.
**Do:** `color:var(--accent)`, `background:var(--panel)`, `border:1px solid var(--line)`.

## 3. Type

Fonts (tokens): `--f-display` Bricolage Grotesque (titles), `--f-body` IBM Plex Sans (text), `--f-mono` IBM Plex Mono
(numbers, source stamps). Body is 17px/1.5.

| Role | Spec |
|---|---|
| Page title (header h1) | 800, clamp(30px, 4.4vw, 44px), display font |
| Page section `h2` | 800 20px display, one scale everywhere (second audit #8). Home category titles 24px, fold-out section titles 17.5px |
| Card title `.card h3` | 700 17.5px display |
| Sidebar section title | 800 21.5px display, accent color |
| Table/control labels | 600 12px caps, +.06em tracking, `--muted` |
| Notes `.note` | 14.5px, `--muted`, max 78ch |
| Sub text `.sub` | 13.5px `--muted` |
| Numbers | `.num` (mono, tabular, right-aligned) |
| Source / build stamps | `.src`, `.sitever` (mono 13px, muted) |

Keep line length readable (`max-width: 68-78ch` on paragraphs). Use `text-wrap: balance` on titles.

## 4. Spacing, boxes and padding

Danny's rule (10-21): **always padding between a nested box and its container; nothing flush to or past a card edge.
Stacked cards get a gap.** The smoke test enforces it on every page via the `tests/boxgaps.js` helper; craftplan.js checks
the craft planner too (see section 12).

- Card: `.card` = `--panel` fill, 1px `--line`, radius 12, padding 16. Inner wells (`.lpdemo`, inputs) sit on `--bg`, radius 10.
- Stacked cards: `section>.card+.card{margin-top:14px}`. Grids use `gap:12-14px` (`.grid2`, `.homegrid`, `.lpgrid`).
- Radius scale: 6 inputs, 8 buttons, 10 wells/tables, 12 cards, 14 modals, 999 pills/chips.
- Page width: `.wrap` max 1180px, 16px side padding. On wide screens it is scaled with `zoom` (1.06 at 1350, 1.12 at 1600,
  1.2 at 1900; Settings "Page size" 1-5). **Trap:** `getBoundingClientRect` returns zoomed values; use `offsetHeight`
  when measuring.
- Phones (≤600px): 4+ column tables become row cards automatically (`76-stack.js`, `table.stk`). Key/value tables need
  class `kv`. Every page must fit at 390px with no sideways scroll (smoke test checks all pages).

**Don't:** put a table or input directly against a card edge; stack two cards with no margin; make a fixed-width box wider
than its container.
**Do:** wrap tables in `.tblwrap`, put controls in `.controls`, space groups with the existing gaps.

## 5. Components

**Cards / modules.** `.card` (+ `.cardhead` for title + action row), `.fact` (small info tile), `.card.hero` (one lifted
card per page at most), `.snstats` tiles for headline numbers. Collapsible groups use `<details>`; they open with a short
`tray` animation.

**Buttons.** `.btn` (neutral: `--bg` fill, line border, accent border on hover), `.btn.primary` (accent fill; one per
view), `.btn.sm`, `.btn.tgl` (pill toggle with `aria-pressed`), `.seg` (pill segmented control with
`aria-checked`). Buttons never change size on hover; only color/border, and a 1px press (`translateY(1px)`). Always keep
the `:focus-visible` accent outline.

**Pills / badges.** `.pill` with `.p-good`, `.p-warn`, `.p-hot`. `kbd` for shortcuts.

**Links.** Accent color. In lists use `.hlink` (accent bold title, muted description, underline on hover). Every page or
section the changelog names must be a link (Danny).

**Inputs.** `--bg` fill, 1px line, radius 6; focus = accent border + soft 3px accent ring (no browser outline).

**Tables.** Sticky uppercase muted header on `--bg`, row hover washes `--accent-soft` at 40%, `.num` for numbers, `.thwrap`
when headers must wrap.

## 6. Modals (pop-ups)

Rule (10-20): **an inset card over a blurred backdrop**, never appended under the page and never resizing the window.

- Site: `.srch.setm` (backdrop) > `.setbox` (card). Backdrop = `--bg` 35% mixed into black .45 + `blur(7px) saturate(.85)`.
  Card = `--bg` fill, radius 14, big soft shadow, max 780px, inset `clamp(10px,5vh,44px) / clamp(10px,5vw,56px)`, scrolls inside.
  Search (Ctrl+K) uses the lighter `.srchbox` (blur 2px). Markup sits next to `#srch` near the end of `src/index.html`,
  **not inside the header** (`.wrap` is zoomed).
- Tracker: `#modalBack` + `.modal` in `tracker/app/index.html`; `.modal.short` for small ones. Same numbers on purpose.
- Anatomy: sticky title row (accent title, close button) + section chips (`.pnav`), then one `.setcard` per section
  (accent heading with a hairline rule, `--panel` fill, radius 10).
- Esc closes; focus is trapped inside; the page behind does not move.
- **Trap:** don't use a `<nav>` element inside a modal: global `nav` CSS hits it.

## 7. Animation

Crisp and subtle. Nothing bounces, nothing slides far, nothing resizes the layout.

| Thing | Spec |
|---|---|
| Page change | `pagein` .22s ease-out, 5px rise + fade |
| Fold-out (`details`) | `tray` .2s, 5px drop + fade |
| Modal open | backdrop fade .14-.18s; card `popin` .18s (tracker .22s with a soft curve), 6-10px rise, scale .975-.985 |
| Modal close | .14s out, then removed |
| Hover/focus | `transition: border-color, background-color, color, box-shadow .15s`; icons may lift 1px / scale 1.08 |
| Bars | width .3s ease-out |

Rules: durations 120-300ms; animate `opacity` and `transform` only (never width/height of a laid-out box); no looping
motion except tiny status pulses (e.g. `snpulse`); the global `prefers-reduced-motion: reduce` block must keep working
(don't add animation that bypasses it). Home cards expand to a billboard via view transitions: leave that alone.

## 8. Layout patterns

- **Shell:** header (title, Search, settings cog) over a left sidebar and one content column. Sidebar sections are named
  after the game (My Character, Training, Victoria Island, Maple Database, Mesos and Trade). Page names are white with a
  dark outline like in-game text (hairline + lilac glow in dark themes); section titles are big and accent-colored.
  Basic mode (plain list) and two-row mode are Settings options: don't break them.
- **Narrow single-column pages** (Feedback, Privacy, Map Navigator, Changelog): put `class="narrowpage"` on the
  `<section>` (centered, max 760px). The About box and content share that width. No empty tail below the content.
- **Control strip + data:** a `.controls` card on top, results below (tables in `.tblwrap`).
- **Home:** masonry grid of section cards; clicking one expands it into a billboard. New pages need a Home link plus
  smoke/pages test count bumps (see site.md).
- **Landing pages:** clicking a sidebar section title opens its landing page (`77-landing.js`): `.lphero` (sprite, title,
  one paragraph), then `.lpgrid` of `.lpcard`s. Each card = sprite + title + one-line description + a small live demo
  (`.lpdemo`) built from real data. Cards lift with a soft accent shadow on hover. Keep demos small and real.
- **Customizable:** the user can move/scale header parts (anchor mode, ElvUI /moveui style). Don't hard-position header
  elements in new CSS.

## 9. Sprites and images

Art is **real MapleStory sprites from the OSMS export**, never drawn or generic icons (Danny: the tracker icon and site
favicon are game sprites too).

- Data: `D.iicons` (items), `D.mobimg` (monsters), `D.icons` (skills), keyed by id; filled into
  `<img data-ic="i:<item>|m:<mob>|s:<skill>">` after load (`00-core.js`, `fillIc` in 77-landing.js). Meso drop icons come
  from the maplestory.io MCW client (not in OSMS).
- Pixel art: `image-rendering: pixelated`, `object-fit: contain`, never stretched. Icons: 22px nav, 30-36px section
  heads, 56px landing hero, 32px `.sicon` tile. Soft drop shadow (`drop-shadow(0 2px 3px rgba(23,17,42,.35))`) lifts them
  off any theme.
- Use an `<img>` without `src` hidden (`visibility:hidden`) until filled; no empty boxes or broken-image icons.
- Small and cute, "not flashy, not big" (Danny 10-18). One sprite per link/header, no banners.

## 10. Copy (UI text)

- Plain US English. Short sentences. Say what the thing does ("Fit to window"), not how it works.
- Game terms exactly as the game spells them. Classic World only; no modern/retail names or numbers.
- Every number has a source; estimates are labeled "estimate" on the page and say how they're computed.
- Buttons are verbs ("Copy link", "Reset filters"); no exclamation marks, no emoji in UI, no "simply/just/easily".
- Errors say what to do next. Empty states say what to type or try.
- Screenshot import: paste = auto-apply, show what was read, Undo/Redo + Reset; the reader prefers 0 wrong reads and asks
  when unsure.

## 11. The tracker shares the look

The Windows app (`tracker/app/`) is the same product, not a lookalike:

- Same tokens (`--bg --panel --ink --muted --line --accent --accent-soft --on-accent --leaf --warn --bad`) in its `:root`;
  theme presets in `tracker/app/themes.js` are the single source, and the site's Settings uses the same file.
- Same card, button and pill proportions; same modal recipe (section 6); same reduced-motion rule.
- Theme codes (`MSCT1.`) and setup/profile codes (`MSCS1`) are interchangeable between site and app. Don't break
  decoding of old codes (additive changes only).
- Tracker-only: draggable modules that snap to a shared grid (Simple Mode for a tiny window). Boxes keep content width,
  rows wrap when narrow; the window never resizes itself unless the user turns that on.

## 12. Before you ship a visual change

1. Check light **and** dark (and one custom theme) at 1300px and 390px.
2. Run `node tests/smoke.js` (CI runs it). The boxgap check (section 4) runs **inside** smoke on every page at 6px, and
   craftplan.js runs it on the craft planner — `tests/boxgaps.js` is the page-evaluate helper they both load, not a
   standalone script, so `node tests/boxgaps.js` on its own does nothing. Fix, don't skip. `node tests/digest.test.js` checks that the commands in this file exist and do what they say,
   and that UI text follows section 10.
3. Screenshot only when layout changed; crop before viewing.
4. Update this file if you add a token/component, add a dated line to [decisions.md](decisions.md) for any call Danny made,
   and leave a mailbox note ([agent-mailbox.md](agent-mailbox.md)) if you touched a shared area.

## Quick do / don't

| Don't | Do |
|---|---|
| New hex color, new font | A token from section 2, the three font vars |
| Hover that changes a box's size | Change color/border only |
| Pop-up appended in the page flow | Inset modal over blurred backdrop |
| Bounce/slide/looping animation | 150-250ms fade + few-px rise, reduced-motion safe |
| Table touching its card edge | `.tblwrap` inside a padded `.card` |
| Wide empty page for 3 fields | `.narrowpage` centered column |
| Drawn emoji icons | OSMS sprite via `data-ic` |
| Modern/retail names, unsourced numbers | Classic names, cite or label "estimate" |
