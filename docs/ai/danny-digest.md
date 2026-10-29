---
kind: digest
status: live
issue: 8
date: 2026-10-29
written_utc: "11:55"
author: "Glorg [z.ai]"
site_version: "0.19.5"
---

# Danny's daily digest, issue 8

## Where things stand

The heaviest day of the project so far, and the subject was weight itself: your 04:13Z "can we try to get the memory usage down" and 05:01Z "figure out a solution its still very heavy" (monitor reading 2,090-2,332 MB on your screenshots) drove three memory releases in three hours, with the transparency and black-overlay fixes wrapped around them. The tracker walked from v0.2.94 to v0.3.13 between 00:06 and 06:06 UTC, two of those builds committed from your side. Yesterday evening's batch (site prices in the tracker, the price blacklist) is also in this window. The site is at v0.19.5 on https://maplestory.scumlord.studio after the accuracy audit landed. Main CI is green at write time (deploy success, price polls mid-run).

## Wins since digest 7

- **Memory pass 1 (0.3.10, `6c4781c`)**: the OCR worker tears down after 10 idle minutes and recycles at 200 reads (its WASM heap used to park at peak, est. 100-200 MB), the frame compare reuses one persistent buffer instead of a fresh copy per changed frame, spellcheck dictionaries off.
- **Memory pass 2 (0.3.11, `bff9b20`)**: frames are read with `VideoFrame.copyTo` (`tracker/app/framesrc.js`) instead of canvas copies. Claude's xvfb bench measured the tracker window at 850 MB under the old canvas path vs 380 MB after, and a full run with overlay from 1,500 to about 860 MB (measured with no game running; recipe in `docs/ai/tracker.md`).
- **Memory pass 3 (0.3.12, `ae76a42`)**: the monitor headline was double-counting shared Windows libraries once per Electron process (up to 6x); it now reports private bytes the way Task Manager does. Frame buffers circle through `tracker/core/bufpool.js` (the old path allocated 3.7-14.7 MB per read, 30-60 MB/s of churn, est); audio helper merged into the app process, HTTP cache capped at 32 MB, GPU spare-cache budget 256 MB, JS heaps GC hard past 512 MB.
- **Overlay transparency landed (0.3.7 `dacd0bf`, 0.3.9 `134f118`)**: root cause of the see-through was the Elv skin pinning 90% alpha and ignoring the Glass setting. The slider is inverted (max means most glass), Run log and Loot default clear at 82, Chat blocker and Map & spawns are forced opaque with no Glass row.
- **Performance monitor (0.3.8, `ecffe6d`)**: Help menu panel with per-process CPU and memory, read rate and per-step timings. It is what exposed the memory story; now it reports honest numbers.
- **Site prices in the tracker (0.2.83 `3d7f002`, 0.2.84 `1cc5b15`, 0.2.85)**: Watchlist card with median, trend, sales and cheapest live listing per watched item; Market pulse movers; priceAbove and priceBelow alert triggers; a Compare modal showing all six sources side by side with per-source sale counts; Ctrl+K quick jump. Prices cache on disk so an offline grind keeps the last numbers.
- **Price blacklist (`1855c47`)**: arrows and pure quest items are out of every price layer and the data-quality spread check, per your 10-28 call.
- **Final Attack proc, your builds (0.2.107 `4e6680a`, 0.3.2 `51c9930`)**: the buff-icon reader with the countdown read, computer vision only.
- **Journey log (0.2.101 `4f0ee10`, 0.2.102 `87aaf8c`)**: opt-in timestamped log of everything the readers see, HP/MP reader feeding it, and a suspect EXP jump asks for confirm instead of logging as fact. Eight more alert triggers and custom sounds shipped alongside (0.2.102 `04f14ba`).
- **Overlay night batch**: bag check icons with aging colors on the card and the EXP card (0.2.94 `52466b3`, 0.2.105 `103b421`), Borderless fade rework with no minimize (0.2.106 `b3e7ee3`), edit mode Undo/Redo plus a 6 px drag threshold (0.3.3 `3c4c52b`), Discard run with a two-click confirm (0.2.94 `87be7d1`).
- **Site accuracy audit (`0544a50`, site v0.19.4)**: three real defects fixed: the 3-day weighted Usual value applied its weights backwards on 118 of 119 moving items, the consensus tile counted markets instead of sales, and the p25-p75 band contradicted spike-held headlines.
- **maplestory.watch is answering again**: fresh rows at 11:45 UTC today, and meowdb rows fresh at 06:54 UTC. No bypass used on either.

## Anything broken or weird

- **0.3.11 briefly turned the overlay solid black.** Merging the overlay into the tracker renderer process (a memory cut) cannot work for a transparent window. You hit it at 06:03Z, Claude root-caused it and 0.3.13 (`635fb09`) removed the merge while my shell was down. `tracker/tests/overlaywin.test.js` now fails on process-per-site, single-process and in-process-gpu so the cut stays out for good.
- **Version collisions between agents, again**: 0.3.7 was renumbered over Claude's 0.3.6 (`6ca5fef` clash review), two different builds both claimed 0.2.94, and the new frames test was renamed `tracker/tests/bufcircle.test.js` after a docs-gate name clash (`51e7bfd`). All resolved same-day. Pull before you push if a fresh tag appears under you.
- **Digest statekeeping gap**: yesterday's issue 7 posted fine but the run died before the state file and archive steps, so this morning found stale state. Nothing was lost; issues 6 and 7 are now in the [Archive] thread and the state file matches its backup.

## Decisions I need from you

1. **Memory verdict**: quit and reopen the tracker (0.3.13 installs on restart), grind normally, then send the Help > Performance monitor total. That number either closes the thread or picks the next lever (capture-stream idle release while stopped).
2. **classicrank partner key** (carried): the daily census refreshes chars, top and scan only until a read key from Kitten lands in the sandbox secrets.
3. **maplestory.market partner key** (carried): the API is key-gated by design; the key unblocks the dashboard price slot and the tracker's cross-source slot.
4. **web-PAT revoke confirm** (carried): one word that the old web instance token is dead.
5. **Cron pile-up** (carried): cut meso.watch to 2 polls per hour or add push-retry to the poll script; I lean retry.

## Today's priorities

1. Restart the tracker and confirm two things on your side: the overlay is see-through again and the monitor total reads honest (private bytes, comparable to Task Manager).
2. Send that total after a normal grind; it is the only input the next memory decision needs.
3. The two partner keys remain the only data-side unblocks; nothing else waits on you.

## Where to go deeper

- Releases and installers: v0.2.94 through v0.3.13 on the repo's Releases page; in-app patch notes render from `tracker/app/changelog.js`.
- Memory findings and the bench recipe: `docs/ai/tracker.md` section Memory; buffer pool in `tracker/core/bufpool.js`, frame reader in `tracker/app/framesrc.js`.
- Accuracy fixes: weight and band logic in `src/js/11-cmarket.js` with the test scene in `tests/features.js`; live prices on https://maplestory.scumlord.studio
- Digest shape and rules: `docs/ai/digest-contract.md`. Next refresh 04:45 AM PT.
