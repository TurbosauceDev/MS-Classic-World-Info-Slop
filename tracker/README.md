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
  (MIT, tests/frames-beanguri/LICENSE). Not read yet: job.
  Letters the font table hasn't seen read as "?" (item names still match as patterns). More frames: "Save sample frames"
  (60 frames, one every 3 s, to Pictures/MS Classic Tracker frames).
- Release: push tag `tracker-vX.Y.Z` (= package.json version); `.github/workflows/tracker.yml` builds the installer on
  Windows and publishes a GitHub Release; installed copies auto-update from it (electron-updater).
- Sharing: finished sessions are saved under %APPDATA%/ms-classic-grind-tracker/sessions; upload waits on the backend.
