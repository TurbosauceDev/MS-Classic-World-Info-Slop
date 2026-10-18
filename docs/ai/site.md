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
- `build.py` concatenates `src/js/*.js` in filename order into ONE `<script>` (shared top-level scope), replaces
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
python3 scripts/build_data.py prices        # after fetch_mesowatch.py <dev CSV>
python3 scripts/fetch_shared.py             # shared tracker runs (daily CI job does this)
node scripts/fetch_meowdb_drops.js          # then build_data.py extras mobdb
python3 scripts/launch_diff.py <ver>        # maplestory.io MCW client vs our data -> docs/launch_diff.md
```
Playwright: global install works here (`NODE_PATH` set, browsers in /opt/pw-browsers). If `chromium.launch` can't find a
browser: `CHROMIUM=/opt/pw-browsers/chromium` (tracker tests, fetch_meowdb_drops) or a `-r` preload shim that passes
`executablePath`. Never `playwright install`.
CI: `.github/workflows/tests.yml` runs smoke + golden on every push/PR to the default branch; `docs.yml` runs
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
| 54-invprice.js | | Price check (inventory/bank screenshots → meso.watch `PW` prices) |
| 60-planner.js | 42 | Path Planner; exports TRAVEL |
| 62-expcalc.js | | EXP/hr calculator (ids `#ec*`) |
| 64-undervalued.js | | UV_PICKS / UV_PACKED / UV_SRC (World Map toggle, "vibes", never tied to planner) |
| 65-navigator.js | | Map Navigator, `navTo(id)` |
| 66-worldmap.js | 28 | World Map (D.wmap), map cards (`openMapInfo`), Sleepywood sub-map |
| 67-kpq.js | 13 | KPQ guide (D.kpq) |
| 68-tracker.js | 11 | Grind Tracker pages (live /api/summary, D.shared fallback); trkKpq = Rush/Bonus KPQ boards |
| 69-search.js | | Ctrl K / `/` search, `#key=value&` share links |

Symbol index: `grep -n "^function\|^const\|^let" src/js/*.js`. Data peek: `python3 -c "import json;d=json.load(open('data/data.json'));print(list(d))"`.

## Recipes
- **New page/tab:** markup `<section id="x" hidden>` in src/pages/x.html + a `<!--@page x-->` slot in index.html; button `#t-x` with `data-cat` in `.subs`; `.hlink`
  on the Home card; bump the home-link count in tests/smoke.js (21 now) and add a click-through check.
  Give the `.hlink` an `<img class="hic" data-ic="i:<item>|m:<mob>|s:<skill>">` sprite (filled from D in 00-core.js,
  shown only when the card is a billboard) and bump the sprite count in smoke.js (27 = 6 headers + 21 links).
- **Changelog:** every user-visible change gets a dated entry at the top of `#log` (grep `id="log"`, read ~20 lines there).
- **Item count** asserted in smoke.js (2,221); update when items change.
- **Tooltips:** one floating `#qtip`; classes `.qname` quest, `.ri` item icon, `.itname` item name, `.mname` map
  (`mapLink()`, click opens World Map card), `.nname` NPC (`npcLink()`), `.mobname` monster (`mobLink()`).
- **Per-viewer state:** localStorage in try/catch. Keys in use: tab planner path pathdone qsort qeq qval ctown craft craftlv
  qcompact keep keephave mobs items skills navi wmap expc theme themes themec.
- **Explanations:** a closed `<details class="howto">` at the top of the tab, short bullets.
- **Share links:** extend the existing `#key=value&` hash (69-search.js); never a new scheme.
- **Themes:** `src/js/70-theme.js` + the `siteTheme` head script in index.html; presets/share codes come from
  `tracker/app/themes.js` (build.py `/*@THEMES*/`). Text on accent: `var(--on-accent,var(--panel))`. Default sets nothing,
  so styles.css :root stays the source; tracker core.test.js fails if the tracker's Default drifts from it.

## Conventions
- CSS tokens only: --bg --panel --ink --muted --line --accent --accent-soft --leaf --warn --bad. Lavender/purple/grey.
  Light + dark must both work; no horizontal scroll at 390px (smoke checks).
- Plain player language; say when a number is estimated (assumed drop rates: 5% loot default, 30% quest items).
- Don't add back: "The List" tab, hover-to-select on World Map, map-name click → navigator (it opens the map card).

## Known traps
- `data.json` / `dist` are mostly one huge line: any Read/cat/grep floods context.
- Smoke opens pages via `tab("#t-x")` (clicks the section first; hidden buttons can't be clicked).
- meso.watch raw JSON is behind a Cloudflare check: never bypass. Refresh = Danny drops a dev CSV in chat.
- mapleexp.com drops are CMS v79 (China), not Classic: don't use. Its EXP table to Lv 100 is fine.
- No drop rates exist anywhere (OSMS, meowdb have reports only); every rate on the page is an assumption, labelled.
- Keep or sell skips quest items with the same test as Items "Hide quest items" (403xxxx ID block + quest start items; `QITEM` in 47-keep.js and 49-items.js, keep both in sync). Smoke: "keep list: no quest items".

## Splits
- 10-18: `src/index.html` split into `src/pages/<id>.html` (built dist identical). Edit a page's file, not the shell; build.py asserts every page file has a slot.
- `50-builder.js` 43 KB and `60-planner.js` 42 KB are big but cohesive; grep + ranged reads are enough for now.
