# Daily Briefing — 2026-10-28 (Issue #7)

last-verified: 2026-10-28 by Glorg [z.ai]

**For:** All agents.
**From:** Glorg [z.ai]
**Written:** 2026-10-28 11:55Z (04:45 PT).
**Refresh rule:** overwrite this file at the start of your work session
if it's >24h old. Keep history in git (`git log docs/ai/daily-briefing.md`).
**Read order for new agents:** START-HERE.md → state-of-the-pipeline.md →
this file → agent-mailbox.md § Open.

---

## TL;DR (5 bullets)

1. **Tracker overnight arc complete: v0.2.78 through v0.2.82 all published** (installers + update manifests verified). Alerts engine (13 trigger kinds, legacy keys auto-migrate), overlay layout profiles + `OVL1.` share codes, card sparklines (30 min ring), boss respawn polish (due-soon color, hand "killed it" marking), and a beta update channel (Settings > App). Danny's copy auto-walks on next restart. Full local suites green on every ship; two CI flakes hardened along the way.
2. **Site batch live: P8, P9, P10, P11 + accuracy P12-P16.** Movers page; price data split out of the shell (first load 3771 → 1218 KB gzip, returning visitors ~371 KB); shared-runs real mesos/kill on mob pages; step-level timeouts on every poll; spike breaker, p25-p75 range tile, 3-day weighted headlines, consensus labels. Plus listing-age tiers on Where to buy (`b40b392`). Site stamp v0.19.3.
3. **maplestory.watch is challenge-walled (403) since 01:16 UTC.** It killed the shopscans poll twice because `scripts/fetch_alt_sources.py` had no error handling; fixed in `c2a6f9c` (per-source try/except, keep old file, exit 0 — the contract `fetch_shopscans.py` already had). mesoarbitrage still fresh; only maplestory.watch rows age. No bypass attempted (10-20 rule). Watch the 13:11 UTC run to confirm green.
4. **classicrank.com unchanged** (challenge-walled since 10-23, census frozen at 10-22 data). Both blocks sit in Decisions 1-2 of issue 7.
5. **Digest feed healthy:** issue 6 rotated on schedule (uploaded to the [Archive] thread, stale post deleted); keeper crons passed silently. State after this run: `last_issue=7, archived_through=5`.

## What needs doing next

- **Danny:** Decisions 1-4 in `docs/ai/danny-digest.md` (issue 7): classicrank call, maplestory.watch call, cron pile-up, standing asks (market key, draft batch, web-PAT revoke).
- **Next agent on digest duty:** rotation is proven; state file `/home/z/my-project/.secrets/digest-state.json` is the source of truth (backup at `/home/z/my-project/upload/digest-state-backup.json`, keeper cron 474950 self-restores at 04:21 PT).
- **Tracker side:** next-up menu from the overnight list, not yet built: site watchlist, market pulse, compare view, keyboard UX. Do not start big tracker work without a Danny pick.
- **Data side:** do not "fix" either blocked fetcher with UA tricks (decisions.md 10-20). If a blocked source self-heals, note it in the worklog and the digest.
- **Do not** re-add the digest offer-on-check-in block (retired, decisions log 10-25); any src/ commit ships its changelog card in the same push.

## Reading list

`docs/ai/danny-digest.md` (issue 7, decisions) · `docs/ai/tracker.md` (overnight build log) · `docs/ai/digest-contract.md` + `docs/ai/discord-digest-runbook.md` · `docs/ai/design.md` (read before any UI/copy change) · `docs/ai/decisions.md` (grep before proposing) · `docs/ai/agent-mailbox.md` § Open.
