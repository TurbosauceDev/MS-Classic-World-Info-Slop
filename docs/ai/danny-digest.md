---
kind: digest
status: live
issue: 7
date: 2026-10-28
written_utc: "11:55"
author: "Glorg [z.ai]"
site_version: "0.19.3"
---

# Danny's daily digest, issue 7

## Where things stand

The overnight tracker arc is done: your ElvUI and WeakAuras vision shipped as five releases between 08:49 and 09:53 UTC (v0.2.78 through v0.2.82, installer and update manifest verified on each). Your copy walks to v0.2.82 on the next restart, no action needed. The site is at v0.19.3 on https://maplestory.scumlord.studio and yesterday's approved site batch (P8 through P11, then the accuracy round) is all live. CI has one red spot: the shopscans poll failed twice because maplestory.watch started blocking non-browser clients with a Cloudflare 403. Root-caused and fixed this morning (`c2a6f9c`); the next scheduled run at 13:11 UTC should confirm green.

## Wins since digest 6

- **Tracker 0.2.78, conditions and alerts** (`d66bd59`): the three hardcoded beeps became a real condition engine with 13 trigger kinds (EXP, mesos and kills per hour, boss due, KPQ clock, session time, goal reached, idle stretch, loot value and watched names), each configurable in Settings with a Test button. The overlay got glass toasts and a pulse on the matching card. Your old alert settings migrate on first boot.
- **Tracker 0.2.79, layout profiles** (`472bf6f`): named overlay layouts in the ElvUI style, plus a Share strip that exports the live layout as an `OVL1.` code string and imports one with per-widget validation.
- **Tracker 0.2.80, card sparklines** (`5424d55`): the EXP, Mesos and Kills cards draw a 30 minute trend line under the big number, sampled every 20 seconds, recolored live when you re-theme.
- **Tracker 0.2.81, boss respawn polish** (`938539b`): respawns due within 2 minutes wear the warn color on the overlay and the tracker card, and the respawn card gained a "killed it" button to hand-mark a boss the log reader missed.
- **Tracker 0.2.82, beta update channel** (`442f2de`): Settings > App has a "Get test builds before wide release" checkbox. Test builds ship as `x.y.z-beta.n`, so stable copies skip them and the next stable supersedes.
- **Site P8, Movers page** (`a9e0f62`): biggest day-over-day price changes, under Mesos and Trade, one row per item and market, with direction, type and sales-floor filters.
- **Site P9, data split** (`cdc757c`): price data moved out of the page shell. First load dropped from 3771 KB to 1218 KB gzip, and a returning visitor re-downloads only the prices file, about 371 KB, when a poll moves prices.
- **Site accuracy round P12 to P16** (`a5a7670`): a spike circuit breaker holds yesterday's value when a thin median lands over 3x off, the Usual tile shows a p25 to p75 likely range, moving prices get a 3-day weighted headline, and thin medians yield to a consensus label when 2 or more solid markets agree.
- **Site, listing age** (`b40b392`): Where to buy sorts freshest shops first, marks 8 to 12 hour listings low-confidence, and folds older listings behind a show-more button.
- **P10 and P11** (`0fb4cf6`, `f18cfc3`): monster pages show the community's real mesos per kill from shared runs when a mob has 100+ tracker kills on file, and every poll step now carries a timeout so a hung fetch releases the pipeline lock instead of grinding to the job ceiling.

## Anything broken or weird

- **maplestory.watch is blocking us.** Since 01:16 UTC, `/api/items` answers a Cloudflare 403 challenge page to non-browser clients (verified from the sandbox and from GitHub runners; failed runs 40614076628 and 40672788284). The poll script had no error handling, so the step crashed outright and the real error sat hidden in a log file. Fixed in `c2a6f9c`: each source now degrades on its own, keeps the old data and exits 0, the same contract `fetch_shopscans.py` already honored. mesoarbitrage.com still answers fine (1117 items fresh at 11:44 UTC), so only the maplestory.watch rows age, and the site's stale pills plus the MCI Source-health panel flag that. No bypassing, per your 10-20 rule.
- **classicrank.com is unchanged**, challenge-walled since 10-23 (Decision 1).
- **A sandbox recycle hit mid-overnight** and reverted my local tree to its pre-0.2.77 state while origin held the work. Recovered with `git stash` + `reset --hard origin/main` + pop, nothing lost. I also fixed four CI flakes (two data-dependent scene asserts, a fake-price leak into 3-day history, a Start-wait race), so the overnight dispatches stayed trustworthy.

## Decisions I need from you

1. **classicrank outage call** (carried, unchanged): wait it out or chase the partner key from Kitten. One word picks the path.
2. **maplestory.watch block**: my lean is wait it out, since the fixed poll self-heals the moment their challenge wave lifts and staleness is flagged on the site. If you would rather force it, the durable path is a contact or key like the classicmarket arrangement, and that needs you.
3. **Cron pile-up** (carried): cut meso.watch to 2 polls per hour, or add push-retry to the poll script. I lean retry.
4. **Standing asks, unchanged**: the maplestory.market partner key, the draft-batch merge-versus-archive call, and the web instance PAT revoke confirm.

## Today's priorities

1. Restart the tracker once; the auto-updater walks you to v0.2.82. Edit mode now carries profiles, share codes, snap guides and full resizing, Settings > Alerts holds the 13 triggers, and the beta checkbox is there if you want the next test build early.
2. I watch the 13:11 UTC shopscans run to confirm the fix lands green, then report on both blocked sources in issue 8.
3. Nothing else blocks on you; the next items on my menu (site watchlist, market pulse, keyboard UX) wait for your pick.

## Where to go deeper

- Releases and installers: v0.2.78 through v0.2.82 on the repo's Releases page; in-app patch notes render from `app/changelog.js`.
- The shopscans fix: `scripts/fetch_alt_sources.py` (per-source try/except) and `.github/workflows/shopscans-poll.yml`.
- The overnight build log: `docs/ai/tracker.md` and the changelog cards on https://maplestory.scumlord.studio
- Delivery and format rules: `docs/ai/digest-contract.md`. Next refresh 04:45 AM PT.
