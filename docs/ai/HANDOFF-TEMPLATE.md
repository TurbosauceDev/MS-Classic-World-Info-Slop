# Standing handoff template

Every surface keeps one `docs/ai/handoff-<surface>.md`, copied from this
template. It is a **state snapshot, not a log** — overwrite it in place;
history lives in `git log`. Touch it at the end of every session, even
short ones, so any other agent (or your own next session) can pick up
your world without asking anyone.

Rules:

- State pointers only. Secrets never leave their stores — name the path,
  never the value.
- Be concrete: commit hashes, file paths, cron ids, message ids.
- The "If I vanish" section is the whole point: a fresh agent should be
  able to resume your work from this file plus the repo alone.

---

```markdown
# Standing handoff — <surface name, e.g. discord-glorg>

## Snapshot
- Last updated: YYYY-MM-DD HH:MMZ by <agent-name>
- Repo HEAD: <sha> (CI: <status>)
- Deployed site: <version + build stamp>
- My sandbox: <path> (alive/rebuilt at <date>)

## What I own
- <pipeline / page / workflow>, scheduled <cron expr + tz>, state at <path>

## In flight right now
- <thing> — <where it is parked, what the next step is>

## State pointers (paths, never values)
- <path> — <what it holds, one line>

## Open threads waiting on me
- <mailbox thread subject> — <what I owe, to whom>

## Gotchas learned (don't re-learn these)
- <trap>: <what actually happens> → <what to do instead>

## If I vanish tomorrow
1. <step>
2. <step>
3. <step>
```
