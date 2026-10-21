# meso.watch sync cheatsheet (for Claude threads)

Automated pipeline that polls `meso.watch` hourly via 6 scheduled GitHub
Actions cron entries (at minute 7, 17, 27, 37, 47, 57 of every hour — the
off-minute marks avoid GitHub's high-load 0/30 schedule-event skips),
regenerates `data/sources/mesowatch_prices.json` from the latest pricing
data, commits to `main` if anything changed, and Pages redeploys
automatically. The chat-CLI trigger (Danny says "refresh") fires the same
workflow on demand for an instant update outside the hourly cadence.

## For future Claude Code threads working on this repo

You're reading this from `docs/ai/mesowatch-sync.md` in the project repo. The
pipeline runs entirely in GitHub Actions (`.github/workflows/mesowatch-poll.yml`)
— no chat-CLI dependency, no PAT in CI, no side branch.

| Context | Where | What it can do |
|---|---|---|
| **GitHub Actions (primary)** | `meso.watch poll` workflow, runs hourly at minute 7, 17, 27, 37, 47, 57 (6 separate cron entries — if GitHub's scheduler skips one, the rest still fire) | Fetches meso.watch, regenerates prices, commits to `main`, Pages redeploys. Uses `GITHUB_TOKEN` (auto-injected). |
| **Chat CLI (manual override)** | Danny's chat tool says "refresh" → triggers `workflow_dispatch` on the same workflow | Same as above, just on-demand instead of scheduled. Uses a PAT in `/home/z/my-project/.secrets/gh-token`. |

The scripts are mirrored in this repo at `scripts/mesowatch-sync/`:
- `scripts/mesowatch-sync/mesowatch_poll_ci.sh` — the actual CI poller (fetches meso.watch, runs `scripts/fetch_mesowatch.py` + `scripts/build_data.py` prices + `scripts/build.py` directly, commits to `main` if changed)
- `scripts/mesowatch-sync/fresh_to_csv.py` — converts fresh.json → CSV (called by the CI poller)
- `scripts/mesowatch-sync/meso_watch_poll.sh` — chat-CLI trigger (1-line wrapper around `workflow_dispatch`)
- `scripts/mesowatch-sync/gh_push_files.py` — Git Data API pusher (supports --file and --delete). Used for one-off file pushes from chat (e.g. this handoff doc update). CI doesn't use it.

**Standing approval** (per Danny, 2026-10-19, reaffirmed 2026-10-20):
CSV/pricing refreshes are pre-approved for push + publish to `main`. You
don't need to ask before the workflow runs or pushes CSV updates. Anything
beyond items pricing + live FM listings (e.g. pulling the per-item sales
ledger, model training, new endpoints) — **ask Danny in-thread first**.

## Data sourcing & licensing — read this first

The meso.watch market.json file carries this notice verbatim:

> Data (c) MesoWatch (meso.watch). Read from public streams by MesoWatch. Not
> licensed for copying, redistribution, resale or model training. No permission
> is granted by access. Contact: contact@meso.watch

**Danny (owner of this repo) is a personal friend of the meso.watch team and
has their explicit verbal OK to ingest the public pricing data into this repo
for the planner site + his own research.** If you (a future Claude thread)
need reassurance, ask Danny in-thread before extending the pipeline beyond
its current scope (CSVs of items pricing + live Free Market listings). Don't
feed the data into model training, don't re-publish it under a different
brand, don't add new endpoints (e.g. per-item sales ledger) without checking
with him first.

## Flow

```
GitHub Actions cron (hourly at minute 7, 17, 27, 37, 47, 57) OR chat-CLI "refresh" trigger
   │
   ▼  .github/workflows/mesowatch-poll.yml
   │     1. checkout main (full history for git show HEAD:...)
   │     2. setup Node 22 + Python 3.12
   │     3. pip install Pillow (for scripts/squash_images.py)
   │     4. npm install -g agent-browser + agent-browser install --with-deps
   │     5. actions/cache@v4 restore vendor/osms_datamine_dashboard (keyed on OSMS_REF)
   │     6. bash scripts/fetch_osms.sh (only if cache miss)
   │     7. run scripts/mesowatch-sync/mesowatch_poll_ci.sh:
   │        a. agent-browser: open https://meso.watch, pass Cloudflare
   │        b. fetch /data/list.json (v2, hourly, 1.7 MB) + /data/fresh/Classic World.json
   │           (stored in localStorage to sidestep Chrome's broken 2nd-blob-download bug)
   │        c. IF fresh.json is empty (returns 0 rows, broken since 2026-10-21),
   │           fetch /data/market.json (22 MB) and convert its per-item `listings`
   │           field into the same CSV shape — map/room/channel are empty in this
   │           fallback, but seller + price + qty + stock are preserved.
   │        d. extract localStorage values to /tmp/mesowatch-ci/tmp/
   │        e. python3 scripts/fetch_mesowatch.py list.json fresh.csv
   │           → updates data/sources/mesowatch_prices.json (with now/asks/seen/listed)
   │        f. fetch_mesowatch.py logs a [fresh] WARNING if the listings CSV has no
   │           map info (i.e. fresh.json was empty and the fallback was used).
   │        g. git diff --quiet -- data/sources/mesowatch_prices.json → if no change, exit
   │        h. python3 scripts/build_data.py prices  →  updates data/data.json
   │        i. python3 scripts/build.py  →  rebuilds dist/index.html
   │        j. python3 scripts/mesowatch_claude_review.py  →  templated commit message
   │        k. git commit -F /tmp/commit_msg.txt + git push origin HEAD:main
   │           (commits as 'meso.watch helper <actions@github.com>')
   │   │
   ▼  .github/workflows/pages.yml
   │     workflow_run trigger: fires when 'meso.watch poll' completes
   │     → assembles site/index.html from dist/index.html
   │     → uploads to GitHub Pages → live site updates
   │
   ▼
https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/
   shows new prices within ~90s of the cron tick (or "refresh" trigger)
```

## Schema (data/sources/mesowatch_prices.json)

Top-level fields:

| Field | Shape | Source | Added |
|---|---|---|---|
| `source` | URL string | static | original |
| `read` | `"YYYY-MM-DD"` (UTC date of `generated_at`) | list.json `generated_at` | original |
| `market` | `"Classic World"` | static | original |
| `items` | `{itemId: [price, p25, p75, sold, flags, trend, sellThrough, askMedian]}` | list.json `items[]` | original + askMedian added 2026-10-21 |
| `hist` | `{itemId: [[date, median, sold], ...]}` (7-day rolling) | list.json `items[].history` | added 2026-10-21 |
| `totals` | `{sales, topSale: {itemId, price, qty, total, time, tagNote}}` | list.json `totals` | added 2026-10-21 |
| `now` | `{itemId: [priceEach, qty, channel, map, seller]}` (cheapest live listing) | fresh.json OR market.json fallback | original |
| `asks` | `{itemId: [[priceEach, qty, channel, map, seller], ...]}` (ALL listings, sorted by price) | fresh.json OR market.json fallback | added 2026-10-19 |
| `listed` | `"YYYY-MM-DD HH:MM"` UTC timestamp of listings payload | fresh.json OR market.json `generated_at` | original |
| `seen` | `{itemId: [firstSeenUnixMin, ...]}` parallel to `asks` — first time we observed each (price, seller) pair, carried forward across runs | derived in `fetch_mesowatch.py` from prev `mesowatch_prices.json` | added 2026-10-22 |

The `seen` field lets the frontend identify stale listings — a seller who's been
asking the same price for 3+ days is likely a holdout, not a price leader. Carry-forward
is done by reading the previous `mesowatch_prices.json`'s `seen` + `asks` arrays and
matching (price, seller) tuples. If a (price, seller) pair is new, the current `listed`
timestamp is used as the first-seen time.

## File map (Danny's chat-CLI sandbox at /home/z/my-project/)

These paths exist only on Danny's chat-CLI sandbox, not in the repo. They're
listed here for debugging when Danny says "refresh" and something goes wrong.
Paths are absolute (start with `/`) so `tests/docs.test.js` skips them.

| Sandbox path | Role |
|---|---|
| `/home/z/my-project/.secrets/gh-token` | Fine-grained PAT, scoped to this repo. chmod 600. Used only by the chat-CLI trigger script (CI uses GITHUB_TOKEN). |
| `/home/z/my-project/scripts/meso_watch_poll.sh` | Chat-CLI trigger — 1-line wrapper around workflow_dispatch. Mirror of `scripts/mesowatch-sync/meso_watch_poll.sh` in the repo. |
| `/home/z/my-project/scripts/gh_push_files.py` | Git Data API pusher (supports --file and --delete). Used for one-off file pushes from chat (e.g. this handoff doc update). Mirror of `scripts/mesowatch-sync/gh_push_files.py` in the repo. CI doesn't use it. |
| `/home/z/my-project/tmp/last_market_at.txt` and `/home/z/my-project/tmp/last_fresh_at.txt` | (Legacy) State files from the old chat-CLI poller architecture. Not used by the new CI workflow — CI uses `git diff` against existing `data/sources/mesowatch_prices.json` instead. Kept for historical reference. |
| `/home/z/my-project/worklog.md` | (Legacy) Append-only run log from the old chat-CLI poller. Not used by the new CI workflow. |

## How to invoke

**Primary path (autonomous, no human needed):** GitHub Actions hourly
cron fires the workflow at minute 7, 17, 27, 37, 47, 57 (6 separate entries —
GitHub's scheduler sometimes skips a single entry during high-load periods,
so 6 entries at different minutes make a skip nearly impossible). This is
Danny's preferred path — the pipeline is meant to run unattended. No chat
trigger, no manual intervention. ~60s after each cron tick, the workflow has
fetched meso.watch, regenerated prices, committed to `main` (if anything
changed), and Pages has redeployed.

**Manual override (chat "refresh"):** say any of `refresh`, `update mesowatch`,
`meso.watch update please` in chat. Claude runs
`/home/z/my-project/scripts/meso_watch_poll.sh`, which fires
`workflow_dispatch` on the same workflow. Same end result, just on-demand
outside the hourly cadence. Use this for instant updates (e.g., you just
saw a price change on meso.watch and don't want to wait for the next tick),
or for testing when you've changed something in the pipeline.

**Manual trigger via UI:** https://github.com/TurbosauceDev/MS-Classic-World-Info-Slop/actions/workflows/mesowatch-poll.yml
→ click "Run workflow" button → pick branch `main` → click "Run workflow".
Uses your GitHub session auth (no PAT needed). Same as the chat trigger,
just from the browser instead of chat.

## Token rotation

The PAT was pasted in chat once (chat logs are the exposure surface). To rotate:

1. Revoke the old token at https://github.com/settings/personal-access-tokens
2. Generate a new fine-grained PAT: owner=TurbosauceDev, repo=MS-Classic-World-Info-Slop, expiration 30-90d,
   Contents: Read and write, Workflows: Read and write, Actions: Read and write.
   All other permissions: No access.
3. Write it to `/home/z/my-project/.secrets/gh-token` (just the token string,
   no quoting). DO NOT paste in chat — overwrite the file directly.

## Traps (real bugs we hit; do not regress on these)

- **Chrome silently drops the second blob download.** If you `a.click()` two
  blob URLs in the same page session back-to-back, the second one never saves.
  Workaround: store the data in `localStorage` inside the eval, then read it
  back via `agent-browser storage local <key>`. See `scripts/mesowatch-sync/mesowatch_poll_ci.sh`.
- **agent-browser eval returns `{}` for unhandled Promise rejections.** Always
  wrap async IIFEs in `try { ... } catch (e) { return 'ERR ' + e.message; }`.
- **GitHub PATCH endpoint is `git/refs/heads/{branch}` (plural `refs`).** The
  singular `git/ref/heads/{branch}` works for GET but returns 404 for PATCH.
  Don't URL-encode the slash in `main` (or any branch name) either — GitHub
  treats the encoded form as a different branch name.
- **meso.watch's market.json is Cloudflare-cached.** Cache-busting with
  `?v=<timestamp>` does NOT help — the file genuinely is only regenerated
  once a day. The live listings endpoint `fresh/Classic%20World.json` updates
  roughly every 15 min (when working). Don't expect both payloads to advance
  on the same cadence.
- **fresh.json has been returning 0 rows since the 2026-10-21 list.json switch.**
  meso.watch appears to have deprecated `fresh/Classic%20World.json` when
  introducing list.json v2 (the new combined endpoint). The CI poller now
  falls back to `market.json`'s per-item `listings` field — it has seller +
  price + qty + stock but no FM room/channel info. `fetch_mesowatch.py` logs
  a `[fresh] WARNING` line to stderr whenever the fallback is detected
  (by checking whether the listings CSV has any rows with a non-empty `map`
  column — market.json fallback has 0, real fresh.json has 287+).
- **Git Data API ref updates don't fire push events.** Only `git push` via
  HTTPS/SSH or the Contents API does. This bit us when the chat-CLI poller
  pushed CSVs to a side branch and expected the workflow's `on: push` trigger
  to fire — it didn't. The new architecture sidesteps this by running the
  fetch+build+commit all inside one workflow.
- **`window.__foo` set in one `agent-browser eval` call is not reliably visible
  to a later eval call.** Each eval should re-fetch its own data instead of
  reading a window variable set by a previous eval. (localStorage sidesteps
  this — localStorage IS persistent across evals in the same session.)
- **`scripts/build_data.py` partial rebuild needs OSMS data even though only the
  prices step is being run.** `python3 scripts/build_data.py prices` imports
  `scripts/analyze.py` at module level, which reads
  `/home/z/my-project/vendor/osms_datamine_dashboard/data/current/monsters.json`
  on import. CI workflow runs `bash scripts/fetch_osms.sh` once, then
  `actions/cache` persists the `vendor/osms_datamine_dashboard` directory
  across runs (keyed on `OSMS_REF` env var).
- **GitHub Actions cron fires late or silently skips at minute 0 and 30.** GitHub's
  docs warn: "The schedule event can be delayed during periods of high loads...
  High load times include the start of every hour." Our original cron `0,30 * * * *`
  ran at the worst possible minute — verified by 0 schedule-event runs ever
  in the first ~2 hours after enabling. Now using 6 separate cron entries at
  minute 7, 17, 27, 37, 47, 57 — each entry is a separate schedule event, so if
  GitHub skips one, the others still fire.
- **`seen` field carry-forward depends on the previous `mesowatch_prices.json`.**
  If you delete `data/sources/mesowatch_prices.json` and let the next run
  rebuild from scratch, all `seen` timestamps reset to the current run's
  `listed` time. Don't blow away that file unless you really mean to reset
  seen-time tracking.
- **`tests/docs.test.js` checks that every path mentioned in backticks or
  markdown table cells in `docs/ai/*.md` exists in the repo.** Bare filenames
  like foo.py (without a directory prefix) get checked against `BASES`
  (`scripts/`, `tracker/`, etc.) and fail if they don't match. Always use
  full repo paths (e.g. scripts/mesowatch-sync/foo.py — but only if it exists) or absolute sandbox
  paths (e.g., `/home/z/my-project/scripts/foo.py`) — the latter is skipped
  because it starts with `/`.

## Endpoints polled

| URL | Updates | Size | Fields used |
|---|---|---|---|
| `https://meso.watch/data/list.json` (v2, **primary**) | hourly | 1.7 MB | `generated_at`, `market`, `totals`, `items[].{id,name,price,p25,p75,sold,lowData,unitBasis,trend,sellThrough,askMedian,history}` |
| `https://meso.watch/data/market.json` (v1, **listings fallback**) | ~daily | 22 MB | `generated_at`, `items[].{id,listings[]}` — fetched only when fresh.json returns 0 rows, used to build the listings CSV (no FM room/channel info in fallback) |
| `https://meso.watch/data/fresh/Classic%20World.json` (live FM listings, **currently broken**) | ~every 15 min (when working) | 124 KB | `generated_at`, `rows[].{id,seller,price,qty,stock,map,room,channel,seen,market}` — has been returning 0 rows since the 2026-10-21 list.json switch; the CI poller falls back to market.json's per-item `listings` field |

## Related: cross-marketplace sources

A separate workflow (`.github/workflows/shopscans-poll.yml`, every 3 hours at minute 41)
fetches the two crowdsourced shop-scan sources for cross-marketplace comparison:

| URL | Updates | Output files |
|---|---|---|
| `https://maplestory.watch/api/items` + `/api/item?name=` | 14-day rolling window | `data/sources/maplestorywatch_prices.json` (raw, written by `scripts/fetch_alt_sources.py`) + `data/sources/shopscans.json` (combined, written by `scripts/fetch_shopscans.py` with per-listing seller/shop/FM room info) |
| `https://mesoarbitrage.com/data/prices.json` | 2h anti-abuse hold | `data/sources/mesoarbitrage_prices.json` (raw, written by `scripts/fetch_alt_sources.py`) + `data/sources/shopscans.json` (combined, with NPC prices + 72h/14-day windows) |

`fetch_alt_sources.py` writes the raw per-source files (for the site's data-freshness
panel and human inspection). `fetch_shopscans.py` does the heavier per-item work (fetching
maplestory.watch's per-item listing details with seller + shop + FM room info) and writes
the combined `shopscans.json` that the frontend reads as `D.mw` / `D.ma`.

## Decisions log

See `docs/ai/decisions.md` section `## Data sync (meso.watch → GitHub)` and
`## Architecture consolidation (chat-CLI poller → scheduled CI workflow)` for
dated one-liners on every non-trivial call Danny made on this pipeline.
