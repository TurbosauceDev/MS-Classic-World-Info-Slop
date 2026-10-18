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
| app/renderer.js | 98 | all UI: tabs, cards, settings, docking layout, history, themes (72 top-level functions) |
| app/readers.js | 68 | frame → events: EXP bar (BAR_FONT), pickup lines, party HP bars, inventory counts, KPQ clock. Also inlined into the site by build.py (`/*@READERS*/`) |
| app/index.html | 34 | window markup + CSS |
| app/main.js | 23 | Electron main: capture, OCR, updater, files, IPC |
| core/session.js | 29 | pure: events → rates; `createRunSlicer` (15-min share runs) |
| build_data.js | | data/data.json → app/gamedata.json; copies src/js/51-shot.js → app/shot.js |
| server/src/index.js | 17 | Worker routes; `server/src/check.js` validates runs |

Symbol index: `grep -n "^function\|^async function" tracker/app/renderer.js`; readers/session are indented:
`grep -n "^  function\|^  async function" tracker/app/readers.js tracker/core/session.js`.

## Commands (from tracker/)
```
npm run data                          # after build_data.py changes
npm test | tail -5                    # core + fuzz (CI runs this in tracker.yml)
node tests/ui.test.js | tail -5       # window in Chromium, fake game stream (CHROMIUM=/opt/pw-browsers/chromium if needed)
node tests/readers.test.js | tail -5  # readers on real frames (tests/frames)
node tests/inventory.test.js | tail -3; node tests/kpq.test.js | tail -3; node tests/snip.test.js | tail -3
cd ../server && npm install && npm run data && npm test   # Node 22 (node:sqlite stands in for D1)
```

## Release / deploy
- Tracker: bump `tracker/package.json` version, commit, push to the default branch, then GitHub `actions_run_trigger`
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
  native File menu → Settings (Ctrl+,, main.js sends menu "settings"); no title-bar button. Panel tabs: Session, Loot,
  History. Tests open it with `window.menu("settings")` and must close it (it covers the page). Its section chips
  (#prefsNav) come from `data-nav` on each card: a new section needs that attribute. label.chk checkboxes are switches.
- Mini (#mini, renderMini): its own copies of numbers, run log (#miniFeed, mirrored in feedAdd) and top-5 lists; host.mini(on, h)
  sizes the window's content height to the view (miniFit). #miniFull goes back; the card itself isn't clickable any more.
- The main card (#top, box id `main`) lives in #dock with the run log, so it moves/docks/folds like any box (folded keeps
  its Start bar). #wrap/#summary/#selfcheck sit after #dock.
- Leaderboards aren't anonymous: don't call sharing "anonymous" in the UI.
- beanguri's /api/stats needs their permission; we only borrowed MIT reader ideas.
- Themes: PRESETS[0] "Default" = the site's src/styles.css colours (light+dark); core.test.js fails if they drift, so a
  site recolour must update app/themes.js, the index.html :root fallback and main.js window/title-bar colours too.
- Run log (core/feed.js, box `log` pinned in #dock by default): diffs session.state every 2 s (feed.step), so it shows
  what the session counted, not raw events. Box ids saved in a user's layout.order win; an unsaved new box stays at home.
  The dock now holds a box, so drag tests that drop "onto the dock" land relative to #logBox.
- Docking: dropZone = left/right third of a box → side by side; `.dropGhost` previews the landing spot. Danny never found
  the old quarter-width edge (his saved layout had no rows), so check discoverability, not just that the code works.
- Running tests locally: `npm run data` first (core.test.js needs app/gamedata.json, not committed).

## Split candidates (not done; tracker thread owned these 2026-10-18)
- `app/renderer.js` 98 KB: split by UI area (history, settings/themes, layout/docking, live cards) into files loaded by
  index.html. Biggest win for future threads.
- `app/readers.js` 68 KB: one file per reader (EXP bar, pickups, inventory, KPQ clock) is natural, but build.py inlines it
  into the site, so update `/*@READERS*/` handling at the same time.
