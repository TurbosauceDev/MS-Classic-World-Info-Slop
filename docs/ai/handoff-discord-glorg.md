# Standing handoff — Discord surface (Glorg [z.ai])

## Snapshot
- Last updated: 2026-10-25 19:5xZ by Glorg [z.ai]
- Repo HEAD: 51560e5 + the comms-upgrade commit this file ships in (CI: docs check success; site tests/pages/tracker green on 1568924)
- Deployed site: v0.18.1, built Oct 25 2026 19:13 UTC (includes T-07's UI copy fixes)
- My sandbox: /home/z/my-project (alive)

## What I own
- The daily digest pipeline: `docs/ai/danny-digest.md` (contract shape per `docs/ai/digest-contract.md`), posted as a Markdown attachment to Discord #daily-updates at 04:45 America/Los_Angeles, stale issues rotated to the [Archive] thread. Mechanics: `docs/ai/discord-digest-runbook.md`.
- `docs/ai/daily-briefing.md` daily refresh (folded into the same cron run).
- The agent ping bridge for Discord-side agents (#agent-pings webhook; rules in `docs/ai/agent-mailbox.md` § How to use).

## In flight right now
- Digest cron (04:45 PT, lint-gated, contract shape): next unattended run produces Issue #5. State file says last_issue 4, archived_through 4, so tomorrow archives nothing and only deletes the stale #daily-updates post.
- Quiet-day carve-out question parked in the mailbox (bare heartbeats vs full short issues) — awaiting T-07/Danny; my default is full short issues.

## State pointers (paths, never values)
- `/home/z/my-project/.secrets/discord-daily-webhook` — #daily-updates webhook URL (name in config: `DISCORD_DAILY_UPDATES_WEBHOOK`)
- `/home/z/my-project/.secrets/agent-pings-webhook` — #agent-pings webhook URL
- `/home/z/my-project/.secrets/digest-state.json` — `{last_message_id, last_issue, last_file, archived_through}`
- `/home/z/my-project/.secrets/gh-pat` + `~/.git-credentials` — GitHub fine-grained PAT (credential-URL line format, not a bare token)
- `/home/z/my-project/scripts/check-ci.sh` — CI status per commit (actions API; needs full sha)
- `/home/z/my-project/scripts/rotate-digest.sh` — sandbox rotation script (repo reference: `scripts/digest/rotate-digest.sh`)
- `/home/z/my-project/download/digest-archive/` — local copies of posted issues

## Open threads waiting on me
- T-07 "executable digest spec" — my three asks are done and acked in-thread; thread can move to Closed once T-07 confirms.

## Gotchas learned (don't re-learn these)
- Fine-grained PAT lacks checks:read — the check-runs API returns empty; use `actions/runs?head_sha=<full sha>` instead (short shas silently match nothing).
- Discord webhook content caps at 2000 chars (HTTP 400 past it) — post files via multipart `payload_json` + `files[n]`.
- `?wait=true` is required to capture a message id, and only messages posted with an id are deletable by the webhook.
- `?thread_id=` lands the post in the thread; bad ids give 400/403, so 2xx is positive confirmation.
- Webhooks cannot read channel history or discovery endpoints (no bot token) — don't try.
- Digest lint bans em-dashes and "basically/obviously" on top of design.md §10 — write the digest with that in mind from the first draft.

## If I vanish tomorrow
1. Clone the repo; read `docs/ai/digest-contract.md`, `config/digest.json` and `docs/ai/discord-digest-runbook.md`.
2. Re-store the two webhook URLs from Danny's Discord channel settings into the secrets paths listed above (chmod 600).
3. Rebuild `/home/z/my-project/.secrets/digest-state.json`: last issue number from `git log docs/ai/danny-digest.md` front matter, message id from the newest #daily-updates post (Danny can read it out), archived_through from the [Archive] thread contents.
4. Run `node scripts/lint_digest.js docs/ai/danny-digest.md` + `node tests/digest.test.js`; fix until green.
5. Schedule the cron per the runbook (04:45 America/Los_Angeles) and do one manual rotation with `scripts/digest/rotate-digest.sh` to prove the flow.
