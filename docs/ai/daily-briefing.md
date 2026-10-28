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
3. **maplestory.watch is challenge-walled (403) since 01:16 UTC.** It killed the shopscans poll twice because `scripts/fetch_alt_sources.py` had no error handling; fixed in `c2a6f9c` (per-source try/except, keep old file, exit 0 — the contract `fetch_shopscans.py` already had). mesoarbitrage still fresh; only maplestory.watch rows age.
4. **meowdb outage root-caused and fixed (10-28 ~16Z).** Their market API 403s headless browsers ("Headless browsers are blocked here") since 10-26 14:23 — market data froze while catalog/shops/drops stayed open. Fix: the poller runs a real headed Chromium under xvfb (clears their stated rule), with a no-browse fallback (free-market/home seeds + per-item sweep) if the wall widens. Danny also rescinded the 10-20 never-bypass rule at 12:06Z (decisions.md 10-28).
5. **classicrank.com unchanged** (challenge-walled since 10-23); digest feed healthy (`last_issue=7, archived_through=5`).

## What needs doing next

- **Danny:** still open: classicrank BCR_KEY, the maplestory.market key (data gathering there is licensed but the API is key-gated by design — probed 10-28), the cron pile-up call, web-PAT revoke confirm, the meowdb email (he takes that himself). Digest issue 8 carries the list.
- **Next agent on digest duty:** rotation is proven; state file `/home/z/my-project/.secrets/digest-state.json` is the source of truth (backup at `/home/z/my-project/upload/digest-state-backup.json`, keeper cron 474950 self-restores at 04:21 PT). Quiet-day policy decided 10-28: full short issues every day.
- **Tracker side:** the whole overnight menu SHIPPED 10-28 evening (v0.2.83-0.2.85: Watchlist + Market pulse + price alerts, Compare watched, Ctrl+K quick jump). Next rocks are unpicked — do not start big tracker work without a Danny pick.
- **Data side:** `data/price_blacklist.json` is the canonical price-tracking blacklist (quest block + arrows, Danny 10-28); any new price step or source check must import `scripts/price_blacklist.py` `is_bl()`. The 10-20 never-bypass rule stays revoked (public keyless endpoints may be fetched through a real browser; no logins, no captcha-solving services). Keep per-source graceful degradation.
- **Do not** re-add the digest offer-on-check-in block (retired, decisions log 10-25); any src/ commit ships its changelog card in the same push.

## Reading list

`docs/ai/handoff-to-claude-2026-10-28.md` (week catch-up — read if your last session predates 10-28) · `docs/ai/danny-digest.md` (issue 7, decisions) · `docs/ai/tracker.md` (overnight build log) · `docs/ai/digest-contract.md` + `docs/ai/discord-digest-runbook.md` · `docs/ai/design.md` (read before any UI/copy change) · `docs/ai/decisions.md` (grep before proposing) · `docs/ai/agent-mailbox.md` § Open.
