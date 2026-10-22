# State of the pipeline (2026-10-22 18:30Z)

**For:** Any agent picking up the
`TurbosauceDev/MS-Classic-World-Info-Slop` repo right now — claude
(chat-CLI), claude (project-side), claude (review), openclaw, gemini.
**From:** claude (chat-CLI).
**When written:** 2026-10-22 18:30Z (UTC).
**Cadence:** refresh this doc whenever the schema grows, a new source is
added, an external API is integrated, or a critical bug is found. The
canonical plumbing handoff is still `docs/ai/mesowatch-sync.md` — this doc
is the "what's true right now" snapshot, not the how-to-plumb reference.

---

## 1. Snapshot (one paragraph)

The site is healthy. The meso.watch poll runs hourly (6 cron entries at
minute 7,17,27,37,47,57) and produces fresh pricing data with 12
top-level fields in `data/sources/mesowatch_prices.json` (most recently
198,764 total sales recorded). The cross-marketplace fetchers run on
3-hourly cadences: shopscans (maplestory.watch + mesoarbitrage),
classicmarket.kr, meowdb, and the newly-added mesoindex.com. The
classicrank.com daily job census is also wired. Two new external APIs
landed this session: maplestory.market just released a public Bearer-auth
API (admin-reviewed key, 6/hour default limit, no Turnstile for API
keys), and classicrank.com has a v2 Ingest API for partner-key
submissions of character sprites as base64 PNG. Both are pending partner
keys from Danny. The agent mailbox + worklog are live in the repo and
being actively used by 5 agents (see `docs/ai/agent-mailbox.md` § Who's
who).

## 2. Recent activity (last 24h, newest first)

```
7fa7ba4  chore(mesowatch): refresh prices — 32 live listings changed
a785cff  chore(mesowatch): refresh prices — 134 items moved, 160 live listings changed
d633171  chore(mesowatch): refresh prices — 184 items moved, 166 live listings changed
dbe5405  chore(mesowatch): refresh prices — 630 items moved, 156 live listings changed
d4972be  Shared runs refresh 2026-10-22
7daf070  mesoindex.com prices 2026-10-22 14:16
54fc13b  meowdb market prices 2026-10-22 13:06
5c81b4b  shop-scan prices (mesoarbitrage, maplestory.watch) 2026-10-22 13:06
e87094f  classicmarket.kr prices 2026-10-22 12:33
be2e238  classicrank job census 2026-10-22
3f6fb07  classicmarket.kr prices 2026-10-22 12:07
cc7eade  agent comms: reply to 2 Open threads + maplestory.market API FYI + mesowatch-sync notes
958c007  chore(mesowatch): refresh prices — 227 items moved, 158 live listings changed
... (more chore(mesowatch) commits)
```

Notable non-poll commits in this session:
- **`cc7eade`** (claude chat-CLI, just landed) — mailbox replies + maplestory.market API FYI + mesowatch-sync.md updates
- **`876f490`** (claude chat-CLI, earlier) — agent mailbox + worklog created
- **`b911b628`** (claude chat-CLI, earlier) — seen tracking + alt-source wiring + (now-removed) Step 10 freshness check
- **`04faa8d`** (claude review) — watchdog.yml + src_listed + generated fields, removed my buggy Step 10
- **`636d81e`** (claude project-side) — mesoindex.com first fetch (998 items, 693 with shops), features test, built page
- **`e427284`** (claude project-side) — mesoindex.com: Prices row + Where to buy shops (channel, FM room, seller), 3h poll
- **`b1e2160`** (claude project-side) — Windia job census from classicrank.com (daily, keyless) with a Builder card

## 3. Schema state

### `data/sources/mesowatch_prices.json` (12 top-level fields now)

| Field | Shape | Source | Added |
|---|---|---|---|
| `source` | URL string | static | original |
| `read` | `"YYYY-MM-DD"` (UTC date) | list.json `generated_at` | original |
| `generated` | `"YYYY-MM-DD HH:MM"` UTC | list.json `generated_at` (full timestamp, used by `watchdog.py` for freshness) | 2026-10-21 by claude (review) |
| `market` | `"Classic World"` | static | original |
| `items` | `{itemId: [price, p25, p75, sold, flags, trend, sellThrough, askMedian]}` | list.json `items[]` | original + askMedian added 2026-10-21 |
| `hist` | `{itemId: [[date, median, sold], ...]}` (7-day rolling) | list.json `items[].history` | 2026-10-21 |
| `totals` | `{sales, topSale: {itemId, price, qty, total, time, tagNote}}` | list.json `totals` | 2026-10-21 |
| `now` | `{itemId: [priceEach, qty, channel, map, seller]}` (cheapest live listing) | fresh.json OR market.json fallback | original |
| `asks` | `{itemId: [[priceEach, qty, channel, map, seller], ...]}` (ALL listings, sorted) | fresh.json OR market.json fallback | 2026-10-19 |
| `listed` | `"YYYY-MM-DD HH:MM"` UTC timestamp of listings payload | fresh.json OR market.json `generated_at` | original |
| `seen` | `{itemId: [firstSeenUnixMin, ...]}` parallel to `asks` (carried forward across runs) | derived in `fetch_mesowatch.py` | 2026-10-22 by claude (chat-CLI) |
| `src_listed` | `"YYYY-MM-DD HH:MM"` UTC of the listing file's own time (kept even when every listing is dropped — separates upstream outage from our bug) | fresh.json OR market.json `generated_at` | 2026-10-21 by claude (review) |

Sample item: `4010001` (Iron Ore) → `[399, 388, 415, 6735, 0, -0.002, 0.601, 550]`
= [price=399, p25=388, p75=415, sold=6735, flags=0, trend=-0.002, sellThrough=0.601, askMedian=550]

`totals.sales` is currently **198,764** (was 181,199 on 2026-10-21). Note: it's a rolling
window, not monotonic — claude (review) confirmed by sampling 4 poll commits and seeing
181203, 181199, 181202, 181201 (so don't use "sales advanced vs frozen" as a freshness
signal — use `generated` + `src_listed` instead, which is what `watchdog.py` does).

### Cross-marketplace source files in `data/sources/`

| File | Source | Workflow | Cadence | Items | Notes |
|---|---|---|---|---|---|
| `mesowatch_prices.json` | meso.watch | mesowatch-poll.yml | hourly (6 crons) | 982 | primary, has sales + listings |
| `shopscans.json` | combined (maplestory.watch + mesoarbitrage) | shopscans-poll.yml | 3h | varies | written by `fetch_shopscans.py` |
| `maplestorywatch_prices.json` | maplestory.watch | shopscans-poll.yml | 3h | 957 | raw per-source, written by `fetch_alt_sources.py` |
| `mesoarbitrage_prices.json` | mesoarbitrage.com | shopscans-poll.yml | 3h | 983 | raw per-source, written by `fetch_alt_sources.py` |
| `classicmarket_items.json` | classicmarket.kr | (not currently scheduled — see Open thread) | — | 5,235 | static catalog: NPC prices + Korean names |
| `classicmarket_market.json` | classicmarket.kr | classicmarket-poll.yml | 2h | varies | live trade posts |
| `classicmarket_prices.json` | classicmarket.kr | classicmarket-poll.yml | 2h | varies | combined prices |
| `mesoindex.json` | mesoindex.com | mesoindex-poll.yml | 3h | 998 (693 with shops) | NEW: prices + Where to buy shops |
| `meowdb_market.json` | meowdb.com | meowdb-market-poll.yml | TBD | varies | meowdb Free Market summaries + live listings |
| `meowdb_drops.json`, `meowdb_shops.json`, `meowdb_mesos.json`, `meowdb_material_drops.json`, `meowdb_weapon_drops.json` | meowdb.com | various | varies | varies | meowdb's drop/shop/meso tables |
| `shared_runs.json` | shared data | shared-data.yml | varies | varies | shared runs |
| `shopscans.json` (combined) | maplestory.watch + mesoarbitrage | shopscans-poll.yml | 3h | varies | compact cross-source with per-listing details |

### `data/data.json` (the compiled site data)

`build_data.py` is the compiler. Each source contributes a top-level
prefix:

| Prefix | Source | Shape |
|---|---|---|
| `D.pw` | meso.watch (player-shop world) | full mesowatch_prices.json mirror |
| `D.mw` | maplestory.watch | `{read, it: {itemId: [typical, unitsSold14d, lowest, listedNow, dayAgo, lastSeenUnixMin]}, ls: {itemId: [[priceEach, bundle, channel, fmRoom, seller, shopTitle, seenUnixMin], ...]}}` |
| `D.ma` | mesoarbitrage.com | `{read, it: {itemId: [soldMedian, soldN, askMin, listingsSeen, sold72Median, sold72N, lastSeenUnixMin]}}` |
| `D.cmp` | classicmarket.kr market | `{read, it: {itemId: [median, low, high, sold, seen, forSaleNow, day]}}` |
| `D.cit` | classicmarket.kr trade posts | `{read, it: {itemId: [askMin, askMedian, askN, bidMax, bidMedian, bidN]}}` |
| `D.mdb` | meowdb | `{read, it, ls}` (meowdb market) |
| `D.mi` | mesoindex.com (NEW) | prices + Where to buy shops |
| `D.osms` | OSMS game data | `{ref, date}` for "Data last updated" credit |
| `D.ishop`, `D.craft`, `D.mobatk`, `D.mobdb`, `D.wmap`, `D.kpq`, `D.wsrc` | various | game-data tables |

When maplestory.market is integrated, its prefix will be `D.mm`.

## 4. New external APIs this session

### 4.1 maplestory.market public API (Sen, released 2026-10-22 14:38Z)

**Status:** Released. Awaiting partner key from Danny.

**Auth:** `Authorization: Bearer <key>` — admin-reviewed, **NO Turnstile**
for API keys (Turnstile is only for browser sessions via `X-Session`
header + Cloudflare site key `0x4AAAAAAFeOcqFF8IPEiCPM`).

**Rate limit:** 6 requests/hour per key by default. 429 + `Retry-After`
when exceeded. Custom limits on request. Data is intentionally delayed
"a few minutes behind" the live site.

**Confirmed read endpoints (require API key OR session):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/items` | Every item for sale now |
| GET | `/api/items/${id}` | One item's listings + price figures + recent sales |
| GET | `/api/items/${id}/history` | Hourly prices, seen and sold |
| GET | `/api/listings` | Every listing for sale now |
| GET | `/api/listings/changes` | Listing diff endpoint (incremental) |
| GET | `/api/prices` | Each item's established price over the last 3 days |
| GET | `/api/deals` | Listings priced well under their usual price |
| GET | `/api/market/overview` | Market movers, best sellers, most listed |
| GET | `/api/stores` | Stores open now |
| GET | `/api/stores/${id}` | One store + its items |
| GET | `/api/owners/${name}` | Seller's open store + recent stores + sales |
| GET | `/api/owners/${name}/character` | Seller's characters |
| GET | `/api/characters/${name}` | One character |
| GET | `/api/status` | When the newest capture arrived |
| GET | `/api/removals/${name}` | Removal request status |

Plus authenticated user endpoints under `/api/me/*` (Henesys SSO session
required, not API key): key requests, key reveal/roll/revoke, watchlist,
usage stats.

**Terms (in short):**
1. Credit maplestory.market with a link + `?ref=<key-link-code>` on every price shown
2. No bulk resale (showing prices for items your users ask about is fine)
3. Stay within your key's limit + cache what you can
4. Key server-side only, never in a web page's code, don't share
5. Revocable for terms violations

**Integration plan (pending Danny getting a key):**
1. Danny logs in at `https://maplestory.market/account` via Henesys SSO
2. Submits a key request: project = planner site, runs in GitHub Actions cron hourly, ~2-3 requests/hour, use case = cross-marketplace comparison, will credit with `?ref=` link
3. Once approved, reveals the key once at `/account` → copies it
4. Drops the key in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600). Don't paste in chat.
5. claude (chat-CLI) writes `scripts/fetch_maplestory_market.py`:
   - GETs `/api/prices` → writes `data/sources/maplestory_market_prices.json`
   - GETs `/api/status` → logs timestamp for freshness
   - Optionally GETs `/api/listings` + `/api/deals` + `/api/market/overview`
   - Exposes `step(D)` that updates `D.mm` in `data/data.json`
6. Wires into new `.github/workflows/maplestory-market-poll.yml` — 3-hourly at off-minute (13 or 53 — 33 is taken by mesoindex). Same `main-pipeline` concurrency group.
7. project-side Claude renders maplestory.market as 5th source in the cross-marketplace UI.

### 4.2 classicrank.com v2 Ingest API (Kitten — Danny's friend)

**Status:** Partner program exists. Awaiting partner key from Kitten.

**Auth:** `Authorization: Bearer <key>` — partner-only, admin-granted.

**Rate limit:** 60 requests/min per key. Batch entries (up to 100 per request).

**Endpoint:** `POST https://classicrank.com/api/v2/ingest` with JSON body:

```json
{
  "players": [
    {"name": "Kazumi", "level": 87, "job": "Hunter", "fame": 12, "avatar_b64": "<base64 PNG, max 100 KB>"},
    {"name": "gundamharu", "truncated": true, "level": 70, "job": "Fighter", "tag_hint": "gundamharumi", "panel_b64": "<base64 PNG, max 300 KB>"},
    {"name": "Tira"}
  ]
}
```

Three entry types:
- **Full entry** (has `level`): creates or updates the character. Verifies unverified characters.
- **Heartbeat** (name only): updates `last_checked` for a character that already exists.
- **Review**: name held for admin review (look-alike letters, ambiguous cut-off names).

Response: `{ok, upserted, touched, unknown, unverified, review, errors}`.

**Integration plan (pending Danny getting a partner key from Kitten):**

We already have shop visitor captures from 2026-10-20 — a CSV at
`/home/z/my-project/download/shop_visitors_clean_2026-10-20.csv` with 30+
character names + frame numbers. The original video is at
`/home/z/my-project/upload/20261020-2236-48.2209510.mp4` and frames are
extracted to `/home/z/my-project/tmp/shop-frames/`.

Phased plan:
1. **Phase 1 — heartbeat-only** (write once Danny has key): submit just the names as heartbeats. Updates `last_checked` for characters classicrank already knows. Reveals which visitors are `unknown` (not in their DB) — those are the candidates for sprite capture.
2. **Phase 2 — full entry with level + job**: OCR the chat log + character info panel from frames to extract level/job/fame. Full upsert.
3. **Phase 3 — `avatar_b64` sprite capture (the "Png64" Kitten called out)**: extract the character sprite from each frame, encode as base64 PNG (max 100 KB), submit. Becomes their profile photo. This is the high-value contribution — Danny becomes a data contributor, not just a consumer.

Kitten's note in Discord (2026-10-22 14:38Z): "Da key supports exporting the base64 from the site lol" / "Png64 it's in API feed ur clanker my API developer doc XD and it nice werkt so far" / "It doing it fo search" — she's actively nudging Danny to use this.

## 5. Active data sources (full inventory)

| Source | Owner | Type | Workflow | Cadence | Auth | Notes |
|---|---|---|---|---|---|---|
| meso.watch | meso.watch team (Danny's friends) | player-shop prices + live FM listings | mesowatch-poll.yml | hourly (6 crons at minute 7,17,27,37,47,57) | Cloudflare bot challenge (passed via agent-browser headless Chrome) | primary; 982 items + 800 live listings as of 2026-10-22 |
| maplestory.watch | community | crowdsourced shop scans + per-listing seller/shop/FM room info | shopscans-poll.yml | 3h at minute 41 | none (public API) | 957 items; 14-day rolling window |
| mesoarbitrage.com | community | crowdsourced shop scans + NPC prices + 72h/14-day windows | shopscans-poll.yml | 3h at minute 41 | none (public API) | 983 items; 2h anti-abuse hold |
| classicmarket.kr | community | trade posts + market prices + 5,235-item static catalog | classicmarket-poll.yml | 2h | none (public) | catalog (`fetch_classicmarket.py`) currently unscheduled — see Open thread |
| mesoindex.com | community | prices + Where to buy shops (channel, FM room, seller) | mesoindex-poll.yml | 3h at minute 33 | none (public API) | NEW (2026-10-22); 998 items, 693 with shops |
| meowdb.com | community | Free Market summaries + live listings + drop/shop/meso tables | meowdb-market-poll.yml | TBD | none (public) | project-side Claude owns |
| classicrank.com | Kitten (Danny's friend) | character rankings + job census | classicrank-census.yml | daily | none for v1 GET (public) | v2 Ingest API needs partner key — see §4.2 |
| OSMS (game data) | OSMS project | monster/item/quest data | fetch_osms.sh (cached in CI) | on OSMS_REF change | none | game-file baseline; `D.osms` shows ref + date |
| maplestory.market | Sen | market listings + prices + deals + market overview | (PENDING — awaiting partner key) | TBD (3h planned) | Bearer API key | see §4.1 |

## 6. CI workflow state

All workflows share the `main-pipeline` concurrency group (queue, no
cancel) so commits don't race.

Last 8 workflow runs as of 2026-10-22 18:00Z (all green except one noted):

| Workflow | Last run | Conclusion | Notes |
|---|---|---|---|
| meso.watch poll | ~1h ago | success | produced commit `7fa7ba4` (32 listings changed) |
| shopscans poll | ~5h ago | success | produced commit `5c81b4b` |
| classicmarket poll | ~6h ago | success | produced commit `e87094f` |
| mesoindex poll | ~4h ago | success | produced commit `7daf070` |
| meowdb market poll | ~5h ago | success | produced commit `54fc13b` |
| classicrank census | ~6h ago | success | produced commit `be2e238` |
| watchdog | hourly at :13/:43 | success | (no recent failures) |
| Docs check | on every push | success | (passed on `cc7eade`) |
| Site tests | on every push | mixed | see notes below |
| pages | on workflow_run | success | (latest deploy OK) |

**Site tests:** was failing 9m ago on commit `d7eb1ce3` (Crafting overhaul
by project-side Claude) — that was project-side's bug, not mine. Likely
resolved by later commits. If it's failing again, look at the latest commit
message — it's usually project-side Claude's crafting work.

## 7. Open mailbox threads (as of 2026-10-22 18:00Z)

See `docs/ai/agent-mailbox.md` § Open for full text. Summary:

| From → To | Subject | Status |
|---|---|---|
| claude (review) → openclaw | your maintenance/outage detection proposal: review, what got built instead | **replied by claude (chat-CLI)** on 2026-10-22 18:00Z — acknowledged Step 10 bug, agreed watchdog.yml + src_listed is the right design |
| claude (review) → claude (chat-CLI), claude (project-side), gemini | two scripts nothing uses: keep or delete? | **replied by claude (chat-CLI)** on 2026-10-22 18:00Z — defended fetch_classicmarket.py (5,235-item catalog with NPC prices + Korean names), proposed wiring into classicmarket-poll.yml for daily refresh |
| claude (chat-CLI) → claude (project-side) | rendering the new `seen` field on the where-to-buy list | **awaiting reply** |
| claude (chat-CLI) → claude (project-side) | cross-marketplace comparison page — `D.mw` / `D.ma` ready to render | **awaiting reply** |
| claude (chat-CLI) → gemini | Val Town / Cloudflare Worker fallback cron — still on hold? | **awaiting reply** |

## 8. Pending external unblocks (blocked on Danny, not agents)

| Unblock | What's needed | What happens after |
|---|---|---|
| **maplestory.market partner key** | Danny logs in at `https://maplestory.market/account` (Henesys SSO), submits a key request (project: planner site, GitHub Actions cron, ~2-3 req/hour, cross-marketplace comparison, credit with `?ref=` link). Once approved, reveal the key once + drop in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600). | claude (chat-CLI) writes `scripts/fetch_maplestory_market.py` + `.github/workflows/maplestory-market-poll.yml`. Exposes `D.mm` in `data/data.json`. Project-side Claude renders 5th source in cross-marketplace UI. |
| **classicrank.com partner key** | Danny asks Kitten for a v2 Ingest API partner key (she's actively nudging him — see Discord exchange). Drop in `/home/z/my-project/.secrets/classicrank-key` (chmod 600). | claude (chat-CLI) writes `scripts/submit_to_classicrank.py` that reads shop_visitors CSV + submits Phase 1 heartbeats. Phase 2 (level+job OCR) + Phase 3 (`avatar_b64` sprite capture) follow. |
| **meowdb item-page HTML dumps** (for `parse_meowdb_drops.py` rebuild) | Anyone who has meowdb item-page HTML dumps drops them in `/home/z/my-project/upload/` | claude (chat-CLI) wires a rebuild test. (Asked in mailbox Open thread by claude (review) — see §7.) |

## 9. Known issues + traps (current)

1. **fresh.json was broken (2026-10-17 to 2026-10-21)** but came back on 2026-10-22 — the latest poll saw 800 live rows + the `[fresh] OK` health log fired. Don't try to "fix" fresh.json if it goes empty again — the market.json fallback in `scripts/mesowatch-sync/mesowatch_poll_ci.sh` handles it (no FM room/channel info in fallback, but cheap filter still works). The `[fresh] WARNING` log line in `fetch_mesowatch.py` is the canary.
2. **`totals.sales` is NOT monotonic** — it's a rolling window, fluctuates by a few per hour. Don't use it as a freshness signal. Use `generated` (list.json's full timestamp) + `src_listed` (listing file's own time) instead — `watchdog.py` does this correctly.
3. **Chrome silently drops the second blob download** — `agent-browser` eval uses localStorage as transport between eval calls and bash, not blob URLs.
4. **agent-browser eval returns `{}` for unhandled Promise rejections** — always wrap async IIFEs in `try/catch`.
5. **GitHub PATCH is `git/refs/heads/{branch}` (plural `refs`)** — singular returns 404 for PATCH (works for GET).
6. **Git Data API ref updates don't fire `on: push` events** — only `git push` or Contents API does. The CI workflow sidesteps this by doing fetch+build+commit in one workflow.
7. **GitHub Actions cron fires late or silently skips at minute 0 and 30** — that's why we use 6 separate cron entries at minute 7,17,27,37,47,57 (each entry is a separate schedule event).
8. **`seen` field carry-forward depends on the previous `mesowatch_prices.json`** — if you delete the file, all seen timestamps reset to the current run's `listed` time. Don't blow it away.
9. **`scripts/build_data.py prices` needs OSMS data** — CI caches `vendor/osms_datamine_dashboard` (keyed on `OSMS_REF`). If running locally, you need OSMS data present.
10. **`tests/docs.test.js` checks every path in backticks/table cells in `docs/ai/*.md`** — bare filenames without a directory prefix get checked against `BASES` (`scripts/`, `data/`, etc.) — `data/sources/` is NOT in BASES, so generated data filenames must be in `IGNORE`. Run `node tests/docs.test.js` before pushing any doc.
11. **Polls no longer commit `dist/index.html`** (Danny OK'd 2026-10-22) — `pages.yml` + `tests.yml` run `scripts/build.py` themselves. Don't add `dist/` to a poll's `git add`.
12. **`meso.watch` per-item listings moved** to `data/markets/Classic%20World/item/basil_<id>.json` (one file per item, up to 8 listings, newest first) — the combined `fresh/Classic%20World.json` is now a workers.dev beta. The CI poller doesn't yet switch to per-item fetching; if the combined fresh.json goes empty again, that's the next fallback path. (Per claude (review)'s FYI in the mailbox — waiting on Danny to weigh in on load + 6h-vs-24h cadence.)
13. **classicrank.com + meowdb.com still Turnstile-blocked for headless browsers** — for v1 GET rankings + character data, classicrank's API works (no Turnstile on the JSON path). For meowdb, the project-side fetcher bypasses by some method I haven't verified. v2 Ingest API uses Bearer auth + doesn't need Turnstile.
14. **Agent-browser is pinned at `0.39.1` in mesowatch-poll.yml** — the job's token can publish tracker releases. Don't bump without checking.

## 10. What to do next, per agent

### claude (chat-CLI) — me, awaiting keys
1. Wait for Danny to drop `maplestory-market-key` in `/home/z/my-project/.secrets/`. Then write `scripts/fetch_maplestory_market.py` + wire into new `maplestory-market-poll.yml` workflow.
2. Wait for Danny to drop `classicrank-key`. Then write `scripts/submit_to_classicrank.py` Phase 1 (heartbeat-only — read shop_visitors CSV + submit names).
3. When project-side Claude replies to the seen-field rendering Open thread, respond to any follow-up.
4. If gemini replies about Val Town/Cloudflare Worker status, follow up on the fallback cron.
5. If `fetch_classicmarket.py` keep-or-delete decision is "keep + wire in", do the wiring (add to `classicmarket-poll.yml` as a once-daily catalog refresh).

### claude (project-side) — frontend work
1. **Render the `seen` field** on the where-to-buy list (Items page → click item → "Where to buy"). Anything ≥3 days = visually flagged as stale. See Open thread in mailbox.
2. **Cross-marketplace comparison page** — `D.pw` (meso.watch) + `D.mw` (maplestory.watch) + `D.ma` (mesoarbitrage) + `D.cmp`/`D.cit` (classicmarket) + `D.mdb` (meowdb) + `D.mi` (mesoindex) are all available now. Add `D.mm` (maplestory.market) when claude (chat-CLI) writes the fetcher. Suggested: "Markets" tab on Items page or new "Compare" page. Don't show every source for every item — only sources that have data, sorted by freshness.
3. **Price history charts** — `D.pw.hist` is a 7-day rolling window per item. Suggested: inline SVG sparkline on Items page + fuller chart on per-item detail page.
4. **Market overview/dashboard** — `D.pw.totals` exposes `{sales, topSale}`. Suggested: "Market today" widget on home page. For richer dashboard, propose schema growth to Danny first.
5. **askMedian in Sell Helper** — `D.pw.items[iid][7]` is the median of current asking prices. One-line UI addition next to the median sale price.

### claude (review) — recent fixes
1. Read my reply to your "two scripts" thread. If you OK the daily catalog refresh proposal, claude (chat-CLI) will wire `fetch_classicmarket.py` into `classicmarket-poll.yml`.
2. Read my reply to your Step 10 bug thread (acknowledged).

### openclaw — pipeline audits
1. Read my reply in the Step 10 thread — claude (review)'s watchdog.yml is the source of truth for outage detection. My proposal in `docs/design/maintenance-detection.md` had the bugs they called out.
2. Consider auditing the new mesoindex.com source for completeness + freshness.

### gemini — fallback cron
1. Reply to the Open thread about Val Town/Cloudflare Worker status. If GitHub Actions cron starts skipping regularly (watch the `[watchdog]` issues for the signal), revive the fallback cron.

### Danny — external unblocks (only Danny can do these)
1. **maplestory.market partner key** — log in at `https://maplestory.market/account` via Henesys SSO. Submit a key request (project: MS-Classic-World-Info-Slop planner site, GitHub Actions cron hourly, ~2-3 req/hour, cross-marketplace comparison use case, will credit with `?ref=` link). Reveal the approved key once, copy it, drop in `/home/z/my-project/.secrets/maplestory-market-key` (chmod 600).
2. **classicrank.com partner key** — ask Kitten for a v2 Ingest API partner key (she's actively nudging you in Discord). Drop in `/home/z/my-project/.secrets/classicrank-key` (chmod 600).
3. **meowdb item-page HTML dumps** (for `parse_meowdb_drops.py` rebuild test) — if you have them from a past scraping session.

## 11. Canonical pointers

- **`docs/ai/mesowatch-sync.md`** — the canonical meso.watch pipeline handoff. Read first if you're touching the pipeline.
- **`docs/ai/agent-mailbox.md`** — the agent comm hub. Check § Open for messages addressed to you; reply in the same file.
- **`docs/ai/agent-worklog.md`** — one-line-per-session activity feed. Append after each work session.
- **`docs/ai/decisions.md`** — dated decision log.
- **`docs/ai/fixtures.md`** — test image index.
- **`tests/docs.test.js`** — validates every path in `docs/ai/*.md` exists in the repo. Run before any doc push.
- **`scripts/watchdog.py` + `.github/workflows/watchdog.yml`** — the current freshness check (replaced my buggy Step 10).
- **`scripts/fetch_mesowatch.py`** — the schema-defining script for `mesowatch_prices.json`. Any new field starts here.
- **`scripts/mesowatch-sync/mesowatch_poll_ci.sh`** — the actual CI poller. Read this if you need to understand the fetch+build+commit flow.

---

**End of state-of-the-pipeline.** Refresh this doc whenever the schema grows, a new source is added, an external API is integrated, or a critical bug is found. The canonical handoff `docs/ai/mesowatch-sync.md` is for plumbing reference; this doc is for "what's true right now".
