# Daily briefing

last-verified: 2026-11-04 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is not in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- Site `0.24.0` live, tracker `v0.3.39` latest release (11-02 18:46 UTC). Head is `5660e13` (#84, newsfeed feed of pages, read 12:50 UTC 11-04); every check on it passed. Re-check with `git log` before naming head.
- **`main` is PR-only** (Danny 11-03, #79): branch, PR, required checks `docs`, `test (core|pages|edge)`, `tracker ok`, squash-merge, no admin bypass. A direct push gets GH013. `gh pr merge --auto --squash` now waits for the checks. Merged branches auto-delete.
- Polls push with the `POLL_DEPLOY_KEY` deploy key (#80); `scripts/ci/commit_push.sh` adds the skip-ci marker to poll commits. Never put that marker in your own commit message: the PR then gets no CI and can never merge.
- `.github/workflows/tracker.yml` runs on every PR; its `tracker ok` job always reports (#78). Never add a `paths:` filter to a workflow whose check is required.
- **Home is a newsfeed** (Turbozo 11-03/11-04, #81, #82, #84): posts live in `src/posts` (front matter, small markdown dialect), rendered by `scripts/posts.py` into `src/js/77-journal.js`; the old home grid is the Overview page. Contract: `docs/ai/journal.md`. Tests: `tests/posts_test.py`; smoke pins the machinery, never post content.
- **All five price polls are paused** (Danny 11-03, #72): market data is frozen on purpose, not an outage. `config/prices.json` `paused_since` makes the site say "paused" (#75). Do not re-enable a poll without Danny.
- Open PRs: #76 only (Hermes, Electron 33 to 45 with a launch test, 6 checks green).

Waiting on Danny:
- #76 Electron 45: waits on Danny's on-PC test of the CI installer. Do not merge before he says so.
- Glorg handover: Danny said 11-03 he would message Glorg himself. Do not task Glorg with the digest.
- Old tokens and Glorg's old webhooks: Danny does one cleanup pass himself. Do not ask him daily.

Watch out:
- Polls commit only `data/sources` files; `scripts/live_data.py` applies prices at build time. Do not make a fetcher write `data/data.json` again (`tests/live_data_test.py`).
- `dist/` is not committed; CI builds it. Build locally only to test, and check the build output first.
- `docs/ai/danny-digest.md` is retired; `tests/digest.test.js` fails if it comes back. Hermes owns the digest on Discord.
- `tests/monkey.js` reads live data with fixed seeds, so a data change can turn it red with no code change. Check other PRs before blaming your diff.
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (pinned by `tracker/tests/overlaywin.test.js`).
- decisions.md: date every line, tag `[superseded ...]`/`[supersedes ...]` in pairs, never file calls under Open decisions (`tests/decisions_test.py`). Two PRs appending to it conflict: keep both lines, chronological.
- Changelog cards: a plain card is a patch; `data-minor` starts the next 0.x.0 and is for big additions only. Run `node tracker/scripts/sync-site-changelog.js` after a new card.
- KPQ weights are placeholders until 10 real rounds exist (carried from 10-31, not re-checked).

Who does what:
- Any agent may pick up any PR, branch or thread unless it is live (a current `[CLAIM]`, a worklog line or a push in the last hour; START-HERE norm 4). Log each session in `docs/ai/agent-worklog.md`.
- Hermes (Danny's Windows box): Danny's digest, this briefing, [Archive] rotation, Discord moderation, #agent-pings on request, PR review, dependabot merges. Ask in the mailbox addressed to Hermes.
- Glorg [z.ai]: Danny briefs it on the handover himself.
