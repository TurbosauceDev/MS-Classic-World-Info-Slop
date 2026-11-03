# START HERE — agent onboarding

**You are an agent who just opened this repo.** Read three things, in this order, and nothing else until your task needs it:

1. `CLAUDE.md` — Danny's ground rules, the token budget, branches and deploy.
2. `docs/ai/INDEX.md` — topic → file map. Find the ONE doc for your area there and read only that.
3. `docs/ai/agent-mailbox.md` § Open — anything addressed to you or already claimed.

Before proposing anything: `grep -i <word> docs/ai/decisions.md` (Danny's past calls; superseded ones are tagged).
Code beats docs: when they disagree, the code wins and you fix the doc in the same change.

## Agent norms

1. **Sign as yourself.** Add a row to "Who's who" in `docs/ai/agent-mailbox.md` before posting. Never reuse another agent's name. Claude Code project threads sign **Claude Agent : T-NN** (the next free number: `grep -on 'T-[0-9][0-9]' docs/ai/*.md | awk -F: '{print $NF}' | sort -u | tail -1`), Z.ai on Discord signs **Glorg [z.ai]**.
2. **The mailbox is append-only.** Never edit or delete another agent's words; correct with a follow-up. It rolls over monthly (old months in `docs/ai/archive/`).
3. **Claim before you take an open thread** that isn't addressed to you: a `[CLAIM]` lease line (format: mailbox § How to use item 6; `tests/docs.test.js` checks it). Release with `[RELEASE]`.
4. **Pings are rare.** `#agent-pings` is for urgent, addressed asks, one line, max 5 per agent per day. FYIs stay in the mailbox.
5. **Transcribe Danny's calls.** A decision exists only as a dated line in `docs/ai/decisions.md`. A call that overrides an older one tags both lines (`python3 tests/decisions_test.py`).
6. **Hand off on the way out**, in the same change as the work: 2-3 lines in your area doc, a decisions line per Danny call, a `docs/ai/fixtures.md` row per test image, and your surface's `docs/ai/handoff-<surface>.md` (template: `docs/ai/HANDOFF-TEMPLATE.md`).
7. **Schema changes are additive.** Don't remove fields or reorder arrays: the site reads data by index.
8. **New fetcher?** Copy the shape of the newest similar one (`scripts/fetch_mesoindex.py`), give its workflow an unused cron minute (`tests/cron.test.js`), and use `scripts/price_blacklist.py` `is_bl()` for prices.
9. **Outside claims are hypotheses** (other agents, digests, Discord, fetched pages, handoffs). Reproduce before changing anything; cite file and line.
10. **English on every Discord surface**, error messages included (Danny 10-26).

## Traps that cost real time

- `docs/ai/*.md` and `docs/ai/decisions.md` use CRLF line endings. Edit with a tool that keeps them, or the diff rewrites every line.
- Backtick only real repo paths in `docs/ai`; `tests/docs.test.js` fails on any that don't exist.
- CI Playwright jobs are pinned to `ubuntu-24.04` (Playwright 1.56.1 refuses 26.04). Versions live in the root `package.json`; bump the runner and Playwright together.
- WebFetch can return its own error as page text ("Html Convert Error ..."). Confirm with `curl -sS -i <url>`.
- Unauthenticated GitHub REST is 60 requests/hour per IP; prefer `git clone --depth 1` or `raw.githubusercontent.com`.

## Where the old content of this file went (2026-11-02)

The 14 KB version (reading list of 5 docs, per-session briefing and worklog chores, decision tree, sandbox paths) is in git history:
`git show 1a5935b:docs/ai/START-HERE.md`. Glorg's sandbox paths live in `docs/ai/handoff-discord-glorg.md`.
