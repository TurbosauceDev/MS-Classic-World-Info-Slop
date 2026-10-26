---
kind: digest
status: live
issue: 5
date: 2026-10-26
written_utc: "11:55"
author: "Glorg [z.ai]"
site_version: "0.18.9"
---

# Danny's daily digest, issue 5

## Where things stand

Site is healthy at v0.18.9, live at https://maplestory.scumlord.studio, CI green on head `6c521a5`, all polls on cadence. Your overnight ask is done: the full price audit is in `docs/ai/overnight-price-audit-2026-10-26.md`, reproducible with `python3 scripts/price_audit.py`. Headline: every transform we control matches its source exactly, six of seven sources refreshed on cadence all night, and the one real outage (mesoindex.com frozen for 3 days behind a silent 403) is fixed with a watchdog now covering every source. The tracker also gained Overlay Mode (`0.2.74`), the true overlay you pointed at maplestory.watch for. One thing needs you this morning (Decision 1): a sandbox recycle wiped my local copy of the two Discord webhook URLs, so this issue may not have arrived in #daily-updates on its own. The file is committed and linted either way.

## Wins since digest 4

- **Overnight price audit delivered** (your 08:25Z ask): `scripts/price_audit.py` + `docs/ai/overnight-price-audit-2026-10-26.md`. Transforms exact (median drift 0.000 on 698 mesoarbitrage and 1,159 maplestory.watch spot-checked items), NPC cross-check 915 of 918 match an independent game-file source, no stale-median absurdities, no wrong rounding or units. Findings F1-F9, proposals P1-P11 ranked with effort labels.
- **mesoindex.com un-frozen** (`1e78c54`): their API started 403-ing non-browser agents on 10-23 and our poll kept reporting success with 3-day-old data for 1,110 items and 593 shops. Now sends a browser UA, verified live at 5,286 catalog rows; failed fetches print a CI-visible warning.
- **Watchdog covers all 7 price sources** (`b10640f`): per-cadence age limits (24-36 h) checked twice an hour; before tonight it watched only meso.watch, so a freeze on any other source was invisible by design. 16 checks green.
- **Tracker 0.2.74 Overlay Mode** (`7128317`): a transparent, frameless, always-on-top window spanning every monitor. Widgets: status, EXP with level bar, kills, mesos, loot, map with spawns and boss respawn timers, party, KPQ, run log. Ctrl+Shift+E edit mode drags cards anywhere and picks what they track; positions persist; Done hands clicks back to the game.
- **Tracker 0.2.73 Focus Mode** (`1ada6d5`): the skinned single-column view, Ctrl+Shift+F.
- **Server retention and fixes**: archive tables (`7f200ad`, rows older than 180 days move out during the summary rebuild, all-time KPQ bests survive), and the full-project bug hunt (`0c5d5d9`, four owner-panel and summary-cache bugs, regression-tested).
- **Owner tooling**: the browser panel at `/admin` (`f527b8d`), the Shared runs tab (`6217cd5`), the KPQ owner inbox (`2367820`), and honest share replies in the tracker event log (`e6c5ccf`). No more manual curl.
- **KPQ Today's runs lists in arrival order** (`375a8a7`, server `a3360dc`), the day's best highlighted wherever it sits.
- **Quest pages** (`4eebe68`, layout `1ef4f60`): every quest name opens a quest page, with a "Where to go" section showing the giver's map, spawn dots and exit numbers.

## Anything broken or weird

- **Digest webhooks lost to a sandbox recycle.** The repo-side pipeline is intact; the two sandbox-only webhook files and the state file are not. This issue is committed and linted but needed a manual delivery today. Decision 1 restores the feed. The stale issue-4 post in #daily-updates also needs one manual delete (its message id was in the lost state file, so I cannot delete it myself right now).
- **One meso.watch poll failure** at 09:18 UTC on `c32948a`; the next poll ran green at 09:46 UTC. A superseded pages run was cancelled, which is normal under the shared concurrency group.
- **P11 (open): every poll shares one `main-pipeline` lock.** A hung poll delays all the others; last night's first mesoindex re-dispatch ground for 45+ minutes while the hourly meso.watch refresh queued behind it. Proposal P11 lists two fix options.
- Recorded for honesty: mesoindex served 3-day-old prices for 3 days under green CI before the audit caught it. That failure class is now covered (source-age watchdog + CI warnings), and it is exactly why the audit exists.

## Decisions I need from you

1. **Re-share the two Discord webhook URLs.** A sandbox recycle wiped my local copies (never committed, by design). I need the #daily-updates webhook and the #agent-pings webhook again; after that the 04:45 AM PT schedule self-heals and I rebuild the state file from git.
2. **Price quick wins P3-P6, all small:** a stale-age tint on Prices rows (P3), a sources-context sub-line under the Usual price tile (P4), extend the price fallback past classicmarket so 51 priced items stop showing "no player prices yet" (P5, fallback only, meso.watch stays first per your 10-21 call), and show the stored askMedian on the meso.watch row (P6). P5 is the only one that changes a visible number for some items.
3. **P11 lock fix**, folded into the open cron pile-up call: a step-level timeout under the 30-minute job ceiling, or loosen the concurrency group now that every poll carries its own push-retry.
4. **P9 perf split, when you want speed:** move price data out of `index.html` (5.1 MB raw, 1.69 MB gzip re-served to every returning visitor on each poll commit). Biggest perf win available, effort L.
5. **Standing asks, unchanged:** the maplestory.market partner key, the classicrank.com key from Kitten (both block built-and-waiting slots), the draft-batch archive call, and the web instance PAT revoke confirm.

## Today's priorities

1. Your calls above. My recommended first pair is P5 + P6: one line each, both shipped the same morning.
2. I restore the digest feed the minute the two webhook URLs land, rebuild the state file from git, and run one manual rotation before trusting the schedule again.
3. Overlay Mode is on the installer (`0.2.74`); your verdict after a real session drives the next round. On the price side, the next candidates are P8 (Movers page, data already stored) and P10 (players' actual mesos beside estimates).

## Where to go deeper

- The audit: `docs/ai/overnight-price-audit-2026-10-26.md`, reproduce with `python3 scripts/price_audit.py`.
- This issue as a file: `docs/ai/danny-digest.md` in the repo; history in git log.
- The live site: https://maplestory.scumlord.studio
- Delivery and format rules: `docs/ai/digest-contract.md`. Next refresh 04:45 AM PT.
