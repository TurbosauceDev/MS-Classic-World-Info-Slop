# Danny's daily digest

> **INSTRUCTION FOR CLAUDE (read this first, top of file):**
>
> When Danny checks in on the project for the first time in a calendar day
> (PST timezone — America/Los_Angeles), OR when his first message in a new
> session is a greeting / status check ("hi", "hello", "morning", "what's
> up", "status", "what's new", "anything happening", "refresh", or similar),
> **offer to show him this digest before doing anything else.**
>
> **How to offer:**
> - One sentence: "Hey Danny — I've got a daily digest ready (a quick
>   plain-English summary of what landed since you last checked in, what's
>   broken, and what needs your attention today). Want me to share it?"
> - If he says yes (or "sure", "ok", "go", "yep"): paste the **Digest
>   body** section below verbatim. Don't summarize or rephrase — paste
>   exactly. It's already written to be readable.
> - If he says no (or "later", "not now", "just doing X"): skip it. Don't
>   paste it later unless he asks.
> - If he asks a specific question first ("hey, did X happen?"): answer
>   the question, then offer the digest at the end if it seems useful.
>
> **Detection trigger (be liberal):** if you're unsure whether to offer,
> offer. The cost of an extra "want the digest?" is low; the cost of Danny
> missing a critical update because you didn't offer is higher.
>
> **Refresh rule for claude:** if this file is >24h old when Danny checks
> in, refresh it FIRST (overwrite with today's content based on the latest
> git log + mailbox + state-of-the-pipeline.md), THEN offer it to Danny.
> The refresh should take ~5 minutes — read the last 24h of `git log
> --oneline origin/main`, skim `docs/ai/agent-mailbox.md` § Open + § FYI,
> skim `docs/ai/agent-worklog.md` § Recent, and write the new digest body.
>
> **Authoritative version:** this file at `docs/ai/danny-digest.md` in the
> repo. Local copy at `/home/z/my-project/download/danny-digest.md` if you
> need to read it without cloning.

---

## Digest body

**Date:** 2026-10-25 (Sunday)
**Written:** 17:50 UTC (10:50 AM PST)
**Author:** Z.ai (Discord)

### Where things stand

The site's in good shape — all CI workflows green, every poll running on cadence, nothing broken. The big news since you last checked in: the 4-enhancement batch you asked Z.ai (web) to build landed on 10-25 and is live on production (v0.18.1). That's a Source-health panel on the Market Comparison Index, a 7-day trend column on MCI, a `@deal` search command in the Ctrl+K bar, and two new CI tests (cross-source data quality + poll cadence). Plus a craftplan test fix — one of its assertions assumed Gold Ingots are always profitable to craft, live prices disagreed, and the test went red; the planner was actually right, so the test now accepts "Nothing to craft" as a correct answer.

Also new today: I'm the Discord surface of the same assistant (you pinged me in `#main`). Z.ai (web) wrote me a handoff, I verified everything from a fresh clone (CI green, live site healthy, all 4 enhancements deployed, full test suite passes locally), you gave me my own repo-scoped PAT, and I took over their top open thread: a sweep for data-dependent test flakes — tests that assert something about live market prices and will false-fail when prices move. Found and fixed 2 more (details in the wins below); everything else checked out properly fixture-based.

### Wins since you last checked in

- **4 enhancements live on https://maplestory.scumlord.studio/** (v0.18.1, built 17:14 UTC today): MCI Source-health panel (flags stale price sources), MCI 7-day trend column, `@deal` Ctrl+K deal-finder, and 2 new CI tests wired in.
- **Site tests are green again** (run #138) — the craftplan fix flipped it after the pre-fix commit's failure (#137).
- **2 more brittle tests hardened** (the same "asserts live prices" class): the crafting page's profit-sort test (now tolerates a market day where no recipe is profitable) and the smoke test that gates every deploy (now only requires the cheap-filter to show rows when the filter could actually have results — an all-equipment listing lull won't false-block deploys anymore).
- **Polls all healthy** — meso.watch hourly, classicmarket 2h, shopscans/meowdb/mesoindex 3h, classicrank census daily. ~378k rolling-window sales tracked.

### Anything broken or weird

- **Nothing.** No watchdog issues, no failed polls since the 10-22 push-race pair (that fix decision is still parked with you — see below).

### Decisions I need from you

1. **maplestory.market partner key** — still the highest-value unlock. Log in at https://maplestory.market/account (Henesys SSO), submit the key request, drop the key in `/home/z/my-project/.secrets/maplestory-market-key`. The dashboard slot is already built — once the key lands, the fetcher is about an hour of work.
2. **classicrank.com partner key from Kitten** — same deal, `/home/z/my-project/.secrets/classicrank-key`.
3. **Cron pile-up call (from 10-22, still open):** (a) cut meso.watch to 2 polls/hour, or (b) add push-retry logic to the poll script (keeps 6/hour). Z.ai leans (b); either works.
4. **Draft-batch call (new today):** Z.ai (web) has an unshipped earlier draft — a more elaborate data-integrity dashboard + CI audit — sitting on their sandbox. It overlaps what already shipped (the data-quality + cadence tests) but is fancier. Recommendation: keep the shipped simple version, archive the draft. If you want the richer Danny-facing dashboard instead, tell them to share it.
5. **Web instance's PAT** — you said you'll revoke it; just confirming it's still on the list.

### Today's priorities (the most important 1-3 things)

1. Nothing is on fire — the keys in "Decisions" above are the only unblocks, in that order.
2. If you want the `pages.yml` golden-gate hardening (a regression test added to the deploy gate so a broken main can't ship — it deployed 4× red back on 10-21), that's landing right after this digest.

### Ideas floating around (lower priority, no rush)

- Per-item listing fetch from meso.watch (poll only what changed) — waiting on your load/cadence call.
- Per-item cross-source price agreement on the MCI page (extends today's Source-health panel).
- Incremental stats tables for the tracker server before it hits 100k runs.
- `/api/deals` cross-check + incremental polling once the maplestory.market key lands.

### Other agents' status

- **Z.ai (web):** handed off cleanly; will read the mailbox reply next session. Their PAT should be revoked (see Decisions).
- **Claude (project-side):** one open UI item from the 10-22 audit batch (the "first seen / stale" badge on where-to-buy listings).
- **Claude (review) / openclaw:** idle. gemini: still hasn't replied about the fallback cron.

### Where to go deeper

- `docs/ai/handoff-to-discord-zai-2026-10-25.md` — what the 4-enhancement batch changed and why
- `docs/ai/state-of-the-pipeline.md` — schema + sources + CI + traps snapshot
- `docs/ai/daily-briefing.md` — the agent-facing version of this digest
- The live site: https://maplestory.scumlord.studio/

---

**End of digest Issue #3.** Next refresh: when you next check in (or tomorrow morning, whichever comes first).
