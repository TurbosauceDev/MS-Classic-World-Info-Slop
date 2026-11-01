# Daily briefing

last-verified: 2026-10-31 by Glorg [z.ai]

TL;DR:
- maplestory.watch is a legit tracker and is back (PR #23 removed it by mistake; Danny reversed it 10-30). maplestory.market is Sen's bot site and is scrubbed everywhere: never add it, never mention it as a source.
- Tracker `0.3.28` live (Danny's PR #34): /api/forget "Delete what I shared" + Settings button, installer SHA-256 in release notes, unsigned-installer help, privacy page covers shop prices + KPQ names, axe accessibility ratchet in CI. Carries the whole 0.3.2x arc: App/Site patch notes with tabs (`0.3.26`/`0.3.27`, Turbozo's ask; site cards copied by `tracker/scripts/sync-site-changelog.js`, pinned by `tracker/tests/sitesync.test.js`), Elv re-skin default everywhere + "Clanker Chic" preset (`0.3.22`), efficiency port from customclassic-chat (`0.3.23`), shop prices Ctrl+Shift+K (`0.3.24`), perf-monitor busyPct 10x + frozen text-reader counter fixes (`0.3.25`).
- Changelog discipline (10-31, Turbozo's "looking thin" then "make things correct and accurate"): app patch notes + site log were current, but all 129 GitHub Releases shipped with empty bodies — backfilled from changelog.js, and `npm run release` now emits the release-notes file from the top changelog entry (releaseInfo.releaseNotesFile) so future releases carry notes automatically. 0.2.108's changelog entry, accidentally deleted by the 0.3.0 commit, restored verbatim. Then the tracker's patch notes wore the site's card look with App/Site tabs (`0.3.26`), and the site's log got a one-time full sort — 5 retro-carded entries sat out of date order (the inversions the sitesync parser warned about); strictly newest-first now, mid-history site versions renumbered, carded as site `0.19.14` (the rebase over Claude's parallel 0.19.13 card — its Screenshot-import ship keeps 0.19.13, both cards sit stamp-ordered on top), and the tracker's Site tab picked up the corrected copy as `0.3.27`.
- Builder: mastery crit + simc-style stat weights card (`#20`/`#21`). OSMS re-pinned to `7e1c4eb` (v1.1.0): mob HP, 8 skills, arrow recipes, +1 hat.
- Release numbers walked backward mid-day (`0.3.17`-`0.3.19` shipped before `0.3.14`-`0.3.16` landed); all tags have releases and the update chain ends at `0.3.28` (site track ends at `0.19.16`: screenshot-import cards `0.19.13`/`0.19.15`, sort card `0.19.14`, privacy card `0.19.16`). Digest state had rolled back to the 10-27 snapshot (issue 6) while git held issues 7/8/9; issue 10 posted 10-31 follows the repo-as-truth rule, and issues 7/8 may need a one-time [Archive] backfill.

Waiting on Danny:
- Memory verdict: Performance monitor total on `0.3.13`+ after a real session. Next lever if still heavy: idle capture-stream release at Stop.
- web-PAT revoke confirmation (last open item in decisions.md; classicrank key died with the 10-31 park, cron pile-up resolved by the shipped push-retry).
- Optional: message id of the 10-30 digest post in #daily-updates (state rollback lost it; needed only to delete that stale post).

Watch out:
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (the 0.3.13 black-overlay lesson, pinned by `tracker/tests/overlaywin.test.js`).
- KPQ weights are placeholders; the server derives averages once 10 real rounds exist. The leaderboard was wiped 10-30 (old data backed up server-side first): boards start blank, site timer submissions are refused (tracker rounds only), so no "first leader" until real rounds land.
- `digest-state.json` can silently roll back on sandbox recycle; when state and `upload/digest-state-backup.json` disagree, the backup wins. Verify before computing the next issue number.

Standing tools (live outside the repo; NOTE: the 2026-11-01 recycle DID wipe REA despite this line's old claim — check for it after every recycle):
- REA (`rea-agents` 6.8.0, reverse-engineering CLI) pinned at `/home/z/my-project/tools/rea/rea` — static analysis of JS/Electron/web/.NET works with zero extra engines; native targets would need a Ghidra headless install (Java 21 present). Official npm source only. Not for the MapleStory client (Nexon ToS). Update via `tools/rea/rea-update`. Reinstall after a wipe: `npm install -g --prefix /home/z/my-project/tools/rea rea-agents@6.8.0 && ln -sf /home/z/my-project/tools/rea/bin/rea /home/z/my-project/tools/rea/rea` (2026-11-01 reinstalled this way, 6.8.0 verified).
