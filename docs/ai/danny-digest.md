---
kind: digest
status: live
issue: 6
date: 2026-10-27
written_utc: "11:45"
author: "Glorg [z.ai]"
site_version: "0.18.10"
---

# Danny's daily digest, issue 6

## Where things stand

Site is healthy at v0.18.10, live at https://maplestory.scumlord.studio, CI green on head `6aeefd0`. Your approved price work (P3, P4, P5) shipped yesterday afternoon and is live on the site. All seven price sources are fresh on cadence and the watchdog is clean. The one open problem is classicrank.com: its API has been unreachable for us since 10-23, so the daily Windia job census is frozen at 10-22 data (Decision 1).

## Wins since digest 5

- **P3, P4 and P5 shipped** (`e88d659`, live as v0.18.10), per your approval of proposals 1 through 5:
  - **P5 fallback tail**: items priced only by mesoarbitrage, maplestory.watch or mesoindex now get a Usual price, drawn from mesoarbitrage sold median, then maplestory.watch typical, then mesoindex usual, each labelled rough. 50 items that showed "no player prices yet" now price out and light up loot, keep, craft and quest valuation. meso.watch stays first per your 10-21 call.
  - **P4 sources context**: the Usual price tile carries a range across solid sources plus an agreement pill (within 25 percent vs N times apart).
  - **P3 stale pills**: any Prices row whose source file is past its cadence gets a quiet stale tint, with the same thresholds as the MCI Source-health panel.
  - Tests cover the fallback walk, the context block and the unpriced path; full suite green.
- **Shared runs refresh** committed (`1b9b079`).
- Housekeeping held: webhook secrets, digest state and the keeper crons all stayed intact overnight.

## Anything broken or weird

- **classicrank.com is blocking us.** The census workflow has failed 4 days straight (last success 10-22 12:30 UTC). Actions runners get a hard 403; from here, every endpoint (`/stats`, `/characters`, `/jobs`) serves an anti-bot challenge page instead of JSON. `data/sources/classicrank.json` is frozen at 54,094 characters and 30 jobs. The browser-side Load-by-IGN lookup still works for visitors whose browser holds a fresh classicrank cookie, and answers "Couldn't reach classicrank.com" for the rest. I did not attempt a bypass, per your 10-20 rule. Today's 06:49 UTC scheduled run has not appeared so far, which GitHub does under load sometimes.
- Nothing else: no price-source anomalies, no watchdog alerts, and no cancelled runs worth noting.

## Decisions I need from you

1. **classicrank outage call**: wait it out (the workflow self-heals if their challenge wave lifts) or chase the partner key from Kitten, which was already on the standing-ask list and is now the durable fix. I can also add classicrank staleness to the watchdog and this digest, so a freeze pings you instead of sitting as a red X. One word picks the path.
2. **P8 Movers page**: the biggest day-over-day price changes, from fields we already store (`dayAgo`, `trend`, cmp `day`). Self-contained, data ready, say go.
3. **P9 data split**: move price data out of `index.html` (about 1.7 MB gzip re-served to every returning visitor on each poll commit; measured 1.69 MB in the audit). Biggest perf win available, effort L.
4. **P11 poll lock fix**, unchanged since digest 5: a step-level timeout under the 30-minute job ceiling, or loosen the shared `main-pipeline` group now that every poll carries its own push-retry.
5. **Standing asks, unchanged**: the maplestory.market partner key, the draft-batch merge-vs-archive call, and the web instance PAT revoke confirm. The classicrank key moved into Decision 1.

## Today's priorities

1. Your calls above. If you name no path on classicrank, I keep watching the daily run and report in the next digest.
2. P8 can start the moment you say go; P9 wants a quiet window with no poll traffic, so it pairs with the P11 call.
3. P6 (askMedian on the meso.watch row) stays yours; nothing needed from me.

## Where to go deeper

- The audit with all proposals: `docs/ai/overnight-price-audit-2026-10-26.md`, reproduce with `python3 scripts/price_audit.py`.
- The classicrank fetcher and its workflow: `scripts/fetch_classicrank.py`, `.github/workflows/classicrank-census.yml`.
- The live site with the new price context: https://maplestory.scumlord.studio
- Delivery and format rules: `docs/ai/digest-contract.md`. Next refresh 04:45 AM PT.
