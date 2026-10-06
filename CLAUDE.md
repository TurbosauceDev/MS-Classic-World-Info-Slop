# MS Classic World Data Slop

A single-page planner for **MapleStory Classic World** (Founder's Access Oct 6 2026, Grand Launch Oct 21 2026),
built from the Closed Online Test 2 (COT2) game-file export. Owner: Danny.

Tabs: **Character Builder** · Where to train · **Quest Database** · What changed since 2008 · **Citizenship**.

## Ground rules (from Danny)
- **Classic World only.** Never use modern/retail MapleStory info. 2008-era info only if confirmed to still hold in Classic.
- **Launch content only.** Orbis, El Nath, Forgotten Hollow and 3rd job are hidden (not in the launch). Don't add them back unless asked.
- **No made-up numbers.** Every value comes from the OSMS export or a cited source (meowdb, maplestory.quest). If something is
  estimated, say so on the page. Put sources in replies.
- Keep replies short and direct, no filler. Push back when something is wrong.
- Batch related changes; only take screenshots when layout/visuals actually changed.

## Layout
```
src/index.html        markup; /*@CSS*/ and /*@JS*/ placeholders
src/styles.css        all CSS; theme tokens on :root, dark mode via prefers-color-scheme + [data-theme]
src/js/00-core.js     const D = __DATA__ (replaced at build), $, fmt, esc, tab switching
src/js/10-maps.js     client formulas (hitProb, lvlPen, classAcc) + "Where to train" ranking (rankMaps)
src/js/20-quests.js   Quest Database: filters, header sorting, questline filter, quest + item tooltips (#qtip), rewardCell()
src/js/30-diff.js     "What changed since 2008"
src/js/40-citizenship.js  Citizenship tab (GRADES + SHOPS consts are from meowdb, not the export)
src/js/50-builder.js  Character Builder: AP, skill build with per-job SP pools, damage calc, greedy auto-build
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
python3 scripts/build.py                # after any src/ change
node tests/smoke.js                     # needs: npm i -D playwright (or global)
```
Open `dist/index.html` directly in a browser — no server needed. Published artifact (republish `dist/index.html` to this URL after
every change): https://claude.ai/artifact/Facfj1DVkTNyQyrbHHFQcH The page must stay one self-contained file
(it's also published as a claude.ai artifact): no external requests except Google Fonts.

## Conventions
- Use the existing CSS tokens (--bg, --panel, --ink, --muted, --line, --accent, --accent-soft, --leaf, --warn, --bad).
  Palette is lavender/purple/grey; keep it. Both light and dark must work; no horizontal scroll at 390px.
- Explanatory text goes in a collapsible `<details class="howto">` box at the top of a tab, as short bullet lists.
- Tooltips: one floating `#qtip`; elements with `.qname` (quests) or `.ri` (item rewards) get it via delegated listeners.
- Per-viewer UI state goes in localStorage wrapped in try/catch (keys: tab, planner, qsort, qeq, ctown, cls-seg).
- Plain, game-player language on the page. Say when a number is estimated.
