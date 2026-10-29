# Daily Briefing — 2026-10-29 (Issue #8)

last-verified: 2026-10-29 by Glorg [z.ai]

**For:** All agents.
**From:** Glorg [z.ai]
**Written:** 2026-10-29 11:55Z (04:45 PT).
**Refresh rule:** overwrite this file at the start of your work session
if it's >24h old. Keep history in git (`git log docs/ai/daily-briefing.md`).
**Read order for new agents:** START-HERE.md → state-of-the-pipeline.md →
this file → agent-mailbox.md § Open.

---

## TL;DR (5 bullets)

1. **The memory arc shipped: 0.3.10, 0.3.11, 0.3.12 in three hours, then 0.3.13.** Danny's monitor read 2,090-2,332 MB at 05:01Z. Big cuts: frames read via `VideoFrame.copyTo` (window 850 → 380 MB in Claude's xvfb bench, run total 1,500 → ~860 MB measured), buffer pooling (`tracker/core/bufpool.js`), OCR idle teardown, honest private-bytes counting in the monitor. 0.3.11's renderer merge made the overlay solid black; 0.3.13 (`635fb09`) reverted that one cut and `tracker/tests/overlaywin.test.js` bans the bad switches. **Do not re-add process-per-site, single-process or in-process-gpu.**
2. **Overlay transparency finally landed (0.3.7 + 0.3.9):** root cause was the Elv skin pinning 90% alpha and ignoring `--glass`. Slider inverted (max = most glass), Run log + Loot default clear (82), Chat blocker + Map & spawns forced opaque. Perf monitor shipped in 0.3.8.
3. **Danny's 10-28 evening batch live:** site prices in the tracker (0.2.83-0.2.85: Watchlist, Market pulse, price alerts, Compare modal, Ctrl+K) and the price blacklist (`data/price_blacklist.json` + `scripts/price_blacklist.py`, canonical). Plus his own commits: Final Attack proc 0.2.107 + 0.3.2. Journey log 0.2.101/0.2.102, HP/MP reader, chat blocker arc, Borderless rework, bag check icons, Undo/Redo.
4. **Site accuracy audit fixes live (0544a50, v0.19.4):** 3-day weights were inverted (118 of 119 moving items), consensus tile counted markets as sales, p25-p75 band contradicted spike-held headlines. Site stamp v0.19.5.
5. **Feed health:** maplestory.watch and meowdb are answering again (fresh rows 11:45Z / 06:54Z today). classicrank still key-walled. Digest issue 7 posted but its run died before statekeeping; rotation debt paid in issue 8's run (issues 6+7 archived, state matches backup).

## What needs doing next

- **Danny:** the memory verdict (restart → 0.3.13 → send Help > Performance monitor total) and the carried calls: classicrank BCR_KEY from Kitten, maplestory.market key, web-PAT revoke confirm, cron pile-up (Z.ai leans push-retry).
- **Tracker side:** memory follow-up lever queued = capture-stream idle release while stopped with no Chat blocker on. Needs Danny's new monitor numbers first. Do not start other big tracker work without a Danny pick.
- **Next agent on digest duty:** state file `/home/z/my-project/.secrets/digest-state.json` is the source of truth (backup at `/home/z/my-project/upload/digest-state-backup.json`, keeper cron 474950 self-restores at 04:21 PT). Lesson from issue 7's run: the post can succeed and the run still die before statekeeping — always append the worklog line LAST and verify state + backup both landed before ending.
- **Data side:** `data/price_blacklist.json` is canonical for price tracking; new price steps must import `scripts/price_blacklist.py` `is_bl()`. maplestory.watch answers again, so no source action needed. Keep per-source graceful degradation.
- **Do not** re-add the digest offer-on-check-in block (retired, decisions log 10-25); any src/ commit ships its changelog card in the same push.

## Reading list

`docs/ai/danny-digest.md` (issue 8, decisions) · `docs/ai/tracker.md` (memory arc + bench recipe, section Memory) · `docs/ai/handoff-to-claude-2026-10-28.md` (read if your last session predates 10-28) · `docs/ai/digest-contract.md` + `docs/ai/discord-digest-runbook.md` · `docs/ai/design.md` (read before any UI/copy change) · `docs/ai/decisions.md` (grep before proposing) · `docs/ai/agent-mailbox.md` § Open.
