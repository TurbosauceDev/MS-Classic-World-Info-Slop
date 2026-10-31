---
kind: digest
status: live
issue: 10
date: 2026-10-31
written_utc: "11:54"
author: "Glorg [z.ai]"
site_version: "0.19.16"
---

# Danny's daily digest, issue 10

## Where things stand

Site is healthy at v0.19.16, live at https://maplestory.scumlord.studio, CI green on head `105bef0`. The tracker is at `0.3.28` (your PR #34). The changelog debt from your "thin and stale" call is paid off on all three surfaces: app patch notes, the site log and the 129 GitHub Release bodies now match git history, and every future release carries its notes automatically. One pipeline note: this sandbox's digest state rolled back to issue 6 in a recycle, but git shows issues 7, 8 and 9 were committed on their days, so per the contract the repo wins and this issue is numbered 10.

## Wins since digest 9

- **Changelog made whole** (your 10-31 "correct and accurate" mandate, closed the same day):
  - All 129 GitHub Releases that shipped with empty bodies are backfilled from `tracker/app/changelog.js`.
  - Root cause found and fixed: electron-builder 25.1.8 never sends a release body. `npm run release` now generates the notes first and writes them onto the body (`tracker/scripts/release-notes.js`, commits `16f7acb`, `f98f9b8`).
  - The 0.2.108 entry that the 0.3.0 commit deleted is restored verbatim (`acd8afe`).
  - The app's Help > Patch notes now wear the site's card look with Site and App tabs (`0.3.26` and `0.3.27`, `dba3bb7`).
  - The site log was audited against git history and re-sorted strictly newest-first: catch-up cards `0.19.10` and `0.19.11`, the scored-boards retro card `0.19.12`, the sort itself `0.19.14` (`3f51a9a`, `cd04ed4`, `c392e1d`).
- **Shop prices shipped** (`0.3.24`, your PR #27): Ctrl+Shift+K reads the merchant shop, prices rows against the market median, and uploads crowd rows only with sharing on. The `0.3.25` review pass fixed the Performance monitor's 10x busy percentage and the frozen text-reader counters (`7c392f0`).
- **Your blind-spot batch 2 shipped** (`0.3.28`, PR #34): server /api/forget with a Settings button, installer SHA-256 in the release notes, unsigned-installer help, the privacy page covering shop prices and KPQ names, and an axe accessibility ratchet in CI. The site log's newest card (`0.19.16`) is that privacy work.
- **Site look and builder**: the Elv re-skin is the default everywhere including the site, with the old look kept as the "Clanker Chic" preset (`5854ac9`, your 10-30 call). Builder screenshot import now reads non-integer window scales and passed at 14 sizes from 1x to 3x (`5e2b1d4`, `6b7c3b6`).
- **classicrank parked cleanly** per your 10-31 call (`6031f1e`): Load by IGN, @char search, the census card, profile links and the census cron are hidden or paused until Neko's project returns.
- **Cron pile-up resolved**: push-retry landed in the meso.watch poll script per your ask, so no poll-cadence cut is needed. All four price bots polled on cadence overnight.

## Anything broken or weird

- **classicrank.com stays offline** (your 10-31 decision): nothing fetches from it and the site pieces that depended on it are hidden. Nothing to watch until it returns.
- **Digest state rollback**: issues 7, 8 and 9 were committed daily, but this instance's state file was stale at issue 6 after a sandbox recycle. Numbering follows git. Rotation today archived issue 9 to the [Archive] thread from git content; the loose end is the stale channel post (Decision 2).
- Nothing else: head is green and no workflow failed in the last 24h.

## Decisions I need from you

1. **web-PAT revoke** - confirm the old web instance PAT is revoked. The fine-grained replacement is in use; this is hygiene only. It is the last open item in `docs/ai/decisions.md`: the classicrank key ask died with the park and the cron pile-up was resolved by the push-retry.
2. **Digest channel tidy** - I hold no message id for the issue 9 post (state rollback). If you want the channel clean, copy the message id of the 10-30 post in #daily-updates and I delete it. I can also re-upload issues 7 and 8 to the [Archive] thread from git if they are missing there.

## Today's priorities

1. Restart the tracker on `0.3.28` and, if memory still feels heavy, send the Performance monitor total; that number picks the next lever.
2. KPQ board weights are still placeholders (`docs/ai/tracker.md`, KPQ section); a sanity check against real rounds is welcome once 10 rounds exist.
3. Bag check Set Up/Cash/Deco reads want one real-client look (Claude's standing ask).
4. Nothing needed from you on the changelog arc; it is closed as far as git can prove.

## Where to go deeper

- Today's agent briefing: `docs/ai/daily-briefing.md` (stamped 2026-10-31).
- Changelog machinery: `tracker/scripts/release-notes.js`, `tracker/scripts/sync-site-changelog.js`, `tracker/tests/sitesync.test.js`.
- Live site with the sorted log: https://maplestory.scumlord.studio
- Format rules: `docs/ai/digest-contract.md`. Next refresh 04:45 AM PT.
