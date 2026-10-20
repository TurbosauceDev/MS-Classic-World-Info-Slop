# Site cheatsheet (for Claude threads)

One self-contained page (`dist/index.html`) built from `src/` + `data/data.json`. No server, no external requests except
Google Fonts and the tracker's live `/api/summary` fetch (Danny OK'd). Also published as the claude.ai artifact.

## Pipeline
```
vendor/osms (fetch_osms.sh, pinned OSMS_REF) ─┐
data/sources/*.json (meowdb, meso.watch,     ─┼─ scripts/build_data.py [steps] ──► data/data.json (5.7 MB, D)
  shared runs, maplestory.quest)              ┘
src/index.html + styles.css + js/*.js (+ tracker/app/readers.js) ── scripts/build.py ──► dist/index.html (6.2 MB)
```
- `build.py` puts data.json in `<script type="application/json" id="sitedata">` (`D = JSON.parse(...)`, ~20% faster start than a JS literal; `<` escaped as \u003c) and concatenates `src/js/*.js` in filename order into ONE `<script>` (shared top-level scope), replaces
  `/*@CSS*/`, `/*@JS*/`, `__DATA__` (in 00-core.js), `/*@READERS*/` (tracker readers), and stamps the Home build time.
- `build_data.py` steps (run a subset by name, e.g. `build_data.py crafting extras`): base weapons skills quests rewards npcs
  mobimg nav weapon_sources crafting extras minimaps portals launch mobdb worldmap itemdb kpq prices shared.
  Most need `vendor/` (`./scripts/fetch_osms.sh`, ~130 MB). Full rebuild keeps `data/sources/*`. `squash_images.py` runs last.
- Data schema: `docs/notes.md` "## data/data.json schema". Look up keys there, not in data.json.

## Commands
```
python3 scripts/build.py | tail -3          # after any src/ change (no vendor needed)
node tests/smoke.js | tail -5               # every tab, 390px overflow, NaN/undefined text; ~40 s
node tests/golden.js | tail -3              # meowdb-published reference numbers; run after model changes
node tests/edge.js | tail -5                # bad saved state/share links/server replies, phone nav, keyboard; ~80 s
node tests/features.js | tail -5            # train hand-off reload, price check keep/sell, job compare, Credits dates
node tests/pages.js | tail -5               # Pages split (late icons), manifest, offline service worker
node tests/snipe.js | tail -5               # FM Sniper on a fixture market.json: deal maths, views, filters, watch, new, live refresh, tools
python3 tests/deal_life_test.py             # FM Sniper deal lifetimes from a fake snapshot git history
node tests/monkey.js | tail -3              # random clicks/typing/Back/window sizes; SEEDS=4,5 N=300 to vary; ~100 s
python3 scripts/pages_site.py /tmp/site     # the Pages copy pages.yml deploys (prints first-load size)
python3 scripts/name_diff.py <base-commit>  # skill/item/monster/map renames between two data.json (CI: osms-names.yml)
python3 scripts/fetch_shared.py             # shared tracker runs (daily CI job does this)
node scripts/fetch_meowdb_drops.js          # then build_data.py extras mobdb
python3 scripts/launch_diff.py <ver>        # maplestory.io MCW client vs our data -> docs/launch_diff.md
```
Playwright: global install works here (`NODE_PATH` set, browsers in /opt/pw-browsers). If `chromium.launch` can't find a
browser: `CHROMIUM=/opt/pw-browsers/chromium` (tracker tests, fetch_meowdb_drops) or a `-r` preload shim that passes
`executablePath`. Never `playwright install`.
CI: `.github/workflows/tests.yml` runs smoke + golden + edge + features + pages + monkey on every push/PR to the default branch;
`osms-names.yml` lists renames when `scripts/fetch_osms.sh` or data.json changes (red = a skill/item renamed or removed; not required); `docs.yml` runs
`tests/docs.test.js` (paths/commands in these docs exist, every test image listed in [fixtures.md](fixtures.md)).

## Source map (bytes; grep before reading anything over ~15 KB)
| file | KB | what |
|---|---|---|
| src/index.html | 7 | page shell: head, header/nav, `<!--@page id-->` slots (build.py inlines `src/pages/<id>.html`) |
| src/pages/*.html | | one `<section id>` per page; biggest `src/pages/log.html` 24 KB (changelog, newest first), `src/pages/path.html` 11 KB |
| src/styles.css | 42 | theme tokens on `:root`, dark via prefers-color-scheme + `[data-theme]` |
| 00-core.js | | `D = __DATA__`, `$`, fmt, esc, tab switching, home/nav |
| 10-maps.js | 31 | client formulas (hitProb, lvlPen, classAcc), hpmpAt, touchPct, POTS, party, mobKill, mapShare, mapRates, rankMaps (Where to train) |
| 15-valuable.js | | VALUE: community-picked quests (not game data) |
| 16-guides.js | 26 | GUIDE (1-30) + GUIDE2 (2nd job 30-70) from meowdb class guides |
| 20-quests.js | 18 | Quest Database, `#qtip` tooltips, rewardCell() |
| 40-citizenship.js | | GRADES + SHOPS (meowdb) |
| 45-crafting.js | 14 | Crafting (CRAFT_LV from OSMS dashboard) |
| 47-keep.js | | Keep or sell |
| 48-monsters.js | 21 | Monsters list + page |
| 49-items.js | 18 | Items list + page; `.ri`/`.itname` click opens it |
| 50-builder.js | 43 | Character Builder; `buildAt()` headless default build; BLD |
| 51-shot.js | | screenshot reader core (un-double UI, icon pixel match, SHOT_FONT digits); also copied into tracker |
| 52-shotimport.js | 11 | builder "Import from screenshots" |
| 53-skills.js | | Skills tab |
| 54-invprice.js | | Price check (inventory/bank screenshots → meso.watch `PW` prices; Keep or sell column via `KEEPSELL` from 47-keep.js) |
| 57-scrollscan.js | | Price check › Scroll check: getDisplayMedia, live Use tab grid, tooltip read (readers.js `readTextLines`) matched to scroll name/desc, slot = nearest to tooltip corner; feeds 54 via `INVP.live` |
| 55-bcompare.js | | Builder "Compare two jobs" (buildAt per side, or "This build" = BLD.S) |
| 56-snipe.js | 48 | FM Sniper: PWNOW vs PW, deal grades/score (ours), views, watch list, new badges, live market.json refresh, tools (trip, craft, sell, watch alerts, movers, lifetimes) |
| 60-planner.js | 42 | Path Planner; exports TRAVEL |
| 62-expcalc.js | | EXP/hr calculator (ids `#ec*`) |
| 64-undervalued.js | | UV_PICKS / UV_PACKED / UV_SRC (World Map toggle, "vibes", never tied to planner) |
| 65-navigator.js | | Map Navigator, `navTo(id)` |
| 66-worldmap.js | 28 | World Map (D.wmap), map cards (`openMapInfo`), Sleepywood sub-map |
| 67-kpq.js | 13 | KPQ guide (D.kpq) |
| 68-tracker.js | 11 | Grind Tracker pages (live /api/summary, D.shared fallback); trkKpq = Rush/Bonus KPQ boards |
| 69-search.js | | Ctrl K / `/` search, `#key=value&` share links |
| 71-navside.js | | sidebar nav: random sprite pools per page (MESO_ICONS inlined), footer links, Settings Layout + Page size |
| 75-history.js | | Back/Forward: history entry per page/place change, nav ← → buttons |

Symbol index: `grep -n "^function\|^const\|^let" src/js/*.js`. Data peek: `python3 -c "import json;d=json.load(open('data/data.json'));print(list(d))"`.

## Recipes
- **New page/tab:** markup `<section id="x" hidden>` in src/pages/x.html + a `<!--@page x-->` slot in index.html; button `#t-x` with `data-cat` in `.subs`
  (under its section's `.sgh` title, with `<img class="nic" data-pool="x">` and a pool `P.x` in 71-navside.js); `.hlink`
  on the Home card; bump the home-link count in tests/smoke.js (22 now) and the sidebar page count (20), Home sprites in tests/pages.js + smoke.js (28), add a click-through check.
  Give the `.hlink` an `<img class="hic" data-ic="i:<item>|m:<mob>|s:<skill>">` sprite (filled from D in 00-core.js,
  shown only when the card is a billboard) and bump the sprite count in smoke.js (29 = 7 headers + 22 links).
- **Changelog:** every user-visible change gets a dated entry at the top of `#log` (grep `id="log"`, read ~20 lines there).
  10-20 audit: 5 small ships (footer move, favicon, offline on custom domain, builder avatar, "listings updated ago") had no card; caught up as v0.8.1. Add only at the top: a card inserted lower renumbers every newer version.
  Each card = one site version, numbered by build.py (oldest = 0.1.0; `class="card" data-minor` starts the next 0.x.0, for a big addition).
  Site-only: tracker app changes go in `tracker/app/changelog.js`.
- **Item count** asserted in smoke.js (2,221); update when items change.
- **Tooltips:** one floating `#qtip`; classes `.qname` quest, `.ri` item icon, `.itname` item name, `.mname` map
  (`mapLink()`, click opens World Map card), `.nname` NPC (`npcLink()`), `.mobname` monster (`mobLink()`).
- **Per-viewer state:** localStorage in try/catch; load an object with `savedState(key, S)` (00-core.js: drops unknown keys and wrong types), then range-check enums/levels.
  Share links (`HASH.x`) are just as untrusted: validate before use (see the sanitizers in 50-builder.js / 60-planner.js). Keys in use: tab planner path pathdone qsort qeq qval ctown craft craftlv
  qcompact keep keephave mobs items skills navi wmap expc theme themes themec anchors train (Where to train + Builder hand-off) bcmp (job compare) snipe snipewatch snipeseen snipetarget snipetools snipealert snipepresets (FM Sniper).
- **Explanations:** a closed `<details class="howto">` at the top of the tab, short bullets.
- **Share links:** extend the existing `#key=value&` hash (69-search.js); never a new scheme.
- **Settings (cog `#thopen`, Danny 10-20):** `#thpop` is an inset modal (`.srch.setm` > `.srchbox.setbox`) next to `#srch` near the end of index.html, not inside the header (`.wrap` zoom); tests close it with `#thclose` (the backdrop covers the cog, so clicking `#thopen` again times out). Toggle anchors (`src/js/72-anchors.js`, option A of the mockups): movers over `#srchopen`/`#thopen` move them by `transform` from their natural spot (layout never shifts), localStorage `anchors` = {id: {x share of header width, y px, w px once resized}}, cleaned on load; off under 761px. `window.ANCH` for tests. tests/edge.js "anchors:" checks drag/reload/reset/bad values/phone, F1, center guide, scale, Colours.
  Round 3: default header (wide) = Search left over the sidebar, `width: var(--sbw)`, small cog right in the same row (CSS at the end of styles.css). Edit mode also moves `header h1`/`header > p` (fit-content now), sidebar width `--sbw` (180-420, `.anchsbw` handle) and `data-sbside="right"`, sidebar section order (`secs`, moves `.sgh` + its buttons and `.cats` buttons), Home card order (`home`) and width (`--hcw`); the `<head>` script applies sb/hcw before draw. Reorders animate with FLIP; clicks in `.navcol`/`.homegrid` are swallowed while editing. Test drags need a hand's pace (16 ms per move) or the glide hides the target.
  Round 2: smart guides (header center/edges, title/tagline text via Range, other part) win over the grid, Alt = free; scale `s` 0.5-2.5 (transform-origin 0 0); F1 toggles (preventDefault stops Chrome help), Esc = Done; Colours panel = theme editor, uses `window.SITETHEME` from 70-theme.js (preview/revert/save into "themes"). Unsaved colour edits revert on close.
- **Themes:** `src/js/70-theme.js` + the `siteTheme` head script in index.html; presets/share codes come from
  `tracker/app/themes.js` (build.py `/*@THEMES*/`). Text on accent: `var(--on-accent,var(--panel))`. Default sets nothing,
  so styles.css :root stays the source; tracker core.test.js fails if the tracker's Default drifts from it.

## Conventions
- CSS tokens only: --bg --panel --ink --muted --line --accent --accent-soft --leaf --warn --bad. Lavender/purple/grey.
  Light + dark must both work; no horizontal scroll at 390px (smoke checks).
- Plain player language; say when a number is estimated (assumed drop rates: 5% loot default, 30% quest items).
- Don't add back: "The List" tab, hover-to-select on World Map, map-name click → navigator (it opens the map card).

## Known traps
- Formulas follow the launch client (OSMS formulas page, 2026-10-20): mastery ×0.7, magic INT/125, new damage taken, Iron Arrow
  0.8^k (AOE_FALL is now the kept ratio), EXP 90+ ×2.1, mesos from the OSMS formula (mesoAvg; D.meso/mesok only shown as meowdb
  reports), party bonus +5%/attacker. Crafting capped at CRAFT_CAP = 8 in 00-core.js (filters D.craft.rec for every tab).
- `data.json` / `dist` are mostly one huge line: any Read/cat/grep floods context.
- Smoke opens pages via `tab("#t-x")` (clicks the section first; hidden buttons can't be clicked).
- meso.watch prices refresh automatically (`.github/workflows/mesowatch-poll.yml`, every 30 min at minute 7 and 37, commits to `main`); to force a run, trigger that workflow via the Actions UI or Danny's chat "refresh" trigger. Claude threads never fetch meso.watch themselves (Cloudflare check + sandbox can't reach it). A dev CSV dropped in chat still works via `python3 scripts/fetch_mesowatch.py <market.json> [listings.csv]`.
- mapleexp.com drops are CMS v79 (China), not Classic: don't use. Its EXP table to Lv 100 is fine.
- No drop rates exist anywhere (OSMS, meowdb have reports only); every rate on the page is an assumption, labelled.
- Keep or sell skips quest items with the same test as Items "Hide quest items" (403xxxx ID block + quest start items; `QITEM` in 47-keep.js and 49-items.js, keep both in sync). Smoke: "keep list: no quest items".
- OSMS c661434 also renamed "Arrow Bomb: Bow" -> "Arrow Bomb", "Iron Arrow: Crossbow" -> "Iron Arrow" (found 10-19). golden.js now fails if any skill named in GUIDE/GUIDE2 sp, AOE_SKILL, AOE_FALL or NEEDS_WEAPON is missing from D.skills.
- OSMS export bumps can change skill wording/kinds silently. Oct 17: "success rate" became "trigger rate" (builder read 0% Final
  Attack) and Final Attacks became attack kinds (Crossbowman's guide cast Final Attack). `faStats` + `attackInfo1` in
  50-builder.js handle both; golden.js checks "Final Attack 25% proc ..." and "no Lv 50 guide build casts Final Attack".
- Back/Forward (75-history.js): after any click/change/Enter it compares {tab, place} with history.state and pushes if
  different (no URL change). A page with in-page places registers `navReg(tab, get, set)` (mobs, items, skills, wmap, quests);
  `get` must return JSON-comparable data or every click pushes. Smoke checks "browser Back ...", "a new step clears Forward".
- Home `#pwstate` (70-theme.js, under `.sitever`): meso.watch state from `D.pw` (`it` count, `read` date, `now` count + `pwListedAgo()`),
  redrawn each minute. Smoke "meso.watch state on Home" pins the text; keep `.sitever` the first match (smoke reads the version from it).
- tests/edge.js "tracker server reply hostileName" checks a markup player name shows as literal text on the KPQ board.
- Unset path vars write to a literal folder named "undefined" (the 10-06 Credits screenshots landed at repo root). Gitignored now; save screenshots to the scratchpad.

## Splits
- 10-18: `src/index.html` split into `src/pages/<id>.html` (built dist identical). Edit a page's file, not the shell; build.py asserts every page file has a slot.
- `50-builder.js` 43 KB and `60-planner.js` 42 KB are big but cohesive; grep + ranged reads are enough for now.

## Bug hunt 2026-10-19
- `src/index.html` now starts with `<!doctype html>` + viewport meta (Pages was quirks mode, phones rendered at 980 px). Phone nav (<=600px): `.cats`/`.subs` are one horizontal-scroll row; `inRow()` keeps the picked button visible.
- Big tables use `lazyRows(tbody, rowsHtml, emptyHtml)` (00-core.js): 60 rows, then 150 per scroll via IntersectionObserver. Tests counting rows must scroll first (edge.js does).
- Tracker live summary goes through `trkClean()` (68-tracker.js) before rendering; never render server fields raw. Price check icon candidates and the Builder import's icons (52-shotimport.js `warm`) preload in idle time when their tab opens.

## Ideas batch 2026-10-19
- Pages deploy = `scripts/pages_site.py` (pages.yml): D.iicons/D.mmaps move to a hashed assets JSON fetched at start (`ASSETS` promise in 00-core.js; first load 3,081 -> 968 KB gzip), plus `src/pwa/` manifest, icons (Orange Mushroom sprite, mobimg 9, on a rounded purple gradient tile matching the tracker Slime; regenerate with `python3 src/pwa/make_icons.py`; icon-32 favicon, 192/512 rounded "any", icon-maskable full-bleed for Android/iOS home screens) and sw.js (network-first, registers on any https host, so the custom domain too; it was *.github.io-only until 10-20). The artifact stays one file. Trap: code that needs every icon must `await ASSETS`; markup drawn before they land is patched by `fillIcons` (`.ri[data-item] > i`, items-list `.ibtn > i`) only, so a new icon spot needs that placeholder shape or a redraw.
- Credits "Data last updated": build.py injects `SRCDATES` (fetch_osms.sh ref + data/sources "read" dates); the OSMS date is data.json `osms` (build_data.py `osms_info()`, set by hand to the Oct 17 export for c661434 until the next rebuild).
- Monkey (tests/monkey.js) found: 1e308 in a Where to train stat box scrolled phones sideways (statNum now clamps 0-99,999; edge.js test).

## Market data 2026-10-19
- `D.pw.it[id]` gained [5] trend and [6] sell-through (= sold/(sold+asks), checked on the CSV); `D.pw.now` = cheapest live listing per non-equip item (stars 207xxxx and per-set items excluded), `D.pw.listed` its UTC time. the poller (now `scripts/mesowatch-sync/mesowatch_poll_ci.sh`, was refresh_mesowatch.sh until 2026-10-20) feeds both payloads.
- 10-maps.js: `pwTrend`, `pwSellTag` (our cut-offs: 40%+ fast, <10% slow), `pwNowHtml`, `pwCheap` (<=0.8x a solid median). Items: Trend column, "Cheap in shops now" filter. Builder `avatar()` loads a live maplestory.io image, the page's one outside request; hidden on error (artifact sandbox may block it).
- Trap: with vendor/ not cloned, `build_data.py prices` fails (analyze.py); inject pw into data.json in Python as the step does.

## Site version stamp 2026-10-19
- Home `.sitever` now shows the viewer's local time + zone (70-theme.js, from `data-built` ISO set by build.py); hover = UTC. The HTML text stays "built ... UTC", so curl/grep live checks still match; in a browser read the `title` for UTC. smoke.js checks it under America/Los_Angeles.
- 10-19: stamp reads "Site version: v0.x.y · built ..." (`data-ver`, = newest changelog card); smoke.js checks the match and the tracker
  patch notes on Grind Tracker Overview (`/*@TRKLOG*/` in 68-tracker.js).

## Input sizing 2026-10-19
- Builder AP boxes overlapped: `.apgrid input{width:100%}` plus padding/border on content-box inputs = 20px wider than the grid cell. Fixed with `box-sizing:border-box` (also `.pigrid`); range sliders lost their 2px side margin.
- smoke.js `spillingInputs()` fails any `.lab > input/select` wider than its label, every page at 390px and the builder at 1280/900/700/430. Trap: there is no `<main>`, select pages with `section:not([hidden])`. New `width:100%` inputs need `box-sizing:border-box`.

## Nav redesign 2026-10-20
- Default layout = sidebar (html without data-nav, >=761px): .wrap is a 2-column grid, nav sticky in column 1. `data-nav="basic"` = plain sidebar, `"rows"` = old two rows (also always on phones). showCat() unhides every page button when `sideNav()`; tests click `#c-x` only when it's visible.
- 10-20 hanging indent (sprite sidebar only, `html:not([data-nav])`): page links `margin-left:20px`, `.sgh .nic` 36px with -8px left margin, `.sgh` margin-top 22px. Basic mode untouched. Mockup screenshots: inject CSS into dist via Playwright and clip `.navcol>nav`.
- Sidebar sits in `.navcol` (grid column, rows 2-401) so the sticky nav can't slide over the full-width footer (row 402); 71-navside.js gives a nav taller than the window a negative `top` so its bottom stays reachable.
- Site version + meso.watch lines live in `.sitefoot` (bottom of every page, Danny 10-20), not in #home.
- `data-size` 1-5 (default 3) zooms `.wrap` with CSS `zoom` only at >=1700px; max-width is divided by the zoom. Changelog/Credits live in `.sitefoot` (cat "more" is hidden everywhere).
- Spec and Danny's picks: /mnt/project-files/reports/nav-redesign-spec-2026-10-20.md (mockup artifact C9RkvgB6VWPbqjyD6ss4RG).
- 2026-10-20: header centered (title, tagline, Search); Sources link removed (Credits is in the footer); Theme button `.thbtn` sits absolute top-right of the header (static next to Search on phones).

- 10-20 (v-next): Builder moved to Training (2nd, so the section still opens on Where to train), Skills to Maple Database; My Character section/Home card gone. Sections are now trk train world db town (+more).
- Trap: 72-anchors.js `order()` migrates saved `secs`/`home` (drops unknown ids, inserts new ones at their default spot, rejects duplicates), so adding/removing a section keeps users' edit-mode order. edge.js checks a pre-10-20 layout with "char".

## FM Sniper 2026-10-20
- `src/js/56-snipe.js` + `src/pages/snipe.html`: rows = PWNOW (cheapest live listing per non-equip item) vs PW median (or p25 via Compare with). Grades (Steal <=50%, Great <=70%, Good <=85%, Small <100%, Rising/Over/Way over >3x, check it <25%) and Best deal = (1 - ratio) x min(1, log10(1+sales)/2), halved for low data: our cut-offs, stated in the howto. Listings under 1 meso (arrows) and unknown ids are skipped. Share key `#f=`.
- Live refresh: `scripts/pages_site.py` writes `market.json` (= D.pw) next to the Pages copy; the page fetches it on open and every 3 min while visible (only when `D.lazy`, so never in the artifact/file://), and if `listed` is newer, swaps PW/PWNOW contents in place (Items tab and footer follow; footer listens for `pwupdate`). Trap: PW/PWNOW are mutated, never reassigned.
- Tests: `tests/snipe.js` serves a fixture market.json (fixed numbers, so meso.watch poll commits can't break it); smoke.js only checks invariants on the real list. Fixture sellers must not match real ones (the "new" check compares item|price|seller).

- Round 2 (v0.10.0): tool tabs (`S.m`: list, trip, craft, sell, watch, move, life), each a `#snp-<m>` panel drawn by `render()`. NPC price = `D.items[id].p` (Under NPC grade/filter, counts as a deal), shop = `D.ishop` min; Best flip = gap x sell-through (rough = 0) or the NPC gain. Crafting flips use `D.craft.rec` (equip outputs skipped); "Needed by me" reads `KEEPNEED()` (47-keep.js). Storage adds snipetarget snipetools snipealert snipepresets.
- Deal lifetimes: `scripts/deal_life.py` (called by build_data.py prices -> `D.pw.life`) replays the git history of mesowatch_prices.json; needs the poll's fetch-depth 0, finds fewer snapshots in a shallow clone. Test: `python3 tests/deal_life_test.py`. Trap: redrawing the watch table removes the focused target box, whose blur fires `change` again mid-redraw (guarded by `wdraw`).
- Same push: Builder AP boxes cap at 9999 (input sanity, not a game limit); monkey seed 3 found DEX 1e308 printing "4.8e+307" accuracy and scrolling phones sideways (edge.js test). Adding a nav page reshuffles the monkey's random walk, so run monkey.js before pushing one.

## Scroll check 2026-10-20
- 57-scrollscan.js: scrolls share 4 pictures (one per tier, 52 each), so names come from the hovered tooltip. Tooltip (Danny's frames, tests/fixtures/tip-*.png): light blue bullet (85,204,255) left of the name; name in a smooth bold font (`NAMEFONT`, ink levels 0-2, copied from 2 frames); description = MSG_FONT chat font, wrapped. `GrindReaders.readTextLines(img, box, LV, {font})` reads both; match = name regex (2) + joined description prefix (1), "?" = 1-3 letters. Unread letters of matched tooltips are learned (localStorage `scanglyphs2`).
- Hovered slot (`hovered()`): pointer = bullet + (-16, -43) native (tooltip opens below-right of the mouse; tests/fixtures/hover-*.png, 3 live frames), or bullet + (-17, +38) when the tooltip text ends within 30 px of the frame bottom (game pushes it up). The old +38-only rule ticked a slot 2 rows low. Candidates come from the whole-tab grid; a slot covered since the start (grid "?", no picture) is taken as a guess (`guess`, tok null) and confirmed when it is seen clean.
- During a scroll check `INVP.live` gets scroll slots only (Danny 10-20); grid cells are border-box 40x40 (dashed borders made rows uneven), no hover scale (it made a sideways scrollbar).
- Trap: bullet() returns every light-blue dot (inventory items match too); tooltip() keeps the one with the best name line. Artifact has no screen capability: the button says "open the site".
- Testing pass 10-20: features.js sweeps all 208 scrolls through `SCAN.match` with unread letters (never wrong; ties broken by glyph width, "?o?" = Bow vs Gloves), covers a top-row scroll (tooltip hides the red line: readFrame keeps the last window when a tooltip reads) and a tab scrolled one row. UI: live "Reading:" line (`#sshint`), scanned total, Start over.

## Gemini formula check 2026-10-20
- Outside handoff checked against OSMS formulas page: mastery 0.7 (not its 0.8), Lucky Seven, floor(INT/2), ammo-in-WA already right; StatDiv 300 only fires when meleeing with bow/crossbow/claw or Prone Stab, which the builder never models.
- Fixed: `classAcc` (Where to train, EXP calc) now uses the Beginner formula below Lv 10 (golden.js). README and plan.html no longer say COT2 formulas.
- `classAcc` truncs the base like the client (skill bonuses added after). cit.html / craft.html source notes say which numbers are launch vs COT2.
