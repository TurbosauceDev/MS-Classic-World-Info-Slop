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

**Date:** 2026-10-23 (Friday)
**Written:** 15:55 UTC (8:55 AM PST)
**Author:** Z.ai

### Where things stand

The site's humming along — every poll workflow ran overnight (meso.watch hourly, classicmarket 2h, mesoindex + shopscans + meowdb 3h, classicrank daily, watchdog hourly). The big news is that project-side Claude shipped 3 of the audit-improvement features I'd been waiting on: price-history sparklines on item pages, a Market-today dashboard with Rising/Falling/Best sellers, and a Market Comparison Index showing every price source side by side. So three of the five audit items I had on my pending-for-frontend list are now done. Also: Danny decided to delete `fetch_classicmarket.py` (the static catalog fetcher) — I'd defended keeping it, but Danny sided with the cleanup argument, so it's gone (commit `cbc82b7`).

One real issue overnight: 2 meso.watch poll runs failed with push-race errors (non-fast-forward push rejection on the shared concurrency group). It's not breakage in the fetcher — it's that the script doesn't have retry logic when its commit loses the race to a concurrent poll. I've diagnosed it in the mailbox + offered to wire up the retry pattern that shopscans-poll.yml already uses.

### Wins since you last checked in

- **Project-side Claude shipped 3 audit features** in commits `2da2851` + `2618ea0` + `06f064e`:
  - **Price sparklines** on item pages (audit #4 — uses `D.pw.hist`, the 7-day rolling history I added to mesowatch_prices.json)
  - **Market today dashboard** with Rising/Falling/Best sellers rows + a slot for maplestory.market overview (audit #5 — uses `D.pw.totals`)
  - **Market Comparison Index** showing every price site side by side (audit #3 — uses `D.pw` + `D.mw` + `D.ma` + `D.cmp` + `D.mdb` + `D.mi`)
- **Danny OK'd the agent board naming convention** — I'm now signed as **Z.ai** (not "claude (chat-CLI)"). Claude Code project threads sign as `Claude Agent : [ID]` (coordinator-assigned T-XX, or last 6 chars of session id if no coordinator).
- **Project-side Claude shipped quality-of-life features**: section landing pages, quest log planner with crafting as a player skill, "Read my screen" live screen share, page-name-in-browser-tab, centered changelog column. Plus a new `docs/ai/site-history.md` for version history.
- **All overnight polls ran clean** — meso.watch produced 8+ commits, classicmarket 5, mesoindex 2, shopscans 2, meowdb 2, classicrank-census 1. (Plus 2 cancelled + 2 failed meso.watch runs — see issues below.)

### Anything broken or weird

- **2 meso.watch poll runs failed overnight** (2026-10-22T19:15Z and 2026-10-22T22:22Z) with `! [rejected] HEAD -> main (non-fast-forward)` push errors. Root cause: another `main-pipeline` workflow (probably another meso.watch run or a classicmarket poll) landed a commit between when this run fetched main + when it tried to push. The script doesn't have retry logic — it just exits 1. I've diagnosed this in mailbox Open thread + offered to wire up the retry pattern. **Easy fix, no data loss** — the next meso.watch run (10 min later) re-fetched + re-committed successfully.
- **5 cancelled meso.watch runs per hour** — that's by design (6 crons/hr in the shared concurrency group, GitHub keeps only 1 pending slot, so 5 are evicted). Not broken, just wasteful (120 cancelled runs/day). Project-side Claude suggested reducing to 2 crons/hr; I lean toward keeping 6 crons/hr but adding push retry instead. Your call.
- **fresh.json is healthy again** — the broken-endpoint issue from last week is fully resolved, latest polls show 800+ live rows + `[fresh] OK` log lines.

### Decisions I need from you

1. **maplestory.market partner key** — still pending. When you get a chance: log in at https://maplestory.market/account (Henesys SSO), submit a key request saying "MS-Classic-World-Info-Slop planner site, GitHub Actions cron hourly, ~2-3 req/hour, cross-marketplace comparison, will credit with ?ref= link", reveal the approved key once + drop in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600). Project-side Claude already left a **slot for maplestory.market** in the Market-today dashboard (commit `2618ea0`), so as soon as the key lands I can wire up the fetcher + the data flows straight into the existing UI.
2. **classicrank.com partner key from Kitten** — still pending. Same plan as before: drop in `/home/z/my-project/.secrets/classicrank-key` (chmod 600), I'll write the Phase 1 heartbeat submitter.
3. **Cron pile-up fix** — your call: (a) reduce meso.watch to 2 crons/hour on minutes nothing else uses (less data, simpler), or (b) let me add push-retry logic to `mesowatch_poll_ci.sh` (keeps 6 crons/hour, handles race properly). I lean (b) but defer to you.

### Today's priorities (the most important 1-3 things)

1. **Drop the maplestory.market key in `/home/z/my-project/.secrets/`.** Still the highest-value unlock — project-side Claude already built the dashboard slot for it. Once the key's in, I write `fetch_maplestory_market.py` (Phase 1: `/api/prices` + `/api/status`), wire it into a 3-hourly poll, and the data flows straight into the Market-today dashboard + the Market Comparison Index without any UI work needed.
2. **Reply to Kitten about the classicrank partner key** if you haven't already. Just a "hey Kitten, can I get a partner key for v2 Ingest? I want to submit character sprites from my shop visitor captures" would unblock it.

### Ideas floating around (lower priority, no rush)

- **Per-item listing fetch from meso.watch** — claude (review) noted listings moved to per-item files at `data/markets/Classic%20World/item/basil_<id>.json`. Switching to per-item fetching would let us poll only items whose `listedLast` moved. Still waiting on you to weigh in on load concerns + 6h-vs-24h cadence.
- **`/api/deals` cross-check** — when maplestory.market key lands, their built-in `/api/deals` endpoint is a sanity check on our cheap filter algorithm.
- **`/api/listings/changes` incremental polling** — maplestory.market has a listing-diff endpoint. Could poll that hourly instead of full `/api/listings` to stay well under the 6/hour rate limit.
- **classicrank avatar_b64 sprite capture (Phase 3)** — once the classicrank partner key + the Phase 1 heartbeat submitter are both working, the next step is to extract character sprites from your shop visitor video frames + submit as base64 PNG. That's the high-value contribution to Kitten's site.
- **Stale-listing badges on where-to-buy UI** — the `seen` field is the data; project-side Claude can render a "3d stale" chip next to each listing. Low effort, high signal. (I left an Open thread asking them — no reply yet.)

### Other agents' status

- **Claude (project-side):** actively shipped 3 audit features + multiple quality-of-life items overnight (price sparklines, market dashboard, market comparison index, quest log crafting, read-my-screen, section landing pages). Likely picking up the crafting overhaul again today.
- **Claude (review):** wrapped up the cleanup pass. Danny OK'd deleting `fetch_classicmarket.py` (commit `cbc82b7`).
- **openclaw:** no recent activity visible in the worklog since 2026-10-21 18:00Z.
- **gemini:** still no reply to the Val Town/Cloudflare Worker status Open thread from yesterday. Will likely reply next time they check in.
- **Claude Agent : FjKBXQ:** posted the sign-as + ID-format rule changes. Acknowledged in mailbox.

### Where to go deeper

- `docs/ai/state-of-the-pipeline.md` — full snapshot of schema + sources + CI + traps (now 12 fields in mesowatch_prices.json; 9 active sources; all polls green except the 2 push-race failures noted above)
- `docs/ai/daily-briefing.md` — today's newspaper for agents (same content as this but for the agent audience)
- `docs/ai/agent-mailbox.md` — comm hub, 2 Open threads I just replied to (cron pile-up + sign-as)
- The repo itself: https://github.com/TurbosauceDev/MS-Classic-World-Info-Slop
- The live site: https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/

---

**End of digest Issue #2.** Next refresh: when you next check in (or tomorrow morning, whichever comes first).
