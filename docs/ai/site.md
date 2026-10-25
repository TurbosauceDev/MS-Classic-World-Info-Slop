# Site cheatsheet (for Claude threads)

Version history index: [site-history.md](site-history.md).

One self-contained page (`dist/index.html`) built from `src/` + `data/data.json`. No server, no external requests except
Google Fonts, the tracker's live `/api/summary` fetch (Danny OK'd) and the user-initiated classicrank.com "Load by IGN" lookup. Also published as the claude.ai artifact.

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
node tests/expclive.js | tail -3            # EXP/hr live reader on tracker/tests/frames, Stop saves a session, screenshot pair
node tests/polish.js | tail -3              # list Reset + Copy link, Home masonry, changelog times, World Map idle card, item page
node tests/snipe.js | tail -5               # FM Sniper on a fixture market.json: deal maths, views, filters, watch, new, live refresh, tools
python3 tests/deal_life_test.py             # FM Sniper deal lifetimes from a fake snapshot git history
node tests/monkey.js | tail -3              # random clicks/typing/Back/window sizes; SEEDS=4,5 N=300 to vary; ~100 s
python3 scripts/pages_site.py /tmp/site     # the Pages copy pages.yml deploys (prints first-load size)
python3 scripts/name_diff.py <base-commit>  # skill/item/monster/map renames between two data.json (CI: osms-names.yml)
python3 scripts/fetch_shared.py             # shared tracker runs (daily CI job does this)
python3 scripts/fetch_classicrank.py        # classicrank.com job census -> D.crank (~2 min; daily CI job does this)
node scripts/fetch_meowdb_drops.js          # drops + mesos; then build_data.py extras mobdb
node scripts/fetch_meowdb_shops.js          # NPC shops; then build_data.py extras crafting itemdb weapon_sources
python3 tests/meowdb_test.py                # meowdb source shape + Citizenship shop prices = meowdb launch prices
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
| 20-quests.js | 18 | Quest Database, `#qtip` tooltips, rewardCell(), questMarket/marketCell, stackWith/stackCell |
| 40-citizenship.js | | GRADES + SHOPS (meowdb) |
| 45-crafting.js | 14 | Crafting (CRAFT_LV from OSMS dashboard) |
| 47-keep.js | | Keep or sell |
| 48-monsters.js | 21 | Monsters list + page |
| 49-items.js | 18 | Items list + page; `.ri`/`.itname` click opens it |
| 50-builder.js | 43 | Character Builder; `buildAt()` headless default build; BLD |
| 51-shot.js | | screenshot reader core (un-double UI, icon pixel match, SHOT_FONT digits); also copied into tracker |
| 52-shotimport.js | 16 | builder "Import from screenshots": auto-applies, thumbnails + big view, unshown-SP ask |
| 53-skills.js | | Skills tab |
| 54-invprice.js | | Price check (inventory/bank screenshots → meso.watch `PW` prices; Keep or sell column via `KEEPSELL` from 47-keep.js) |
| 59-crlookup.js | | Load by IGN (Builder + Where to train): keyless classicrank.com `/api/v1/characters/{name}`, badge, `jobOf` job → class/branch; `window.CRL` for tests |
| 58-craftplan.js | | Crafting > Plan tab (was the Craft planner page) + the craft levels card and price helpers (`CPLAN.worth/buyEach/rough`) the other Crafting tabs use: craft levels + Price check's screenshot reads (`INVP.counts()`, `invupdate` event) + hand entry → craft now / almost (farm maps, buy cost) / best mix; `window.CPLAN` for tests |
| 57-scrollscan.js | | Price check › Scroll check: getDisplayMedia, live Use tab grid, tooltip read (readers.js `readTextLines`) matched to scroll name/desc, slot = nearest to tooltip corner; feeds 54 via `INVP.live` |
| 55-bcompare.js | | Builder "Compare two jobs" (buildAt per side, or "This build" = BLD.S) |
| 56-snipe.js | 48 | FM Sniper: PWNOW vs PW, deal grades/score (ours), views, watch list, new badges, live market.json refresh, tools (trip, craft, sell, watch alerts, movers, lifetimes) |
| 56-mci.js | 5 | Market Comparison Index (#mci): one column per price site (sale prices only), middle, spread, cheapest live listing |
| 60-planner.js | 42 | Path Planner; exports TRAVEL |
| 62-expcalc.js | | EXP/hr calculator (ids `#ec*`): typed/timer, screenshot pair (EXIF/file-name time), Save as image; `window.EXPC` |
| 02-screen.js | | `shareScreen({ms, onFrame, onEnd, before})` + `screenTicker`: shared getDisplayMedia plumbing (Worker ticks, ImageCapture) for 61-questlog.js and 63-expclive.js |
| 63-expclive.js | | EXP/hr live screen reader (`#ecl*`): tracker readers + core/session.js + core/gamedata.js, Mini view (Document PiP); `window.EXPLIVE` for tests |
| 64-undervalued.js | | UV_PICKS / UV_PACKED / UV_SRC (World Map toggle, "vibes", never tied to planner) |
| 65-navigator.js | | Map Navigator, `navTo(id)` |
| 66-worldmap.js | 28 | World Map (D.wmap), map cards (`openMapInfo`), Sleepywood sub-map |
| 67-kpq.js | 13 | KPQ guide (D.kpq) |
| 68-tracker.js | 11 | Grind Tracker pages (live /api/summary, D.shared fallback); trkKpq = Rush/Bonus KPQ boards |
| 69-search.js | | Ctrl K / `/` search, `#key=value&` share links |
| 71-navside.js | | sidebar nav: random sprite pools per page (MESO_ICONS inlined), footer links, Settings Layout + Page size |
| 75-history.js | | Back/Forward: history entry per page/place change, nav ← → buttons |
| 76-stack.js | | phone tables: labels body cells with their header (`data-l`), marks 4+ column tables `stk` (styles.css "Phone tables", ≤600px) |

Symbol index: `grep -n "^function\|^const\|^let" src/js/*.js`. Data peek: `python3 -c "import json;d=json.load(open('data/data.json'));print(list(d))"`.

## Recipes
- **New page/tab:** markup `<section id="x" hidden>` in src/pages/x.html + a `<!--@page x-->` slot in index.html; button `#t-x` with `data-cat` in `.subs`
  (under its section's `.sgh` title, with `<img class="nic" data-pool="x">` and a pool `P.x` in 71-navside.js); `.hlink`
  on the Home card; bump the home-link count in tests/smoke.js (26 now) and the sidebar page count (22), Home sprites in tests/pages.js + smoke.js (32), the nav page count in tests/edge.js "My Character still loads" (23), add a click-through check.
  Give the `.hlink` an `<img class="hic" data-ic="i:<item>|m:<mob>|s:<skill>">` sprite (filled from D in 00-core.js,
  shown only when the card is a billboard) and bump the sprite count in smoke.js (29 = 7 headers + 22 links).
- **Changelog:** every user-visible change gets a dated entry at the top of `#log` (grep `id="log"`, read ~20 lines there).
  10-20 audit: 5 small ships (footer move, favicon, offline on custom domain, builder avatar, "listings updated ago") had no card; caught up as v0.8.1. Add only at the top: a card inserted lower renumbers every newer version.
  Each card = one site version, numbered by build.py (oldest = 0.1.0; `class="card" data-minor` starts the next 0.x.0, for a big addition).
  Site-only: tracker app changes go in `tracker/app/changelog.js`.
- **Item count** asserted in smoke.js (2,258; also 308 recipes, 84 monsters in smoke + edge); update when items change.
- **Tooltips:** one floating `#qtip`; classes `.qname` quest, `.ri` item icon, `.itname` item name, `.mname` map
  (`mapLink()`, click opens World Map card), `.nname` NPC (`npcLink()`), `.mobname` monster (`mobLink()`).
- **Per-viewer state:** localStorage in try/catch; load an object with `savedState(key, S)` (00-core.js: drops unknown keys and wrong types), then range-check enums/levels.
  Share links (`HASH.x`) are just as untrusted: validate before use (see the sanitizers in 50-builder.js / 60-planner.js). Keys in use: tab planner path pathdone qsort qeq qval ctown craft craftlv
  qcompact keep keephave mobs items skills navi wmap expc theme themes themec anchors train (Where to train + Builder hand-off) bcmp (job compare) snipe snipewatch snipeseen snipetarget snipetools snipealert snipepresets (FM Sniper) fbkey (Feedback inbox) cplan (Crafting levels + Plan) crtab craftlvv (Crafting tab, Level up valuation) profiles profile (Settings profiles) cr_char (Load by IGN).
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
- Padding (Danny 10-21): nested boxes keep padding from their container on every side, nothing flush to or past a card edge;
  stacked cards get a gap (`section>.card+.card` 14px, `.pcol`/`.grid2` gaps). `tests/boxgaps.js` checks it (smoke: every page at 390px; craftplan.js filled page).
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
- Home billboard (homeBig) uses View Transitions: the browser default stretches each card snapshot to the moving box and cross-fades (10-21 "cards flash" report: giant ghost text). styles.css pins `::view-transition-old/new(*)` to `object-fit:none` top-left; root swaps without fading. tests/edge.js "Home billboard transition" checks it. Any new view transition inherits this.

## Splits
- 10-18: `src/index.html` split into `src/pages/<id>.html` (built dist identical). Edit a page's file, not the shell; build.py asserts every page file has a slot.
- `50-builder.js` 43 KB and `60-planner.js` 42 KB are big but cohesive; grep + ranged reads are enough for now.

## Bug hunt 2026-10-19
- `src/index.html` now starts with `<!doctype html>` + viewport meta (Pages was quirks mode, phones rendered at 980 px). Phone nav (<=600px): `.cats`/`.subs` are one horizontal-scroll row; `inRow()` keeps the picked button visible.
- Big tables use `lazyRows(tbody, rowsHtml, emptyHtml)` (00-core.js): 60 rows, then 150 per scroll via IntersectionObserver. Tests counting rows must scroll first (edge.js does).
- Tracker live summary goes through `trkClean()` (68-tracker.js) before rendering; never render server fields raw. Price check icon candidates and the Builder import's icons (52-shotimport.js `warm`) preload in idle time when their tab opens.

## Ideas batch 2026-10-19
- Pages deploy = `scripts/pages_site.py` (pages.yml): D.iicons/D.mmaps move to a hashed assets JSON fetched at start (`ASSETS` promise in 00-core.js; first load 3,081 -> 968 KB gzip), plus `src/pwa/` manifest, icons (Orange Mushroom sprite, mobimg 9, on a rounded purple gradient tile matching the tracker Slime; regenerate with `python3 src/pwa/make_icons.py`; icon-32 favicon, 192/512 rounded "any", icon-maskable full-bleed for Android/iOS home screens) and sw.js (network-first, registers on any https host, so the custom domain too; it was *.github.io-only until 10-20). The artifact stays one file. Trap: code that needs every icon must `await ASSETS`; markup drawn before they land is patched by `fillIcons` (`.ri[data-item] > i`, items-list `.ibtn > i`) only, so a new icon spot needs that placeholder shape or a redraw.
- Credits "Data last updated": build.py injects `SRCDATES` (fetch_osms.sh ref + data/sources "read" dates); the OSMS date is data.json `osms` (build_data.py `osms_info()`; patched by hand to 6f003e7 on 10-22).
- OSMS re-pin 10-22 (63db094 -> 6f003e7): trap: a full `build_data.py` here dropped KPQ spawn points (mobdb `sp`) and most `pw.life` price history (environment-dependent steps). When the export diff touches nothing the site reads, bump fetch_osms.sh and patch data.json `osms` only; diff data.json key-by-key after any full rebuild.
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

## Craft planner 2026-10-21
- `src/js/58-craftplan.js` + `src/pages/craft.html` Plan tab (was cplan.html) (layout A of the mockups, artifact WNSNUN8SWR16sf7k8CkQrw). Inventory = 54-invprice.js `tally()` (shared with Price check: drop on either page) + hand items (localStorage `cplan`). `make()` crafts parts on the way with the 45-crafting.js recipe rule (lowest level, biggest batch), only for recipes your levels allow; otherwise the part is "missing".
- Value = max(meso.watch median, NPC price); per-set (flag 2) items fall back to NPC. Held materials cost what they'd sell for unless "nothing". Farming: D.drops + D.craft.src mobs × 5%/kill, or D.shared.mobs real count at 100+ kills; kills/hr from `mapRates` with the default build (not Where to train's typed stats). Test: `node tests/craftplan.js` (CI) checks invariants only, since prices move every poll.
- Trap: crafting success rates aren't in the files; every craft is taken as a success (said in the howto).
- Crafting overhaul (10-21): Craft planner merged into Crafting as tabs Plan / Recipes / Level up / Reference (`#crmode`, panels `#crp-*`, built on first open, redrawn on `craftlv`/`invupdate`). One "Your craft levels" card (`#cplv`, owned by 58) feeds all tabs. Recipes gain Sells for + Profit (45 `econ`: worth × batch − fee − ingredients at worth; an unpriced crafted part costs its own recipe), "Only my levels", "Profitable only", "you can make N". Recipe pop-up `#crpop` (in index.html next to `#thpop`, `.srch.setm`): tiles, ingredients, from scratch, farm maps, Used in, `priceBox`. `window.CRAFT` for tests.
- Old `#g=cplan` links and a saved `tab=cplan` land on Crafting > Plan (00-core.js). Nav lost a page: home links 25, Home sprites 31, sidebar 21. Price tile CSS is `:is(#itprices,.crpx)`. Test: tests/craftplan.js "Crafting tabs".
- 10-21 padding fix: cards were stacked flush and `.cpset`/`.cpadd`/`.cpbig` had no CSS (end of styles.css now). `#cpitem` needs type=text for the input styles.

## Feedback page 2026-10-21
- `src/pages/feedback.html` + `src/js/73-feedback.js`: footer link + `#t-feedback` (cat "more"). POSTs {kind, msg, contact, website (honeypot), page = last page open, ver} to the Worker's `/api/feedback` (URL from TRK_API). Owner inbox in the same page: key = Worker secret FEEDBACK_KEY, kept in localStorage `fbkey`.
- smoke.js fakes `/api/feedback` with `p.route` (never post to the live server from tests; monkey.js aborts all outside requests). Nav page count is 24 in edge.js (after Craft planner).
- `.narrowpage` (styles.css): a page whose content is one narrow column gets it on its `<section>`: About box + content share one width (760px), centered right of the sidebar (Danny 10-21: no long empty tail). Only Feedback needed it on 10-21 (checked every page at 1900px).
- Scanned-inventory peek (10-21): `invPeek(counts)` in src/js/00-core.js renders a hover/focus popover grid of read items (icons + counts); used by Price check (#ivsum) and Craft planner (#cpinv). Generic, so other screenshot readers (Builder import) can reuse it. CSS `.ipeek*` at end of src/styles.css.

## Profiles + app-style Settings 2026-10-21
- `src/js/74-profiles.js`: localStorage `profiles` (max 30) + `profile` (in use; unset = "b:Default"), same model as the tracker's (switching away saves the screen into your profile; built-ins "b:<name>" are never saved into/deleted). Codes = MSCS1 + `site` {nav, size, anchors}; app takes only the theme, site takes only the theme from app codes. `window.PROFILES` for tests; edge.js "profiles:".
- Danny's Default anchors were measured off his 10-21 screenshot (1961 px header, sidebar ~285 px is an estimate); if he sends his own code, replace BUILTIN[1]. Uses `ANCH.clean/set` and `SITETHEME.setup/take`.
- Settings modal now mirrors tracker `#prefsPop` (sticky title + `.pnav` chips, `.setcard` per section). Trap: don't use a `<nav>` in it, global `nav` CSS hits it.
- 10-21 builder pass: screenshots apply on paste (`applyR` in 52-shotimport.js, wrapped in `BLD.group` so one paste = one Undo step); the review form is gone, the builder's own controls are the edit form. Undo/Redo/Reset live in 50-builder.js (`HIST`, `track()` at the end of `render()`); the import's READS ride along via `BLD.extra`. Only typing in AP boxes coalesces steps.
- Trap: anything that changes S in several `BLD.apply` calls must go through `BLD.group`, or Undo needs two presses. Reset = default S with an auto skill build (sp `{__auto:1}`), not empty SP.
- Each read keeps `marks` (native-pixel boxes) and a `thumb` crop of just the read windows; a full 2560x1440 frame reads fine at 2x (bow-full.png).
## Privacy page 2026-10-21
- `src/pages/privacy.html` (footer "Privacy", More › Privacy): static, plain-language policy + disclaimers, verified from code (localStorage only, screenshots/screen share never uploaded, Worker keeps only Feedback notes, opt-in runs/KPQ, party_live 1 h, salted IP-day hashes). Smoke checks the footer link.
- Trap: if a feature starts sending or storing anything new (server field, external fetch, analytics), update this page in the same push.

## classicmarket.kr prices 2026-10-21
- `scripts/fetch_classicmarket_listings.py` pulls classicmarket.kr's public `/api/listings` (JSON, real item ids, price is per unit) -> `data/sources/classicmarket_prices.json` + `D.cm.it[id] = [askMin, askMedian, askN, bidMax, bidMedian, bidN]`. Workflow `classicmarket-poll.yml` every 2 h (own workflow, meso.watch poll untouched); build_data.py step `cmarket`.
- Counted: use/etc posts, and equips with 0 upgrades and an "exact" roll (buy posts with no roll too). Dropped: scrolled, upper/lower/unknown rolls, Cash, placeholder prices (0, all-same digits like 9999/99999, 123456), posts 10x off the median, bids over 2x the ask median. Author, Discord id and note are never stored.
- Traps: the outside handoff's note rules (drop cheap posts saying 귓 "whisper") would drop real stackables (Iron Ore 300 "귓주세용"); price is already "each" (개당), no total parsing. Tests: `python3 tests/classicmarket_test.py` on `tests/fixtures/classicmarket_listings.json` (real posts).

## meowdb refresh 2026-10-21
- Shops come from `scripts/fetch_meowdb_shops.js` (JSON in the npc-shops page's `self.__next_f` flight payload; no API). Each shop has `prices` "Launch prices"/"COT2 prices" + `mapId`; `D.ishop` rows gain a 5th field ("COT2" or ""). `fetch_meowdb_drops.js` also refreshes mesos. Run the fetchers with the global Playwright (a local `npm i playwright` pins a browser build /opt/pw-browsers doesn't have).
- Item page "Prices" = `PRICE_SRC` in 10-maps.js (shared; see "Item Prices box" below). `npcCheaper`/`npcCheaperPill` = cheapest shop under the cheapest listing (or median); `votesHtml(v)` = "N confirmed". meowdb votes are weighted floats: build rounds them.
- Trap: 40-citizenship.js SHOPS is a hand copy of meowdb prices; tests/meowdb_test.py fails when a launch-priced shop differs. Endpoint map for Z.ai: /mnt/project-files/reports/meowdb-endpoints-2026-10-21.md (market summary/listings work without login).
- UI (src/js/11-cmarket.js): `CM`, `pwPrice(id)` (meso.watch -> meowdb usual -> cm ask median -> cm bid median, `{v, src, n, rough}`), `cmShort`; adds rows to `PRICE_SRC` (Items "Prices"). Used by Price check `advice()`, Keep or sell, Craft planner `worth`/`buyEach`, FM Sniper Sell helper ("Fill a buy order"). FM Sniper deal grading stays meso.watch only (asks aren't sales). Test: features.js "classicmarket".
- Quest turn-in value (v0.12.5): quest `il` rows are `[name, n, sourceMob, itemId]` (`build_data.py reqitems` patches an old data.json and adds the turn-in items to D.items). `questMarket` prices turn-ins vs rewards with `pwPrice` (skips 403xxxx quest items and per-set prices), NPC floor alongside; net tag only when all priced. `stackWith`: kl mobs + il source mob + D.drops mobs, ±10 levels. Test: `node tests/questvalue.js` (fake prices).
- Trap: craftplan.js "padding" check already failed on main 40200c3 before this change (not from quests).
- Craft planner padding test (10-21): tests/craftplan.js seeds `free: 1` so the filled table has rows regardless of live prices; it failed after a price refresh left 0 profitable crafts (layout was fine).
- Kill breakpoints (v0.12.6, 10-21): Where to train kill badge = `kbpHtml` (10-maps.js) → `killInfo` per monster from `trainRange` (per-hit window
  range; source order FORM_FROM_BUILDER hand-off > typed Magic+INT / Attack range > default build `form`; null = no badge, never 20 × level).
  `form` = calc()'s damage inputs (50-builder.js), also in S.win and saved under "train".fb.form. Even-roll assumption: `pKill` (binned convolution). Tests: golden.js.

## Item Prices box + meowdb market 2026-10-21
- `scripts/fetch_meowdb_market.js` (Chromium; ~30 min) pulls meowdb's Free Market with no login: items catalog (meowdb id -> game id = `iconKey`), `market-listings/browse` (all live listings, sell + `side=buy`), then per item `item-market-summary` + `market-listings` -> `data/sources/meowdb_market.json`; `python3 scripts/meowdb_market.py` (build_data.py step `mdbmarket`) -> `D.mdb {read, it, ls}` (fields in the file's header). Workflow `meowdb-market-poll.yml` every 3 h: fetch job outside `main-pipeline`, commit job inside it.
- meowdb "usual" = 14-day median of player price checks (asks seen in shops + "sold for") and finished meowdb trades; asks = priceChecks - soldChecks, sales = soldChecks + finishedTrades (meowdb's own UI code). Listings are posted by players: listings not bumped in 7 days are dropped, cheapest 12 asks + best 5 buy orders kept.
- UI `src/js/12-prices.js` `priceBox(id)`: 4 tiles (usual = `pwPrice`, cheapest listed, NPC shop, NPC buys), a table row per `PRICE_SRC` entry (`{src, kind, v, n, detail, when, few}`), "Where to buy" = every `LIST_SRC` listing (meso.watch cheapest + meowdb posts) cheapest first, 8 shown + "Show all". Prices is its own section after Stats. Trap: 49-items.js wraps `openItem` (not global): tests open items by clicking a fake `.itname`. Tests: features.js "prices:", meowdb_test.py "market:".
- 2026-10-22 listing age: meso.watch rows come from `D.pw.asks` (every listing, last field = first-seen unix min from fetch_mesowatch.py `seen`; `PWASK` in 10-maps.js), Listed shows "up N days", `pxStale` tags 3+ days "stale". Falls back to `D.pw.now` (cheapest only) when asks are absent. Trap: first poll after a `seen` reset seeds every listing to "now", so ages are lower bounds. Test: features.js "listing age + stale".

## Shop-scan prices: mesoarbitrage.com + maplestory.watch 2026-10-21
- `scripts/fetch_shopscans.py` (build_data.py step `shopscans`, test `tests/shopscans_test.py`) -> `data/sources/shopscans.json` -> `D.ma` (mesoarbitrage `/data/prices.json`, real item ids) + `D.mw` (maplestory.watch `/api/items` names + `/api/item?name=` per-listing: seller, shop title, FM room, channel). Workflow `shopscans-poll.yml` every 3 h; listing calls only for items whose summary moved (~700 calls first run, ~5 min). Fields in the script header.
- UI `src/js/13-shopscans.js`: a `PRICE_SRC` row each + maplestory.watch shops seen in the last day in `LIST_SRC`. `pwPrice` unchanged (meso.watch has ~10x their sales and covers 900 items vs ~380).
- Traps: mesoarbitrage `npc` = game-file NPC sell price (not stored). maplestory.watch is name-only: male/female and quest copies share names, tie -> mesoarbitrage's id, else dropped (Blue Moon). Neither site splits equip rolls/scrolls. No CORS on either, so build-time only.
- Layer B (2026-10-21, owner OK'd, credit classicmarket.kr everywhere): `scripts/fetch_classicmarket_market.py` pulls `/api/prices/recent` (their combined "합산" prices) with repo secret `CLASSICMARKET_COOKIE` (`cmm_session=...` of Danny's character-verified login) -> `data/sources/classicmarket_market.json` + `D.cmp.it[id] = [median, low, high, sold, seen, forSaleNow, day]`, same workflow. `pwPrice` order: meso.watch -> cmp -> meowdb -> cm asks -> cm bids.
- Traps: verifying/re-logging on classicmarket replaces the session, so the old cookie dies (the poll then prints a ::warning:: and keeps the old file). Never pull Minerva's Owl (`owl-scrape-blocked`) or work around `/api/prices/list`'s x-cm-token.

## Audit polish pass 2026-10-21
- `src/js/01-pagectl.js` + `76-polish.js`: PAGECTL lists the list pages; each gets Reset filters + Copy link in `.ctlend` at the end of its filter row (existing buttons keep their handlers, missing ones are generic). Defaults are read in 01 before page scripts restore saved state (fields inside the page section, not in details/modals). Link = `#L={p, v}` (changed fields only); 00-core.js opens the page, 76 applies it. New list page: add it to PAGECTL and the regex in 00-core.js. tests/polish.js.
- Changelog cards carry `data-t` (ship time, backfilled from git author dates; Oct 16 card is date-only). build.py writes `data-t` = build time into src/pages/log.html for a new card that has none, so commit log.html after building. 76-polish.js adds the time and folds days into `details.logday`.
- Home is masonry (`.homegrid.masonry`, 1 px rows, ResizeObserver spans from `offsetHeight`: getBoundingClientRect is zoomed at 1700px+ and left 55-190px holes, 10-21; polish.js checks gaps at 1300/2000/size 5). Trap: a Home card's `margin-bottom` is the row gap now; don't add row-gap back. tests/boxgaps.js skips boxes inside folded `<details>`.

## Phone tables 2026-10-21
- ≤600px every table with 4+ header columns becomes row cards (`table.stk`): card title = first non-number column (`.stkhead`), the rest labelled from `data-l` in a 3-wide grid, long cells (>28 letters) span 2. A MutationObserver in 76-stack.js relabels on every row change, so new tables need nothing. Opt out with class `nostk`; tables with `tbody th` row headers (transposed) never stack.
- Traps: headers with no thead (key/value tables) aren't stacked: give them `kv` (KPQ King Slime) or fit them. Craft levels has a phone-only transposed copy `#crlevelsp`. Smoke "tables fit, no sideways scroll" checks every `.tblwrap` at 390px (the page-width check didn't see inner scroll).

## KPQ timer + leaderboard filters 2026-10-21
- `src/pages/kpqt.html` + `src/js/68-trkkpq.js` (KPQT, after 68-tracker.js: needs TRK_API/mss): Space splits stages (Enter ends, Backspace undo, Esc throw away + Undo), rounds in localStorage `kpqt`, settings `kpqtset` (install id `site-<24 hex>`), live round `kpqtcur`. Screen share feeds `readKpqTimer` into `KPQT.feed(left, t)`: armed after 3 s with no clock, starts on 2 agreeing reads. Sends to /api/kpq with `src: "site"`, no EXP (Rush board only).
- KPQ leaderboard: KPQB (same file) renders from `summary.kpq.list` (filters party/job class/period/timing, saved in `trkkf`); old snapshots without a list use trkKpq's board. Both go through `trkKpqClean`. trkOpen at load runs in a microtask so KPQB exists. Test: `node tests/kpq.js` (uses page.clock; `clock.install` must come after goto or the page hangs).


## CI red fix 2026-10-21
- bf2672f left an empty duplicate "classicmarket.kr market prices" card (no `</div>`) at the top of log.html: every older card nested inside it, smoke "t-log at 390px" failed, and since smoke is the first CI step every later suite was skipped from 69c3e09 on while Pages kept deploying. build.py now asserts `<div>`/`</div>` counts match in each `src/pages/*.html`.
- CI after the fix: every tests.yml suite runs even when one fails (`!cancelled()`), Playwright pinned 1.56.1, and pages.yml runs smoke.js before each deploy (bot price commits never trigger Site tests), so a red main no longer goes live. shared-data.yml joined `main-pipeline` and retries its push like the polls.
- Pins: Playwright 1.56.1 (tests, pages), 1.64.1 (meowdb poll, whose 30-min fetch job is now `contents: read`; only its commit job writes).

## Item page order + Settings Reset 2026-10-21
- Item page (49-items.js): Stats, Where to get it, What it's for, then Prices (Danny 10-21). tests/polish.js "item page section order".
- Settings › Reset (`src/js/77-reset.js`, card at the end of `#thpop`): `#rstlook` removes `RESET.LOOK` (theme themec navmode pagesize anchors profile; saved profiles/themes kept), `#rstall` clears all localStorage + sessionStorage. First click arms for 5 s (`.btn.danger`), second wipes, drops the hash and reloads. edge.js "reset:"; the settings chip check now expects Layout,Theme,Reset. A new look/layout key belongs in `RESET.LOOK`.
- Smoke/snipe no longer need real live listings (10-21: dropping stale ones left 0 and smoke went red, which now blocks Pages): smoke checks the empty state when `PWNOW` is empty, snipe.js's file:// check swaps in its fixture.

## Titles, page links, touch 2026-10-21
- `setTitle(name)` (00-core.js) sets "<page> · MS Classic World Data Slop" on every tab click, plain title on Home; FM Sniper's "(n) " badge is kept in front (56-snipe.js strips/adds it on document.title). `#g=<page id>` (plain, not base64: HASH parse special-cases `g`) opens that page; other share keys still win. edge.js "#g= page link + page titles".
- smoke "every nav page has a Home link" (KPQ timer shipped without one). Touch screens (`pointer:coarse`): fold-out summaries get 7px padding (were 19-22px tall); tests run with a fine pointer, so they don't see it.
- 2026-10-21: skipped/late scheduled polls are GitHub cron throttling (meso.watch ran hours late, shared-data 09:17 cron ran 14:30), not our YAML. Only one *pending* run per concurrency group survives, so main-pipeline polls firing together drop each other; shopscans moved to :11 off meowdb's :41.
- tests/cron.test.js (tests.yml): main-pipeline crons must not share a minute or sit on :00/:30. shared-data moved 09:17 -> 09:19 (collided with meso.watch :17).

## Polls commit data only 2026-10-21 (Danny OK'd)
- The price polls (meso.watch, classicmarket, meowdb, shopscans) and shared-data commit `data/sources/*` + `data/data.json`, never `dist/index.html` (a 7 MB page per poll was most of the repo's growth). pages.yml and tests.yml run `python3 scripts/build.py` first, so the live site and CI always match `main`'s data; the "built ..." stamp is the Pages build time.
- Trap: the committed `dist/index.html` is now only as fresh as the last human push. Threads still build and commit it with site changes (the artifact is published from it), but don't read prices out of it.
## Load by IGN (classicrank.com) 2026-10-21
- `src/js/59-crlookup.js` + `.crl[data-for=plan|maps]` slots (CSS in a `<style>` in src/pages/plan.html, kept out of styles.css). Keyless GET on Load/Enter only; CORS `*`, 30 req/min per IP, 429 + Retry-After when busy (classicrank.com/developer). No read key needed; never put one in src/ or dist/.
- Reply sanitised by `clean()`: name `[A-Za-z0-9]{1,13}`, ints range-checked, photo/profile URLs only `https://classicrank.com/...`. Job map covers every `/api/v1/jobs` name (3rd job → its 2nd job; Beginner/Pirate → level only). tests/features.js "Load by IGN" mocks the API.
- 10-21 later: `@char <name>` in Ctrl+K (69-search.js `charRow`, 300 ms debounce, `CRL.lookup`/`CRL.use`; Enter → Where to train if open, else Builder). Job census: `scripts/fetch_classicrank.py` (keyless, ~50 one-row list calls 2.2 s apart: meta.total = players, row 100 = job rank #100 level; lists past row 1,000 are 403 without a key) → `data/sources/classicrank.json` + `D.crank`; `.github/workflows/classicrank-census.yml` daily at 06:49 UTC, data only. Builder card `#pcensus` (census() in 59-crlookup.js). build_data.py step `classicrank` only re-merges the source file.
- Trap: tracker auto-setup still not built (tracker thread).

## mesoindex.com prices + listings 2026-10-21
- `scripts/fetch_mesoindex.py` (build_data.py step `mesoindex`, test `tests/mesoindex_test.py`) -> `data/sources/mesoindex.json` -> `D.mi` (`/api/catalog` one call, real item ids in `game`; `/api/item?game=<id>` per-item shop slots with channel, room, shop, title). Workflow `mesoindex-poll.yml` every 3 h; listing calls only where the catalog row moved, busiest first, 15 min budget per run (~700 calls; the next run does the rest). UI `src/js/14-mesoindex.js`: `PRICE_SRC` row + `LIST_SRC` shops seen in the last day. `pwPrice` unchanged.
- `src/js/56-mci.js` + `src/pages/mci.html` (Market Comparison Index, Mesos and Trade, shipped 2026-10-22): `SITES` = one fn per site id -> [sale price, sales] or null (asks-only = blank; meowdb usual mixes asks, runs high on loot). Middle = median, spread = max/min, cheapest live = `listingsOf` within a day (no "% under" for equips). Add maplestory.market (`D.mm`) as one more `SITES` row. CSS lives in the page's own `<style>`; the 1300px "tables fit" smoke check is tight (7 price columns), keep cells short. Smoke: rows with icons + 3+ sites, name opens item page.
- Traps: the HTML page is behind Vercel's checkpoint (never bypass), `/api/*` isn't. Catalog `id` is meowdb's id, use `game`. `npc` = game-file NPC sell price. `room` is null for shops outside the FM (map name kept instead). `trend` baseline unknown, not shown. Prices are mostly cozy.markets scans (`src` counts).

## Tables fit at 1300 px 2026-10-21
- smoke.js now checks every page at 1300 px: no `.tblwrap` may scroll sideways (Where to train hid EXP/hr, Mesos/hr, Hrs/level).
- Where to train: potions line under the map name, `dangerPill(o, 1)` puts "hits you N%" under the pill, relative bar under EXP/hr. `.thwrap` lets headers wrap + 10px cell padding (Where to train, Items, Citizenship).
- Trap: a new column on those tables can push them past 910 px again; the smoke check will say which page. Monster pages' best-maps table (next to the minimap) still scrolls; not covered.

## Second audit polish 2026-10-21 (tests/polish.js "second audit" block)
- `.drop` hides the file input (opacity 0, covers the label) behind an icon + "Browse" chip: keep `<label class="drop"><input type=file><span>` shape. `fitSelects` (00-core.js) adds `label.wide` on phones when a select's chosen text doesn't fit; runs on tab open + select change.
- Path Planner `#xsum` = `.snstats` tiles (golden.js reads the first `h3` for "N h") + `details.xmore`. EXP/hr form is `.ecform` with two `.ecrow`s; hint lives in `#echint`, empty saves show `#ecempty`. Quest "Stack with" is `details.qstack`.
- h2 is 20px everywhere (fold-out section titles 17.5px, Home categories keep 24px). Monster page `.mfgrid` stacks under 1250px; smoke.js checks the best-maps table fits at 1300.
- FM Sniper tables use `.thwrap` too (smoke's 1300 px check only bites with live listings; it blocked Pages 10-21 20:33 to 10-22 00:20). smoke's "cheap in shops now" needs ≥1 row, not >5 (data-dependent).

## OSMS 63db094 re-pin 2026-10-21
- OSMS F2P release (17:53Z): +9 field monsters (Excavation Site I-III, Remains <Tomb>/<Cliff>, Camp 1-3), Stumpy (Parched Land, 1 h timed),
  Primrose Hill PQ monsters (mobdb kind "Primrose Hill PQ", Monsters filter "pq"), +13 maps, +37 items, +18 recipes. Faust/Moon Bunny/Flyeye 1032 have no spawn maps, so no page.
- maplestory.io still has only MCW CBT2 + "1" (= COT1, older). The new maps have no world-map spot: step_worldmap now adds every
  D.nav map without one to the spot of its nearest marked map by walking (fallback: OSMS return_map_id), ids also in the spot's 5th
  field; the card says "aren't marked on the in-game world map". Smoke "world map: Excavation Site ..." + "Ghost Stump lights its spot".

## EXP/hr live reader 2026-10-21
- `src/js/63-expclive.js`: Share game window → getDisplayMedia, frames every 500 ms from a Worker ticker (background tabs throttle page timers), ImageCapture.grabFrame where it exists, else the video. Each frame goes through the app's own `createReaders(G).readFrame` and `createSession(G)` (G = `GrindGamedata.toGamedata(D)` after ASSETS); no forked maths. Bar off screen 5 s = auto pause; Pause = hold. Stop / pagehide saves to `expc` sessions (`live: true`, `mesosHr`, `kills`).
- Not in the browser: map/job/death OCR (pick map + class on the page), inventory loot correction, glyph learning across runs, shared-run uploads (kept off the boards until Danny says). Mini view needs Chrome/Edge 116+ (`documentPictureInPicture`); the button hides elsewhere.
- Screenshot pair (karuzk 10-18) now uses readers.js `readBar`/`readBarAny`; the old copied 61-expbar.js is gone. Unverified in a real browser capture: background-tab frame grabbing on Firefox/Safari (no ImageCapture there).
## Quest log 2026-10-22 (Training › Quest log)
- `src/js/61-questlog.js` + `src/pages/qlog.html`: reads the QUEST window from a recording (4 frames/s) or screenshots. Bars by colour (tan = Event/job/Citizenship/Crafting, blue = regions), tab by the pink highlight, rows by ink width + 3-band column shape against the quest-log names (`ln`) of the bar's category. Candidates are drawn letter by letter at round(12px advance) × UI scale (the game's 12px UI text, 2x at Ideal Ratio). Rows are slots (category + distance below the bar ÷ row pitch) voted over frames, best score wins, one name per slot. Results: localStorage `qlog` {done, prog, pick, lv, from, cats, at}; done quests also go to `pathdone` "q<id>" (Keep or sell, Path Planner).
- Planner (`plan()`): picked quests + their unfinished `pre`, accept → hunts (one per monster and chain depth; kills = max(kill counts, drops ÷ the Path Planner drop rate)) → buys (`D.ishop`) → crafts with the player's own levels (`CPLAN.S.lv[profession]`, Crafting › Your craft levels; lowest recipe your level allows, 2 levels deep, crafted where you are, craft EXP shown; above your level = "Buy from players" at `pwPrice`). Classic World crafting is the player's skill: never route to the legacy profession masters → turn-in; greedy least travel + time, two rules, faster kept. Uses `PLANNER` (new export from 60-planner.js: charAt, killSpot, tripSec, routeText, npcSpot, X…). Item sources: the quest's own, else the most-voted `D.drops` monster.
- Traps: in progress beats done (repeatables like "Donating to Henesys" sit in both tabs); being on a quest marks its `pre` and earlier questline steps done; bar counts are unreliable on video (unsure → null, shown only when ≥ found); test Chromium can't play H.264, so the fixture is VP9. Test: `node tests/questlog.js` (54 of 59 read, ≤ 2 wrong; screenshot exact).
- 2026-10-22 live reading: **Read my screen** (`#qllive`) shares the game window via `shareScreen` (02-screen.js, moved out of 63-expclive.js), 4 frames/s into the same `reader()`; `settle()` (split from readFiles; copies `names` so it can run every second) re-applies on top of the pre-share state each second. `#qlnow` = names in the current frame, `#qlseen` = names a read added. Undo/Redo (`#qlundo`/`#qlredo`, Ctrl+Z/Y) over {done, prog, cats, at}; a read/share/mark/Forget = one step; Undo also strips `pathdone`. Test: `QLOG.liveFrame` + `QLOG.endLive` in tests/questlog.js. Untested on a real share (headless can't); 57-scrollscan.js and 68-trkkpq.js still have their own copies.
- 2026-10-22 self-check (Danny: "check whether what it's reading is accurate", right state): a frame's state comes only from the pink tab (no tab seen yet = frame skipped, status says so); the selected row (51,102,153 box, white text) is read inverted; the closest 6 names are re-ranked by `dtw()` (letter-aligned, ±6% band) since squeezed columns smear long cut names; bar counts use score + dtw. Rows that never had a clear read, faint slots, rows over the bar's count, and shared cut names on Completed go to `U` (`#qlunsure`: pick / None of these), never applied. Cut rows: every name's cuts are re-ranked by dtw (not just the old-score top), and a near-tie only counts against different visible letters (ties within one name were a bug). Ink connected to something reaching outside the row band (the mouse pointer) is dropped (flood fill). Recording 59/59, 0 wrong; the test now asks for all 59. A narrow read whose near-rivals (`riv`, dtw within 0.02) are all other rows' clear reads in that category is applied by elimination (CI fonts made "[Event] The Final Mark" narrow vs First/Fifth Mark).
- Trap: `.pill` is nowrap; a pill holding a sentence (KPQ share status, Quest log names) needs `white-space:normal` or it scrolls a 360 px phone sideways (monkey.js, red on main 10-22 17:20-19:45).
- Exits lists (minimap() in 20-quests.js) render names via mapLink: hover = map tooltip, click = World Map card. Inside #qtip they're inert (pointer-events:none). Smoke: "exit name previews and opens that map".
- 2026-10-22 Sell Helper: "Others ask" row from meso.watch `askMedian` (`D.pw.it[id][7]`, null when no listings) + buyers' market note when it is ≥1.5× the sold median. Trap: market.json key is `it`, not `items` as the pipeline docs say.

## Market today 2026-10-22 (Home › Mesos and Trade card)
- `build_data.py prices` copies meso.watch `totals` to `D.pw.tot` {sales, top: [itemId, price, qty, time]} (itemId arrives as "basil:01382005"). Rendered by the `#mktday` IIFE in `src/js/70-theme.js`; smoke: "Market today on Home".
- Trap: `totals.sales` is meso.watch's rolling window, not a daily count, so the page says "sales tracked", never "sold today".

## 7-day price sparklines 2026-10-22
- `D.pw.hist` {itemId: [[date, median, sold], ...]} = meso.watch daily medians (7-day window, items with 2+ days), kept by build_data.py `step_prices`. `pwSpark(id, big)` in 10-maps.js draws it (green/red by first vs last day, hover lists every day).
- Shown in: Items list trend column (small, under the %), Prices box chart under the tiles + meso.watch row (`spark` field on `PRICE_SRC` rows, optional). Test: tests/features.js "7-day price sparkline". Trap: a 64px spark pushed the Items table past its card at 1300px (smoke); keep it 44px and on its own line.
- Rows (Rising/Falling/Best sellers, 4 each; items with 50+ sales, not low data) come from a `sources` list in that IIFE: `D.mkt.ov` {movers, best, listed: [[itemId, text]]} (maplestory.market /api/market/overview, once Danny's partner key + Z.ai's poll exist) wins, else meso.watch trend/sold.
- Citizenship (#cit) lives under Maple Database since v0.17.2 (sidebar data-cat="db", Home db card); was Mesos and Trade.

## Changelog links + narrow-page test 2026-10-23
- Changelog: bold page/category names auto-link (`linkPages()` in src/js/76-polish.js, lookup = nav labels; "Overview", "How to use", "More" skipped as generic). Write new entries with page names in `<b>` and they link. smoke.js fails on an unlinked bold page name.
- smoke.js checks every page at 1900px: content must reach 95% of its About box width, else add `.narrowpage` to the section. Changelog now has it.

## Section landing pages 2026-10-23
- Sidebar section titles are now `<button class="sgh" id="t-<cat>" data-tab="<cat>">` (spans `.sgt` title + `.sgo` "Overview", shown as a pill on phones/Two rows), so they're ordinary tabs: `#trk` (old Overview), `#train`, `#world`, `#db`, `#town` (src/pages/<cat>.html, demos in src/js/77-landing.js, drawn on first open; CSS "section landing pages" at the end of styles.css). goCat() opens the landing page until a section has a LASTTAB.
- Text of a nav button: read `.sgt || button` (setTitle, smoke titles, 76-polish `pageNames`); the raw textContent ends in "Overview". Sidebar page count is 27 (smoke); Home "Open X →" buttons are `data-go="<cat>"`.
- Demos use only D + existing helpers (itemIcon, pwSolid/pwSpark/pwTrend, TRAVEL.travel, navTo); trip time labelled an estimate. Adding a page to a section: add its card/link to that section's landing page too.

## 2026-10-25 enhancements (Z.ai external autonomous batch)
- MCI 7-day trend column: reuses `pwSpark`/`pwTrend`/`PWH` from 10-maps.js — same pattern as the Items list trend column, now on the MCI table + a "7-day trend" sort option in mci.html. Trap: the empty-state row colspan is `SITES.length + 5` (was +4) — add a column, bump the colspan.
- MCI Source-health panel: `src/js/56c-mcihealth.js` (additive — injects `#mcihealth` after `#mcisrc`, zero edits to mci.html). Flags stale sources (meso.watch uses `D.pw.generated` full-ISO, 180 min; the others only have date-only `read`, so 2 days = definitively missed several 3h polls) + surfaces the `now ⊆ asks` contract live (mirrors `tests/data_quality_test.py` § 3). Re-renders on MCI tab open.
- `@deal` in Ctrl+K search (`src/js/69-search.js`): mirrors MCI's `deal = ask.v / mid` over the same 6 sources (`DEAL_SRC`); cached 5 min via `dealsIndex()`. Equips excluded (any roll, no "% under", matches MCI). Returns `kind:"item"` rows → clicking opens the item page (with its priceBox + history).
- Tests: `tests/cadence_test.js` (poll max-gap + watchdog `POLL_MAX >= 2x meso.watch` cross-check, complements cron.test.js) + `tests/data_quality_test.py` (cross-source shape/id-format/timestamp + meso.watch now⊆asks + cross-source spread). Both wired into `tests.yml`.
