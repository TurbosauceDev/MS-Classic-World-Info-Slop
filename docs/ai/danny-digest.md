---
kind: digest
status: live
issue: 9
date: 2026-10-30
written_utc: "11:58"
author: "Glorg [z.ai]"
site_version: "0.19.8"
---

# Danny digest, 2026-10-30 (issue 9)

## Where things stand

Tracker `0.3.21` and site `0.19.8` are live. CI is green on `6f73a6d`, Pages stamped 10:51 UTC. Eight tracker releases shipped since yesterday morning (`v0.3.14` through `v0.3.21`). maplestory.watch was removed by mistake (PR `#23`) and is being restored; maplestory.market (Sen's bot site) is scrubbed instead. The memory verdict is still open: we need a Performance monitor total from a session on `0.3.13` or later. Four decisions wait on you (below).

## Wins since issue 8

Tracker:
- Overlay cards auto-fit (`0.3.17`, PR `#16`): text shrinks to fit, no scrollbars.
- Chat window card (`0.3.18`, PR `#17`): party, buddy and all chat captured by colour.
- Per-card options pop-up in edit mode (`0.3.19`, PR `#18`).
- KPQ automation and scoring (`v0.3.20`, PR `#19`): auto Rush/Bonus phases, `tracker/core/kpqscore.js`, server re-scores into 5 boards, site Scored boards card.
- Claude polish: drag/resize ends on pointercancel/blur (`0.3.14`), blocker bars hold 4 Hz idle, undo covers Snap/Grid, heap cap 1 GB (`0.3.15`), Performance monitor main-process detail line (`0.3.16`), map name read from the folded title bar for maps without a minimap.
- QA pass shipped as `0.3.21`: fixed a slowCap latch (one burst of slow reads used to hold 1 Hz pace and the blocker idle fix for the whole session; it now releases after about 40 healthy ticks). Regression scene added to `tracker/tests/ui.test.js`; `0.3.17`-`0.3.19` probed headless, clean.

Site and data:
- Builder: weapon-mastery crit counted plus a stat window row (PR `#20`), simc-style stat weights card with a golden check (PR `#21`).
- OSMS re-pin `7e1c4eb` (Classic World `v1.1.0`): mob HP, 8 skills, arrow recipes, +1 hat.
- Danny 10-30: maplestory.watch is legit (a tracker) and PR `#23` removing it was a mix-up, reverted. maplestory.market is Sen's bot site and is removed everywhere.
- KPQ scored boards took their first scores: Turbow leads total at 1,258 points (server `/api/summary`, read 11:55 UTC today). Rush matches; the Bonus and "what could have been" boards are empty.

## Anything broken or weird

- Release numbers walked backward mid-day: the PR builds shipped as `0.3.17`-`0.3.19` first, then Claude's commits landed as `0.3.14`-`0.3.16`. All eight tags have releases and the update chain ends at `v0.3.21`, so every change reached users. Same collision class as the `0.2.9x` pair.
- The sandbox recycle this morning rolled digest state back to the 10-27 snapshot. Reconciled from the keeper backup before this run; issues 7 and 8 verified posted, and the archive copy of issue 8 was rebuilt from git.
- Nothing else. Price polls are all committing (meso.watch, mesoarbitrage, classicmarket, meowdb, mesoindex) and CI is green.

## Decisions I need from you

1. **classicrank partner key from Kitten** - without a read key the daily census refreshes chars, top and scan only (`BCR_KEY` in the sandbox secrets path).
2. **Cron pile-up** - cut meso.watch to 2 polls/hour or add push-retry to the poll script. We lean retry.
3. **web-PAT revoke** - confirm the old web PAT is revoked (hygiene; the fine-grained replacement is in use).

## Today's priorities

- Restart the tracker once, run a session, read Help > Performance monitor. That total picks the next memory lever (idle capture-stream release at Stop is next).
- KPQ weights are placeholders (`docs/ai/tracker.md`, KPQ section). The server derives averages from real rounds; a sanity check is welcome.
- Bag check Set Up/Cash/Deco reads need one real-client look (Claude's mailbox ask).
- The MS-Classic backlog stays queued behind the memory verdict.

## Where to go deeper

- `docs/ai/tracker.md` for `0.3.14`-`0.3.21`, KPQ scoring and per-card options.
- `docs/ai/decisions.md` 10-30 entry: maplestory.watch kept, maplestory.market scrubbed.
- Mailbox: Claude's `0.3.19` and KPQ threads hold the asks above.
- Site: https://maplestory.scumlord.studio
