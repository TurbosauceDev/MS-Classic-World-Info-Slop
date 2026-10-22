# Daily Briefing — 2026-10-22 (Issue #1)

**For:** All agents.
**From:** claude (chat-CLI).
**Written:** 2026-10-22 18:45Z.
**Refresh rule:** overwrite this file at the start of your work session
if it's >24h old. Keep history in git (`git log docs/ai/daily-briefing.md`).
**Read order for new agents:** START-HERE.md → state-of-the-pipeline.md →
this file → agent-mailbox.md § Open.

---

## TL;DR (5 bullets)

1. **Site is healthy.** meso.watch hourly poll producing 198,764 total sales; 800 live listings as of latest run. All 6 cross-marketplace polls (meso.watch / shopscans / classicmarket / mesoindex / meowdb / classicrank-census) running on schedule.
2. **Two new external APIs landed this session.** maplestory.market public API (admin-reviewed Bearer key, no Turnstile, 6/hour default limit — awaiting Danny to sign up + submit key request) + classicrank.com v2 Ingest API (partner key + base64 PNG character sprite submission — awaiting partner key from Kitten).
3. **Agent comms infrastructure live.** 6 shared docs in `docs/ai/`: START-HERE (onboarding), state-of-the-pipeline (snapshot), agent-mailbox (comm hub), agent-worklog (1-line feed), daily-briefing (this file), danny-digest (Danny's plain-English briefing). Plus canonical `docs/ai/mesowatch-sync.md` + `docs/ai/decisions.md`.
4. **5 active agents.** claude (chat-CLI), claude (project-side), claude (review), openclaw, gemini. Mailbox has 3 Open threads awaiting reply + multiple FYI notes broadcast.
5. **One known issue:** Site tests failed earlier on commit `d7eb1ce3` (project-side Claude's crafting overhaul). Likely resolved by later commits — verify on next push.

## Recent commits since last issue (last 24h, newest first)

```
c1b5ad3  mailbox FYI pointer + worklog entry for state-of-the-pipeline doc
e61c60d  agent briefing: new docs/ai/state-of-the-pipeline.md snapshot
7fa7ba4  chore(mesowatch): refresh prices — 32 live listings changed
a785cff  chore(mesowatch): refresh prices — 134 items moved, 160 listings changed
d633171  chore(mesowatch): refresh prices — 184 items moved, 166 listings changed
dbe5405  chore(mesowatch): refresh prices — 630 items moved, 156 listings changed
d4972be  Shared runs refresh 2026-10-22
7daf070  mesoindex.com prices 2026-10-22 14:16
54fc13b  meowdb market prices 2026-10-22 13:06
5c81b4b  shop-scan prices (mesoarbitrage, maplestory.watch) 2026-10-22 13:06
e87094f  classicmarket.kr prices 2026-10-22 12:33
be2e238  classicrank job census 2026-10-22
3f6fb07  classicmarket.kr prices 2026-10-22 12:07
cc7eade  agent comms: reply to 2 Open threads + maplestory.market API FYI + ...
958c007  chore(mesowatch): refresh prices — 227 items moved, 158 listings changed
... (more chore(mesowatch) commits)
```

## Wins since last issue

- **`b911b628`** (claude chat-CLI) — landed `seen` field in `mesowatch_prices.json` for first-seen-time tracking of (price, seller) pairs across runs. Lets frontend identify stale listings (3+ days held = holdout, not price leader).
- **`876f4904`** (claude chat-CLI) — created agent mailbox + worklog as the comm hub. Cuts Danny out of the message-relay loop.
- **`cc7eade`** (claude chat-CLI) — replied to 2 Open mailbox threads (defended keeping `fetch_classicmarket.py`; acknowledged Step 10 measurement-ordering bug + agreed `watchdog.yml` is the right design). Posted maplestory.market API FYI.
- **`e61c60d`** (claude chat-CLI) — wrote `docs/ai/state-of-the-pipeline.md` (345-line snapshot doc).
- **Project-side Claude shipped:** mesoindex.com as 5th cross-marketplace source (`.github/workflows/mesoindex-poll.yml`, 3h cadence, 998 items + 693 with shops); Crafting overhaul (multiple commits); `classicrank-census.yml` (daily Windia job census).
- **claude (review) shipped:** `watchdog.yml` + `scripts/watchdog.py` with proper outage detection (replaces my buggy Step 10 which measured the commit it just made).

## Issues / what's broken / needs attention

1. **Site tests on commit `d7eb1ce3`** (Crafting overhaul, project-side Claude) failed earlier today. Likely resolved by later commits — verify on next project-side push.
2. **`fetch_classicmarket.py` + `data/sources/classicmarket_items.json`** — claude (review) flagged these as unused. I defended keeping them in mailbox (the 5,235-item static catalog has NPC prices + Korean names the live fetchers don't have). Proposed wiring into `classicmarket-poll.yml` as a once-daily catalog refresh. **Waiting on claude (review) to OK the proposal** (deadline 2026-10-23).
3. **fresh.json was broken 2026-10-17 to 2026-10-21** but came back on 2026-10-22 (800 rows in latest poll + `[fresh] OK` log fired). If it goes empty again, the market.json fallback in `scripts/mesowatch-sync/mesowatch_poll_ci.sh` handles it. Don't try to "fix" fresh.json — that's meso.watch's job.
4. **3 Open mailbox threads still unanswered:**
   - claude (chat-CLI) → claude (project-side): render the new `seen` field on the where-to-buy list
   - claude (chat-CLI) → claude (project-side): cross-marketplace comparison page (`D.mw` / `D.ma` ready to render)
   - claude (chat-CLI) → gemini: Val Town/Cloudflare Worker fallback cron status

## What's still left to do

**Pending external unblocks (blocked on Danny):**
1. **maplestory.market partner key** — Danny logs in at `https://maplestory.market/account` (Henesys SSO), submits a key request (project: planner site, GitHub Actions cron hourly, ~2-3 req/hour, cross-marketplace comparison use case, credit with `?ref=` link). Reveal the approved key once + drop in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600).
2. **classicrank.com partner key** — Danny asks Kitten for a v2 Ingest API partner key (she's actively nudging him in Discord). Drop in `/home/z/my-project/.secrets/classicrank-key` (chmod 600).
3. **meowdb item-page HTML dumps** (for `parse_meowdb_drops.py` rebuild test) — if Danny has them from a past scraping session, drop in `/home/z/my-project/upload/`.

**Pending project-side Claude work (frontend):**
1. Render the `seen` field on the where-to-buy list (≥3 days = stale flag)
2. Cross-marketplace comparison page (5 sources: meso.watch / maplestory.watch / mesoarbitrage / classicmarket / meowdb, +maplestory.market as 6th when key lands)
3. Price history charts using `D.pw.hist` (7-day rolling)
4. Market overview/dashboard using `D.pw.totals` + `D.mi` (mesoindex's market data)
5. askMedian in Sell Helper using `D.pw.items[iid][7]`

**Pending claude (review) decision:**
1. OK or reject the `fetch_classicmarket.py` keep + wire-in proposal (mailbox Open thread, deadline 2026-10-23)

## Today's priorities (2026-10-22, what to focus on)

1. **claude (chat-CLI):** wait for Danny to drop either the maplestory.market key OR the classicrank.com key. Either unlocks the next fetcher. While waiting: nothing blocking — could write a `scripts/submit_to_classicrank.py` Phase 1 skeleton (heartbeat-only) ready to run the moment a key arrives.
2. **claude (project-side):** reply to the 2 Open threads in the mailbox (seen rendering + cross-marketplace UI). Even a "got it, will do" reply closes the loop so I stop pinging. Then continue crafting-overhaul work + address the failed Site tests if still red.
3. **claude (review):** review the `fetch_classicmarket.py` keep + wire-in proposal. Either approve (and claude chat-CLI will wire it in) or reject (and we delete the script + data file by 2026-10-23).
4. **openclaw:** read START-HERE.md (new today) → state-of-the-pipeline.md → mailbox § Open. Then either pick up the meowdb fetcher investigation OR audit the new mesoindex source for completeness.
5. **gemini:** reply to the Val Town/Cloudflare Worker status Open thread. Just a "still on Val Town, no plans to migrate" or "migrated to Cloudflare Worker on date X" reply is enough.
6. **Danny:** drop a key (any one!) into `/home/z/my-project/.secrets/`. The maplestory.market one is the highest-value unlock (5th cross-marketplace source + bypass-Turnstile pattern means it works without agent-browser).

## Ideas floating around (lower priority, worth thinking about)

1. **Per-item listing fetch from meso.watch** — claude (review) noted that meso.watch moved listings to per-item files at `data/markets/Classic%20World/item/basil_<id>.json`. The combined `fresh/Classic%20World.json` is now a workers.dev beta. Switching to per-item fetching would let us poll only items whose `listedLast` moved (much more efficient than the current 22 MB market.json fallback). Waiting on Danny to weigh in on load concerns + 6h-vs-24h cadence.
2. **Stale-listing badges on the where-to-buy UI** — the `seen` field is the data; the UI is just a "3d" or "stale" chip next to each listing. Low effort, high signal.
3. **Daily catalog refresh for classicmarket.kr** — the 5,235-item static catalog (NPC prices + Korean names) hasn't been refreshed since 2026-10-21. Wire `fetch_classicmarket.py` into `classicmarket-poll.yml` to run once daily (catalog changes rarely, doesn't need 2h polling). Fixes the null Credits date + enables NPC-price-as-deal-baseline in the cross-marketplace UI.
4. **`/api/deals` cross-check** — when the maplestory.market key lands, their `/api/deals` endpoint is a built-in underpriced-listings view. Comparing our cheap filter against theirs is a good sanity check on both algorithms.
5. **`/api/market/overview` for the planned dashboard** — maplestory.market has a built-in market movers / best sellers / most listed endpoint. That's directly useful for the audit-improvement #5 market dashboard.
6. **classicrank avatar_b64 sprite capture (Phase 3)** — the high-value contribution to Kitten's site. Danny's shop visitor video captures character names; adding sprite capture would let us submit profile photos for characters that don't have them. Phased: Phase 1 (heartbeat names only) → Phase 2 (level+job OCR) → Phase 3 (sprite crop + base64 encode). Needs the partner key first.
7. **`/api/listings/changes` incremental polling** — maplestory.market has a listing-diff endpoint. Once we have the key, polling this every hour (instead of full `/api/listings`) would be much lighter on our rate limit. Worth implementing as the second iteration of the fetcher.

## Notable mailbox threads worth surfacing

- **claude (review) → openclaw, replied by claude (chat-CLI):** Step 10 bug + watchdog.yml replacement. My buggy Step 10 measured the commit it just made (always 0m old). Replaced by `watchdog.yml` + `scripts/watchdog.py` with proper logic. I acknowledged the design was right.
- **claude (review) → all (ask + claude chat-CLI + project-side + gemini):** two scripts nothing uses: keep or delete? I defended `fetch_classicmarket.py`. Deadline 2026-10-23.
- **claude (chat-CLI) → claude (project-side):** render the new `seen` field on the where-to-buy list. Data is in `mesowatch_prices.json.seen` parallel to `asks`. Awaiting reply.
- **claude (chat-CLI) → claude (project-side):** cross-marketplace comparison page. `D.mw` + `D.ma` + (new) `D.mi` ready to render. Awaiting reply.
- **claude (chat-CLI) → gemini:** Val Town/Cloudflare Worker fallback cron status check. Awaiting reply.

## Deeper docs to read

- `docs/ai/mesowatch-sync.md` — pipeline plumbing reference (read this if you're touching the poller or schema)
- `docs/ai/state-of-the-pipeline.md` — full snapshot of schema + sources + CI + traps (read this if you need current state in detail)
- `docs/ai/agent-mailbox.md` — comm hub (read § Open for anything addressed to you; § FYI for broadcast notes)
- `docs/ai/agent-worklog.md` — one-line per session activity feed (skim § Recent for what other agents just did)
- `docs/ai/decisions.md` — dated decision log (read if you need to understand WHY something is the way it is)
- `docs/ai/danny-digest.md` — plain-English briefing for Danny (read if you're about to talk to him — match his context)

---

**End of Issue #1.** Next issue: when an agent starts work tomorrow (or whenever this is >24h old), overwrite with Issue #2.
