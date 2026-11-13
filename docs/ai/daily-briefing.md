# Daily briefing

last-verified: 2026-11-13 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is not in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- Site `0.24.5` live, tracker `v0.3.47` latest release (11-06 05:55 UTC, installer + blockmap + latest.yml all on it, not a draft). Head is `0cf6670` (classicmarket price commit, read 19:43 UTC 11-13); its pages runs passed. Re-check with `git log` before naming head.
- Open PRs: #121 (hide maplestory.watch prices once stale, #93; checks green, not reviewed by Hermes) and #115 (docs: repair `docs/ai/decisions.md` splice from #109, branch `glorg/decisions-splice-fix`, checks green; open since 11-06). The 11-11 briefing PR #122 was closed unmerged after a runner DNS error (`Temporary failure resolving` the apt mirror); its replacement #123 merged 11-12 14:00 UTC.
- **Towns** (#111, #112): time on a map with no monster spawn in the game data (maps + mobdb) never counts, and the tracker arms after Start (waits for a KPQ round or 5 monster-EXP gains in 60 s). There is no town flag in the game data; do not add a hand-kept town list.
- **Bug reports** (#107, #110): a `report-*` folder renamed `-checked` is deleted at tracker start; automatic reports cap at 1 GB; report pictures stay lossless (the lossy spike failed reader tests). Snapshot `snap-*` pictures live in the runs folder and are never pruned.
- **Server admin tool** (#113): `/api/admin/*` behind a key checked by SHA-256; the key lives only on Danny's PC. How to use it: `docs/ai/server-admin.md`. Every admin delete is real data and needs Danny's OK per action. Never print or commit the key.
- **Server review fixes** (#104, #105): item caps count distinct ids (60 per run, 30 per mob, measured on 81 real sessions); `IP_SALT` is set at deploy from the repo secret. Party-code group hashes keep the D1 salt on purpose (see `docs/ai/decisions.md`).
- `main` is PR-only: required checks `docs`, `test (core|pages|edge)`, `tracker ok`, squash-merge, no admin bypass. Use `gh pr merge --auto --squash`. Never write the skip-ci marker in your own commit message.

Waiting on Danny:
- Issue #93 (watchdog): the maplestory.watch half of `scripts/fetch_shopscans.py` fails behind a challenge wall and its data was 178 h old at the 11-06 07:56 UTC check (not re-checked since); the poll stays green because mesoarbitrage still fetches. Danny decides whether to turn that source off. Do not disable it before he says so.
- Old tokens and Glorg's old webhooks: Danny does one cleanup pass himself. Do not ask him daily.

Watch out:
- A green poll can still carry frozen data: a failed fetch keeps the old file. Read the watchdog issue, not only the run status.
- The meowdb market poll timed out once (carried from 11-06, not re-checked) (fetch step hit 40 minutes); the next run passed. A repeat is a bug, not flake.
- A CI runner lost DNS on 11-11 (briefing PR #122, apt mirror unresolvable); a rerun is fine once, a repeat needs the log read. Site tests last succeeded 11-12 12:47 UTC.
- Release path: `tracker/scripts/prepare-release.js` makes a draft first; `tracker/tests/release.test.js` pins the builder line that reuses it. If a builder bump fails that test, the two-publisher race is back.
- Polls commit only `data/sources` files; `scripts/live_data.py` applies prices at build time. Do not make a fetcher write `data/data.json` again (`tests/live_data_test.py`).
- `tests/smoke.js` now warns when a table has under 8px spare at 1300px (#106). Treat a warning as "add headroom now": price refreshes change column widths with no code change.
- Feed pills, tags and Home's feed buttons use 4px corners (#103, provisional 24h from 11-05); smoke pins them. Dots, counters and map markers stay round.
- `dist/` is not committed; CI builds it. Build locally only to test, and check the build output first.
- `docs/ai/danny-digest.md` is retired; `tests/digest.test.js` fails if it comes back. It also lints changelog cards in `src/pages/log.html` for banned words, in CI only.
- decisions.md: date every line, tag `[superseded ...]`/`[supersedes ...]` in pairs, never file calls under Open decisions (`tests/decisions_test.py`). Two PRs appending to it conflict: keep both lines, chronological.
- Changelog cards: a plain card is a patch; `data-minor` is for big additions only. Run `node tracker/scripts/sync-site-changelog.js` after a new card.
- KPQ weights are placeholders until 10 real rounds exist (carried from 10-31, not re-checked).

Who does what:
- Any agent may pick up any PR, branch or thread unless it is live (a current `[CLAIM]`, a worklog line or a push in the last hour; START-HERE norm 4). Log each session in `docs/ai/agent-worklog.md`.
- Hermes (Danny's Windows box): Danny's digest, this briefing, [Archive] rotation, Discord moderation, #agent-pings on request, PR review, dependabot merges, server admin tool. Ask in the mailbox addressed to Hermes.
- Glorg [z.ai]: runs in fresh sandboxes and cannot push (mailbox FYI 11-05); log its handovers for it.
