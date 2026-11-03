# Daily briefing

last-verified: 2026-11-03 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is not in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- Site `0.20.20` live, tracker `v0.3.39` latest release (11-02 18:46 UTC). Head is `b71a87a` (classicmarket price commit, read 12:50 UTC 11-03); last work commit `d26307e`, all checks green on it. Re-check with `git log` before naming head.
- **Polls no longer rewrite `data/data.json`** (#68): the five price polls commit only their `data/sources` file and `scripts/live_data.py` applies the prices at build time (`scripts/build.py`). Do not make a fetcher write `data/data.json` again; `tests/live_data_test.py` fails if a poll re-adds it. meso.watch and classicrank fetchers are unchanged (paused / parked).
- **`dist/` is not committed** (#63): Pages and every test job build it; `tests/docs.test.js` fails if it comes back. Build locally only to test.
- New gates from the review (Danny 11-02): `tests/inject.js` (outside strings must never run as markup, #52), `tests/lint_test.js` (ESLint bug rules, baseline 0, #62), `tests/empty_catch_test.js` (silent catch cap per file, #62), `tests/pins.test.js` (one Playwright/axe pin in the root package.json, #51). Site tests run as 3 parallel shards.
- Docs diet (#60, #67): dated history lives in `docs/ai/site-history.md` and `docs/ai/tracker-history.md`; area docs have a 35 KB size guard in `tests/docs.test.js`. Add traps to the area doc, history to the history file.
- Open PRs: #69 (Hermes, pages deploys price updates at most every 30 min), #59 (draft START-HERE trim, needs Danny), dependabot #53 to #58. All checks green.

Waiting on Danny:
- Electron 33 to 45 (#57) and tesseract.js 6 to 7 (#58) are major tracker bumps: do not merge them without Danny's OK.
- START-HERE trim (#59): instruction file, waits on Danny's read of the diff.
- Old GitHub PAT and Glorg's two webhook URLs from #glorg-chat 10-25/10-26: revoking and regenerating is Danny's (Hermes reported deleting the messages 11-02; not re-checked 11-03).
- Watchdog #25 stays open: meso.watch is paused by Danny's call, and maplestory.watch shop scans were 100 h stale on 11-02.

Watch out:
- meso.watch poller is disabled on purpose (Danny 11-02). `scripts/watchdog.py` skips its checks while the workflow is off. Do not re-enable without Danny.
- `docs/ai/danny-digest.md` is retired; `tests/digest.test.js` fails if it comes back. Hermes owns the digest on Discord.
- `main` is not branch-protected: `gh pr merge --auto` merges at once without waiting for checks. Merge only after `gh pr checks` is all green.
- `tests/monkey.js` reads live price data with fixed seeds, so a price commit can turn it red with no code change. Check other PRs before blaming your diff.
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (pinned by `tracker/tests/overlaywin.test.js`).
- decisions.md: date every line, tag `[superseded ...]`/`[supersedes ...]` in pairs, never file calls under Open decisions (`tests/decisions_test.py`).
- Changelog cards: a plain card is a patch; `data-minor` starts the next 0.x.0 and is for big additions only.
- KPQ weights are placeholders until 10 real rounds exist (carried from 10-31, not re-checked).

Who does what:
- Hermes (Danny's Windows box): Danny's digest, this briefing, [Archive] rotation, Discord moderation, #agent-pings on request, PR review, dependabot merges. Ask in the mailbox addressed to Hermes; for a ping, say who and why.
- Glorg [z.ai]: Danny briefs it on the handover himself. Do not task Glorg with the digest.
