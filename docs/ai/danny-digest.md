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
**Written:** 18:15 UTC (11:15 AM PST)
**Author:** Glorg [z.ai]

### Where things stand

Site's healthy — all CI workflows green, every poll on cadence, nothing broken. This is a same-day refresh of digest #3 (written 17:50 UTC): three things landed since then, all housekeeping-plus rather than site features, so the site itself is unchanged (still v0.18.1 with this morning's 4 enhancements).

### Wins since digest #3

- **Golden gate live on the deploy path** (`9beafb5`): `tests/golden.js` now runs inside `pages.yml` pre-deploy, after build and before smoke. A red main can no longer ship a golden regression to production — the 10-21 pattern (4 red builds deployed back-to-back) is now closed at every gate. Verified live: the deploy check on that commit passed with the gate running inside it.
- **Identifier renamed on the agent messageboard** (`183b0a1`): I sign **Glorg [z.ai]** now (was "Z.ai (Discord)") — Who's who, mailbox, briefing, worklog all updated with an old→new mapping note; older posted messages stay as history per the append-only rule.
- **Your daily digest feed is live** (`83f493a`): you created #daily-updates + the webhook; the URL lives sandbox-side only (chmod 600, never committed), and a scheduled job at 09:00 AM your time now rebuilds this digest from the last 24h, pushes the refresh, and posts it to #daily-updates. Quiet days get a one-line heartbeat — no post means something's wrong. This post is today's hand-built issue #4; the first fully automatic one lands tomorrow morning.

### Anything broken or weird

- **Nothing.** All 3 workflows green, all polls on cadence, no watchdog issues. The token scope hiccup from this morning resolved itself once you added the workflow permission — the golden gate push went through on retry.

### Decisions I need from you

1. **maplestory.market partner key** — still the highest-value unlock. Log in at https://maplestory.market/account (Henesys SSO), submit the key request, then drop the key in the sandbox secrets path we discussed. Dashboard slot + MCI column slot are both already built; the fetcher is about an hour of work once the key lands.
2. **classicrank.com partner key from Kitten** — same deal, same secrets path.
3. **Cron pile-up call (from 10-22, still open):** (a) cut meso.watch to 2 polls/hour, or (b) add push-retry logic to the poll script (keeps 6/hour). Z.ai leans (b); either works.
4. **Draft-batch call:** the web instance's unshipped earlier draft (fancier integrity dashboard + CI audit) overlaps what already shipped. Recommendation: keep the shipped simple version, archive the draft.
5. **Web instance's PAT** — you said you'll revoke it; still confirming it's on the list.

### Today's priorities

1. Nothing is on fire — the keys in "Decisions" above are the only unblocks, in that order.
2. The golden gate was the last CI-gating item, so I'm idle per one-feature-per-session. Candidates if you want more: worker `summary()` scaling, mesowatch-poll GH_TOKEN env hardening, per-item MCI agreement panel.

### Other agents' status

- **Z.ai (web):** handed off cleanly; will read the mailbox reply next session. Their PAT revoke is item 5 above.
- **Claude (project-side):** one open UI item from the 10-22 audit batch (the "first seen / stale" badge on where-to-buy listings).
- **Claude (review) / openclaw:** idle. **gemini:** still hasn't replied about the fallback cron.

### Where to go deeper

- `docs/ai/daily-briefing.md` — the agent-facing version (amended today with all three items above)
- `docs/ai/agent-mailbox.md` — the rename FYI + handoff thread
- The live site: https://maplestory.scumlord.studio/

---

**End of digest Issue #4.** Next refresh: automatic, tomorrow 09:00 AM PT (or whenever the file is >24h old at check-in).
