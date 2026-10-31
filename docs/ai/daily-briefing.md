# Daily briefing

last-verified: 2026-10-31 by Glorg [z.ai]

TL;DR:
- maplestory.watch is a legit tracker and is back (PR #23 removed it by mistake; Danny reversed it 10-30). maplestory.market is Sen's bot site and is scrubbed everywhere: never add it, never mention it as a source.
- Tracker `0.3.25` live: Elv re-skin is the default look everywhere (tracker, overlay and site boot in it); the old purple glass default is the "Clanker Chic" preset, and old "Default" picks/share codes migrate to it (`0.3.22`). Also in: overlay auto-fit (`0.3.17`), chat card (`0.3.18`), per-card options (`0.3.19`), KPQ automation + 5 scored boards (`0.3.20`), slowCap QA fix (`0.3.21`), efficiency port from customclassic-chat — frame gate, reader telemetry, read pacing, pickup second-looks, overlay z-order (`0.3.23`), shop prices Ctrl+Shift+K (`0.3.24`), review-pass fixes for the perf monitor's busyPct 10x and the frozen text-reader counters (`0.3.25`).
- Changelog discipline (10-31, Turbozo's "looking thin"): app patch notes + site log were current, but all 129 GitHub Releases shipped with empty bodies — backfilled from changelog.js, and `npm run release` now emits the release-notes file from the top changelog entry (releaseInfo.releaseNotesFile) so future releases carry notes automatically. 0.2.108's changelog entry, accidentally deleted by the 0.3.0 commit, restored verbatim.
- Builder: mastery crit + simc-style stat weights card (`#20`/`#21`). OSMS re-pinned to `7e1c4eb` (v1.1.0): mob HP, 8 skills, arrow recipes, +1 hat.
- Release numbers walked backward mid-day (`0.3.17`-`0.3.19` shipped before `0.3.14`-`0.3.16` landed); all tags have releases and the update chain ends at `0.3.25`. Sandbox recycle rolled digest state to the 10-27 snapshot; reconciled from the keeper backup.

Waiting on Danny:
- Memory verdict: Performance monitor total on `0.3.13`+ after a real session. Next lever if still heavy: idle capture-stream release at Stop.
- classicrank read key (`BCR_KEY`), cron pile-up call (retry preferred), web-PAT revoke confirmation.

Watch out:
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (the 0.3.13 black-overlay lesson, pinned by `tracker/tests/overlaywin.test.js`).
- KPQ weights are placeholders; the server derives averages once 10 real rounds exist. The leaderboard was wiped 10-30 (old data backed up server-side first): boards start blank, site timer submissions are refused (tracker rounds only), so no "first leader" until real rounds land.
- `digest-state.json` can silently roll back on sandbox recycle; when state and `upload/digest-state-backup.json` disagree, the backup wins. Verify before computing the next issue number.

Standing tools (survive sandbox recycles, live outside the repo):
- REA (`rea-agents` 6.8.0, reverse-engineering CLI) pinned at `/home/z/my-project/tools/rea/rea` — static analysis of JS/Electron/web/.NET works with zero extra engines; native targets would need a Ghidra headless install (Java 21 present). Official npm source only. Not for the MapleStory client (Nexon ToS). Update via `tools/rea/rea-update`.
