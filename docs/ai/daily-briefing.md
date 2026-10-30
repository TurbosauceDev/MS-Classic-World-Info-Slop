# Daily briefing

last-verified: 2026-10-30 by Glorg [z.ai]

TL;DR:
- maplestory.watch is a legit tracker and is back (PR #23 removed it by mistake; Danny reversed it 10-30). maplestory.market is Sen's bot site and is scrubbed everywhere: never add it, never mention it as a source.
- Tracker `0.3.21` live: QA pass over the day's builds fixed the slowCap latch (one slow burst used to hold 1 Hz pace + the blocker idle fix all session). Also in: overlay auto-fit (`0.3.17`), chat card (`0.3.18`), per-card options (`0.3.19`), KPQ automation + 5 scored boards (`0.3.20`).
- Builder: mastery crit + simc-style stat weights card (`#20`/`#21`). OSMS re-pinned to `7e1c4eb` (v1.1.0): mob HP, 8 skills, arrow recipes, +1 hat.
- Release numbers walked backward mid-day (`0.3.17`-`0.3.19` shipped before `0.3.14`-`0.3.16` landed); all eight tags have releases and the update chain ends at `0.3.21`. Sandbox recycle rolled digest state to the 10-27 snapshot; reconciled from the keeper backup.

Waiting on Danny:
- Memory verdict: Performance monitor total on `0.3.13`+ after a real session. Next lever if still heavy: idle capture-stream release at Stop.
- classicrank read key (`BCR_KEY`), cron pile-up call (retry preferred), web-PAT revoke confirmation.

Watch out:
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (the 0.3.13 black-overlay lesson, pinned by `tracker/tests/overlaywin.test.js`).
- KPQ weights are placeholders; the server derives averages once 10 real rounds exist. First leader: Turbow, 1,258 pts total.
- `digest-state.json` can silently roll back on sandbox recycle; when state and `upload/digest-state-backup.json` disagree, the backup wins. Verify before computing the next issue number.
