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
- Item counts in the tracker's own (video) frames come out a few shades off, so ink is "white" on the top 4 rows and a
  per-row light-blue band below (tests/frames-inv/video-a.png, Danny's KPQ run). Light-blue bits with no white above
  (icon edges, the selected slot's frame) are skipped; a 1-wide column without outline above and below is a window edge.
- EXP bar readings whose EXP / % fits no level's total are dropped (in the reader and again in the session): a
  misread number ("1 [68.01%]") used to count as a death and then as +32k EXP.
- Start/end snapshots (mapleexp.com's method): level + EXP % at the start and the end, EXP/hr = EXP between them /
  clock time. Taken by themselves (first bar read, Stop; pictures saved as snap-*.png) or with Snap start / Snap end;
  level and % can be typed by hand. Shown next to the live count, with a note when the two disagree by over 25%.
- Deaths: each EXP bar drop is checked against the chat box line "You have lost N EXP for dying" (lower-left of the
  screen, bright text to black-on-white, 2x, same Tesseract OCR as the map; up to 3 tries a second apart). The Deaths
  box says how many were confirmed and the exact EXP lost. OCR text isn't logged (player names).
- "Show me where my potions are": freezes the game picture in a full-screen window (snip.html, snipping-tool style);
  the box dragged there (fractions of the frame, saved as settings.countArea) is the only place counts are read.
  "Look everywhere" clears it. tests/snip.test.js, inventory test (box around the quick slots).
- Always on top: "screen-saver" level, re-asserted on blur and every 5 s (setting "Keep this window on top").
- Meso total: the inventory window's meso field (black 8-row digits on white) gives real money in/out, shop trips
  included. All ten digits are known (learned from real screenshots).
- Arrows for Bows/Crossbows: 0.5 mesos each (Danny, 2026-10-17: not in our shop data); Bronze 2 (shop data).
- Shared runs carry usedCost (mesos spent on items used; null when no item counts were on screen). The server stores
  deaths, start hour and usedCost in run_extra; the site shows "pots/ammo" per map and Frugal mode uses it.
- Potion box monitor (v0.2.19): the snip window opens on the game's monitor (GetWindowRect via PowerShell on the
  captured window's HWND, or the captured screen in whole-screen mode), else the main monitor; not the mouse's monitor.
- Start and end readings (v0.2.21): part of the Session tab (Snapshots tab gone). The start reading is taken at Start (filled from the first bar reading if the bar did not read), the end at Stop; missing level/% boxes are marked. Saved with the session (snap: levels, %, minutes, EXP); History EXP/hr uses it when complete.
- History (v0.2.21): × on each session deletes it (asks "Delete?" first; main.js delete-session takes the file time stamp only).
- Help (v0.2.18): ? button, F1, or Help in the app menu (our own menu replaces Electron's default) opens a Help page:
  getting started, what the numbers mean, tabs, potions, party, window tips, bug reports, updates, privacy.
- Updates (v0.2.17): checked at launch and every 6 h, downloaded in the background, installed on close (electron-updater,
  GitHub Releases). Settings > App has "Check for updates"; once downloaded, a banner on top offers "Restart and update"
  (stops and saves a running session first, then installs silently and starts the app again). v0.2.20: an Install button next to "is ready" in Settings > App, and the banner stays on top while scrolling.
- Window (v0.2.16): Start/Stop, tracking state and the 4 main numbers (EXP/hr, next level, mesos/hr, kills/hr) on top;
  tabs Session / Loot / Snapshots / History / Settings below (last tab remembered). Self-check is one line while
  checking, then only the readers that fail, with the fix.
- Speed (v0.2.15):
  - Frames are grabbed at the game's own size: once a full frame shows the scale, the video is drawn shrunk by it
    with no smoothing (renderer.js grabFrame). A full frame every 20 re-checks the scale. On a 2560x1440 capture the
    grab went from about 60 ms to 4 ms.
  - The readers run in a worker (app/reader-worker.js, GrindReaders.work), so the window never stutters. If the worker
    can't start or doesn't answer in 5 s, they run in the window ("engine" log line says which).
  - Item counts and the meso total are looked for only where they were last found, plus a whole-frame look every 10 s
    or as soon as they're gone. The any-scale EXP bar reader does the same with its rows.
  - A frame identical to the last one is skipped, at most 4 in a row (2 s).
- Auto-pause: EXP bar and minimap both gone for 3 s (Cash Shop, channel change) = paused; that time is left out of
  active time and of 15-minute runs. Level-ups are logged with the farming time each level took (History).
- Window spot (v0.2.23): position and size saved to settings.winBounds on move/resize/close (full height while mini); reopens there if the title bar is still on a monitor, else 360x600 default.
- Inventory (v0.2.24): readers.js findInventory (red line under the tabs + pink open tab, Danny's Use tab 2026-10-18) and
  readInventory (5x6 slots; picture vs every Equip/Use/Etc item icon, G.iicons, decoded in the worker; counts via readCounts).
  "inv" events {tab, items, alike, unknown} when read the same twice. Session keeps first/last per tab; loot per item =
  max(pickup lines, inventory gain) for Etc/equips/scrolls. Stop asks for another look if a tab is >2 min stale.
- Kills: KPQ stages without monsters are maps with none (stage-clear EXP isn't kills); a lone monster worth 5x the
  smallest on its map (King Slime) counts once per visit. Pickup names fitting several items: the one this map's
  monsters drop (G.drops from meowdb reports), Coupon/Pass on KPQ stages.
- KPQ: Session tab "Doing" Auto / Grinding / KPQ, plus Mode Bonus / Rush (a label). Auto turns KPQ on at the first map
  in `G.kpq` (80000000-80000600: 1st Accompaniment stages 1-4, Last Stage, Bonus, Exit; from the site's D.kpq). While on,
  any other known map (Kerning City 10003000 between rounds) pauses the session and the bar can't resume it; the next
  stage does. A round = entering a stage from outside. Saved as `kpq: {mode, rounds}`; History's EXP/hr for it uses
  stage time only. No shared runs while KPQ is on.
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
