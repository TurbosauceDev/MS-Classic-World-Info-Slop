# MS Classic Grind Tracker (Windows)

Small always-on-top window that watches the MapleStory Classic World window while you grind: kills, EXP/hr, time to
next level, mesos/hr with meso drops per monster, every item picked up with its market value. It only reads the window's
pixels (same capture API as OBS/Discord); it never touches game files or memory and never sends keys.

```
npm install
npm run data        # data/data.json -> app/gamedata.js(on), copies src/js/51-shot.js -> app/shot.js
npm test            # session math on synthetic events
node tests/ui.test.js   # the window in Chromium with a fake game stream (needs playwright)
npm start           # run it (Windows, Electron)
```

- `core/session.js`: events -> rates. Pure; idle gaps over 60 s are left out. Kills are placed by matching each EXP pickup
  to the map's monsters (exact base EXP, or the party share); mesos/items are credited to the last kill (a guess on maps
  with several monsters).
- `app/readers.js`: frame -> events. **Element finders are stubs** until built against real frames
  ("Save sample frames" button saves 60 frames, one every 3 s, to Pictures/MS Classic Tracker frames).
- Release: push tag `tracker-vX.Y.Z` (= package.json version); `.github/workflows/tracker.yml` builds the installer on
  Windows and publishes a GitHub Release; installed copies auto-update from it (electron-updater).
- Sharing: finished sessions are saved under %APPDATA%/ms-classic-grind-tracker/sessions; upload waits on the backend.
