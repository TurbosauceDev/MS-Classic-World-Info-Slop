# Maintenance / outage detection — design

Status: proposal. Not implemented. Written 2026-10-21 while the 17:06 poll sat at
`asks_rows = 0` (see "Worked example" at the end).

## 1. The problem

Two very different events produce the same payload:

| Event | `asks` rows | Who is at fault | What Danny wants |
|---|---|---|---|
| Game servers down / maintenance — every seller loses their FM spot | 0 | nobody | silence, then a clean reset |
| Our fetch, drop or build logic is broken | 0 | us | an alert |

Right now both are invisible. CI is green in both cases, and the only human-readable
signal is a `[fresh] WARNING` that says the same thing either way. A pipeline that
publishes nothing scores as healthy.

So the job is not "detect downtime". It is **classify a listing collapse by its cause**
and only shout when the cause is us.

## 2. What we already have to work with

Five independent sources, four of which stamp their own generation time. That
independence is the whole basis for telling "them" from "us".

| Source | File | Own timestamp | Independent? |
|---|---|---|---|
| meso.watch list.json | `data/sources/mesowatch_prices.json` | `read` | yes |
| maplestory.watch | `data/sources/maplestorywatch_prices.json` | `generated_at` | yes |
| mesoarbitrage.com | `data/sources/mesoarbitrage_prices.json` | `generated_at` | yes |
| classicmarket.kr | `data/sources/classicmarket_prices.json` | `read` | yes |
| meowdb | `data/sources/meowdb_market.json` | `read` | yes |

Plus two counters inside list.json that we currently throw away after building:

- `totals.sales` — cumulative sales count, monotonic, only ever goes up.
- `items[].sold` — per-item sales, same property.

## 3. The discriminator

`totals.sales` is the key. It measures **activity**, while `asks` measures
**inventory**. They move independently, and the way they diverge identifies the cause.

| `generated_at` advances? | `totals.sales` advances? | `asks` rows | Verdict |
|---|---|---|---|
| yes | yes | collapsed to 0 | **INTERNAL_COLLAPSE** — activity is happening, our inventory went missing. Our bug. |
| yes | frozen | collapsed to 0 | **EXTERNAL_STANDSTILL** — market is live but nothing is being sold or listed. Servers down or maintenance. |
| no (stale) | no | any | **STALE_UPSTREAM** — meso.watch itself stopped publishing. Not our fault, but the site is now showing old numbers. |
| fetch failed | — | — | **FETCH_FAULT** — Cloudflare, DNS, timeout, HTML instead of JSON. |
| yes | yes | healthy | **HEALTHY** |

The first two rows are the entire point. Today's incident is row one: list.json was
fresh, sales were advancing, and `asks` went to zero because of `LIVE_MIN`. Maintenance
is row two: the hours tick by, `generated_at` moves because the site is up, but the
sales counter sits still because nobody can trade.

Secondary corroboration, used to raise confidence rather than to decide alone:
if three or more of the five sources go quiet in the same 2 h window, the event is
external almost by definition — our code does not break four fetchers simultaneously
in a way that leaves all of them parseable.

## 4. Architecture

Four pieces. The fourth is the one that fixes the bug I found in the current
freshness check.

```
   poll run (hourly)
        │
        ├─ 1. health sample ──────► data/health/polls.jsonl   (one line per run)
        │      cheap, append-only, committed with the poll
        │
        ├─ 2. classifier ─────────► verdict + evidence
        │      pure function: (this sample, previous samples) → verdict
        │      no network, no git, fully unit-testable
        │
        └─ 3. epoch marker ───────► mesowatch_prices.json `gen` (only on a confirmed wipe)

   4. watchdog workflow  (separate cron, separate workflow)
        reads polls.jsonl + last-run times, opens/updates one GitHub Issue
```

### 4.1 Health sample

One JSON line per poll, committed to `data/health/polls.jsonl` alongside the data.
Small — roughly 400 bytes — so appending it does not bloat the repo, and the git
history becomes the audit trail.

```jsonc
{
  "ts": "2026-10-21T17:07:23Z",
  "run": 39640822531,
  "fetch": { "ok": true, "http": 200, "bytes": 1831002 },
  "list":  { "gen": "2026-10-21T17:00:00Z", "age_min": 7, "sales": 181199 },
  "asks":  { "rows": 0, "items": 0, "dropped_stale": 2228, "prev_rows": 2228 },
  "cross": { "mw_age_min": 81, "ma_age_min": 95, "cm_age_min": 120, "mdb_age_min": 240 },
  "verdict": "INTERNAL_COLLAPSE",
  "confidence": 0.9
}
```

Note `dropped_stale`. It is already computed and printed, just not persisted. Persisting
it is what lets the classifier say *why* rows vanished instead of only that they did.

### 4.2 Classifier

A pure function so it can be tested against fixtures without touching the network:

```
classify(sample, history) -> (verdict, confidence, reasons[])
```

Rules, in order — first match wins:

1. `fetch.ok == false` → **FETCH_FAULT**
2. `list.age_min > 2 * cadence` → **STALE_UPSTREAM**
3. `asks.rows == 0 and sales_delta > 0` → **INTERNAL_COLLAPSE**
4. `asks.rows == 0 and sales_delta == 0` → **EXTERNAL_STANDSTILL**
5. `asks.rows < 0.2 * baseline` → **COLLAPSE_SUSPECTED** (needs a second poll to confirm)
6. otherwise → **HEALTHY**

`sales_delta` is against the previous sample, so it needs history — which is why
polls.jsonl exists rather than a stateless check.

Confidence is raised by cross-source agreement: if `mw` and `ma` are also stale,
`EXTERNAL_STANDSTILL` goes to high confidence; if they are fresh and advancing while
meso.watch is not, that points at meso.watch specifically.

**Hysteresis matters.** Single-poll blips are normal (one skipped cron, one bad
scrape). `HEALTHY → COLLAPSE_*` requires 1 sample because a collapse is actionable;
recovery back to `HEALTHY` requires 2 consecutive clean polls, so a flapping source
does not produce an alert storm.

### 4.3 Epoch marker — the part specific to FM maintenance

This is what the maintenance scenario actually needs, and it is not just an alert
concern. It is a **correctness** concern for the `seen` field.

Everyone loses their FM spot during maintenance. Afterwards the same seller may list
the same item at the same price in a new spot. The current carry-forward matches on
`(price, seller)` — so a brand-new listing inherits a first-seen timestamp from
before the maintenance, and the UI will label a fresh listing as "3 days stale".
That is exactly the wrong answer, and no amount of alerting fixes it.

Fix: a generation counter.

```jsonc
// data/sources/mesowatch_prices.json
"gen": 7,
"gen_started": "2026-10-21T17:07:00Z"
```

`fetch_mesowatch.py` increments `gen` when the classifier reports a confirmed
`EXTERNAL_STANDSTILL` (or an explicit maintenance window is open), and then
**skips carry-forward entirely** — every pair is treated as new. This is an addition,
not a removal, so it falls under the standing approval for additive schema fields.

The frontend gets something useful out of it too: "market reset 2h ago" is a better
label than a wall of zeros, and `seen` values become comparable within a generation
in a way they never were across one.

### 4.4 Watchdog — separate workflow

The current freshness check in `mesowatch_poll_ci.sh` (Step 10) runs *after* its own
commit and greps `git log` for the newest `meso.watch helper` commit. That commit is
the one it just made, so it reports `0h 0m ago` on every successful run. It cannot
detect skipping by construction.

No amount of threshold tuning fixes this, because the poller is inside the thing it
is measuring. The watchdog must be outside:

- its own workflow, own cron (e.g. minute 23 and 53, off the poll's minute marks)
- it does not fetch meso.watch, does not build, does not commit to the data path
- it only reads: last completed run per workflow via the API, plus `polls.jsonl`

Checks:

| Check | Threshold | Meaning |
|---|---|---|
| last `meso.watch poll` run completed | > 2h ago | cron entries skipping |
| last run conclusion | `failure` | job-level break |
| last sample age in polls.jsonl | > 2.5h | poll running but not producing samples |
| `totals.sales` delta over 24h | 0 | game side has been down a long time |
| current verdict | not HEALTHY | surface it |

A separate workflow is also the only way this survives a broken poll — if the poll
workflow is what's broken, a check inside it never runs.

## 5. Alerting

One GitHub Issue, label `pipeline-alert`, title keyed on the verdict so repeats update
rather than spam:

```
[INTERNAL_COLLAPSE] listings went to 0 while sales advanced — 2026-10-21
```

- Body: the health sample, the three previous samples, and the classifier reasons.
- Auto-closed after 2 consecutive HEALTHY polls.
- `EXTERNAL_STANDSTILL` opens at low priority, or optionally only comments — an
  expected maintenance should not page anyone. That distinction is the whole reason
  for the classifier.

Optional Discord webhook via repo secret for immediate delivery. That adds a secret,
so it needs Danny's OK first.

## 6. What this deliberately does not do

- **No probing the game client or login server.** Unreliable from CI, and it drifts
  toward ToS territory without telling us anything `totals.sales` does not.
- **No scraping Discord or patch-note sites for maintenance announcements.** A
  human-readable "maintenance until 18:00" is nice-to-have; the counter divergence
  already answers the question without parsing prose that changes format weekly.
- **No automatic deletion or rewriting of data.** The system classifies and alerts;
  the recovery action stays manual.
- **No new service.** Everything runs on the existing Actions minutes plus one extra
  small workflow.

## 7. Rollout

1. **Shadow mode, ~1 week.** Emit `polls.jsonl` and compute verdicts, log them, alert
   on nothing. This gives a baseline distribution and shows whether the thresholds
   are anywhere near right.
2. **Enable Issues for `INTERNAL_COLLAPSE` and `FETCH_FAULT` only.** Those are the
   ones we can act on.
3. **Enable the epoch counter** once there has been at least one real maintenance to
   observe, so the boundary detection is calibrated on a real event rather than a guess.
4. Fold `EXTERNAL_STANDSTILL` into the site's data-freshness panel as "market down",
   which is more useful to a player than an empty list.

## 8. Worked example — would this have caught today?

The 17:06 poll, replayed against the rules:

```
fetch.ok      = true          → rule 1 no
list.age_min  = 7             → rule 2 no
asks.rows     = 0             → rules 3/4
sales_delta   = > 0           → rule 3 → INTERNAL_COLLAPSE
```

`dropped_stale = 2228`, `prev_rows = 2228`, `sales` advancing. The classifier would
have raised it within one poll, with the cause already narrowed to the drop path,
instead of waiting for someone to notice the site had gone quiet.

The same sample with `sales_delta = 0` and all four cross-sources stale would have
been classified `EXTERNAL_STANDSTILL` and stayed quiet — which is the maintenance
case, correctly silenced.

That single comparison is the design.

## 9. Open questions for Danny

- Is a GitHub Issue the right channel, or Discord?
- Should `EXTERNAL_STANDSTILL` notify at all, or only annotate the site?
- How long a `STALE_UPSTREAM` window is tolerable before the site should show a
  banner rather than silently serving old prices?
