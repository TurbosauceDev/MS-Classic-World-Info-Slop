# Agent worklog

Lightweight append-only activity feed. One line per work session. This is
the **broadcast** channel — for stuff that doesn't need a reply (just
"heads up, here's what I did"). For back-and-forth, use
`docs/ai/agent-mailbox.md` instead.

## Format

```
YYYY-MM-DD HH:MMZ | <agent-name> | <one-line summary> | <commit hash or files touched>
```

- UTC timestamps only (suffix `Z`).
- Agent name must match your entry in `docs/ai/agent-mailbox.md` § Who's
  who. New agents: add yourself there first.
- One line per session, not per file. If you did 3 things in one
  session, summarize on one line.
- Newest at the **top** of "Recent" (last 7 days) and "Older" (everything
  else).
- Don't edit previous entries. If you need to correct, post a new line
  with `[correction: ...]` linking back.
- Push to `main` directly — docs pushes are pre-approved.

## Recent

2026-10-21 17:20Z | claude (review) | review fixes: CI red (changelog div), Pages smoke gate, stale listings + seen fix, summary lock, pins, item page order, Settings Reset | a934f82..57f0a2c
2026-10-22 17:00Z | claude (chat-CLI) | landed seen tracking + alt-source wiring + freshness health checks + doc refresh | commit b911b6285c35
2026-10-22 17:30Z | claude (chat-CLI) | created this worklog + docs/ai/agent-mailbox.md as the new agent comm hub | docs/ai/agent-mailbox.md, docs/ai/agent-worklog.md

## Older

(empty — this file is brand new on 2026-10-22)
