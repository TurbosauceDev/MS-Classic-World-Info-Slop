# Overnight price audit — do our prices match our sources? (2026-10-26)

**For:** Danny + any agent on the repo. **By:** Glorg (z.ai), overnight per Danny's 08:25Z ask
("deep investigation into how our site could be better… especially in regards to our prices. I would like it if our
prices could match our sources more accurately"). **Reproduce with:** `python3 scripts/price_audit.py` (reads
data/data.json + data/sources/*, no network, prints the whole numbers appendix at the end).

---

## TL;DR

The price pipeline is in good shape: every transform we control matches its source file bit-for-bit (live drift ~0),
six of seven sources refreshed on cadence all night, and the item page already shows every source side by side.
The audit found **one real outage** (mesoindex.com frozen for 3 days behind a silent 403 — fixed tonight), **one
monitoring gap** (the watchdog only watched meso.watch — closed tonight), and a set of smaller fidelity gaps with
ranked proposals below. Nothing else was broken: no wrong rounding, no wrong units, no wrong item mappings found
beyond the three known name-collision drops.

---

## 1. How a price gets on the site (the 30-second map)

| Source | Cadence | File | D key | Semantics of its headline number |
|---|---|---|---|---|
| meso.watch | hourly ×6 | data/sources/mesowatch_prices.json | `D.pw` | median **sale** price seen on streams (+p25/p75, sell-through, trend, askMedian) |
| classicmarket.kr combined | ~3 h | data/sources/classicmarket_market.json | `D.cmp` | their own combined **sold** median |
| meowdb | ~4-6×/day | data/sources/meowdb_market.json | `D.mdb` | "usual" = 14-day median of **asks seen in shops + sold reports + finished trades** (mixed) |
| classicmarket.kr posts | ~3 h | data/sources/classicmarket_prices.json | `D.cm` | trade-board **ask** / **bid** medians |
| mesoarbitrage.com | ~3 h | data/sources/mesoarbitrage_prices.json | `D.ma` | median **sold** + cheapest ask, 72 h/14 d windows, 2 h hold |
| maplestory.watch | ~3 h | data/sources/shopscans.json (`D.mw`) | `D.mw` | "typical" over 14 days of shop scans |
| mesoindex.com | ~3 h | data/sources/mesoindex.json | `D.mi` | "usual" from cozy.markets shop scans (+conf, trend) |

One function, `pwPrice()` (src/js/11-cmarket.js), picks the number the rest of the site uses, in Danny's fixed order
(2026-10-21 decision: "FM Sniper / pwPrice stay on meso.watch"): meso.watch median → classicmarket combined → meowdb
usual → classicmarket asks → classicmarket bids. The Items page "Prices" table shows **all** sources as rows regardless
(per Danny's 2026-10-21 call: "show every market source").

## 2. What checks out (verified, not assumed)

- **Transform fidelity is exact.** Live-fetched mesoarbitrage vs our committed `D.ma`: median relative drift **0.000**
  over 698 shared items (0 items >30 % off). Same for maplestory.watch: median drift **0.000**, 0.9 % of 1,159 matched
  items >30 % (name-collision items and same-day drift, expected). classicmarket.kr combined: all 1,101 rows carry
  today's date. Nothing in our fetchers rewrites a source's numbers.
- **Freshness on the healthy sources:** meso.watch prices 8.6 h old at audit time (their own list.json cadence),
  listings 2.2 h, classicmarket 3.1 h, meowdb 8.5 h, maplestory.watch 2.5 h, mesoarbitrage 3.1 h. All inside cadence.
- **No stale-median absurdities:** 0 items where the headline price is ≥3× the cheapest live ask (a classic
  "median moved, listing didn't" detector).
- **The "rough headline" case is rare:** exactly **1** item (Soft Feather) has a low-data meso.watch median while a
  ≥20-point source disagrees >30 %. The chain's preference for meso.watch is not hurting in practice.
- **NPC prices agree with an independent game-file source:** mesoarbitrage's `npc` column matches our `items[id].p`
  for **915 of 918** checked items (the 3 exceptions are in finding F6).
- **Live listings are live:** all 364 meso.watch listing rows are under 6 h old; the 6 h drop rule is working.

## 3. Findings

### F1 — mesoindex.com was frozen for 3 days, silently (FIXED tonight, commit 1e78c54)
`data/sources/mesoindex.json` read `2026-10-23 07:50` while everything else moved hourly. The mesoindex poll "succeeded"
every 3 h the whole time: the fetcher catches the failure, keeps the old file, and exits 0 — green CI over stale data.
Cause: mesoindex.com started **403-ing non-browser User-Agents** around 10-23 (their API answers a plain 200 to a normal
browser UA; no checkpoint involved — the HTML-page checkpoint rule stays untouched). Their last-sale timestamps buried in
the Prices rows showed it if you looked, but nothing alarmed. 1,110 items' mesoindex rows (and 593 shops' where-to-buy
rows) were frozen. **Fix shipped:** fetch_mesoindex.py now sends a browser UA (verified 200 live, 5,286 catalog rows);
the poll was re-dispatched; failed fetches now print a CI-visible `::warning::`.

### F2 — the watchdog only watched meso.watch (FIXED tonight)
A 3-day outage on any of the other six sources was invisible by design. `scripts/watchdog.py` now also checks the data
age of shopscans (ma + mw separately), classicmarket posts, classicmarket combined, meowdb, and mesoindex with
per-cadence thresholds (24-36 h), migrates the old issue title in place, and keeps the same one-issue/comment-on-change
behavior. `tests/watchdog_test.py` grew 6 cases including the exact mesoindex freeze pattern. All 16 checks green.
Related and found while fixing F1: all polls share one `main-pipeline` concurrency lock, so a hung poll delays every
other source's refresh (see P11).

### F3 — 51 items have source prices but no site price
The fallback chain stops at classicmarket, so items priced **only** by mesoarbitrage / maplestory.watch / mesoindex
(e.g. White Dye 24,999, Red-Hearted Earrings 1,288,888 asked, Square Hammer) show "no player prices yet" on the Usual
price tile — and get no loot/keep/craft/FM-Sniper valuation — while their source rows sit one inch lower on the same
page. Proposal **P5** below closes this without touching Danny's meso.watch-first rule.

### F4 — when sources disagree, they disagree loudly (semantics, not bugs)
For 834 items we hold ≥3 solid sources (≥5 data points each): 229 agree within 1.25×, **85 differ >2×**. Against the
meso.watch headline specifically, with the other source holding ≥20 data points: **147 items** differ >1.5× from meowdb
(ask-mixed semantics — expected skew upward), 49 from mesoarbitrage, 22 from maplestory.watch, 4 from mesoindex.
Examples: Blue Sauna Robe meso.watch 20,000 vs meowdb 40,000 (226 pts); Yellow Icarus Cape 18,944 vs 49,999; Wolbi
Throwing Stars meso.watch 7,950/set vs mesoarbitrage 26,488. These are ask-vs-sold and window-length differences, not
fetch errors — the Items page already shows both numbers honestly. The gap is that the **single number the rest of the
site uses** carries none of that context outside the Items page. Proposals **P3/P4** add the context everywhere the
headline appears; per Danny's 10-21 decision the headline itself stays meso.watch-first.

### F5 — meso.watch's askMedian is stored and never shown
`pw.it[id][7]` (median of current asks, 821 of 1,071 items) has sat unused since the 2026-10-20 plan intended it for the
sell helper. One line in the meso.watch Prices row ("asks now ~X") makes the ask-vs-sold gap visible on every item.

### F6 — 3 NPC prices are 10× off an independent game-file source
Anvil (ours 100 vs mesoarbitrage 1,000), Weaponcrafting Station (100 vs 1,000), Metal Trash Can (10 vs 100). Either our
OSMS `price` field is the buy price while theirs is the sell price (or vice versa), or one of the two mapped the wrong
field. Three items, zero user impact so far, but it is exactly the class of error a price audit should catch — verify
against the game and reconcile.

### F7 — throwing stars (8 per-set items) mix per-set and per-each
meso.watch prices them **per set** (flagged, labelled per set on item pages — good). But `npcCheaper()` compares the
per-set median against meowdb **shop** prices whose per-set/per-each basis nobody verified (Subi: PW 420/set, NPC "pays"
250, shop 500). Stars are excluded from live listings and loot valuation already, so exposure is one pill on 8 items —
verify the shop basis in game, then either divide or exclude stars from that pill.

### F8 — mob meso estimates are thin and uncalibrated
The map model's meso side rests on meowdb community reports for only 30 mobs. Where shared-runs reality exists it
disagrees: Pig est 13.0 vs players' 15.1 mesos/kill (+16 %), Ribbon Pig est 20.5 vs 14.9 (−27 %, n≈3,000 kills each).
As shared runs grow, the site can show "players' actual" next to the estimate and calibrate (P10).

### F9 — (non-finding, recorded for completeness) 1,158 of 2,258 items have no live-listing row
Expected — most items are not in the Free Market — listed so nobody mistakes the number for a bug later.

## 4. Proposals, ranked

| # | Proposal | Effort | Note |
|---|---|---|---|
| P1 | mesoindex browser-UA fix | **shipped** (1e78c54) | un-freezes 1,110 items' rows |
| P2 | watchdog covers all 7 sources | **shipped** (this commit) | a freeze now files its own issue |
| P3 | Stale-age pill on Prices rows: any source row whose data is past its cadence gets a quiet "stale N d" tint, like the listing-stale pill | S | makes F1-class outages visible on the page itself |
| P4 | "Sources" context on the headline: one sub-line under the Usual price tile — range across solid sources + an "all sources within ±25 %" style agreement pill | S | answers "why does classicmarket say 40k?" without leaving the tile |
| P5 | Extend the pwPrice **fallback** (not the head): after classicmarket asks/bids, try mesoarbitrage sold median → maplestory.watch typical → mesoindex usual, labelled with their kind as the chain already does | S | closes F3; respects "pwPrice stays on meso.watch" |
| P6 | Show stored askMedian on the meso.watch row ("asks now ~X") | XS | F5 |
| P8 | Movers page: biggest day-over-day price changes from fields already stored (`dayAgo`, `trend`, cmp `day`) | M | new page, data ready |
| P9 | Split price data out of index.html: the SW is network-first, so every poll commit re-serves ~1.7 MB gzip to every returning visitor; icons are already a hashed second file — do the same for data.json (cached shell + data URL) | L | biggest perf win available |
| P10 | Mob meso: show shared-runs "players' actual mesos/kill" beside meowdb's estimate once coverage grows; calibrate the map meso model | M | grows with shared runs |
| P11 | Concurrency coupling: every poll shares the `main-pipeline` lock, so a hung poll starves the others — tonight's first mesoindex dispatch ground for 45+ min (cancelled by hand) and the hourly meso.watch refresh queued behind it the whole time. Options: a step-level timeout under the 30-min job ceiling, or loosening the group now that every poll carries its own push-retry loop | S | the existing watchdog `poll` check already catches the symptom |

## 5. Appendix — headline numbers from the audit run

- Coverage: 2,258 items · 1,218 with ≥1 source price · 1,169 with a headline (meso.watch 1,069, classicmarket 86,
  meowdb 12, CM bids 2) · 51 with prices but no headline · 1,040 with no source price at all (mostly untradeables).
- Headline vs ≥20-point source >1.5×: 178 items (meowdb 147, mesoarbitrage 49, maplestory.watch 22, mesoindex 4 — overlapping).
- Source pairs (n≥5 each) compared: 4,667 · >1.5×: 876 · >2×: 331.
- Agreement among ≥3 solid sources: 834 items · within 1.25×: 229 · over 2×: 85.
- Worst cross-source pairs: Mushmom Balloon 10,000 vs 194,443 (19×); Rower 157,499 vs 2,799,999 (18×); Bottomwear MP
  Scroll: Lesser 500 vs 8,000 (16×); Metal Trash Can 3,499 vs 49,999 (14×) — thin-data equips and fixture items, none
  unit-broken (the 100× data-quality tripwire stays silent).
- NPC cross-check: 918 checked, 915 match, 3 mismatched (F6).
- Payload: live index.html 5.1 MB raw / 1.69 MB gzip, ~15 s uncompressed first load from here (P9).
