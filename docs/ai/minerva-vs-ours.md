# Minerva vs our tracker and site (2026-11-01)

Source: static read of itechify/minerva @ 88f55b8 (= v0.17.0 binary, see docs/ai/minerva-teardown.md section 9) against
our tracker/ and src/js. Nothing of theirs was run. Numbers marked (theirs) are from their code/ADRs; (ours) from
docs/ai/tracker.md. RAM was NOT measured for either app: no Windows box here.

## 1. Map view: spawn points + portals (the feature Danny meant)
Theirs: Map Preview = OSMS Data Explorer's full-map render (`map_manifest.json` picture), every portal ringed at its
render x/y (blue = other map, green = within map with an arrow to where it lands, grey = map not in data, dashed =
hidden/quest), every spawn point dotted. Hover a mob row: its dots light, the rest dim. Hover a dot: its mob + Mob Card.
Wheel zoom toward the pointer, drag, double-click resets. Hidden Portals listed below with destinations. Hand-kept
portal overrides (`portal_overrides.rs`). Code: crates/minerva-core/src/map_preview.rs, portals.rs, src/map-preview.ts.

Ours already has every input:
- `D.mmaps` (211 minimap WebPs, ~1.6 MB base64, 200 px wide), `D.mmdim`.
- `D.portals` {map: [[x, y, dest, hidden]]} as minimap fractions (208 maps, 106 hidden exits).
- `D.mobdb[mob].sp[map]` spawn points as minimap fractions (70 mobs).
- Full renders exist upstream (`ohmi69/osms_datamine_dashboard` data/maps/<hash>.webp; `render_dims()` in
  scripts/build_data.py already reads their sizes) if the 200 px minimap is too small.
- Site: `minimapWith()` (src/js/48-monsters.js) already draws ONE mob's dots + numbered exits.
- Tracker: overlay "Map & spawns" card (tracker/app/overlay.js) is a list only; `G` (tracker/core/gamedata.js) carries
  no minimap, portals or spawn points.
Gap: one view with ALL mobs' dots, coloured per mob, linked hover between dot and row, portal kinds. Cheap on the site
(data present). Tracker needs mmaps/portals/sp added to gamedata.json (~1.7 MB) or fetched per map.

## 2. Grind tracker
| | Minerva (theirs) | Ours |
|---|---|---|
| Runtime | Rust core + Tauri v2 (system WebView2), one 23 MB exe | Electron (bundled Chromium) |
| Capture | GDI BitBlt of small crops only: minimap title 3 Hz (333 ms), Status Bar strip (bottom 128 rows) 1 Hz, Pickup Log band 10 Hz on its own thread, shop 2.5 Hz only while Deal Finder is on | Windows Graphics Capture of the whole window, 2 fps during a run (1 fps when slow; 4 with Chat blocker); whole-frame read ~6 ms |
| OCR | ocrs (neural, pure Rust) for everything, digits included; ink-keyed cache skips repeat OCR | Exact pixel font templates for EXP digits (BAR_FONT) and pickups; Tesseract.js (~90 ms a crop) for map/job/name, pixel-hash cache |
| EXP source | EXP bar only (ADR 0005). Level total inferred from EXP + % ranges, no EXP table | EXP bar + pickup EXP lines; EXP table from OSMS |
| Misread guard | Reading must fit the game's shape; patches for ocrs's systematic 7->2 and 5->S errors (re-read at 1.25x); "unreadable, never wrong" | Jump guard: big jump or drop needs the same reading twice; EXP/% must agree for the level |
| Pickup Log | Stack shift by line SHAPE (brightness-independent), 10 Hz, each new line read up to 5 times / 500 ms and voted, three ink preps away from native scale, OSMS name matching with OCR-slip-aware edit distance | Stack shift by line TEXT equality at 2 fps; inventory reads correct loot |
| UI scale | Any fractional UI Size: measure an anchor, resample to samples' size (Catmull-Rom, clamped) | Tuned on Danny's 2x; site import has fuzzy scale, tracker less |
| Always on | No Start: Session starts on first EXP change, 2 min idle = break, character switch detected from the bar, per-map Visits, figures refresh every 30 s | Start/Stop runs, auto-pause |
| Extras | Personal Best race + pace trace, solo/party split from yellow party EXP lines, Bug Report = replayable input log | Kills, mesos, loot, party HP, KPQ clock, overlay widgets, themes, alerts, history, share runs |

Accuracy verdict (reasoned, not measured):
- EXP rate: about equal. Both read the bar, both refuse doubtful frames. Our exact-font templates should misread less
  than general OCR on a fixed bitmap font (their own comments log recurring ocrs digit errors). Our EXP table beats
  their % inference for Time to Level.
- Pickups/mesos/loot counts: theirs is likely better in busy play: 5x the capture rate, shape (not text) matching,
  voting. Our text-equality shift undercounts identical repeated lines arriving between frames. Our inventory check
  offsets this for loot, not for mesos.
- Map ID: theirs is more robust (auto-located title at any UI size; duplicate titles resolved by the previous map's
  connections; Candidates shown when unsure).

Efficiency verdict (reasoned): theirs should use less CPU (small crops vs whole-window frames, no Tesseract) and less
RAM (no bundled Chromium; WebView2 is shared with Windows). Expect maybe 1.5-3x less RAM, not 10x: it still runs
several WebView2 windows. Cheapest real answer: Danny opens Task Manager with each running and compares.

## 3. Rust + ocrs for us?
- Full Rust/Tauri rewrite: NO for now. Our tracker is large (overlay, themes, alerts, history, KPQ, sharing) and the
  readers are already ~6 ms a frame. The win is RAM and Tesseract time, both fixable cheaper.
- ocrs alone: worth a test. It ships an alpha WebAssembly build (`js/` in robertknight/ocrs, npm `ocrs`), usable in
  Electron without Rust. Model 9.7 MB, CC BY-SA 4.0 (attribution needed; ShareAlike on the model, not our code),
  code MIT/Apache. Latin only, fine for map/job/name.
  Test: run it on our minimap-name and job fixtures vs Tesseract, compare hits and ms. Keep BAR_FONT templates for
  digits (better than ocrs there).
- Cheaper wins to copy first: crop-only capture for the bar and pickup band (higher pickup rate at lower cost),
  shape-based pickup matching + voting, always-on session start on first EXP change, previous-map disambiguation.
- ocrs project AI policy: no AI-written issues/PR comments to its maintainers.
