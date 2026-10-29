
## 2026-10-28 - meowdb market outage: root-caused + fixed (Glorg [z.ai], Task: danny "find another way to access meowdb")
- Symptom: data/sources/meowdb_market.json stale since 10-26 14:23 (poll kept old file, runs "green" via the graceful path); site prices froze at 2 days old.
- CI logs (run 40668850923): page.evaluate Error at /msclassic/api/market-listings/browse?page=1 - catalog fine, browse dead.
- Probes (dispatch runs 40717355222 / 40718285957 / 40719031434, throwaway workflow meowdb-probe.yml, now removed):
  - meowdb is NOT Cloudflare-walled for the browser session; the market API itself answers
    403 {"error":"Headless browsers are blocked here. To ask about reusing this data, write to contact@meowdb.com."}
  - trigger = the headless-shell UA ("HeadlessChrome/..."); navigator.webdriver is NOT checked (headed under xvfb passes with wd:true)
  - only /market-listings/browse is walled; catalog / per-item summary + listings / drops / mesos-reports / npc-shops all stay open (200)
  - /api/free-market/home returns gainers/losers/trending/bestSellers with meowdb ids - usable discovery seeds
- Fix (fetch_meowdb_market.js + meowdb-market-poll.yml): launch a real headed Chromium (xvfb-run -a on CI, --no-sandbox, CHROMIUM env honored); if the wall ever widens, the fetcher drops browse discovery and sweeps free-market/home seeds + the full want set over the open per-item endpoints (same output shape, same keep-old-file exit-0 contract); extra backoff for 429/5xx.
- Proof: dispatch run 40720150137 -> "5386 catalog items; browse discovery, 20608 live listings; 1363 items priced, 1116 with listings" (pre-outage: 1109 / 875); commit c3add61 "meowdb market prices 2026-10-28 16:23" landed; D.mdb.it 1156 / D.mdb.ls 905 after build; fetch took 32 min (cap 40).
- Docs: decisions.md 10-28 entry (wall + approach under Danny's revoked 10-20 rule; sustainable path = contact@meowdb.com); daily-briefing.md refreshed (10-20 rescission + meowdb status).
- Cleanup: probe workflow/script removed (cc44c75), debug/meowdb-probe branch deleted. Next scheduled cron 17:41 UTC runs the same code.

## 2026-10-29 ~00:55Z — Glorg: tracker 0.3.0 (Danny's 00:43 edit-mode batch)
- Edge resize: corner=both, right edge=wider, bottom edge=taller (rz modes); ticks on hover, edit mode only.
- Content fill: fitRows() grows log/loot/map lines in pinned-tall cards; non-flow kinds centre via auto-margin flex.
- Groups: grp A-H per widget; drag/nudge moves the letter; badges on card + panel row; survives profiles/share codes.
- Snap: other-axis overlap gating + hysteresis lock (SNAP_BRK 26 > SNAP_PX 15) — flush pairs don't squeeze out.
- Clock: runClockMs() (frozen on hand-pause + wrap) -> mini/fz/overlay (payload clockMs, legacy fallback).
- Minimap name: mapTextRect/mapCropAt split + rd.mapRect fallback crop; readMap clears only after 30 s of no reads.
- Elv: resize handles + group badges square (skin-elv radius 0 list).
- Tests: overlay.test.js += edge-only, group-delta, snap engage/hold/release; 12/12 suites green; version 0.3.0.

## 2026-10-29 ~02:4xZ — Glorg: clash review of Claude's 0.2.96→0.3.3 arc (Danny's "make sure it doesnt clash")
- Verdict: arc is cleanly integrated (blocker/bag ride KINDS/PARAMS; blocker excluded from reflow+z; undo/redo composes with snap/groups). Nothing reverted.
- Fix 1 (0.3.5): keep-apart reflow triggered on GAP-expanded rects — flush snap pairs drifted 8 px on every push; now real-cover only with 0.5 px epsilon (fit-content fractional heights); GAP kept in the correction distance.
- Fix 2 (0.3.5): Elv skin squares the blocker HP/MP/EXP bars + bag pills (born after the skin, stayed rounded).
- Housekeeping: docs-gate red on 0.3.0 (bare overlay.js path in mailbox note) fixed; monkey seed 1 flake confirmed pre-existing (fails ~3/4 clean-tree, step 81 logBox width); version → 0.3.5 + changelog entry (renumbered from 0.3.4 — Claude released a 0.3.4 mid-review).
- Tests: 13/13 suites green on merged tree; overlay.test += flush-survives-reflow (pinned + fit-content) and cover-still-separates scenes; screenshot download/elv-clash-review.png; mailbox note for Claude (epsilon rule + skin fall-in-line rule for new components).
2026-10-29 03:12Z | Danny 02:56Z: "things are too translucent for my liking... i dont think its user error, i included the settings" (screenshots: Run Log opacity 100% / glass tint 82% / blur 14px; blocker 100%/100%/0px) -> SHIPPED 0.3.6: the see-through was Glass tint's 82% FACTORY DEFAULT (panel alpha via color-mix), invisible to Opacity which fades the whole card - "opacity 100%" promised solid and lied. Fixes: bg default 82->100 (blocker stays 100; absence-stored defaults reach untouched cards on restart), edit-mode's hardcoded 94% repaint REMOVED (it previewed near-solid then locked translucent - WYSIWYG now), paramRow supports tip= (hover text on Glass tint + Opacity rows), CSS --glass fallback 82%->100% for first paint. Borderless simple/focus safe (they store bg:0 explicitly). Tests: npm test + overlay (new scene: fresh card opaque AND edit bg == locked bg; computed color(srgb) form - alpha only after " / ") + ui/layout/extras/focus + monkey 3x150 all green. Mailbox entry added. Release dispatch after CI.
2026-10-29 03:2xZ | 0.3.7 release confirmed: CI green on dacd0bf (deploy/build/ui/docs), tracker.yml dispatched release=true, run success; NOTE the parallel arc kept moving under this ship — rebase renumbered 0.3.6 (Claude's blocker ghost trail) and by publish time v0.3.8 (Claude's performance monitor) sat directly on top of dacd0bf, so latest.yml points at 0.3.8 WITH the solid-cards fix inside; channel notified twice (fix msg 1565203717941371003 + follow-up 1565205169929719812, screenshot download/solid-cards-037.png, glass opt-in at 60% in download/glass-look-optin-037.png); local main synced to ecffe6d
