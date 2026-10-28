# docs/ai INDEX — the agentic wikipedia

Danny's rule (2026-10-28): **mailbox everything, as much as possible.** This folder is the
shared memory every agent reads and writes; if you learned something the next agent will need,
it belongs in one of these files, not just in chat. `docs/ai/START-HERE.md` is the reading order for
onboarding; this INDEX is the topic → file map for working. Keep both honest when you add files.

## Find a thing

| I need… | Read |
|---|---|
| Onboarding / reading order / agent norms | `docs/ai/START-HERE.md` |
| What changed recently, site + tracker + pipeline | `docs/ai/daily-briefing.md` (refreshed daily) |
| The whole week's narrative (day by day) | the newest `docs/ai/handoff-to-claude-2026-10-28.md` style file |
| A decision Danny or an agent made | `docs/ai/decisions.md` (grep it before proposing anything) |
| Where every open thread / request lives | `docs/ai/agent-mailbox.md` § Open (claim with a lease line) |
| Site: pages, cards, internals, history | `docs/ai/site.md`, `docs/ai/site-history.md`, `docs/ai/design.md` (visual law), `tests/features.js` + `tests/pages.js` (executable spec) |
| Tracker: modules, readers, releases | `docs/ai/tracker.md`, `tracker/app/changelog.js`, `tracker/tests/core.test.js` |
| Digest: shape, routing, runbook | `docs/ai/digest-contract.md`, `docs/ai/discord-digest-runbook.md`, `config/digest.json` |
| Data: sources, pollers, cadence, watchdog | `docs/ai/state-of-the-pipeline.md`, `data/sources/` read stamps, `tests/data_quality_test.py`, `scripts/price_blacklist.py` |
| meso.watch: pipeline schema, sync | `docs/ai/mesowatch-sync.md`, `docs/ai/tracker.md` |
| What NOT to do (each cost someone time) | the newest handoff's "Do NOT" list + `docs/ai/decisions.md` |

## Conventions (enforced where a test can see it)

- UTC everywhere (`Z` suffix), including chat surfaces.
- Backtick only real repo paths in `docs/ai/*.md` — `tests/docs.test.js` checks every one exists.
- Mailbox threads: one subject per thread, append-only (never edit another agent's words),
  claim with `[CLAIM] <name> <date> <time>Z — lease 24h`, move resolved threads Open → Closed.
- Sign as yourself; project threads sign `Claude Agent : <ID>`; Danny's rule: English on all Discord surfaces.
- Commit messages are the real changelog: one line, full reasoning. `git show <hash>` beats asking.

## Writing for the next agent

- State pointers, never secrets: name the secrets path, not the value.
- Every claim gets a date and (when it came from one) a commit hash or test name.
- If you debug something non-obvious, leave the diagnosis where you'd have looked for it —
  a mailbox thread for incidents, the relevant doc for mechanics.
- When a doc and the code disagree, the code wins; fix the doc in the same push.
