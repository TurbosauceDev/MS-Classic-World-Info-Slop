# Daily briefing

last-verified: 2026-11-16 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is not in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- **Eight workflows were disabled by hand on 11-15, 10:45:55 to 10:48:34 PT** (`gh workflow list --all` shows `disabled_manually`): classicmarket poll, meowdb market poll, mesoindex poll, shopscans poll, watchdog, shared-data, pages and d1-backup. The meso.watch poll has been off since 11-04. Who did it and why is unknown: there is no `docs/ai/decisions.md` line, mailbox entry or worklog line, and the first disable came 5 min 55 s after #127 merged. Hermes asked Danny in digest issue 25 (11-16). No workflow run of any kind has started since 18:40 UTC on 11-15 (checked 12:52 UTC on 11-16). Do not enable or disable any workflow until Danny answers.
- What that freezes: prices (last poll commits, 11-15 UTC: mesoindex 17:57, classicmarket 17:29, shopscans 17:06, meowdb market 16:48), site deploys (`pages` is off, so a merged site change does not go live), the watchdog, and the `d1-backup` copy (last pass 11-15 16:32 UTC). `config/prices.json` `paused_since` is still `null`, so the site will call old prices "stale", not "paused". Still active: Docs check, Site tests, tracker, server, classicrank-census, osms-names.
- Site `0.24.5` live, tracker `v0.3.47` latest release (11-06 05:55 UTC, installer + blockmap + latest.yml all on it, not a draft). Head is `9e50fc6` (#127: `pages` waits 60 s before it retries `deploy-pages`; merged 11-15 18:40 UTC; read 12:53 UTC on 11-16). Re-check with `git log` before naming head.
- Open PRs: #121 (hide maplestory.watch prices once stale, #93; checks green, not reviewed by Hermes) and #115 (docs: repair `docs/ai/decisions.md` splice from #109, branch `glorg/decisions-splice-fix`, checks green; open since 11-06). The 11-15 briefing PR #126 merged. Since digest issue 24 (13:06 UTC on 11-15) there were 2 work commits (#126, #127) and 5 poll-bot commits, none after 17:57 UTC.
- **Towns** (#111, #112): time on a map with no monster spawn in the game data (maps + mobdb) never counts, and the tracker arms after Start (waits for a KPQ round or 5 monster-EXP gains in 60 s). There is no town flag in the game data; do not add a hand-kept town list.
- **Bug reports** (#107, #110): a `report-*` folder renamed `-checked` is deleted at tracker start; automatic reports cap at 1 GB; report pictures stay lossless (the lossy spike failed reader tests). Snapshot `snap-*` pictures live in the runs folder and are never pruned.
- **Server admin tool** (#113): `/api/admin/*` behind a key checked by SHA-256; the key lives only on Danny's PC. How to use it: `docs/ai/server-admin.md`. Every admin delete is real data and needs Danny's OK per action, and the nightly `d1-backup` is off right now. Never print or commit the key.
- **Server review fixes** (#104, #105): item caps count distinct ids (60 per run, 30 per mob, measured on 81 real sessions); `IP_SALT` is set at deploy from the repo secret. Party-code group hashes keep the D1 salt on purpose (see `docs/ai/decisions.md`).
- `main` is PR-only: required checks `docs`, `test (core|pages|edge)`, `tracker ok`, squash-merge, no admin bypass. Use `gh pr merge --auto --squash`. Never write the skip-ci marker in your own commit message.

Waiting on Danny:
- The 11-15 workflow disable (digest issue 25, decision 1): on purpose or not, and if on purpose, a price pause like 11-03 or a full pause. Until he answers, treat the frozen prices and missing deploys as unexplained, not as a bug to fix. If your work needs a poll or a `pages` run, post in the mailbox addressed to Hermes.
- Issue #93 (watchdog): the maplestory.watch half of `scripts/fetch_shopscans.py` fails behind a challenge wall and its data was 178 h old at the 11-06 07:56 UTC check (not re-checked since; the watchdog is off, so #93 cannot update). Danny decides whether to turn that source off. Do not disable it before he says so. It waits on the item above.
- Old tokens and Glorg's old webhooks: Danny does one cleanup pass himself. Do not ask him daily.

Watch out:
- While a workflow is off, `gh run list` keeps showing its last pass, hours or days old. Check `gh workflow list --all` for each workflow's state before you call the pipeline healthy.
- A green poll can still carry frozen data: a failed fetch keeps the old file. Read the watchdog issue, not only the run status.
- The meowdb market poll timed out once (carried from 11-06, not re-checked) (fetch step hit 40 minutes); the next run passed. A repeat is a bug, not flake.
- Site tests and Docs check last passed 11-15 18:40 UTC (push of #127); the `pages` run on that push passed. The two red `pages` runs of 11-11 and 11-13 have causes in `docs/ai/state-of-the-pipeline.md` (11-15 entry): a missing artifact on 11-11, the 10-minute Pages backend stall on 11-13.
- A CI runner lost DNS on 11-11 (briefing PR #122, apt mirror unresolvable); a rerun is fine once, a repeat needs the log read.
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
- Claude Code sessions (Danny's desktop) open branches named claude/...: the `pages` deploy retry (#120, #127) and #121. The #127 body says Danny approved the merge.
- Glorg [z.ai]: runs in fresh sandboxes and cannot push (mailbox FYI 11-05); log its handovers for it.
