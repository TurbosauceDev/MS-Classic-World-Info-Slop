# Daily Briefing — 2026-10-27 (Issue #6)

last-verified: 2026-10-27 by Glorg [z.ai]

**For:** All agents.
**From:** Glorg [z.ai]
**Written:** 2026-10-27 11:45Z (04:45 PT).
**Refresh rule:** overwrite this file at the start of your work session
if it's >24h old. Keep history in git (`git log docs/ai/daily-briefing.md`).
**Read order for new agents:** START-HERE.md → state-of-the-pipeline.md →
this file → agent-mailbox.md § Open.

---

## TL;DR (5 bullets)

1. **P3 + P4 + P5 shipped and live** (`e88d659`, site v0.18.10), per Danny's 10-26 approval of proposals 1-5 (P6 he keeps). The pwPrice fallback tail (mesoarbitrage sold median → maplestory.watch typical → mesoindex usual, rough-labelled) gives 50 items their first headline price; the Usual tile carries a sources range + agreement pill; Prices rows get a stale pill at MCI-panel thresholds. Tests extended in `tests/features.js` + `tests/questvalue.js`; full suite green; CI green on head `6aeefd0`.
2. **classicrank.com is blocking us since 10-23.** Census workflow: 4 straight failures (last success 10-22 12:30 UTC), 403 to Actions runners, anti-bot challenge page to non-browser clients. `data/sources/classicrank.json` frozen at 54,094 chars / 30 jobs. Load-by-IGN (browser-side) still works for visitors with a fresh classicrank cookie. No bypass attempted, per the 10-20 never-bypass rule. Decision 1 in issue 6 asks Danny: wait, Kitten partner key, or add watchdog coverage.
3. **Digest feed healthy.** Issue 5 rotated cleanly (archived to the [Archive] thread, channel post deleted) by this run; issue 6 posted to #daily-updates. Keeper crons 474448 (PAT) and 474950 (webhooks + state) both passed their checks silently; no recycle this cycle.
4. **Price pipeline green.** All seven sources fresh on cadence, watchdog clean, no cancelled runs worth noting. Shared runs refresh committed (`1b9b079`).
5. **Open proposal queue (from the audit, ranked P1-P11):** P8 Movers page (data ready), P9 data split out of `index.html` (1.69 MB gzip re-served per poll commit, effort L), P10 mob-meso calibration (grows with shared runs), P11 poll lock split. P7 stays blocked on the maplestory.market key. Standing asks unchanged: market key, Kitten key (now urgent via Decision 1), draft-batch call, web-PAT revoke confirm.

## What needs doing next

- **Danny:** Decisions 1-5 in `docs/ai/danny-digest.md` (issue 6). The classicrank call is the timely one.
- **Next agent on digest duty:** rotation worked end-to-end this cycle; state is `last_issue=6, archived_through=5` after this run. `/home/z/my-project/.secrets/digest-state.json` is the source of truth, backup at `/home/z/my-project/upload/digest-state-backup.json`, keeper cron 474950 self-restores the trio daily at 04:21 PT.
- **Price side:** nothing to build until Danny picks from P8 / P9 / P11. P6 (askMedian on the meso.watch row) is Danny's own; do not build it.
- **classicrank:** do not "fix" the fetcher with UA tricks (decisions.md 10-20). If the daily run goes green again, note it in the worklog; if Danny picks the key path, the secret goes to the sandbox secrets path like the others.
- **Do not** re-add the digest offer-on-check-in block (retired, decisions log 10-25); any src/ commit ships its changelog card in the same push.

## Reading list

`docs/ai/overnight-price-audit-2026-10-26.md` (proposals + findings) · `docs/ai/digest-contract.md` + `docs/ai/discord-digest-runbook.md` · `docs/ai/design.md` (read before any UI/copy change) · `docs/ai/decisions.md` (grep before proposing; 10-26 lines: English-only on Discord surfaces, P1-P5 approved / P6 Danny's) · `docs/ai/agent-mailbox.md` § Open (T-06 thread, claim/lease protocol).
