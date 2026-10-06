# MS Classic World Data Slop

A single-page planner for **MapleStory Classic World** (Founder's Access Oct 6 2026, Grand Launch Oct 21 2026),
built from the Closed Online Test 2 (COT2) game-file export. Owner: Danny.

Tabs: **Character Builder** · **Path Planner** · Where to train · **Quest Database** · **Citizenship** · **Crafting**.

## Ground rules (from Danny)
- **Classic World only.** Never use modern/retail MapleStory info. 2008-era info only if confirmed to still hold in Classic.
- **Launch content only.** Orbis, El Nath, Forgotten Hollow and 3rd job are hidden (not in the launch). Don't add them back unless asked.
- **No made-up numbers.** Every value comes from the OSMS export or a cited source (meowdb, maplestory.quest). If something is
  estimated, say so on the page. Put sources in replies.
- Keep replies short and direct, no filler. Push back when something is wrong.
- Batch related changes; only take screenshots when layout/visuals actually changed.

## Token budget (read first)
- **Never Read/cat/grep `data/data.json` or `dist/index.html`**: each is ~900 KB, mostly on one line. `.rgignore` keeps Grep out of them.
  Query data with a short script that prints only what's needed, e.g.
  `python3 -c "import json;d=json.load(open('data/data.json'));print(d['mobs']['22'])"`.
- Source is small (~1.6k lines). Read only the file/section being changed; `grep -n "^function\|^const" src/js/*.js` gives a symbol index.
- Don't read the live artifact back or diff it against dist. Publish dist straight to the URL below. In a new session the first
  publish may be refused and hand back the live page; that costs ~20 KB of context, so do it once.
- Don't re-run `fetch_osms.sh` / `build_data.py` unless data logic or the export changed. Pipe test/build output through `tail`.
- **Never `git clone` a repo in full or download anything big without checking its size first** (GitHub API `size`, `du`, a dry run).
  The OSMS repo is 8.6 GB with history; `fetch_osms.sh` is shallow + sparse + blob-filtered (~100 MB). Keep it that way.
  Anything over ~200 MB: ask Danny first. The vendor clone is blob-filtered: `git ls-tree -l`, `git log -p`, `git show` of
  many files etc. silently download the blobs. Use `ls-tree --name-only`, or fetch single files with an HTTP range/raw URL.
- Screenshots only when layout changed. Ask Danny before anything expensive: data rebuilds, big refactors, web research, subagents.

## Layout
```
src/index.html        markup; /*@CSS*/ and /*@JS*/ placeholders
src/styles.css        all CSS; theme tokens on :root, dark mode via prefers-color-scheme + [data-theme]
src/js/00-core.js     const D = __DATA__ (replaced at build), $, fmt, esc, tab switching
src/js/10-maps.js     client formulas (hitProb, lvlPen, classAcc), HP/MP (hpmpAt), danger (touchPct), portals to potions (POTS), party, mobKill, mapRates + "Where to train" (rankMaps)
src/js/15-valuable.js  VALUE: community-picked valuable quests (tier, reward, why, sources) — not game data
src/js/16-guides.js   GUIDE (1-30) + GUIDE2 (2nd-job branches 30-70): meowdb class guides (SP/AP per level, weapons, gear, maps) used by buildAt + Path Planner
src/js/20-quests.js   Quest Database: filters, header sorting, questline filter, quest + item tooltips (#qtip), rewardCell()
src/js/40-citizenship.js  Citizenship tab (GRADES + SHOPS consts are from meowdb, not the export)
src/js/45-crafting.js  Crafting tab: masters + profession quests, craft levels (CRAFT_LV from OSMS dashboard), recipes, raw materials
src/js/50-builder.js  Character Builder: AP, skill build with per-job SP pools, damage calc, greedy auto-build; buildAt() = headless default build
src/js/60-planner.js  Path Planner: level-by-level plan (quests / grinding / mix) using buildAt + mapRates + mobKill
scripts/fetch_osms.sh pin + clone the OSMS export into vendor/
scripts/analyze.py    step 1: map ranking, quest rows, 2008 diffs -> build/analysis.json
scripts/build_data.py all data steps -> data/data.json (embedded in the page)
scripts/build.py      src + data -> dist/index.html (single self-contained file)
tests/smoke.js        Playwright click-through of every tab; fails on any page error
docs/notes.md         formulas, data.json schema, sources, decisions, known gaps — read before changing calculations
```
JS files are concatenated in filename order into ONE `<script>`, so they share top-level scope
(e.g. 50-builder.js calls hitProb/rankMaps; 40-citizenship.js uses rewardCell/qtip from 20-quests.js).

## Workflow
```
./scripts/fetch_osms.sh                 # once (or OSMS_DATA=/path/to/osms/data)
python3 scripts/build_data.py           # only when data logic or the export changes
python3 scripts/build_data.py crafting extras  # cheap: re-runs only these steps (crafting; mobatk + potshops) on the existing data.json
python3 scripts/build.py                # after any src/ change
node tests/smoke.js                     # needs: npm i -D playwright (or global)
```
Open `dist/index.html` directly in a browser — no server needed. Published artifact (republish `dist/index.html` to this URL after
every change): https://claude.ai/artifact/Facfj1DVkTNyQyrbHHFQcH
GitHub Pages: https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/ serves this branch; root index.html forwards to dist/,
so committing a rebuilt dist/index.html and pushing updates the site (~1 min). The page must stay one self-contained file
(it's also published as a claude.ai artifact): no external requests except Google Fonts.

## Conventions
- Use the existing CSS tokens (--bg, --panel, --ink, --muted, --line, --accent, --accent-soft, --leaf, --warn, --bad).
  Palette is lavender/purple/grey; keep it. Both light and dark must work; no horizontal scroll at 390px.
- Explanatory text goes in a collapsible `<details class="howto">` box at the top of a tab, as short bullet lists.
- Tooltips: one floating `#qtip`; elements with `.qname` (quests), `.ri` (items), `.mname` (maps, `mapLink()`), `.nname` (NPCs, `npcLink()`) or `.mobname` (monsters, `mobLink()`) get it via delegated listeners.
- Per-viewer UI state goes in localStorage wrapped in try/catch (keys: tab, planner, path, pathdone, qsort, qeq, qval, ctown, craft).
- Plain, game-player language on the page. Say when a number is estimated.
