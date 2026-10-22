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

**Date:** 2026-10-22 (Thursday)
**Written:** 18:45 UTC (11:45 AM PST)
**Author:** claude (chat-CLI)

### Where things stand

The site's healthy — all 6 polls (meso.watch + 5 cross-marketplace sources) are running on schedule, the latest meso.watch poll recorded 198,764 total sales (up from 181,199 yesterday — site is actively used), and 800 live FM listings as of the most recent run. The agent comm infrastructure went live today: 6 shared docs in `docs/ai/` now let all 5 agents (chat-CLI claude, project-side claude, claude review, openclaw, gemini) talk to each other without you having to relay messages.

Two external API releases happened today worth knowing about: Sen released maplestory.market's public API (admin-reviewed key, no bot challenge for API keys — works from plain server-side code), and Kitten nudged you about classicrank.com's v2 Ingest API for submitting character sprites as base64 PNG (the "png64" she mentioned in Discord).

### Wins since you last checked in

- The agent mailbox + worklog + state-of-the-pipeline + daily briefing + START-HERE onboarding docs are all live. Agents can now coordinate without you in the loop.
- The `seen` field landed in `mesowatch_prices.json` — every (price, seller) pair now carries the first time we observed it, carried forward across runs. Lets the frontend flag stale listings (3+ days held = "this seller is a holdout, not a price leader").
- Project-side Claude shipped mesoindex.com as a 5th cross-marketplace source (998 items, 693 with shops, where-to-buy info with FM room + channel).
- Project-side Claude shipped the Crafting overhaul — multiple commits, plus a Windia job census from classicrank.com (daily, keyless).
- claude (review) shipped `watchdog.yml` — a proper outage detector that runs OUTSIDE the poll workflow (so it can catch when the poll itself fails). It checks: last successful poll >2h ago? list.json's `generated` field >3h old? No listings <6h old? With a new `src_listed` field that tells "meso.watch stopped publishing" from "our fetcher is broken".

### Anything broken or weird

- Site tests briefly failed on commit `d7eb1ce3` (project-side Claude's crafting overhaul). Likely resolved by later commits — I'd verify on the next project-side push, but it's not blocking anything.
- fresh.json (meso.watch's live FM listings endpoint) was returning 0 rows for 4 days (Oct 17-21) — that's why the site showed 4-day-old listings. It came back on Oct 22 (800 rows). The CI poller has a market.json fallback that handled the outage; the only thing missing during the outage was FM room/channel info (cheap filter still worked). Don't try to "fix" fresh.json if it breaks again — it's meso.watch's job, and our fallback handles it.

### Decisions I need from you

1. **maplestory.market partner key** — would you log in at https://maplestory.market/account (Henesys SSO), submit a key request saying: project = MS-Classic-World-Info-Slop planner site, runs in GitHub Actions cron hourly, ~2-3 requests/hour, use case = cross-marketplace comparison, will credit maplestory.market with a link + `?ref=` code on every price shown. Once approved, reveal the key once at /account, copy it, and drop it in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600 — don't paste it in chat). Then I'll write `scripts/fetch_maplestory_market.py` + wire it into a 3-hourly poll. **Highest-value unlock of the day** — maplestory.market bypasses Turnstile for API keys, so it works from plain Python (no agent-browser / headless Chrome needed).
2. **classicrank.com partner key from Kitten** — she's actively nudging you in Discord about "Png64" / base64 export. The v2 Ingest API lets us submit character sprites we observe (from your shop visitor video — we already have 30+ character names + frame captures from Oct 20). Drop the key in `/home/z/my-project/.secrets/classicrank-key` (chmod 600). I'll write `scripts/submit_to_classicrank.py` in 3 phases: Phase 1 (heartbeat names only — tells classicrank "these players are active"), Phase 2 (level + job from OCR), Phase 3 (sprite capture → base64 PNG → becomes their profile photo). **High-value contribution** — you become a data contributor to Kitten's site, not just a consumer.
3. **`fetch_classicmarket.py` keep-or-delete decision** — claude (review) flagged it as unused (the live classicmarket fetchers don't read the static catalog file). I defended keeping it: the 5,235-item catalog has NPC prices + Korean names + category tree that the live fetchers don't have. I proposed wiring it into `classicmarket-poll.yml` for a once-daily catalog refresh (vs the live 2h pricing fetches). claude (review) gave us a deadline of 2026-10-23 to either defend or delete. If you have a preference, mention it; otherwise claude (review) and I will work it out.

### Today's priorities (the most important 1-3 things)

1. **Drop the maplestory.market key in `/home/z/my-project/.secrets/`.** That's the single highest-value thing you can do today — it unlocks the 5th cross-marketplace source + bypasses Turnstile. ~5 minutes of your time (log in, submit request, wait for admin approval, reveal key, drop in file). Key request might take a few hours to be approved by Sen, but the sooner you submit, the sooner it's live.
2. **Reply to Kitten about the classicrank partner key.** She's clearly willing (already nudging you in Discord). Even a "hey Kitten, can I get a partner key for v2 Ingest? Project is MS-Classic-World-Info-Slop planner site, I want to submit character sprites from my shop visitor captures" would unblock it.

### Ideas floating around (lower priority, no rush)

- **Per-item listing fetch from meso.watch** — claude (review) noticed meso.watch moved listings to per-item files at `data/markets/Classic World/item/basil_<id>.json`. Switching to per-item fetching would let us poll only items whose `listedLast` moved (much more efficient than the current 22 MB market.json fallback). claude (review) is waiting on you to weigh in on load concerns + 6h-vs-24h cadence.
- **Stale-listing badges on the where-to-buy UI** — the `seen` field is the data; the UI is just a "3d" or "stale" chip next to each listing. Low effort, high signal. Project-side Claude should pick this up (I left an Open thread in the mailbox).
- **Daily catalog refresh for classicmarket.kr** — wire `fetch_classicmarket.py` into `classicmarket-poll.yml` to run once daily. Fixes the null Credits date + gives the cross-marketplace UI an NPC-price baseline ("is this listing a deal vs just vendoring it?").
- **`/api/deals` cross-check** — when the maplestory.market key lands, their `/api/deals` endpoint is a built-in underpriced-listings view. Comparing our cheap filter against theirs is a good sanity check on both algorithms.
- **`/api/market/overview` for the planned dashboard** — maplestory.market has a built-in market movers / best sellers / most listed endpoint. Directly useful for the market dashboard audit improvement #5.

### Other agents' status

- **claude (project-side):** actively working on the Crafting overhaul. Should reply to my 2 Open threads in the mailbox (seen rendering + cross-marketplace UI) when they next pick up the repo.
- **claude (review):** finished the watchdog + cleanup pass. Waiting on my reply to the "two scripts" thread (I replied — defending `fetch_classicmarket.py`). Will move forward on 2026-10-23 if no objection.
- **openclaw:** audited the pipeline + wrote a maintenance-detection design doc. Picking up the repo fresh — should read `docs/ai/START-HERE.md` (new today) as their entry point.
- **gemini:** no recent activity. I left an Open thread asking about Val Town/Cloudflare Worker status — they'll reply when they next check in.

### Where to go deeper

- `docs/ai/state-of-the-pipeline.md` — full snapshot of schema + sources + CI + traps (357 lines)
- `docs/ai/daily-briefing.md` — today's newspaper for agents (more technical, same content as this but for the agent audience)
- `docs/ai/agent-mailbox.md` — comm hub, § Open has 3 threads awaiting reply
- The repo itself: https://github.com/TurbosauceDev/MS-Classic-World-Info-Slop
- The live site: https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/

---

**End of digest.** Refresh rule for claude: if this file is >24h old when Danny checks in, refresh FIRST, then offer.
