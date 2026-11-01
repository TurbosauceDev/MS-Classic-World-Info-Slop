# P0/P1 enhancement roadmap — approvals and execution plan (2026-11-02)

Source: Turbozo's sign-off in #glorg-chat (2026-11-01 21:29Z, msg 1566564927580147833)
on the 15-item roadmap in the "MesoLens vs Turbosauce stack" competitive analysis
(section 7). This file is the execution contract: what was approved, what was parked,
the build order, and the guardrails that do not move.

## Decisions (roadmap ID → call)

| Item | Decision |
|---|---|
| P0-1 Shop Pricer | Approved with a redirect: **no new page** — improve the existing **Price check** tab in Mesos and Trade (`src/js/54-invprice.js`) |
| P0-2 Shared boss spots | Approved — "improve our boss tracking to work like this; it's how I envisioned it in the first place" |
| P0-3 Auto shop-watch | Approved — start work, **with a master on/off toggle** for users who dislike it |
| P0-4 Advice line on shop cards | Approved |
| P1-5 Weekly grind ladder | Approved — "let's also add the weekly grind ladder" |
| P1-6 Digit models / OCR+CV upgrade | Approved — "use anything you can get to improve our OCR and computer vision stuff" |
| P1-7 Quest HUD reader | Approved — "lets implement that quest hud helper" |
| P1-8 Overlay anchor mode (koffi) | Approved conditional on my safety verdict — verdict below: **safe, scoped** |
| P1-9 Community map rates | Approved |
| P2-10 SMega deals scanner | Parked — "let's not worry about megaphones just yet" |
| P2-11 Discord bot | Parked — "we will consider a public discord bot later" |
| P2-12 Public price API | Parked — "we will work on a public api later but not now" |
| P2-13 Mac build + ko locale | Parked — same line as the API |
| P2-14 Supporter tier | Parked — "we will not be asking for money just yet... a very long time if we do" |
| P2-15 Streamer kit | Parked — "we will consider streamer interactions later" |

## Wave 1 (P0) — build order

### 1. P0-4 · Advice line on the Shop prices card (first — hours)
One generated sentence under every Shop prices card read, from a shared advice helper:
`median 30K · quick 27K · 6 listed today`, plus a trend word. Thin-data fallback
("thin data — 3 sales this week") so the line never overstates. The same helper serves
item 2. Files: `tracker/app/renderer-shop.js`, quote fields in `tracker/core/prices.js`;
scenes in `tracker/tests/shop.test.js` + `tracker/tests/core.test.js`.

### 2. P0-1 · Price check upgrade (Mesos and Trade) — the redirect
The existing Price check tab keeps its flow (drop inventory/bank screenshots → items and
counts) and gains the coaching layer per item: **quick (p25) / usual (median) / patient
(p75)** asks from the meso.watch-first PW chain (`src/js/10-maps.js`), sell-through,
trend, and one plain-English verdict line. NPC-sell fallback unchanged; numbers never
bend the meso.watch-first rule. No new page, no new surface to maintain.
Files: `src/js/54-invprice.js`, shared sentence engine from item 1 (site side),
`tests/features.js` scenes.

### 3. P0-3 · Auto shop-watch (toggleable)
The 0.3.24 shop read goes continuous: a low-frequency watcher looks for the open shop
window (existing band constants) and re-reads rows automatically while the player
browses; the Shop prices card and its badges refresh live.
Controls: **Settings master toggle** (respected forever once turned off); the one-shot
shortcut read stays. — SHIPPED 0.3.30, with Turbozo's same-day privacy change: uploads are
v2 and name the shop (seller + title from the window's title bar via
`tracker/core/shopread.js` readTitle, FM room parsed off the map name, map id; channel
rides on the wire as null until the tracker can read the game's channel display). Files:
`tracker/app/renderer-shop.js` (loop, debounce, change detection), `tracker/app/main.js`, `tracker/app/renderer-settings.js`, `tracker/tests/shop.test.js`.

### 4. P0-2 · Shared boss spots (the networked boss tracking) — SHIPPED 0.3.30
Additive D1 table `boss_spots(boss, ch, t, n)` + `POST /api/spots` (opt-in, **no IGN**,
rate-limited like the rest of the Worker) + `GET /api/spots?boss=`. Tracker side: timed
kills are already detected (kill-log path + `markKill` buttons) → share
`{boss, ch, t}` when "share boss spots" is on. Respawn cards and the overlay map card
render shared rows: "Mushmom ch 3 — down 12 min ago · 3 saw it", current channel first,
24 h TTL. Local display works regardless of whether the user shares.
Files: `server/src/index.js`, `server/schema.sql`, `server/tests/server.test.js`,
`tracker/core/session.js`, boss card renderers, `overlay` push payload,
`core.test.js` + `overlay.test.js` scenes.

## Wave 2 (P1) — in flight

5. **P1-6 · Digit models from our fixtures → the neural text reader. SHIPPED 0.3.34, redirected by the
   OCR permission.** Turbozo granted permission to use the ocrs recognition model (2026-11-01,
   "we have permission to use the ocr model"), superseding the CC BY-SA caution that had this item
   planned as home-trained templates. What shipped instead of, and ahead of, trained digit models:
   `tracker/core/ocrmodel.js` — a JS port of ocrs' recognition half (BT.601 luma at −0.5 bias, resize
   to the model's 64 px line height at half-pixel centres, 50 px width-bucket batching, greedy CTC
   decode over the 96-char alphabet) — running the bundled `models/text-recognition.onnx` (real ONNX
   from the author's HuggingFace, CC BY-SA 4.0, unmodified, attribution in `models/NOTICE.md`) via
   onnxruntime-node, all in the main process behind the existing `ocr` IPC. The shop rows (names +
   both price cuts) route to it; the shop title bar stays on Tesseract (a seller IGN must not come
   back wrong) and every other OCR caller is untouched; an empty or low-confidence (< 0.35 mean
   probability) neural read falls back to the Tesseract worker, so a read only ever gets slower,
   never worse. `tests/ocr_bench.js` is the accuracy gate and passed on 2026-11-02: names 6/6 via
   matchName (= Tesseract's recorded readings), prices 6/6 + 6/6 via parseOffer with 6/6 two-cut
   agreement, median 16.4 ms/line vs ~90 ms. Shop crops now cut at 4x (both thresholds 0.5/0.6 kept
   apart) — the model's measured-best scale. The bar-font digit readers (EXP bar, pickups, KPQ)
   keep their exact templates, which still beat general OCR on the fixed bitmap font; a fixture-
   trained digit model remains open as a later increment behind the same bench.
6. **P1-8 · Overlay anchor mode (koffi).** Overlay cards can pin to the game window's
   rect and track it on move/resize; the shop watcher anchors to the shop window itself.
   Guardrails below. A new winrect module in the tracker app (to be created), `tracker/app/main.js`, overlay placement.
7. **P1-7 · Quest HUD reader.** Read the on-screen quest-tracker progress lines (same
   reader class as our pickup-line reader), map to the 216-quest DB, auto-sync the site
   quest log, live helper card.
8. **P1-5 · Weekly grind ladder.** Runs already flow to the Worker: opt-in weekly
   EXP/mesos-per-hour boards (overall and per map) + a site page. Aggregation only — no
   new collection.
9. **P1-9 · Community map rates.** Aggregate byMap EXP/h from shared runs into the site's
   map pages and a tracker lookup: what the community actually measures on a map this
   week.

## koffi verdict (P1-8): safe, scoped

- **Library:** koffi 3.x — MIT, actively maintained, prebuilt binaries, no network, no
  telemetry. The risk was never the library; it is which native calls you bind.
- **Our binding surface:** read-only window-rect queries only — `FindWindowW`,
  `EnumWindows`, `GetWindowRect`, `DwmGetWindowAttribute`. **No `OpenProcess` at all**
  (not even query-limited), no memory access, no hooks, no input injection, no writes.
- **Supply chain:** exact version pinned in `package-lock.json`, `npm audit` in CI, the
  FFI file isolated behind a runtime capability check so non-Windows and CI never load it.
- **Why it is worth it:** exact game-window geometry makes the shop watcher, quest reader
  and anchor mode dramatically more reliable than full-screen scanning.

## Parked (P2) — recorded, revisit later

SMega scanner, Discord bot, public price API, Mac + ko locale, supporter tier, streamer
kit. When any come back up, the standing rules hold: never paywall data, never ship an
unattributed source, never put secrets in filenames.

## Guardrails that do not move

- Schema stays additive (repo rule).
- First-party collection stays item/qty/price/sold with the 3-player quorum; boss spots
  add `{boss, ch, t}` with no IGN — location without identity.
- Updates stay on GitHub Releases with a public hash history; no filename tokens ever.
- Data licensing unchanged: OSMS CC BY 4.0 + named, permitted sources with attribution.
- Watchlist continues: re-run the installer sweep + overlap check on the next MesoLens
  release (0.3.69 predates our canary — every verdict is per-build).
