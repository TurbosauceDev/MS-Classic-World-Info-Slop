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
| app/renderer-overlay.js | 3 | Overlay Mode, tracker side: ovBuild snapshot (stats-lite, map spawns/respawns, KPQ clock, feed tail, theme) pushed on every render; wraps render/feedAdd |
| app/overlay.html + app/overlay.js + app/overlay-preload.js | 14 | Overlay Mode, overlay window: floating glass widgets, drag + picker (settings.overlay.widgets), edit/locked, 1 s countdown tick |
| app/readers.js | 68 | frame → events: EXP bar (BAR_FONT), pickup lines, party HP bars, inventory counts, KPQ clock. Also inlined into the site by build.py (`/*@READERS*/`) |
| app/index.html | 34 | window markup + CSS |
| app/main.js | 23 | Electron main: capture, OCR, updater, files, IPC |
| core/session.js | 29 | pure: events → rates; `createRunSlicer` (15-min share runs) |
| core/history.js | 10 | pure History maths (GrindHistory): metrics, compareRuns, perHour, byMap, bests, filterRuns, today, goalEta; tested in core.test.js |
| core/autosave.js | 1 | crash-recovery file (Node, main.js): write/read/clear sessions/autosave.json |
| core/gamedata.js | | pure D → G (`GrindGamedata.toGamedata`), shared by build_data.js and the site's live EXP/hr reader |
| build_data.js | | data/data.json → app/gamedata.json (via core/gamedata.js); copies src/js/51-shot.js → app/shot.js |
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
  Standing permission (Danny 10-19, widened 10-22): push and release whenever the work is ready and tested, no
  "push"/"release" ask needed. Still rebase first and live-check after. Bundle small fixes into one release.
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
- Server 2026-10-21: summary.kpq.list = every counted round (party trackers' copies merged: same group/date/hour, clears within 5 s),
  newest 3000, for the site's filters; kpq_src side table ('site' rounds); same install + same clear within 30 min = "already sent".
  Bonus board needs exp (site rounds have none). KPQ clock 6/9 shapes confirmed from Danny's frames (timer-2216/2219/2546).
- Settings is no longer a tab: it's a popup (#prefsPop, openPrefs/closePrefs; ids kept from "Preferences") opened from the
  native File menu → Settings (Ctrl+,, main.js sends menu "settings"); no title-bar button. Tests open it with `window.menu("settings")` and must close it (it covers the page). Its section chips
  (#prefsNav) come from `data-nav` on each card: a new section needs that attribute. label.chk checkboxes are switches.
- Modules (0.2.58, Danny 10-19): no panel tabs or Compact. Every box lives in #dock (one layout); put-away boxes sit in hidden
  #shelf and show as .tbItem cards (data-mod, not data-box: dropTarget's closest() would hit them) in #toolbox (tbOpen/tbRender/
  addBox/shelve, renderer-layout.js; ▦ #tbBtn, View menu + key `toolbox` Ctrl+Shift+K). Save = {v: 2, order: {dock}}; a box not
  listed is put away. v1 saves load dock+session+loot in order, unlisted after, History put away. Main card has no ×.
  #respawn/#partyBox/#lastRun are status cards, not modules: they sit under #dock.
  Tests: wait ~220 ms after a layout change before measuring a drag target (FLIP glide moves boxes).
- Mini (#mini, renderMini): its own copies of numbers, run log (#miniFeed, mirrored in feedAdd) and top-5 lists; host.mini(on, h)
  sizes the window's content height to the view (miniFit). #miniFull goes back; the card itself isn't clickable any more.
- Focus Mode (0.2.73, #focus + body.focus, renderFocus/focusFit in renderer-layout.js): the third view, a centred 840 px
  column skinned after maplestory.watch/market (air, soft shadows, hover highlights) using only theme tokens. Same data as
  Simple via shared builders (lvlHtml/potsHtml/moneyHtml, smChart(svg, pts)); #fzFeed mirrors feedAdd; window fit reuses
  host.mini with no zoom. modalOpen/toolbox leave it; #focusBtn hides under a 400 px main card (container query — inside a
  hidden subtree no container matches, so the narrow-hide test runs in the full view). Tests: focus.test.js; ui.test shortcut rows = 15.
- Overlay Mode (0.2.74, Danny: "a true overlay style mode", shown maplestory.watch): a SECOND BrowserWindow, not a body class —
  transparent, frameless, `focusable: false`, screen-saver on top, bounds = the union of all displays (ovBounds), so widgets can
  sit on any monitor. main.js owns it (ovOpenWin/ovEditSet/ovToggle; ipc `overlay`, `ov-edit(-toggle)`, `ov-close`, `ov-state`,
  `ov-push` relay); it re-pins in the same pinOnTop loop and closes with the tracker window. The tracker page (renderer-overlay.js,
  loaded between renderer-settings and renderer-dummy) wraps `render` and `feedAdd` to push a snapshot ≤ every 500 ms while the
  overlay is open — dummy data flows too (dummyFill forces one after the "Dummy data" labels). overlay.js renders 9 widgets
  (Status/EXP/Kills/Mesos/Loot/Map & spawns/Party/KPQ/Run log), drags them in desktop pixels (settings.overlay.widgets,
  wPos treats 0 as a real spot), re-clamps on ov-screens, and ticks countdowns locally between pushes (apply({...DATA, t: now})).
  Edit = toolbar with a checkbox per widget + Done; locked = setIgnoreMouseEvents(true,{forward:true}) + body.locked (no titles).
  The map card: G.maps[id][2] resolved to names/Lv/EXP + session.respawns() rows (overlay computes dueIn from killed+sec).
  Theme: the push carries the tracker's resolved tokens (TH.resolve(themeNow(), darkQ.matches)) — overlay follows live.
  Edit mode v2 (0.2.75, Danny 2026-10-28, after ElvUI's Toggle Anchors + WoW Edit Mode + WeakAuras' MoverSizer): the checkbox
  strip became the edit panel (in-style glass card, draggable, spot saved in settings.overlay.panel): one row per widget with
  an eye toggle + size steppers, picking a row opens a detail strip (size .5-2x, opacity .25-1, exact x/y, per-widget reset);
  footer = Snap + Grid (32/64/128) + Reset layout (arm-then-confirm). Cards magnet-snap to each other's edges/centres and the
  screen edges/centre (SNAP_PX 15, per-axis min-delta, Shift skips; guides #ovgv/#ovgh), the grid rounds drops when on, cards
  resize via corner grip / Ctrl+scroll / slider (transform scale, transform-origin top left; getBoundingClientRect for the
  scaled rect), arrows nudge the picked card 1 px (Shift 10), Esc = Done, row hover spotlights the card (body.dim + .spot).
  Grid visibility is edit-gated (0.2.76, Danny caught it staying on after Done): gridShow() hides #ovgrid unless
  CFG.grid && CFG.edit — the checkbox stays the saved preference, but the lines only render while editing (onMode and the
  boot path both go through gridShow()), so a locked boot with Grid ticked never draws it.
  0.2.77: that gate was fine but its switch was wired to missing CSS — the 0.2.75 rewrite dropped the generic
  .hidden rule (0.2.74's #ovbar.hidden died with the bar, nothing replaced it for the new bare-hidden elements), so the
  class toggle had no visual effect and the grid painted permanently; the snap guides carried the same latent bug.
  overlay.html now has one real .hidden { display:none } (grid + guides + panel), and overlay.test.js asserts
  getComputedStyle().display, not just classList, on every grid/guide/locked-boot scene. Lesson: a class-only
  visibility toggle needs its rule proven by a computed-style test in THIS stylesheet's document.
  Bounds fix: the page clamps to the window's REAL content area (innerWidth/Height), and main.js reports ovDesk() =
  getContentBounds() (re-asserts setBounds(ovBounds()) after show + on display-metrics-changed) instead of the intended
  display union — mixed-DPI/Windows-nudged windows left a dead strip around the perimeter with cards cut off.
  Tests: overlay.test.js (page part + tracker part); ui-host stubs overlay/overlayPush/onOverlay/overlayEdit; ui.test rows = 15.
- Elv skin (0.2.92, Danny 10-29: "a complete re-skin in the ElvUI style", the no-game ElvUI study — docs/ai/elvui-tracker-reskin.md
  has the full source-reading): a theme can carry `sk` (panel style; "elv" | absent = glass), threaded through themes.js
  (T/clean/encode/resolve — resolve normalizes sk so callers always read it), the theme editor's Panel style select (#thSkin,
  live-previewed), and the overlay push (th.sk). Both windows toggle body.skin-elv; the .skin-elv CSS blocks in index.html
  (~line 376) and overlay.html square the corners, kill blur/shadows, flatten bars onto dark tracks and swap in bundled
  PT Sans Narrow (app/fonts/, ParaType free licence note beside the files). The "Elv" preset is ElvUI's palette verbatim
  (#0f0f0f/#1a1a1a/#3f3f3f, accent #1785d1 = ElvUI's valuecolor) and is appended LAST in PRESETS — tests index presets by
  position (core.test.js 5/8, extras.test.js 8), so never insert before them. Edit mode gained #ovxy, a live x/y chip over
  dragged/resized/nudged cards (overlay.js chip/chipHide; hidden on release, 900 ms linger after nudges, cleared on lock).
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
  hand their height to the row. widthBase (0.2.57) reads every part's width before setting any, also minus pad(). Auto runs in layoutSave and endResize.
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
  Built-in profiles (0.2.67): codes in themes.js BUILTIN, TH.builtins(ids); select value "b:<name>", never saved into or
  deleted. Window size goes through TH.winFit (zoom, clamp to work area, pull on screen), used by main.js `win-size`; core.test.
  flipTo sets body.gliding for 220 ms (#dock overflow-x:clip) so a box gliding in from the right never flashes a sideways scrollbar.
- Traps: box h3/rows need 72 px right padding (⠿ – × = 63 px); `#hist > .row:first-child` never matched (.boxctl is first child).
  .feedlist height = calc(7.5em + 10px) = 5 whole lines; feedIn slides lines, so wait 400 ms before measuring them. Mini's zoom
  search is cached by content height + window size (miniKey).

## Patch notes 2026-10-19 (0.2.62)
- `tracker/app/changelog.js` = [version, date, text] newest first, backfilled 0.1.0-0.2.61 from git subjects. Shown in Help (#patchNotes,
  menu Help > Patch notes) and inlined by scripts/build.py into the site's Grind Tracker Overview (#trkpatch). README version log stays the dev log.
- 0.2.64/0.2.65: app icon = game Slime sprite (data.json mobimg["7"]) on a purple gradient tile, sizes <=32 crop the antenna.
  `python3 tracker/icon/make_icon.py [preview.png]` rewrites app/icon.ico (win.icon + BrowserWindow icon). No tray icon exists.
- 0.2.63: monkey.test.js names the overflowing elements on a sideways-scroll failure. Flaky-test trap: drag tests must measure the
  target after the drag starts and settles (150 ms) and aim well inside it; edge-hugging targets miss on CI fonts/reflow.

## Pop-ups 2026-10-20 (0.2.66)
- One modal system (renderer.js modalOpen/modalClose/MODALS, CSS `.modal`, shared #modalBack: blur + dim, fade/scale, reduced motion
  respected): Settings #prefsPop, Help #helpPop (was section[data-tab=help] under the layout; showTab is gone), Report a bug #bugPop.
  Esc/backdrop close the top one (el._close), Tab is trapped, opening from Mini leaves Mini. A new pop-up = `class="modal hidden"` + modalOpen.
- Closing animates 140 ms with `.closing` (pointer-events off): tests that check `isVisible` after a close wait ~250 ms. ui.test.js
  checks every pop-up is inset, blurred and never calls host.mini/winSize or changes the page height (fitWin on).
- 2026-10-21 Feedback: `feedback` table (schema.sql), POST /api/feedback (5-2000 chars, 5/hour and 20/day per ipday, 300/day total, honeypot `website`), GET /api/feedback + POST /api/feedback/done need `Authorization: Bearer FEEDBACK_KEY` (503 until the secret exists). server.yml puts the repo secret FEEDBACK_KEY into the Worker after deploy.

## Summary rebuild 2026-10-21
- `/api/summary`: when the stored copy is stale, the first request claims meta `summary_lock` and rebuilds; others within 60 s get the stale copy (was: every request rebuilt). Past 1.5 MB `kpq.list` is cut to 1000 then 0 rounds so it can still be stored. server.test.js checks the lock. `server/package-lock.json` now pins wrangler's tree.
- KPQ floor 2026-10-21 (Danny): `KPQ_MIN` = 240 s in server/src/check.js; summary() also skips stored rounds under it (one earlier 30 s-60 s rule). server.test.js "3:59 round not counted".

## User data folders 2026-10-21
- `%APPDATA%\MS Classic Grind Tracker` (settings.json, run-queue.json, sessions/; Electron names it after productName, not `name`), Pictures\MS Classic Tracker frames (bug reports) and Pictures\MS Classic Tracker runs (summary PNGs). Site How to use lists them with uninstall steps; keep both in sync if a path changes.

## Site live reader shares tracker code 2026-10-21
- build.py inlines `tracker/core/gamedata.js` + `tracker/core/session.js` into the site (src/js/63-expclive.js) next to readers.js. Changing session/readers/gamedata changes the site too: run `node tests/expclive.js` (tests.yml now also triggers on tracker/app/readers.js and tracker/core/**). Keep these three files browser-safe (no require at top level).

## Negative EXP from misread snapshot 2026-10-23
- Start/End snapshot raw EXP can be misread while the % is right (100,578 read as 200,579 gave -84,346). `expBetween` and `snap()` now drop a raw EXP that is >1% of the level off its own %. Fixture: `tracker/tests/sessions/negative-exp-kpq-rush-2026-10-23.json` (saved run, tracker 0.2.69).

## UI redesign part 1, 2026-10-23 (0.2.70, T-05)
- EXP by map: session.js keeps `S.byMap[id] = {name, bar, msg, ms, kills}`; stats() `map`/`mapName` = most EXP (bar if read, else lines), then most farming time; `nowMap`/`nowMapName` = where the player stands (live #where, Simple Mode line, party, bug report). Saved runs carry `maps` (top 12). Test: core.test.js "EXP goes to the map it was gained on".
- Edit run: core/history.js `applyEdit` (pure, used by main.js `update-session`): name, note, map, activeMin, exp (also expTotal + snap.exp), mesos, kills, deaths; first values in `x.orig`, `x.edited` = time. Form = `details.hedit` in History details; only changed fields are sent (editPatch).
- Past sessions is a modal (#histPop, F2 toggles, File > Past sessions), no longer a module: no `data-box="hist"`; old saves listing "hist" skip it. Esc with no pop-up/toolbox/drag opens Settings: Esc handlers that consume the key must `preventDefault()` (drag cancel and toolbox close do) or Settings opens behind them.
- Reset (#resetBtn, File > Reset tracker, resetTracker in renderer-run.js): only when not tracking; clears numbers, both logs, snaps, summary.
- Main card bar at <=330 px (container query, index.html): ? is hidden (F1 / Help menu still work), Reset shows only ↺, Simple Mode shows "Simple". CI fonts are ~1 px wider than local: leave slack. Mini is labelled "Simple Mode" in the UI (ids/settings keys still `mini`).
- 0.2.71 (Danny OK'd mockup card 2): #snaps and #invBox boxes are gone; their contents live in #mainStrip in the main card (ids kept: s0lv/s1pct/snapStart/snapEnd/#invTabs/#invAsk; fields behind #snapFix). Old saves listing "snaps"/"invcheck" skip them. Tiles: Per hour/Total (settings.tileTotal, renderTiles in renderer.js) + Loot tile.
- Simple Mode = simpleDraw/smChart (renderer-layout.js) from stats() perMin/bestMin/firstBar/bar (session.js pmBar/pmMsg per clock minute). Spawns = sum of G.maps[id][2] counts (OSMS). Not built yet: minimap crop and region name from the mockup.
- Loot value rule: session.js `lootPrice` (exported): Etc except 4003/4004/4005/4010/4011/4020/4021 ids at NPC price, the rest meso.watch median else NPC. All loot values (tables, History, best drop, drop alert) go through it.
- Conditions & alerts (0.2.78, the ElvUI/WeakAuras arc build 1): core/alerts.js is the pure engine — KINDS (13 trigger kinds:
  rate under/over with a hold, bossDue, kpqClock, sessionTime, goalReached, idleExp, lootWorth, lootNamed), normalize,
  synth (migrates the pre-0.2.78 keys alertWorth/alertItems/stopBeep into alerts[] once; renderer-settings.js's boot calls
  alertsBoot()), evaluate(alerts, ctx, st, now) -> fired[{id, text, sev, sound, toast, log, w}]. Sustained triggers refire
  at most every COOL 10 min; crossing triggers re-arm only after a dip (5-min anti-flap); events (drops) fire at once via
  alertEvent() in renderer-alerts.js, the rest on its 5 s alertsTick(). Actions: alertSound (WebAudio patterns via beep:
  low/mid/high/double), flash, #status, note() run-log line, and alertToasts[] -> ovBuild payload.toasts -> overlay
  toastsShow (glass stack top-right, aged 6.5 s, hidden while CFG.edit, the toast's w card pulses via .ovw.flash).
  dropAlert keeps the legacy alertWorth/alertItems path only when the engine has no enabled loot alert (ui.test drives it
  that way); stopCheck skips when an enabled idleExp alert exists. Settings UI: #alertList rows (kind select rebuilds the
  row's fields, number inputs save as numbers, sound select, Test, ✕), debounced host.settings({alerts}).
- Beta channel (0.2.82): settings.beta -> main.js applyChannel() sets autoUpdater.allowPrerelease (allowDowngrade false),
  applied at boot and on save (the settings handler re-checks for updates when beta changes). Test builds ship as semver
  pre-releases (x.y.z-beta.n -> electron-builder flags the GitHub release pre-release); stable copies skip them, beta
  copies take them, and the next stable supersedes. Renderer: #beta checkbox in Settings > App (betaSet in
  renderer-settings.js). ui.test's toolbox drag waits out the box glide + gives the drop detector a settled pointer
  (the 2026-10-19 flake class, hit again on 10-28).
- Respawn polish (0.2.81): due-soon = killed && 0 < dueIn <= 120e3 -> the warn colour (overlay .mrow span.soon, tracker
  #respawn td.n.soon); session.markKill(id) (exported) stamps S.timedKills[id] = Date.now() and refuses ids that aren't
  timed monsters of the current map; the tracker's respawn card grew a "killed it" button per row (renderer.js
  renderRespawns -> note() run-log line + render()). The overlay stays read-only: it's click-through while locked.
- Card sparklines (0.2.80): renderer-overlay.js keeps ovSpark (a ring, one ovSparkSample() every 20 s, 90 samples = 30 min;
  reset when the session object changes) and ovBuild carries spark: ovSpark.slice(-60); overlay.js SPK(d, k) draws a tiny
  current-coloured SVG polyline + newest dot under the big number in the EXP/Mesos/Kills cards (.spk, empty-safe: <2 samples
  draws nothing and .spk:empty collapses the margin), so an old payload shape renders unchanged.
- ui.test's Start wait is now waitForFunction(session != null) instead of a fixed 1.5 s sleep: the 0.2.79 dispatch run's ui
  job lost that race on CI (same commit's push run passed) — Start's capture flow is async and runners vary.
- Layout profiles (0.2.79, ElvUI's profiles + WeakAuras' export ritual): overlay.js CFG gains profile (active name) and
  profiles ({name: {widgets, panel}}). The live layout IS the active profile — ovSave mirrors profSnap() into
  profiles[CFG.profile] before sending, so there is nothing to remember to save; profApply(name) loads the snapshot
  (profCards() removes/creates cards to match the widget set), profUi() fills the #ovProf select. Save-as types a name in
  #ovProfName; Del is arm-then-confirm and never deletes the last profile. Share = profCode() "OVL1." + base64 JSON;
  profImport() validates every widget (known KINDS keys, clamped s/o, rounded x/y) before swapping the live layout.
  Boot: profiles missing or lacking the active name -> seeded from the live layout; the active profile always re-mirrors.

## Simple Mode restyle + overlay esc fix 2026-10-28 (0.2.86, thread "Make tracker customizable like ElvUI and WeakAuras")
- Simple Mode (#mini .sm*) now uses one accent (--accent) for the hero number and chart, ink for the map name, flat 6 px panels, 10 px uppercase labels; --warn gold is gone from it. Focus Mode shares .smMap/.smWho/.smBox, so check both after touching them.
- overlay.js `esc` mapped ">" to &quot; (profile names with > broke the select). Test in overlay.test.js. Study + roadmap: [tracker-customization.md](tracker-customization.md).
- ov-state (main.js) now returns core/overlaycfg.js state(settings): the WHOLE saved overlay. Before, only widgets came back, so profiles/snap/grid/panel spot reset every launch. core.test.js pins both the helper and the main.js wiring.
- Widget instances (0.2.86, overlay.js): card id = kind or kind_N (INST regex; "_" because the id lands in a CSS selector), ids() lists base kinds then instances, baseOf()/wName() map back. TOKENS (Stat number) and BARS (Level bar) are the display-data registry: one line adds a choice; widgets[id].tok saves it. addInst/delInst; profImport validates ids against KINDS, caps MAX_INST 12, drops unknown tok. New code touching the card list must loop ids(), not Object.keys(KINDS). Next roadmap steps (conditions, load rules, groups) are in tracker-customization.md.
- Cards keep apart (0.2.87, overlay.js reflow()): after place()/apply()/resize/drop, cards are walked top-left first and nudged right (else down) a GAP 8 px clear of already-placed ones. Display only: widgets[id].x/y are never rewritten, so cards settle back as numbers shrink; skipped during drag/resize. Savers that read offsetLeft (arrow nudge, drag) save the displaced spot, which is fine. Fixture: tests/frames-overlay/ (fixtures.md); scene in overlay.test.js.
- Focus Mode redesign (0.2.88, Danny: "glow and not shadows"): the old .fzCard shadow was color-mix of --ink, which is the LIGHT colour in dark themes, so it glowed. Rule: shadows/tints use black rgba (tokens --fzSh/--fzShUp on #focus), never --ink. Tiles are a 12-col grid, 3 + 4 (2 columns under 640 px).
- Overlay inspector (0.2.89, Danny: params in their own pop-up + glass fits content): `PARAMS` registry in tracker/app/overlay.js drives `#ovinsp` (opened by `pick()`, drag position saved as `CFG.insp`, key listed in tracker/core/overlaycfg.js), `okParam`/`cleanParams` validate saved + imported values (bad value = default), `styleCard` turns them into CSS vars on `.ovw` (`width:max-content`, so cards fit content). Add a knob = one PARAMS line. `setP` replaced setS/setO; `vis()` = "Show when" rule (never hides while editing). Trap: range params with `u` (size/opacity/text size) show percent but store fractions.
- Overlay conditions (0.2.91): PARAMS section "Condition" (cv/cop/cn/cact/ccol; `t:"n"` = number input) + `conds(d)` in tracker/app/overlay.js sets `.cmet-color|pulse|hide` per card on every apply; values only from `CONDV` (snapshot numbers). Hide dims instead of hiding while editing. Roadmap next: load rules beyond show-when, groups, per-widget share codes.

## Discard run + patch note layout (0.2.94, 10-29)
- `discard()`/`armDiscard()` in renderer-run.js: #wrapDrop / #miniWrapDrop / #fzWrapDrop, two clicks (arms 5 s), stops capture, clears autosave, then `resetTracker()`; nothing saved. Tested in ui.test.js.
- `TrackerChangelog.parts(text)` (changelog.js) = lead sentence + bullets; used by Help (#patchList) and site 68-tracker.js. Write changelog lines as short sentences; abbreviations e.g./i.e./Lv. don't split.

## CV efficiency 2026-10-29 (0.2.95, T-13)
- Measured on frame-000 (node, `node tests/cv_bench.js`): whole-frame read ~6 ms, shrink ~4 ms; Tesseract ~90 ms a crop. OCR, not the readers, was the biggest recurring cost.
- `core/ocrcache.js`: map/job/name OCR text is cached under a hash of the crop pixels (renderer-live `ocrText`). The job crop includes HP/EXP digits so it never hits; its look is every 2 min once job + name are known. `tests/cv.test.js` (in `npm test`) guards the cache and a 60 ms frame ceiling.
- Not measured: Windows capture/GPU copy, real scenery cost (fixtures have the playfield blanked). Capture is already `frameRate: 2`.
- Alerts 0.2.103: new kinds died/levelUp/mapEntered/itemLow/bigKill/partyChange/mesoBurst/readTrouble in tracker/core/alerts.js (baseline on first sight so a mid-run add never fires for the past). Custom sounds: tracker/app/main.js `sounds-*` IPC copies files into userData/sounds, alert sound value `file:<name>` (plain names only, `isFile`), played from a blob URL (CSP `media-src blob:`). **Final Attack proc trigger is NOT built**: needs reference frames of the proc from Danny first; don't ship a kind with no detector.

## Bag check reminder icons 2026-10-29 (0.2.96, T-12)
- `tracker/core/bagstale.js` (pure; loaded by the window, the overlay page and node): `level(ageMs, everyMin)` -> stage ok/soon/late/now + hue (green 130, yellow 50 held 30 s, then to red 0 at 2 min, then glow); `tabs()` ages each tab from its last read, or from run start if unread; idle (grey) when not tracking. "Fresh for" (settings.bag.every, 1-30 min, default 5) is a guess, not a game number; the 30 s / 2 min ramp is Danny's. Tests: core.test.js, extras.test.js (main card), overlay.test.js part 1c.
- Main card: `#bagIcons` (renderBag in renderer-layout.js, settings.bag.main/every in Settings); click -> `bagRead(tab)` in renderer-run.js, the same code as the `#invTabs` chips. Overlay: kind `bag` (RENDER.bag, PARAMS bagl/bagn); snapshot carries `inv` (last-read times) + `bagEvery`.
- Trap: the overlay is click-through. Icons use `mousemove` -> `ovhost.hit(true/false)` -> main.js `ov-hit` toggles `setIgnoreMouseEvents` (forward:true keeps moves coming); a click is `pointerdown` -> `ov-bag` -> main relays to the window (`host.onBag`). Icons are `span role=button`, not `button`, or edit-mode drag would skip them. Cards re-render every 1 s, so never act on `click`.

## Borderless mode 2026-10-29 (0.2.97, thread T-11)
- Simple/Focus "Borderless" button -> `host.borderless(kind)` -> main.js `bdOpen`: minimizes the tracker window (it keeps reading), opens the overlay in edit mode and asks it for a `simple`/`focus` card (overlay.js `bdCard`; first request rides in `ov-state.bd`, later ones the `ov-borderless` message). Position/width come from the window's content bounds. Those two kinds are normal overlay cards (RENDER.simple/focus -> `svHtml`, data = `sm` from renderer-overlay.js `ovSm`), so scale/inspector/profiles/conditions all work. One borderless view at a time; "Back to tracker window" (`bd-exit`) or closing the overlay restores the window.
- Trap: the cards are fixed width (`--mw`), the grip scales them; Focus reflows with a container query. Edit rows in overlay.test.js now 14 (12 kinds + 2). Tracker tests need `npm run data` first (gamedata.js is generated).
- Windowed scaling (0.2.98): `#mini`/`#focus` are inline-size containers (container queries at 380/220 px, index.html near `.smChart`); `smChart` draws at the svg's real clientWidth and redraws on resize (svg._pts). Hidden views report width 0 and fall back to 520. Test: focus.test.js "chart redraws".

## CV round 2 2026-10-29 (0.2.100, T-13)
- `tracker/app/readers.js` region memo (`memo()`, `regionHash`): bar strip + KPQ clock box reused while unchanged, forced re-read every 8th identical frame, bar memo dropped on any change. Only ~0.8 ms/frame saved: pickups/party sit over moving scenery, so they can't be memoized.
- Jump guard (`barVerdict`/`barJump`): +5% of a level in one read, or EXP going down without a level change, needs the same reading twice (`steady`); `agrees` alone no longer takes it. Tested in `tests/cv.test.js`.
- Job comes from the name-box OCR text (cached, stable pixels); the wide status-bar crop (HP/EXP digits, never repeats) is the fallback only. Job look back to 30 s since it's now free.
- `pace()` in renderer-live: 2 fps, 1 after 45 s without events, 0.5 after 3 min; `slowCap` replaces the old FPS=1 slow-PC drop; capture told via `applyConstraints({frameRate})`. ui.test covers the steps.
- `perfLine()`: per-stage ms printed to the event log at Stop and every minute into the bug-report LOG ("perf"). Combat log (T-14) hooks the same event stream; don't change `tick()` event shape.
## Journey log 2026-10-29 (0.2.101, T-14)
- Opt-in (settings.journal, Settings > Journey log): `tracker/core/combatlog.js` = line format `ISO-UTC<2 spaces>KIND,csv` + `parse()` + `createObserver` (events -> lines; kind table in `KINDS`) + `prune`; `tracker/core/journalfile.js` writes `<userData>/journal/journal-*.log` (4 MB files, <=40 MB total by default via settings.journalMb, JOURNAL_START header per file). IPC `journal-write` only writes while the setting is on.
- Window side `tracker/app/renderer-journal.js` (`jr`): runs tap `session.add` (so everything a run counts is logged); between runs a "watch" reads the game at 1 s, slowing to 2/5/10 s as nothing changes (EXP/pickups speed it back up) and takes bar, chat lines, wallet, inventory, map and job only. `start()` calls `jr.yield()` first (the run owns the capture); Stop/Discard call `jr.runStop`. Trap: `oneFrame()` stops the stream when `timer == null`, so a snapshot kills the watch's stream; the watch reopens it itself.
- Suspect EXP jumps (Danny: a crazy jump is a red herring): a bar gain over 10% of the level that EXP messages don't explain is logged `EXP_JUMP,suspect` and the bar is not advanced until a second read agrees (`confirmed`) or not (`rejected`). Logging only: core/session.js keeps its own checks. HP loss is not read by any reader yet, so there is no HP line; `EXP_LOSS` + `DEATH` (chat line, runs only) stand in. Tests: `tracker/tests/journal.test.js` (npm test), `tracker/tests/journal-ui.test.js` (CI job ui).
- HP/MP (0.2.102): `readVitalsAny` in readers.js pairs the green brackets on the status-bar line, reads the white 5x7 digits, splits at the "/" (a blob a row or two shorter than the digits; a "[2.51%]" box has none). Needs both boxes (HP left, MP next) or it returns null. `readFrame` sends `{type:"vitals", hp:[cur,max], mp:[cur,max]}` once the same pair reads twice; renderer-live routes it to `jr` only (session never sees it). Observer: VITALS/HP_LOSS/HP_GAIN/HP_ZERO/MP_*, an HP loss starts combat. The watch runs the chat death check after HP 0 or an EXP-bar drop. Tests: `tracker/tests/vitals.test.js` (npm test) on frame-000/006/042/046 + `statusbar-native-1440.png`. Not yet checked on 1x/1.5x UI or a low-HP red bar frame.
- 0.2.104 (Danny 10-29 screenshots): sword redrawn (rotated blade+guard in core/bagstale.js); Bag check PARAMS `bgon` (Card background; `.ovw.nobg` is ignored in edit mode so the card stays grabbable); the hit area for ov-hit is the whole bag card (`bagCard()` in overlay.js), not only `[data-bag]`.
- 0.2.105: PARAMS `bagi` (EXP card, "Bag check icons") renders `bagRow()` inside the EXP card; `bagCard()` = any card containing `[data-bag]` takes the mouse.
