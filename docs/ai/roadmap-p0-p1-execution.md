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
Additive D1 table `boss_spots(boss, ch, t, n)` + `POST /api/spots` (opt-in, witness
counts only — no IGN by design; Turbozo's de-anonymization reversal (2026-11-01,
"us anonymizing that was a mistake") applied to the shop name plates, not to kill
witnesses, whose value is the count) + `GET /api/spots?boss=`. Tracker side: timed
kills are already detected (kill-log path + `markKill` buttons) → share
`{boss, ch, t}` when "share boss spots" is on. Respawn cards and the overlay map card
render shared rows: "Mushmom ch 3 — down 12 min ago · 3 saw it", current channel first,
24 h TTL. Local display works regardless of whether the user shares.
Files: `server/src/index.js`, `server/schema.sql`, `server/tests/server.test.js`,
`tracker/core/session.js`, boss card renderers, `overlay` push payload,
`core.test.js` + `overlay.test.js` scenes.

## Wave 2 (P1) — all five shipped

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
6. **P1-8 · Overlay anchor mode (koffi). SHIPPED 0.3.35.** `tracker/app/winrect.js` binds exactly two read-only
   geometry calls — `DwmGetWindowAttribute` (DWM-9 extended frame bounds, what the capture records) with
   `GetWindowRect` fallback — through koffi 3.3.6 pinned exact, probed once and gated to win32, so off-Windows
   and CI never touch anything native; main.js's PowerShell Add-Type path stays as the automatic fallback. The
   cached game rect now refreshes at 600 ms on the fast path (was 3 s), main.js pushes the desk-relative rect
   to the overlay (ov-gamerect) only while a card is anchored, and every overlay card's inspector has
   "Follow the game window": wPos rides the rect by an offset (w.ag) that is based where the card sits when
   the switch goes on and re-based on every save, so enabling never jumps the card, and pushes never re-place
   mid-drag. `tests/winrect.test.js` guards the binding surface (no OpenProcess/hooks/input/enumeration), the
   win32 gate, the fallback's survival, the anchor maths and the exact pin — and proves the _Out_ struct
   pattern against libc's gettimeofday wherever koffi can load.
7. **P1-7 · Quest HUD reader. SHIPPED 0.3.36.** The QUEST window reads live with the site's Quest log engine —
   its reading core moved into one shared file (`src/js/60b-questread.js`, copied to `app/questread.js` at tracker
   build) so site and tracker run the exact same reader against the same fixtures (site suite green untouched; new
   `tracker/tests/quest.test.js` asserts both fixtures read the same 8 quests the site reads). Tracker: a Quests
   module card (in-progress list, unsure rows with one-click picks), Quest watch (Settings > Window and sharing,
   shop-watch cadence) plus a Read-now button, and a QSL1.<base64> sync code the site's Quest log imports through a
   new paste box (undoable like any read). Nothing uploads — quest progress stays on the PC. One lesson for the
   record: the shared core must create its reference-text canvas at page load like the original did — a lazily
   created context rasterizes Arial differently and every match degrades (caught by the site suite, fixed same day).
8. **P1-5 · Weekly grind ladder. SHIPPED 2026-11-02 (server + site), anti-cheat first per the adoption plan.**
   build_data.cjs computes each map's physics ceiling into gamedata.json (Σ spawn points × base EXP × 240
   kills/h/spawn — OSMS spawn data; 190 of 196 maps have one); cleanRun carries an opt-in IGN-shape display
   name into the run_names side table (the KPQ-names pattern); buildLadder network-joins runs exactly like
   the summary, groups party codes, needs 30 farmed minutes per line and ranks the week's best run. Minerva's
   two watchdogs went in BEFORE launch (ADR 0032, report-never-reject): a line over its map's ceiling, or
   over 2x a busy board's (8+ others) best, is held back — counted in the board's hidden count, never
   deleted, nobody named. GET /api/ladder answers this week + last week (5-minute cache); the tracker sends
   the Settings nick with shared runs (absent when empty); the site gained the Weekly ladder page (site
   v0.20.12) with overall/mesos/per-map boards and a last-week switch.
9. **P1-9 · Community map rates. SHIPPED 2026-11-02 with the ladder.** /api/ladder's rates fold per map ×
   network — the median over players of each player's median EXP/h on that map this week, shown once 2+
   players farmed it — rendered on the ladder page's Map rates tab.

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
- First-party shop collection carries the name plate (seller IGN + title + FM room + map,
  Turbozo 2026-11-01) behind the 3-player quorum; boss spots add `{boss, ch, t}` with
  witness counts only — location without identity, the one place anonymity is the feature.
- "Delete what I shared" erases every row an install sent, side tables included — the
  2026-11-02 bug hunt found and fixed the shop-name rows surviving it (delete order);
  round two extended it into the 2026-10-30 KPQ reset's backup tables, which kept a
  forgotten install's rounds and board names forever.
- Updates stay on GitHub Releases with a public hash history; no filename tokens ever.
- Data licensing unchanged: OSMS CC BY 4.0 + named, permitted sources with attribution.
- Watchlist continues: re-run the installer sweep + overlap check on the next MesoLens
  release (0.3.69 predates our canary — every verdict is per-build).

## 2026-11-02 · Bug-hunt and polish pass (all 9 approved items now shipped)

Every Wave 1 + Wave 2 item is live (0.3.30–0.3.36, ladder + rates site-side). A deep
bug-hunt pass then hardened all three areas; fixes are regression-tested:

- **Server:** shared runs dedupe retry sends (same install/map/numbers inside the 12-min
  window — a legit next run is always 14.5+ min later); `forget` now deletes `shop_obs_ext`
  (the seller name rows survived it) and archived runs' side tables; the archive move no
  longer orphans `run_extra`/`run_groups`/`run_names`; the party-view throttle follows the
  install, not the code (rotating codes can't skip it); ladder `hidden` counts only
  watchdog-flagged lines; a mob's mesos can't exceed the run's own pickup total.
- **Tracker:** the inline fallback engine answers `band: null` (the dead worker's band
  reader used to leak a pooled frame a second); pause by hand freezes EXP-bar and wallet
  events too; session saves are atomic; Export CSV reads every session; snapshots return
  their frame buffer to the pool; the neural shop reader also demands the weakest decoded
  digit clear the confidence floor (bench still 6/6 across the board).
- **Site:** a broken screenshot can't brick the Character Builder importer; failed icon
  loads answer with a message instead of a stuck "Reading…"; the live EXP reader stops the
  screen share if start-up fails; the KPQ timer page survives a hand-edited saved round;
  junk SP values in shared links are dropped. site v0.20.15, tracker 0.3.37.

## 2026-11-02 · Bug hunt, round three: the quiet corners (site v0.20.18, tracker 0.3.39)

Four parallel sweeps of the areas rounds one and two never reached (site modules
00–39 and 40–79 for logic rather than error paths, all 25 tracker/core files, the
server's read/aggregate paths); 11 verified findings, all fixed with tests:

- **Server:** a single stored run with corrupt `mobs` JSON 500'd the public
  summary (and the admin panel) until the row aged out — guarded like every other
  stored-JSON parse. A fractional `?limit` reached SQLite's LIMIT as a REAL and
  500'd the owner inboxes — truncated. `cleanShop`'s regex coercion let arrays and
  numbers ride into D1's bind (a 500 after the obs batch had committed, ledger
  skipped) — typeof-gated. The 14-day shop prune orphaned `shop_obs_ext` rows, so
  seller identities outlived their rows' stated life and the table grew forever —
  pruned with the observations. `archiveOld`'s OR IGNORE + unconditional delete
  could lose a run outright if the hot table ever emptied while the archive kept
  rows (rowids restart at 1) — both sides now keyed on the (id, received) pair,
  crash safety preserved. `received` indexes added for the two TTL deletes
  (additive-only).
- **Site:** the Character Builder could be bricked by a `#b=` share link or old
  save with SP over a skill's max (`stat(s, 99)` → `undefined` → render threw on
  every load) — clamped to the export's real maxima, `stat` hardened. The Recipes
  tab could go permanently blank from a saved sort key the current table doesn't
  have — falls back to level. Where to train printed not-a-number mesos/hr for the
  four zero-EXP "Super" event maps once a huge typed Accuracy (clamp 99999) cleared
  their avoid-999 hit gate — skipped. The meso.watch staleness signal was dead
  twice over: `build_data.py` never copied `generated` into `D.pw`, and both
  parsers appended Z to an offset-bearing ISO string (`…+00:00Z` → NaN) — the
  stale pill and Source-health panel work now, and they immediately surfaced real
  freezes (meso.watch since Oct 31, maplestory.watch since Oct 29). The screenshot
  importer's failed reads rendered an empty but clickable thumbnail whose view()
  threw — button only when there is something to show.
- **Tracker (0.3.39):** the KPQ clock alert fired at the start of every round with
  a "1 s left" toast — the readers produce seconds, the engine reads milliseconds
  (`599/1000 > 60` is false, so the held gate never tripped); the producer scales
  now. A 0-second KPQ stage (two identical clock reads one scan apart) scored as a
  new stage record — clamped to the z ceiling, +STAGE_W, and it satisfied PERFECT —
  and the server re-scores history with this file; a zero-second stage counts as
  not-read (round provisional).
- **Tests:** server.test.js round-three block (corrupt mobs row, fractional limits,
  shop coercion, ext-row prune, archive id-collision survival), edge.js 9a–9c
  (builder SP clamp via link and save, crafting junk sort, maps accuracy 99999),
  features.js fakes `pw.generated` fresh (its honest stale pill would now fail the
  pill-free assert), core.test.js 0-stage scenes + the producer-unit assert,
  data_quality_test.py 2b (data.json must carry a parseable `pw.generated`).

## 2026-11-02 · Bug hunt, round two (site v0.20.17, tracker 0.3.38)

The second sweep went at the newest machinery — anchor mode, the pages boot chain,
the forget route's long tail:

- **Server:** `forget` reaches the `kpq_bak_20261030_*` backup tables (children
  first, then the rounds) — a forgotten install's rounds and KPQ board names used to
  survive in there forever; the removed count reports all eleven tables now. The
  Weekly ladder's per-map boards were always empty: the fold keyed its lookup Map by
  array, which never matches under SameValueZero, so every run sat alone under the
  30-minute floor — keys are `map\u0000group` strings now (regression-tested). Party
  posts scrub `job`/`mapName` like `nick` (raw strings rode to every member's UI),
  and the 6-trackers-per-network cap reads the ledger: forget deletes party rows, so
  without the mark it handed the slot back. `server/src/check.js` takes numbers only for counts
  (the old `+v` coercion took `"1000"` as 1000) and calendar-shaped dates only
  (`2026-13-99` became a junk board key).
- **Site:** a prices fetch that rejects at the transport level (offline first visit,
  reset mid-boot) rejected `__PRICES` itself — and the whole app lives inside
  `__PRICES.then`, so nothing ever booted; the chain ends `.catch(() => null)` and
  the shell seeds empty market objects, so a no-prices boot is a real boot. The
  service worker's hashed-file prune tested a bare-filename regex against pathnames
  and full URLs, never matched, and never deleted — one ~1.3 MB prices blob cached
  per market poll, forever, until Chrome's origin-wide eviction took the offline
  cache AND localStorage; matches are by basename now and the cache version bumped
  to wipe the grown copies. The navigator falls back to Lith Harbor when a saved
  starting map has since left the game data (a route from an invisible origin);
  `og:image` points at the canonical host; the build asserts the `NN[a-z]-` module
  prefix convention and sorts modules numerically; build_data flags duplicate item
  ids and coerces string prices.
- **Tracker (0.3.38):** minimizing the game no longer throws anchored cards across
  the screen — Windows reports the minimized window as the iconic rect
  (−32000,−32000, 160×28), which passed the plain size checks and slammed every
  Follow-the-game-window card to the virtual desktop's top-left; all three rect
  paths (koffi's `tracker/app/winrect.js` and both PowerShell fallbacks) reject the signature
  now. A settings save from a window event (moved/resized/closed) that throws —
  another process holding settings.json — was an uncaughtException that killed the
  app mid-session; failed saves are logged and skipped. A failed screen-capture
  setup answers the Start button instead of leaving it on "Opening…" forever; the
  region-snip tool can no longer close a newer snip window when one is cancelled
  mid-load; an OCR worker that keeps failing stands down for a minute instead of
  rebuilding itself (multi-second churn) on every read; the errored band's buffer
  still returns to the pool; and the settings page reports when it fell back to
  defaults.
- **Workflows:** pages.yml skips a deploy when the triggering poll failed (a failed
  poll used to burn a full checkout + Playwright + build of unchanged data);
  server.yml gains deploy concurrency (two racing deploys could finish out of order
  and serve the older Worker); tracker CI moves to node 22.

## 2026-11-02 · Bug-hunt follow-up: the two honestly-logged leftovers

- **Forget can no longer reset the abuse caps.** Every cap counted live rows
  (`COUNT(*) ... WHERE ipday = ?`) — the same rows "Delete what I shared" deletes —
  so hit-cap, forget, refill repeated forever (runs, KPQ rounds, shop rows, boss
  spots, and the 6-trackers-per-network rule alike; round two closed the last gap —
  forget also deletes party rows, so the party cap reads the mark as well). A new
  `ipday_ledger` table keeps
  each network-day's high-water marks (rows ever accepted, tracker IDs ever seen);
  the caps read max(live rows, mark); forget deliberately leaves the ledger — it is
  the network-day's tally, not the install's data: the same day-scoped salted hash
  the rows themselves carry, pruned by the archive pass once the day is gone
  (yesterday-and-older). feedback alone needs no ledger (it has no install column to
  forget by); round two moved party_live's cap onto the ledger too (see below). The
  privacy page spells the tally out in plain words (Nov 2, 2026).
- **The summary cache trims adaptively.** The 1.5 MB store guard used to step
  1000-rounds-then-none; past that the copy was served fresh and never stored, so
  every request re-read every run until the data shrank. `trimSummary` binary-searches
  the most of the newest KPQ rounds that fit, so the cache stores whenever the round
  list can save it; only a copy even an empty list can't shrink goes unstored (real
  data sits far below the line).
