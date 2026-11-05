# Daily briefing

last-verified: 2026-11-05 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is not in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- Site `0.24.3` live, tracker `v0.3.42` latest release (11-05 07:57 UTC, installer + blockmap + latest.yml all on it). Head is `e4c033e` (classicmarket price commit, read 12:50 UTC 11-05); its pages run passed. Re-check with `git log` before naming head.
- No open PRs. #76 (Electron 33 to 45 + launch test) merged 11-05.
- **Release path changed** (#101): `tracker/scripts/prepare-release.js` makes a draft first, electron-builder uploads into it, `tracker/scripts/publish-release-notes.js` un-drafts only when all three assets landed. `tracker/tests/release.test.js` pins the builder line that reuses a draft; if a builder bump fails it, the two-publisher race is back.
- **Prices resumed** (Danny 11-05, #91): classicmarket, meowdb market, mesoindex, shopscans polls are on; `config/prices.json` `paused_since` is null. meso.watch stays disabled (403 to CI, #95). Do not re-enable a source that never worked without Danny.
- `main` is PR-only: required checks `docs`, `test (core|pages|edge)`, `tracker ok`, squash-merge, no admin bypass. Use `gh pr merge --auto --squash`. Never write the skip-ci marker in your own commit message.
- Tracker 0.3.40 to 0.3.42 (#90, #94, #98, #99, #100): KPQ rounds come from the round clock's epoch, map titles answer from a picture fingerprint (`tracker/core/mapfp.js`) before OCR, bug reports carry a flight recorder and `--replay` mode. Several of these calls are "Provisional 24h" in `docs/ai/decisions.md`.
- Server hardening (#97): the IP salt is the Worker secret `IP_SALT`; never write its value anywhere.

Waiting on Danny:
- Issue #93 (watchdog): the maplestory.watch half of `scripts/fetch_shopscans.py` fails behind a challenge wall ("challenge held" in the 12:16 UTC run log) and its data is 158 h old; the poll stays green because mesoarbitrage still fetches. Danny decides whether to turn that source off. Do not disable it before he says so.
- Old tokens and Glorg's old webhooks: Danny does one cleanup pass himself. Do not ask him daily.

Watch out:
- A green poll can still carry frozen data: a failed fetch keeps the old file. Read the watchdog issue, not only the run status.
- Polls commit only `data/sources` files; `scripts/live_data.py` applies prices at build time. Do not make a fetcher write `data/data.json` again (`tests/live_data_test.py`).
- `dist/` is not committed; CI builds it. Build locally only to test, and check the build output first.
- `docs/ai/danny-digest.md` is retired; `tests/digest.test.js` fails if it comes back. It also lints changelog cards in `src/pages/log.html` for banned words, in CI only.
- `tests/monkey.js` and the smoke fit checks read live data, so a price refresh can turn them red with no code change. Prove the baseline before blaming your diff.
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (pinned by `tracker/tests/overlaywin.test.js`).
- decisions.md: date every line, tag `[superseded ...]`/`[supersedes ...]` in pairs, never file calls under Open decisions (`tests/decisions_test.py`). Two PRs appending to it conflict: keep both lines, chronological.
- Changelog cards: a plain card is a patch; `data-minor` is for big additions only. Run `node tracker/scripts/sync-site-changelog.js` after a new card.
- KPQ weights are placeholders until 10 real rounds exist (carried from 10-31, not re-checked).

Who does what:
- Any agent may pick up any PR, branch or thread unless it is live (a current `[CLAIM]`, a worklog line or a push in the last hour; START-HERE norm 4). Log each session in `docs/ai/agent-worklog.md`.
- Hermes (Danny's Windows box): Danny's digest, this briefing, [Archive] rotation, Discord moderation, #agent-pings on request, PR review, dependabot merges. Ask in the mailbox addressed to Hermes.
- Glorg [z.ai]: Danny told it about the handover 11-04. It runs in fresh sandboxes and cannot push (mailbox FYI 11-05); log its handovers for it.
