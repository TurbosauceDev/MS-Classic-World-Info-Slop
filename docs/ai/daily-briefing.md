# Daily briefing

last-verified: 2026-11-02 by Hermes

Agent-facing, overwritten daily by Hermes (took over from Glorg [z.ai] on Danny's 11-02 call). Danny's own digest is no longer in the repo: it posts to Discord #daily-updates and stays on his machine.

TL;DR:
- Site `0.20.19` live, tracker `v0.3.39` latest release (11-02 18:46 UTC). Head is `76344db` (read 01:30 UTC 11-03).
- Repo review batches landed tonight (Danny 11-02): CI hygiene with one Playwright pin (#51), injection test for outside names (#52), docs diet with history split into `docs/ai/site-history.md` and `docs/ai/tracker-history.md` plus a size guard in `tests/docs.test.js` (#60), one shared poll push-retry script (#61). Still open: ratchet lints (#62), stop committing `dist/index.html` (#63), START-HERE trim (#59, draft, needs Danny), six dependabot bumps (#53 to #58, incl. electron 33 to 45 in #57).
- The window 10-31 to 11-02 was huge (100 work commits): tracker Skill range card (`0.3.29`), P0 wave shop watch + named shop uploads + boss spots (`0.3.30`), always-on runs (`0.3.32`), ocrs shop reader (`0.3.34`), koffi anchor mode (P1-8), quest window reader (`0.3.36`), three bug-hunt rounds (`0.3.38`). Site: skill range/hitbox + playable previews, weekly grind ladder + map rates (`0.20.12`), guessable URLs (#44), Builder section (#38), NX/Deco (#40, #42), static pages (#36, #41).
- electron-builder 26 (#33) passed its first real Windows build on `a62c579`.
- **meso.watch poller disabled** (Danny 11-02, `gh workflow disable`): upstream serves HTML where JSON should be, bot wall held 3 days (#25). A new approach comes later. PR #64 makes `scripts/watchdog.py` skip the meso.watch checks while the workflow is off. Do not re-enable without Danny.
- decisions.md got the contradiction check (#49, `tests/decisions_test.py`): date every line, tag `[superseded ...]`/`[supersedes ...]` in pairs, never file calls under Open decisions.

Waiting on Danny:
- maplestory.watch shop scans are 100 h stale (watchdog #25, still alarming): wait, pause or cut.
- Whether the repo copy `docs/ai/danny-digest.md` is retired now that the digest lives on Discord + his PC (contract and `tests/digest.test.js` still read it). Until he calls it, leave that file alone.
- Old GitHub PAT and Glorg's two webhook URLs were pasted in #glorg-chat 10-25/10-26. Hermes deleted the messages 11-02; revoking and regenerating is Danny's.

Watch out:
- Do not refresh `docs/ai/danny-digest.md` or post digests: Hermes owns the digest, outside the repo. START-HERE's "refresh the digest" step is stale for that file.
- `main` is not branch-protected: `gh pr merge --auto` merges at once without waiting for checks. Merge only after `gh pr checks` is all green.
- `tests/monkey.js` reads live price data with fixed seeds, so a price commit can turn it red with no code change. Check other PRs before blaming your diff.
- Do not re-add `process-per-site`, `single-process` or `in-process-gpu` (pinned by `tracker/tests/overlaywin.test.js`).
- Changelog cards: a plain card is a patch; `data-minor` starts the next 0.x.0 and is for big additions only (#50 fixed a misuse).
- KPQ weights are placeholders until 10 real rounds exist (carried from 10-31, not re-checked).

Who does what:
- Hermes (Danny's Windows box): Danny's digest, this briefing, [Archive] rotation, Discord moderation, #agent-pings on request, PR review. Ask in the mailbox addressed to Hermes; for a ping, say who and why.
- Glorg [z.ai]: Danny will brief it on the handover himself. Do not task Glorg with the digest.
