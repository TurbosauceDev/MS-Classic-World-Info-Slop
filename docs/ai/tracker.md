# Tracker + server cheatsheet (for Claude threads)

Windows Electron app that reads the game window's pixels only (no memory, files or input) → kills, EXP/hr, mesos, loot,
KPQ rounds. Opt-in sharing to a Cloudflare Worker that feeds the site. `tracker/README.md` (18 KB) is the user-facing
doc plus a long version log: read its first ~25 lines, grep the rest (`grep -n "v0.2.4" tracker/README.md`).

## Flow
```
game window ─(Windows Graphics Capture)─► app/main.js ─frames─► app/reader-worker.js → app/readers.js (frame → events)
                                             │ Tesseract OCR (map name, job)              │
                                             ▼                                            ▼
                                   app/renderer.js (UI) ◄──────────── core/session.js (events → rates, run slicer)
                                             │ sharing on
                                             ▼
                   server/ Worker + D1: POST /api/runs, /api/kpq, /api/party; GET /api/summary
                                             │ daily .github/workflows/shared-data.yml (fetch_shared.py)
                                             ▼
                              site D.shared (Confirmed Drops, "players:" lines, best times, KPQ board)
```

## Source map (grep before reading; these are big)
| file | KB | what |
|---|---|---|
| app/renderer.js | 17 | window core: globals (G, $, settings, session), capture/grabFrame, reader worker, bug buffer, self-check, respawns |
| app/renderer-layout.js | 33 | Mini view, inventory/Loot tab, tabs, box docking (OBS-style rows/columns, splitter), fitting (fitRows, flip) |
| app/renderer-live.js | 30 | per-frame/timer reads: OCR job/map, run compare, beeps, party, auto-pause, KPQ + leaderboard, level-ups, run log, snapshots, deaths |
| app/renderer-run.js | 20 | Start/Stop, inventory tab chips, End run summary, run name, frame pictures, Report a bug |
| app/renderer-history.js | 22 | History UI: goal, filters, Maps, bests, trend, details + rename, compare 2-6, delete, level-up log, last 7 days |
| app/renderer-settings.js | 20 | updates, Help, title bar, Settings popup, themes editor, sharing, shortcuts, Install |
| app/readers.js | 68 | frame → events: EXP bar (BAR_FONT), pickup lines, party HP bars, inventory counts, KPQ clock. Also inlined into the site by build.py (`/*@READERS*/`) |
| app/index.html | 34 | window markup + CSS |
| app/main.js | 23 | Electron main: capture, OCR, updater, files, IPC |
| core/session.js | 29 | pure: events → rates; `createRunSlicer` (15-min share runs) |
| core/history.js | 10 | pure History maths (GrindHistory): metrics, compareRuns, perHour, byMap, bests, filterRuns, today, goalEta; tested in core.test.js |
| core/autosave.js | 1 | crash-recovery file (Node, main.js): write/read/clear sessions/autosave.json |
| build_data.js | | data/data.json → app/gamedata.json; copies src/js/51-shot.js → app/shot.js |
| server/src/index.js | 17 | Worker routes; `server/src/check.js` validates runs |

Symbol index: `grep -n "^function\|^async function" tracker/app/renderer*.js`; readers/session are indented:
`grep -n "^  function\|^  async function" tracker/app/readers.js tracker/core/session.js`.

## Commands (from tracker/)
```
npm run data                          # after build_data.py changes
npm test | tail -5                    # core + fuzz (CI runs this in tracker.yml)
node tests/ui.test.js | tail -5       # window in Chromium, fake game stream (CHROMIUM=/opt/pw-browsers/chromium if needed)
node tests/layout.test.js | tail -3   # box fitting and window resizing (CI: tracker.yml job ui)
node tests/monkey.test.js | tail -3   # random clicks/menus/typing/window sizes; no errors, sideways scroll or NaN (CI job ui; SEEDS=1,2 N=400)
node tests/extras.test.js | tail -3   # Mini Finalize log, crash-recovery card, History Today/goal ETA, setup codes (CI job ui)
node tests/readers.test.js | tail -5  # readers on real frames (tests/frames)
node tests/inventory.test.js | tail -3; node tests/kpq.test.js | tail -3; node tests/snip.test.js | tail -3
cd ../server && npm install && npm run data && npm test   # Node 22 (node:sqlite stands in for D1)
```

## Release / deploy
- Tracker: bump `tracker/package.json` version, add its line at the top of `tracker/app/changelog.js` (patch notes; core.test.js
  fails without it), commit, push to the default branch, then GitHub `actions_run_trigger`
  on tracker.yml with inputs `{release: true}` (tag pushes are blocked from cloud). Installed copies auto-update.
  Release only on Danny's "release"; pushing needs his "push". Bundle small fixes into one release.
- Server: pushes touching `server/**` deploy via server.yml (repo secrets CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID).
  Live: https://ms-classic-tracker.maplestoryclassic.workers.dev/api/summary

## Fixtures (images: never view whole; crop to the region first)
Per-image index with expected values: [fixtures.md](fixtures.md). Add a row with every new fixture (docs.yml checks).
- `tests/frames/` Danny's 2560x1440 captures (playfield blanked), `frames-inv/` inventory, `frames-kpq/` KPQ clock,
  `frames-beanguri/` (MIT, from beanguri's overlay). Every misread from real use becomes a fixture + expected value.
- Danny's device (folder tools, already approved): `C:\Users\danny\Pictures\MS Classic Tracker frames` (debug/report
  frames), `C:\Users\danny\AppData\Roaming\MS Classic Grind Tracker` (sessions).

## Facts that cost time to rediscover
- Danny plays native 1440, UI "Ideal Ratio" (UI 2x, world not). Captured video shifts colors: match color ranges.
- Share runs: 15 min straight on one map, same party, no break > 60 s. KPQ rounds sent separately (since v0.2.40).
- KPQ maps 80000000 (1st stage) … 80000400 (Last), 80000500 Bonus, 80000600 Exit; Kerning City 10003000.
- KPQ boards (server summary.kpq.board): Rush = all rounds by clear; Bonus = rounds with 80000500 stage time, by EXP +
  mesos. The tracker's Bonus/Rush pick is stored (mode) but no longer picks the board. Names: kpq_names table (schema.sql
  re-runs every deploy, so new columns go in side tables); tracker sends Name (Party card) else the OCR'd charName.
- Settings is no longer a tab: it's a popup (#prefsPop, openPrefs/closePrefs; ids kept from "Preferences") opened from the
  native File menu → Settings (Ctrl+,, main.js sends menu "settings"); no title-bar button. Tests open it with `window.menu("settings")` and must close it (it covers the page). Its section chips
  (#prefsNav) come from `data-nav` on each card: a new section needs that attribute. label.chk checkboxes are switches.
- Modules (0.2.58, Danny 10-19): no panel tabs or Compact. Every box lives in #dock (one layout); put-away boxes sit in hidden
  #shelf and show as .tbItem cards (data-mod, not data-box: dropTarget's closest() would hit them) in #toolbox (tbOpen/tbRender/
  addBox/shelve, renderer-layout.js; ▦ #tbBtn, View menu + key `toolbox` Ctrl+Shift+K). Save = {v: 2, order: {dock}}; a box not
  listed is put away. v1 saves load dock+session+loot in order, unlisted after, History put away. Main card has no ×.
  #respawn/#partyBox/#lastRun are status cards, not modules: they sit under #dock. showTab only shows/hides Help now.
  Tests: wait ~220 ms after a layout change before measuring a drag target (FLIP glide moves boxes).
- Mini (#mini, renderMini): its own copies of numbers, run log (#miniFeed, mirrored in feedAdd) and top-5 lists; host.mini(on, h)
  sizes the window's content height to the view (miniFit). #miniFull goes back; the card itself isn't clickable any more.
- Compact view retired 0.2.58; compactFit stays as the "window height follows the boxes" sizer (fitWin). Adding a shortcut:
  KEYS (main.js), KEY_NAMES, and the ui test's shortcut row count.
- Dummy data: app/renderer-dummy.js (View menu "dummy" → dummyToggle via renderer-settings.js onMenu). It sets `session`
  with the timer off, so nothing reaches History or the slicer; Clear or the menu again wipes it in place. Use it for layout screenshots.
- Rows stretch (`.boxrow` align-items:stretch); column boxes flex:1; #logBox's #feed flexes in a row/column.
- body is a flex column (the tabs that took the spare height are gone, 0.2.58). Body children are
  flex:none; don't give one flex-grow.
- The main card (#top, box id `main`) lives in #dock with the run log, so it moves/docks/folds like any box (folded keeps
  its Start bar). #selfcheck sits after #dock; #wrap/#summary above it (0.2.59).
- Leaderboards aren't anonymous: don't call sharing "anonymous" in the UI.
- beanguri's /api/stats needs their permission; we only borrowed MIT reader ideas.
- Themes: PRESETS[0] "Default" = the site's src/styles.css colours (light+dark); core.test.js fails if they drift, so a
  site recolour must update app/themes.js, the index.html :root fallback and main.js window/title-bar colours too.
- Run log (core/feed.js, box `log` pinned in #dock by default): diffs session.state every 2 s (feed.step), so it shows
  what the session counted, not raw events. Box ids saved in a user's layout.order win; an unsaved new box stays at home.
  The dock now holds a box, so drag tests that drop "onto the dock" land relative to #logBox.
- Event log (box `events`, #events, home = under the run log): feedAdd routes feed kinds map/level/death/party/job
  (EV_KINDS) there, sep lines to both logs. A MutationObserver on #status logs every status write (eventStatus): no need to
  call anything new, just keep writing #status. `note(text, kind)` adds a line without touching the status. Traps: a write
  that only changes digits within 15 s updates the last line; `statusKind = "level"` before a level write; oneFrame's restore
  sets statusUndo. The event log isn't cleared by Start (it's the app's history); Dummy data saves/restores it.
- Docking: dropZone = left/right third of a box → side by side; `.dropGhost` previews the landing spot. Danny never found
  the old quarter-width edge (his saved layout had no rows), so check discoverability, not just that the code works.
- Resize (0.2.49): bars show/grab only with Shift or Alt held (body.rzKeys, also set from pointer modifier flags since the
  game usually has focus). Width bars are the row's .split; height bars are overlay .hsplit in #rzLayer (h.rz = target box
  or row), height in `--h` + class `sized`, saved as layout.h[id] / row object `h`. Widths are measured once per drag.
- Fit (0.2.51, body.fit from settings.fit, on by default): `.boxrow > *` min-width:min-content plus a `::after` spacer of
  `--floor` px (per box in index.html) so no box goes one-word-a-line; fitRows() adds `.wrapped` (flex-wrap) when a row's
  children's offsetWidths add up wider than it (not scrollWidth: FLIP transforms fake overflow). It runs in the resize event
  (same frame) and after layout changes; a ResizeObserver catches content growth. Run log stickiness: `#feed._stick`, only
  user wheel/key/pointer scrolls clear it. settings.fitWin reuses compactFit (fitsWindow()); body.measure = natural height.
- Line up (0.2.55, alignRows in renderer-layout.js; View "Line up every box" Ctrl+Shift+L = menu("align"), #layoutAlign,
  settings.snap / body.snap on by default): rows with the same left/right edge (dock + open tab) cluster their part edges
  (manual tol W/8, auto 24 px; #dock rows lead, a just-dragged row follows) and get px flex weights. Trap: a box never flexes
  below its padding, so weight = width - padding (pad()), else rows with equal weights land ~1 px apart. Sized boxes in a row
  hand their height to the row. widthBase (0.2.57) reads every part's width before setting any, also minus pad(). Auto runs in layoutSave, endResize and showTab (showTab never saves: settings may not be loaded).
- tests/layout.test.js (CI job `ui` in tracker.yml, with ui.test.js; host stub shared in tests/ui-host.js): sweeps the window
  900→340 px over Danny's docked layout. Wait a frame after setViewportSize (resize events fire in the next frame).
- Dummy data off no longer reloads (main.js will-navigate blocks reloads): dummyClear re-renders from the covered session.
- Mini zooms #mini (miniZ, up to 2.5x) to fill a window bigger than its natural height; body.measure = natural size.
- Running tests locally: `npm run data` first (core.test.js needs app/gamedata.json, not committed).
- findInventory picks the open tab by the most pink/rose/pale pixels per tab (not the first hit), and finds the red line's
  top row away from the open tab's break. inventory.test.js isn't in CI (needs Chromium): run it after touching readers.
- Boxes: a Companion's Magic Box leaving the Use tab triggers chat OCR (checkBox, renderer-live.js); boxFromText takes the
  "earned" lines above "...Box xN has been lost" as rewards, items with src "box" (never a monster's drop).
- KPQ timeline: saved runs carry kpq.timeline (per round: start clock, [stage, start, sec], clear, total, end Exit/left/
  stopped, sent or why not). kpqShare returns that reason. Read it before guessing why rounds are missing.
- Party kills whose EXP share fits several monsters count in S.unknownKills; Monsters killed leaves them out (Danny).
- Pickup names: an unread `?` matches 1-2 letters ("Emerald Sta?" = Staff). Saved sessions' `used` = the Consumables used
  list (Use-tab drops included), not raw use events.
- readParty counts party bars by their frame (black outline + white border, top and bottom edge), not red fill: a member
  out of range (other map / KPQ stage) has an empty grey bar and a grey name. Counting red flapped "Party of 4 (was 3)"
  (2026-10-19). Party size feeds EXP/hr compare, speed check and shared runs through the one `party` event.

- Loot value (session.js `worth`): meso.watch median, else NPC price. stats() also returns lootLo/lootHi (p25-p75) and lootRough
  (value from low-data prices); the Loot table marks rough prices "?" and shows the range under Total (2026-10-19).

## Splits
- 10-18: `app/renderer.js` cut into 6 files at top-level boundaries, loaded in order by app/index.html (one shared global
  scope, so no imports). A new file goes in index.html's script list; top-level code may only call functions from its
  own or earlier files at load time (ui.test.js catches a load-time ReferenceError).
- `app/readers.js` 68 KB left whole: one IIFE closure loaded 5 ways (worker importScripts, require in tests, script tags,
  site `/*@READERS*/`); splitting needs a namespace rewrite. Grep + ranged reads instead.
- History (10-19): maths in core/history.js (window.GrindHistory), UI in renderer-history.js. Compare state is `cmpSel` (saved
  ids, any order; drawn oldest first as A-F, max 6) + `cmpBase`; rows/compare redraw from histList, so keep ids as strings
  (`String(+x.saved)`). Rename/note = IPC `update-session` (main.js: name ≤60, note ≤1000, nothing else changes). The ui-host
  stub's sessions() makes new `saved` ids every call, so open details/selection don't survive a loadHist in tests.
  The compare table scrolls inside its box (head row in the table, sticky label column); ui.test.js checks a 400 px window.
- Bug hunt 0.2.59 (10-19): #wrap/#summary now sit ABOVE #dock (under a dozen modules they were off screen); ui.test closes the summary
  before measuring boxes. openStream gives up after 5 s with no frame (play() never resolved: Start dead). Slicer counts a break from
  the run's start when nothing counted yet; server check.js "mostly idle" (activeMin < minutes/2). #go's capture listener only
  drops Dummy data on a starting click; dummyFill refuses while `starting`. Settings chips scroll by prefsGo (sticky header aware).
- 0.2.60 (bug-hunt ideas 1,2,4,5,7): Mini shows #miniWrap (one line + Finalize log) while `wrap` is set (renderWrap). Crash
  recovery: renderer autosaveNow() every 60 s while tracking → IPC `autosave` → core/autosave.js writes sessions/autosave.json
  (tmp + rename; not <digits>.json so History never lists it); save-session clears it; recoverCheck() at launch shows #recover.
  sessionRecord() is the one History record (Finalize and autosave). History #today/#eta from core/history.js today()/goalEta()
  (EXP table = G.exp; maps 15+ min, KPQ left out). Setup codes MSCS1 (themes.js encodeSetup/decodeSetup/cleanLayout: known box
  ids only) in Settings > Layout. Browser checks in tests/extras.test.js, maths in core.test.js.
- Profiles 0.2.61 (renderer-settings.js profUi/profSwitch/setupApply/spTake): settings.profiles (cleaned setups with a name, max 30),
  settings.profile = in use; switching away first saves the screen into it (profKeep). Codes stay MSCS1, now with optional
  name/prefs {fit, fitWin, snap, opacity}/win {w, h} (themes.js cleanSetup; old apps ignore them); decodeSetup also takes MSCT1
  (theme only). Paste = preview (#setupPrev) only; IPC `win-size` sets content size (skipped in Mini). Tests: extras.test.js 4-5.
- Traps: box h3/rows need 72 px right padding (⠿ – × = 63 px); `#hist > .row:first-child` never matched (.boxctl is first child).
  .feedlist height = calc(7.5em + 10px) = 5 whole lines; feedIn slides lines, so wait 400 ms before measuring them. Mini's zoom
  search is cached by content height + window size (miniKey).

## Patch notes 2026-10-19 (0.2.62)
- `tracker/app/changelog.js` = [version, date, text] newest first, backfilled 0.1.0-0.2.61 from git subjects. Shown in Help (#patchNotes,
  menu Help > Patch notes) and inlined by scripts/build.py into the site's Grind Tracker Overview (#trkpatch). README version log stays the dev log.
