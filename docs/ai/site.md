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
node tests/shotscales.js | tail -3         # builder screenshot import at 1x-3x, smoothed + blocky, redrawn from bow-turbow.png (~90 s)
node tests/polish.js | tail -3              # list Reset + Copy link, Home masonry, changelog times, World Map idle card, item page
node tests/snipe.js | tail -5               # FM Sniper on a fixture market.json: deal maths, views, filters, watch, new, live refresh, tools
python3 tests/deal_life_test.py             # FM Sniper deal lifetimes from a fake snapshot git history
node tests/monkey.js | tail -3              # random clicks/typing/Back/window sizes; SEEDS=4,5 N=300 to vary; ~100 s
python3 scripts/pages_site.py /tmp/site     # the Pages copy pages.yml deploys (prints first-load size); audit P9: the per-poll market data rides in a hashed prices file behind a stable pointer, the app boots through window.__PRICES, and sw.js serves the cached shell so a returning visitor only re-downloads the prices file
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
| 56b-movers.js | | Movers page (day-over-day price changes) |
| 47-keep.js | | Keep or sell |
| 48-monsters.js | 21 | Monsters list + page |
| 49-items.js | 18 | Items list + page; `.ri`/`.itname` click opens it |
| 50-builder.js | 43 | Character Builder; `buildAt()` headless default build; BLD |
| 51-shot.js | | screenshot reader core (un-double UI, icon pixel match, SHOT_FONT digits); also copied into tracker |
| 78-charhome.js | | Character Builder section home (#char): name/class/level mirror BLD.S by clicking the calculator's own controls, screenshot drop via `SHOTS.handle` (52), posable preview (maplestory.io pose/frame URL, gear ids read from `#pavatar`'s src) |
| 52-shotimport.js | 16 | builder "Import from screenshots": auto-applies, thumbnails + big view, unshown-SP ask |
| 53-skills.js | | Skills tab |
| 54-invprice.js | | Price check (inventory/bank screenshots → meso.watch `PW` prices; Keep or sell column via `KEEPSELL` from 47-keep.js) |
| 59-crlookup.js | | Load by IGN (Builder + Where to train): keyless classicrank.com `/api/v1/characters/{name}`, badge, `jobOf` job → class/branch; `window.CRL` for tests |
| 58-craftplan.js | | Crafting > Plan tab (was the Craft planner page) + the craft levels card and price helpers (`CPLAN.worth/buyEach/rough`) the other Crafting tabs use: craft levels + Price check's screenshot reads (`INVP.counts()`, `invupdate` event) + hand entry → craft now / almost (farm maps, buy cost) / best mix; `window.CPLAN` for tests |
| 57-scrollscan.js | | Price check › Scroll check: getDisplayMedia, live Use tab grid, tooltip read (readers.js `readTextLines`) matched to scroll name/desc, slot = nearest to tooltip corner; feeds 54 via `INVP.live` |
| 55-bcompare.js | | Builder "Compare two jobs" (buildAt per side, or "This build" = BLD.S) |
| 56-snipe.js | 48 | FM Sniper: PWNOW vs PW, deal grades/score (ours), views, watch list, new badges, live market.json refresh, tools (trip, craft, sell, watch alerts, movers, lifetimes) |
| 56-mci.js | 5 | Market Comparison Index (#mci): one column per price site (sale prices only), middle, spread, cheapest live listing |
| 56b-movers.js | 5 | Movers (#movers): day-over-day price change per item and market, meso.watch daily medians + maplestory.watch day-ago typical; each row compares a market against itself only |
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
  10-31 (owner mandate, Turbozo: "make things correct and accurate"): one-time full sort — 5 retro-carded entries sat at their historical slot (date inversions the sitesync parser warned about); the whole list is strictly newest-first now and mid-history versions renumbered (v0.19.14 carded it). The add-at-top rule stands; `tracker/scripts/sync-site-changelog.js` still warns if a future card inverts.
  Each card = one site version, numbered by build.py (oldest = 0.1.0; `class="card" data-minor` starts the next 0.x.0, for a big addition).
  Site-only: tracker app changes go in `tracker/app/changelog.js`.
- **Item count** asserted in smoke.js (2,259; also 308 recipes, 84 monsters in smoke + edge); update when items change.
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
  so styles.css :root stays the source; tracker core.test.js fails if the tracker's default drifts from it.
  0.3.22 (Turbozo 10-30): styles.css :root IS the Elv scheme (single dark, no system following; the nav hairline glow rule
  is unconditional now and opts out on `[data-theme="light"]`). The old purple look = the "Clanker Chic" preset at
  PRESETS[1] ("Default" renamed; a saved `p:Default` migrates in 70-theme.js, old codes alias in cleanSetup). smoke.js
  resets to default via `p:Elv`.

## Conventions
- CSS tokens only: --bg --panel --ink --muted --line --accent --accent-soft --leaf --warn --bad. 0.3.22: the default is
  the Elv dark scheme (near-black + the #b49bff purple accent); picked themes (Clanker Chic's light side included) ride
  inline vars + data-theme. No horizontal scroll at 390px (smoke checks).
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
- Popups sized with `calc(100vw - Npx)` need `box-sizing:border-box`, or their padding pushes phones sideways (11-02 Builder skill tip, 377 px at 360; pinned in `tests/edge.js`). `tests/monkey.js` seeds are fixed but its walk follows the live DOM, so new price data can lead it somewhere new: a red monkey with no code change is usually a real old bug (Hermes).
- `scripts/build.py` runs on Windows now (`%-d` was glibc-only). On Windows, `tests/smoke.js` fails 2 checks on clean `main` (MCI table 914/910 at 1300 px, skill preview repeat) from font metrics; CI on Linux is the judge (Hermes 11-02).
- CI tools are pinned once in the root `package.json` (+ lockfile); workflows run `npm ci`, locally `npm ci` too. `tests/pins.test.js` fails a hardcoded `playwright@x.y.z` in a workflow (meowdb poll excepted, with reason). Site tests run as 3 parallel shards in `.github/workflows/tests.yml`; add a new test to the lightest shard. `tests/a11y.js` now runs in CI (it never did before 11-02). Python deps: `requirements.txt` (Hermes 11-02).

## Splits
- 10-18: `src/index.html` split into `src/pages/<id>.html` (built dist identical). Edit a page's file, not the shell; build.py asserts every page file has a slot.
- `50-builder.js` 43 KB and `60-planner.js` 42 KB are big but cohesive; grep + ranged reads are enough for now.

## History

Dated feature notes (39 sections: what shipped, why, traps found then) moved verbatim to `docs/ai/site-history.md` on 2026-11-02.
Grep it for the feature you touch (`grep -n "^## " docs/ai/site-history.md`); anything still true belongs in Known traps above.
