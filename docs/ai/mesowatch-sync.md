# meso.watch sync cheatsheet (for Claude threads)

Automated pipeline that polls `meso.watch` for new market snapshots, regenerates
two CSVs locally, and pushes them to the `data/mesowatch-sync` branch in this
repo via the GitHub Git Data API (no clone). Runs on Danny's chat-driven
"refresh" trigger (no scheduler in his sandbox — see "How to invoke" below).

## For future Claude Code threads working on this repo

**Cloud project threads: "refresh" = `./scripts/refresh_mesowatch.sh`.** It reads the newest items CSV the poller
pushed to `data/mesowatch-sync`, runs `python3 scripts/fetch_mesowatch.py` -> `python3 scripts/build_data.py prices` ->
`python3 scripts/build.py`, and prints "unchanged" when the market snapshot didn't move. Then the usual site flow (push
on Danny's word, republish the artifact). Cloud threads don't run the poller (no agent-browser, no token there); the
poller pushes, the cloud thread consumes. The site reads the live-listings CSV as D.pw.now (cheapest non-equip listing, docs/ai/site.md "Market data").

You're reading this from `docs/ai/mesowatch-sync.md` in the project repo. The
pipeline runs in a **separate chat-CLI sandbox** (paths under `/home/z/my-project/`)
that you don't have access to from a local Claude Code clone. Two contexts:

| Context | Where | What it can do |
|---|---|---|
| **Chat CLI sandbox** | `/home/z/my-project/` on Danny's chat tool | Run poller, push CSVs, hold token + state files. Danny triggers by saying "refresh" in chat. |
| **Local Claude Code** | Your clone of this repo | Read handoff (this doc), read CSVs from `data/mesowatch-sync` branch, run the scripts locally if Danny asks you to refresh from your side. |

The scripts are **mirrored in this repo** at `scripts/mesowatch-sync/` — same code
as the chat-CLI sandbox, but all paths are parameterized via the `$MESO_WATCH_ROOT`
env var so they work in either context. To run a refresh from a local Claude Code
session:

```bash
# One-time setup on Danny's machine (or your local clone)
export MESO_WATCH_ROOT="$HOME/.meso-watch"
mkdir -p "$MESO_WATCH_ROOT"/{tmp,download,.secrets,scripts}
cp scripts/mesowatch-sync/*.sh scripts/mesowatch-sync/*.py "$MESO_WATCH_ROOT/scripts/"
chmod +x "$MESO_WATCH_ROOT/scripts/"*.sh
# Drop a fine-grained PAT at $MESO_WATCH_ROOT/.secrets/gh-token (chmod 600).
# Scope: this repo, Contents:write only. Get it from Danny — don't paste in chat.
npm install -g agent-browser && agent-browser install --with-deps   # needs Chrome

# Trigger a refresh
bash "$MESO_WATCH_ROOT/scripts/meso_watch_poll.sh"
```

**Standing approval** (per Danny, 2026-10-19): CSV refreshes are pre-approved
for push + publish to `data/mesowatch-sync`. You don't need to ask before
running the poller or pushing CSV updates. Anything beyond items pricing +
live FM listings (e.g. pulling the per-item sales ledger, model training,
new endpoints) — **ask Danny in-thread first**.

If you only need to **read** the latest data (not trigger a refresh), pull
the side branch:
```bash
git fetch origin data/mesowatch-sync
git show data/mesowatch-sync:data/sources/mesowatch_csv/meso_watch_items.csv | head
```

## Data sourcing & licensing — read this first

`https://meso.watch/data/market.json` carries this notice verbatim:

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
meso.watch (Cloudflare-protected SPA)
   │
   ▼  agent-browser (headless Chrome)
   │     1. GET https://meso.watch
   │     2. wait networkidle + 5s settle (pass Cloudflare)
   │     3. eval (try/catch): fetch /data/market.json + /data/fresh/Classic%20World.json in parallel
   │        parse, extract pricing fields per item, stash in localStorage
   │     4. agent-browser storage local <key>  →  stdout (bypasses Chrome's broken 2nd-blob-download)
   │
   ▼  scripts/meso_watch_poll.sh (orchestrator)
   │     - Compare generated_at against /home/z/my-project/tmp/last_market_at.txt + last_fresh_at.txt
   │     - If either advanced: regenerate that CSV via scripts/items_to_csv.py or scripts/fresh_to_csv.py
   │     - If any CSV regenerated: call scripts/gh_push_files.py
   │
   ▼  scripts/gh_push_files.py (Git Data API pusher, no clone)
   │     - GET /git/ref/heads/data/mesowatch-sync  (or create branch from default if 404)
   │     - GET /git/commits/{sha}  →  tree SHA
   │     - POST /git/blobs  (one per file)
   │     - POST /git/trees  (base_tree = current HEAD tree; add the new blobs)
   │     - POST /git/commits  (parent = current HEAD; tree = new tree)
   │     - PATCH /git/refs/heads/data/mesowatch-sync  (force=false → race-safe)
   │
   ▼
data/sources/mesowatch_csv/meso_watch_items.csv          (~340 KB, 1752 items)
data/sources/mesowatch_csv/meso_watch_fresh_listings.csv  (~93 KB, 800 live listings)
```

## File map (Danny's CLI sandbox; repo copies in `scripts/mesowatch-sync/`)

| Path | Role |
|---|---|
| `/home/z/my-project/.secrets/gh-token` | Fine-grained PAT, scoped to this repo, Contents:write. chmod 600. |
| `/home/z/my-project/scripts/meso_watch_poll.sh` | Orchestrator. Open page → fetch → diff → CSV → push. |
| `/home/z/my-project/scripts/items_to_csv.py` | Convert market.json items[] → meso_watch_items.csv. |
| `/home/z/my-project/scripts/fresh_to_csv.py` | Convert fresh.json rows[] → meso_watch_fresh_listings.csv. |
| `/home/z/my-project/scripts/gh_push_files.py` | Generic `--file LOCAL:REPO --branch B --message M` pusher. |
| `/home/z/my-project/tmp/items.json` `/home/z/my-project/tmp/fresh.json` | Last-extracted payloads (the JS-extracted subset of market.json). |
| `/home/z/my-project/tmp/last_market_at.txt` `/home/z/my-project/tmp/last_fresh_at.txt` | Last-processed `generated_at` timestamps (state files). |
| `/home/z/my-project/worklog.md` | Append-only run log, one section per poller tick. |
| `/home/z/my-project/download/meso_watch_items.csv` `/home/z/my-project/download/meso_watch_fresh_listings.csv` | Local CSV copies. |

## How to invoke

**From chat (Danny's preferred path):** say any of `refresh`, `update mesowatch`, `meso.watch update please`.
Claude runs `bash /home/z/my-project/scripts/meso_watch_poll.sh` and reports what changed. No new code, no
clone, no PAT prompts — the standing approval covers fetch + CSV + push.

**Manually (Danny's own machine, persistent cron):** copy the token + everything in `scripts/mesowatch-sync/` + install `agent-browser` (`npm install -g agent-browser &&
agent-browser install`), then add a crontab entry like `*/15 * * * * /path/to/meso_watch_poll.sh >> /tmp/poller.log 2>&1`.

## Branch strategy & race safety

CSVs live on `data/mesowatch-sync` (a long-lived side branch), NOT on `claude/trusting-bell-fqgar6`. Reasoning:

- `claude/trusting-bell-fqgar6` is the production branch (Pages + CI run from it). Pushing CSVs there
  triggers wasteful rebuilds of the site (the build doesn't read these CSVs anyway — only `data/data.json`
  and `data/sources/*.json` go into `dist/`).
- Danny pushes actively to the default branch. A race between his push and the poller's PATCH
  would fail the poller (force=false is correct), but poller still burns API calls before noticing.
- The side branch is created from the default branch's HEAD on first push. To merge into the
  default branch later (e.g. for a tagged release), open a PR `data/mesowatch-sync → claude/trusting-bell-fqgar6`.

`scripts/mesowatch-sync/gh_push_files.py` retries up to 3 times on HTTP 422 (branch moved under us) by re-fetching HEAD and
re-creating the commit with the new parent. force is always `false` — we never overwrite someone else's work.

## Token rotation

The PAT was pasted in chat once (chat logs are the exposure surface). To rotate:

1. Revoke the old token at https://github.com/settings/personal-access-tokens
2. Generate a new fine-grained PAT: owner=TurbosauceDev, repo=MS-Classic-World-Info-Slop, expiration 30-90d,
   Contents: Read and write, all other permissions No access.
3. Write it to `/home/z/my-project/.secrets/gh-token` (just the token string, no quoting, no trailing newline
   needed — the scripts `.strip()` it). DO NOT paste in chat — just overwrite the file directly.

## Traps (real bugs we hit; do not regress on these)

- **Chrome silently drops the second blob download.** If you `a.click()` two blob URLs in the same
  page session back-to-back, the second one never saves. Workaround: store the data in `localStorage`
  inside the eval, then read it back via `agent-browser storage local <key>`. Do NOT go back to
  blob-URL downloads.
- **agent-browser eval returns `{}` for unhandled Promise rejections.** Always wrap async IIFEs in
  `try { ... } catch (e) { return 'ERR ' + e.message; }`. Otherwise a thrown fetch/parse error
  looks like the eval returned an empty object and you'll chase the wrong thing.
- **GitHub PATCH endpoint is `git/refs/heads/{branch}` (plural `refs`).** The singular `git/ref/heads/{branch}`
  works for GET but returns 404 for PATCH. Don't URL-encode the slash in `claude/trusting-bell-fqgar6`
  either — GitHub treats the encoded form as a different branch name.
- **market.json is Cloudflare-cached.** Cache-busting with `?v=<timestamp>` does NOT help — the
  file genuinely is only regenerated once a day. The live listings endpoint `fresh/Classic%20World.json`
  updates roughly every 15 minutes. Don't expect both CSVs to advance on the same cadence.
- **`window.__foo` set in one `agent-browser eval` call is not reliably visible to a later eval call.**
  Each eval should re-fetch its own data instead of reading a window variable set by a previous eval.
  (The localStorage approach sidesteps this — localStorage IS persistent across evals in the same session.)

## Endpoints polled

| URL | Updates | Size | Fields used |
|---|---|---|---|
| `https://meso.watch/data/market.json` | ~daily | 22 MB | `generated_at`, `items[].{id,name,category,classes,unitBasis,level,price,p25,p75,low,high,priceAll,priceBasis,priceSales,trend,sold,askMedian,asks,sellThrough,lastSold,lowData,scrolled,scrolledOnly,listings,listingShops,history,market}` |
| `https://meso.watch/data/fresh/Classic%20World.json` | ~every 15 min | 124 KB | `generated_at`, `rows[].{id,seller,price,qty,stock,map,room,channel,seen,market}` |
| `https://meso.watch/data/markets/index.json` | (not polled, only used in manual debugging) | 600 B | Live sales counts per market |

The poller doesn't fetch the markets index for state tracking because the index can advance
even when neither underlying payload has new `generated_at` (index shows live sales counts that
increment continuously, separate from the snapshot timestamps we diff against).

## Decisions log

See `docs/ai/decisions.md` section `## Data sync (meso.watch → GitHub)` for dated one-liners on every
non-trivial call Danny made on this pipeline (token approach, branch target, push policy, etc).
