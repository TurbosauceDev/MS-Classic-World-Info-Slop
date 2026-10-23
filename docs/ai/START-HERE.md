# START HERE — agent onboarding

> **Sign-as convention (Danny 2026-10-22):** Z.ai signs as **Z.ai** (formerly "claude (chat-CLI)"). Claude Code project threads sign as **Claude Agent : [ID]** (coordinator-assigned T-XX, else last 6 of session id). Older entries signed "claude (chat-CLI)" are Z.ai historically — not relabeled.

**You are an agent. You just opened this repo. This is the file to read first.**

This file exists because agents kept re-discovering things the hard way —
re-reading the same context, missing messages in the mailbox, breaking
things the traps already documented. The shared docs below are how we
avoid that. Read them. Not optional.

## Why these docs matter (and what breaks if you skip them)

| Doc | Why it matters | What breaks if you skip it |
|---|---|---|
| `docs/ai/START-HERE.md` (this file) | Tells you what to read + in what order | You waste an hour re-deriving context that's already written down |
| `docs/ai/state-of-the-pipeline.md` | Current snapshot of schema, sources, CI, traps | You'll use stale field names, push code that breaks the build, or propose something that's already done |
| `docs/ai/agent-mailbox.md` | Direct messages between agents | You'll miss an Open thread addressed to you + the sender will assume you're ghosting them |
| `docs/ai/agent-worklog.md` | One-line per session activity feed | You'll redo work someone else just finished; or you'll step on a concurrent edit because you didn't see the latest commit |
| `docs/ai/daily-briefing.md` | Today's digest — what landed, what's broken, today's priorities | You'll work on yesterday's problem instead of today's |
| `docs/ai/danny-digest.md` | Plain-English briefing for Danny (less technical) | If Danny asks "what's up?" you'll dump 500 lines of jargon on him instead of pointing him at one short doc |
| `docs/ai/mesowatch-sync.md` | Canonical plumbing handoff for the meso.watch pipeline | You'll break the Cloudflare bypass, the localStorage transport, or the cron-scheduling pattern (each one took hours to figure out) |
| `docs/ai/decisions.md` | Dated decision log — every non-trivial call Danny made | You'll re-litigate a decision Danny already made, or undo a constraint that exists for a reason |
| `docs/ai/fixtures.md` | Test image index | Your new test image will fail the fixtures check + your CI will go red |

**Read order for a new agent:**

1. **This file** (`docs/ai/START-HERE.md`) — what you're reading now
2. `docs/ai/state-of-the-pipeline.md` — current snapshot, 5 min read
3. `docs/ai/agent-mailbox.md` § Open + § FYI — anything addressed to you, 2 min skim
4. `docs/ai/agent-worklog.md` § Recent — last 7 days of activity, 1 min skim
5. `docs/ai/daily-briefing.md` — today's digest, 3 min read
6. **Then** decide what you're doing and read the relevant deeper doc:
   - Touching the pipeline? → `docs/ai/mesowatch-sync.md`
   - Touching the schema? → `docs/ai/state-of-the-pipeline.md` § 3
   - Touching CI? → `docs/ai/state-of-the-pipeline.md` § 6 + § 9 (traps)
   - Frontend work? → look at `src/js/` + `dist/index.html` patterns
   - Replying to another agent? → `docs/ai/agent-mailbox.md` (post in same file)

## Agent norms (don't violate these)

1. **Append-only for the mailbox + worklog.** Never delete or edit another agent's message after posting. If you need to correct, post a follow-up in the same thread.
2. **Sign everything.** Use a stable agent name in the "Who's who" table of `docs/ai/agent-mailbox.md`. New agents: add yourself there before posting anywhere.
3. **Don't impersonate.** If you're a fresh Claude thread, use a new name (e.g. `claude (session-XYZ)`) — don't reuse `claude (project-side)`. Z.ai (Danny's assistant, formerly signed `claude (chat-CLI)`) signs as **Z.ai**; Claude Code project threads sign as **Claude Agent : [ID]** (coordinator-assigned T-01, T-02, ...; else last 6 chars of the session id) (Danny 2026-10-22).
4. **Push to `main` directly for docs.** Docs pushes are pre-approved by Danny — no PR needed. Run `node tests/docs.test.js` first to verify paths.
5. **Don't relay through Danny.** That's why the mailbox exists. Post directly.
6. **Refresh the daily-briefing + danny-digest at the start of your work session** if they're stale (>24h old). It's a 5-minute task. Overwrite the file, don't append.
7. **Refresh `docs/ai/state-of-the-pipeline.md` when:** the schema grows, a new source is added, an external API is integrated, or a critical bug is found. Append an "Updated YYYY-MM-DD: ..." note at the top.
8. **Append a worklog entry after every session** — one line, format: `YYYY-MM-DD HH:MMZ | agent-name | one-line summary | commit hash or files touched`.
9. **For code changes** (not docs): follow the existing patterns. Look at how the latest similar fetcher is structured (`scripts/fetch_mesoindex.py` is the most recent example), copy the shape, don't invent new conventions.
10. **For schema changes**: additive only. Don't remove fields without checking with Danny in-thread. Don't reorder arrays (the frontend reads by index).

## Decision tree — where to start based on what you're doing

```
What are you here to do?
│
├─ Picking up the repo for the first time
│   → Read in order 1-6 above. Then look at the "What to do next, per
│   agent" section of `docs/ai/state-of-the-pipeline.md` § 10.
│
├─ Picking up a specific feature
│   → `docs/ai/state-of-the-pipeline.md` § 10 (what to do next per agent) →
│   → find your role → follow the prioritized list
│
├─ Debugging a CI failure
│   → `docs/ai/state-of-the-pipeline.md` § 6 (CI workflow state) →
│   → `docs/ai/state-of-the-pipeline.md` § 9 (traps) →
│   → if it's a docs test failure, run `node tests/docs.test.js` locally →
│   → if it's a smoke/site test, look at the latest project-side commit
│
├─ Adding a new data source fetcher
│   → docs/ai/mesowatch-sync.md § Schema (current shape) →
│   → pick the latest similar fetcher as template (scripts/fetch_mesoindex.py
│   is the most recent cross-marketplace example) →
│   → write scripts/fetch_<source>.py + step(D) function →
│   → write .github/workflows/<source>-poll.yml at an off-minute →
│   → add to tests/docs.test.js IGNORE if it generates data files →
│   → wire into build_data.py PARTIAL map →
│   → run node tests/docs.test.js →
│   → push to main + post a FYI in `docs/ai/agent-mailbox.md`
│
├─ Replying to another agent
│   → docs/ai/agent-mailbox.md § Open → find the thread addressed to you →
│   → append your reply under their "**Reply:** (none yet)" line, replacing it
│   with a nested quote block (see "How to use" rules at top of mailbox) →
│   → if the thread is resolved, move the whole thing to § Closed
│
├─ Investigating a new external API
│   → WebFetch the dev docs → if blocked, try the site's JS bundle (look for
│   "useApi" or "client" in asset names) → grep for endpoint patterns →
│   → write up findings + integration plan in a FYI to all agents in mailbox →
│   → wait for Danny to provide any needed API key before writing the fetcher
│
├─ Frontend rendering work
│   → `docs/ai/state-of-the-pipeline.md` § 3 (schema) — find the field you'll render →
│   → look at src/js/ for similar existing rendering patterns →
│   → add the rendering + run `python3 scripts/build.py` →
│   → push (dist/index.html is rebuilt by pages.yml + tests.yml, not polls)
│
└─ Just looking around
    → `docs/ai/state-of-the-pipeline.md` § 1 (snapshot) + § 2 (recent activity) is enough
```

## Sandbox vs repo — know the difference

**Repo paths (in `github.com/TurbosauceDev/MS-Classic-World-Info-Slop`):**
- All `docs/ai/*.md` shared files
- `scripts/` (fetchers, builders, poller)
- `.github/workflows/` (CI workflows)
- `data/sources/` (generated data files — fetched by pollers)
- `data/data.json` (compiled site data — built by `scripts/build_data.py`)
- `dist/index.html` (compiled site — built by `scripts/build.py`)
- `src/js/` + `src/pages/` (frontend source)
- `tests/` (test suite, including `tests/docs.test.js`)

**Sandbox paths (only on Z.ai's chat-CLI machine, `/home/z/my-project/`):**
- `/home/z/my-project/.secrets/` — API keys + PAT (chmod 600, never paste in chat)
- `/home/z/my-project/scripts/gh_push_files.py` — Git Data API pusher for one-off pushes from chat
- `/home/z/my-project/scripts/meso_watch_poll.sh` — chat-CLI trigger for the meso.watch workflow
- `/home/z/my-project/download/` — local copies of deliverables for Danny to read without cloning
- `/home/z/my-project/upload/` — files Danny drops in chat (videos, screenshots, etc.)
- `/home/z/my-project/tmp/` — working scratch space (frame extractions, etc.)
- `/home/z/my-project/worklog.md` — local Z.ai's own session log (separate from the in-repo `docs/ai/agent-worklog.md`)

**The in-repo `docs/ai/agent-worklog.md` is the shared one.** The sandbox `/home/z/my-project/worklog.md` is just for chat-CLI claude's own session notes. Don't confuse them.

## If you only have 2 minutes

1. Read `docs/ai/state-of-the-pipeline.md` § 1 (snapshot, 1 paragraph)
2. Skim `docs/ai/agent-mailbox.md` § Open for anything addressed to you
3. Skim `docs/ai/agent-worklog.md` § Recent for the last 2-3 entries
4. Read `docs/ai/daily-briefing.md` (today's digest, 3 min)

Then post a worklog entry when you start work + another when you finish.

## Quick reference — all shared docs

| Doc | Purpose | Refresh cadence |
|---|---|---|
| `docs/ai/START-HERE.md` | This file — agent onboarding | when norms change |
| `docs/ai/state-of-the-pipeline.md` | Current snapshot of schema, sources, CI, traps | on schema/source/API/critical-bug changes |
| `docs/ai/agent-mailbox.md` | Direct messages between agents | append-only |
| `docs/ai/agent-worklog.md` | One-line per session activity feed | append after every session |
| `docs/ai/daily-briefing.md` | Daily newspaper for agents | overwrite daily |
| `docs/ai/danny-digest.md` | Plain-English briefing for Danny | overwrite daily |
| `docs/ai/mesowatch-sync.md` | Canonical meso.watch pipeline handoff | when pipeline plumbing changes |
| `docs/ai/decisions.md` | Dated decision log | append on every non-trivial call |
| `docs/ai/fixtures.md` | Test image index | append when adding new fixtures |

---

**Welcome. Read the snapshot. Check the mailbox. Do your work. Append your worklog. Done.**
