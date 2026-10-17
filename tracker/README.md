# MS Classic Grind Tracker (Windows)

Small always-on-top window that watches the MapleStory Classic World window while you grind: kills, EXP/hr, time to
next level, mesos/hr with meso drops per monster, every item picked up with its market value. It only reads the window's
pixels (same capture API as OBS/Discord); it never touches game files or memory and never sends keys.

```
npm install
npm run data        # data/data.json -> app/gamedata.js(on), copies src/js/51-shot.js -> app/shot.js
npm test            # session math on synthetic events
node tests/ui.test.js   # the window in Chromium with a fake game stream (needs playwright)
node tests/readers.test.js [dir]   # screen readers on real frames (tests/frames, playfield blanked; needs playwright)
npm start           # run it (Windows, Electron)
```

- `core/session.js`: events -> rates. Pure; idle gaps over 60 s are left out. Kills are placed by matching each EXP pickup
  to the map's monsters (exact base EXP, or the party share); mesos/items are credited to the last kill (a guess on maps
  with several monsters).
- `app/readers.js`: frame -> events, built on Danny's 2560x1440 capture (1280x720 game, 2x). Reads the status-bar EXP
  ("18,572[64.09%]"; level = EXP table entry that fits), pickup messages (mesos, "You received EXP" = 1 kill, party bonus,
  "<item> xN earned. (Etc)" matched to an item name), party size from the party window's HP bars. EXP bar also read at any window size (blob sampling) and the
  map name from the minimap title (white-text crop -> Tesseract.js OCR in the main process every 5 s, offline model
  shipped in the installer, fuzzy-matched to our map names); both approaches borrowed from beanguri/Maple-Classic-Exp-Overlay
  (MIT, tests/frames-beanguri/LICENSE). Job: the status-bar text next to the level, OCR'd the same way every 30 s (Job = Auto).
  Letters the font table hasn't seen read as "?" (item names still match as patterns). More frames: "Save sample frames"
  (60 frames, one every 3 s, to Pictures/MS Classic Tracker frames).
- Self-check: for 8 s after Start a card shows which readers work (EXP bar, pickup lines, map name, job) with a hint
  for each that doesn't. "Report a bug" saves the last 8 frames (one every 3 s) and the last 300 log lines (reader
  events, map/job reads, status messages; no install ID, party code or name) to Pictures/MS Classic Tracker
  frames/report-<time>/.
- Items used: every 2 s the item counts on the quick slots and an open Use tab are read (their digit font is exact
  per-row colors, learned from Danny's screenshots in tests/frames-inv) and the icon above each count is matched to
  potion/food/arrow/star icons (gamedata icons, from the site's item icons). A count that drops (confirmed by the next
  read) = used; drops over 20 at once are ignored (sold/stored). Cost = cheapest NPC shop price (D.ishop), else the
  player-shop median. tests/inventory.test.js.
- Auto-pause: EXP bar and minimap both gone for 3 s (Cash Shop, channel change) = paused; that time is left out of
  active time and of 15-minute runs. Level-ups are logged with the farming time each level took (History).
- Runs carry the UTC hour they started; the server's summary has "times" (best time to farm per map, each run against
  the same player's usual speed there, 3-hour blocks with 3+ players).
- Shared numbers count one player per home network: the server joins installs that sent runs from the same connection
  on the same day (and party codes with their members' networks) before the "3+ players" rules.
- Release: run `.github/workflows/tracker.yml` by hand with "release" ticked (version = package.json); it builds the
  installer on Windows and publishes a GitHub Release; installed copies auto-update from it (electron-updater).
- Sharing (asked on first start, off until answered): every 15 minutes of non-stop farming on one map is a run sent to
  the server (server/), queued in run-queue.json until it answers. Sessions are also saved locally under
  %APPDATA%/ms-classic-grind-tracker/sessions (History, CSV export).
- Party view: with a party code, the tracker posts its live EXP/hr, level, job (and the name typed, if any) once a
  minute to `/api/party` and shows everyone on the same code. Works with sharing off.
