# Discord digest pipeline runbook

How Danny's daily digest actually gets built, linted, posted and rotated.
The file shape lives in `docs/ai/digest-contract.md` (source of truth);
this doc covers the transport, state and rotation mechanics. Owner:
Glorg [z.ai] (Discord surface). Everything here was learned by doing it
wrong first — don't re-learn it.

## Components

| What | Where | Notes |
|---|---|---|
| Routing config | `config/digest.json` | Schedule, file paths, attachment name pattern, secret name, archive thread id. The job reads this; nothing hardcodes it. |
| File shape + lint | `docs/ai/digest-contract.md`, `scripts/lint_digest.js` | Lint is a hard gate before any post. |
| Reference rotation script | `scripts/digest/rotate-digest.sh` | Parameterized, no secrets. Sandbox copy: `/home/z/my-project/scripts/rotate-digest.sh`. |
| Webhook URLs | sandbox secrets only (`/home/z/my-project/.secrets/discord-daily-webhook`, `.secrets/agent-pings-webhook`) | Config names the secret (`DISCORD_DAILY_UPDATES_WEBHOOK`), never holds it. Never printed, never committed. |
| Rotation state | `/home/z/my-project/.secrets/digest-state.json` | `{last_message_id, last_issue, last_file, archived_through}` |
| Schedule | 04:45 `America/Los_Angeles` daily | Danny wakes early; this is his morning briefing. |

## Flow (one run)

1. `git pull --rebase` in the repo clone.
2. Read state file → new issue number = `last_issue + 1`.
3. Gather last-24h content: git log (all agents), mailbox threads, worklog, decisions, CI status, live-site version stamp.
4. Overwrite `docs/ai/danny-digest.md` in contract shape (front matter + six `##` sections, 150-line cap).
5. **Lint gate**: `node scripts/lint_digest.js docs/ai/danny-digest.md`. Fix and re-run until it passes; never post unlinted. Then `node tests/digest.test.js` + `node tests/docs.test.js`.
6. Refresh `docs/ai/daily-briefing.md` (free-form) from the same basis; bump its `last-verified:` stamp.
7. Commit as `docs(ai): daily digest`, push.
8. POST to #daily-updates: multipart with `?wait=true`, `payload_json` (username `Glorg [z.ai] Daily Digest`, one TL;DR caption line) + `files[0]` = digest bytes, named per the config pattern `danny-digest-{date}-issue-{issue}.md` (front-matter values). Capture the returned message id.
9. Rotate (failures here never block or undo step 8): if `last_issue > archived_through`, upload `last_file` to the [Archive] thread via `?thread_id=<config discord.archive_thread_id>`; then DELETE the stale channel message `<webhook>/messages/<last_message_id>`. If `last_issue <= archived_through`, skip the upload, still delete the stale post.
10. Update the state file with the new message id / issue / file path; keep `archived_through` as the guard against double-archiving.
11. One line in the worklog: issue number, message id, any rotation errors.

## Discord webhook mechanics (measured, not guessed)

- **Content cap: 2000 chars.** 2280 chars → HTTP 400. Anything longer goes out as a file, not text.
- **Multipart posts** take `payload_json` (as a form field) + `files[n]`; the JSON carries username/caption, the files carry the content.
- **`?wait=true`** makes Discord return the message JSON — capture the id. Only messages posted with a captured id are deletable later (`DELETE <webhook>/messages/<id>` → 204).
- **`?thread_id=<id>`** targets a thread under the webhook's channel. Wrong id → 400/403, so any 2xx is positive confirmation the post landed.
- **No discovery, no reads.** Without a bot token the webhook cannot read channel history or widget endpoints (50004) — it posts and deletes its own posts, nothing else.
- **File bytes = live file bytes.** The attachment is byte-identical to `docs/ai/danny-digest.md` at post time.

## Quiet-day policy

Every day gets a full (but short) contract-shape issue, even when nothing
happened. Bare one-line heartbeat posts are retired: the contract lints
the live file, and "no post today" should always mean "the pipeline is
broken", never "nothing to say". If a bare-heartbeat carve-out is ever
wanted, it needs explicit contract + lint changes first.

## Recovery (sandbox lost)

1. Clone the repo; read the contract, config and this file.
2. Re-store webhook URLs from the Discord channel settings into the secrets paths (chmod 600). The URLs are only recoverable from Discord by a human with channel access — ask Danny.
3. Rebuild the state file: last issue number from `git log docs/ai/danny-digest.md` front matter; message id from the newest #daily-updates post (Danny reads it out); `archived_through` = highest issue in the [Archive] thread.
4. `node scripts/lint_digest.js docs/ai/danny-digest.md` and `node tests/digest.test.js` until green.
5. Schedule the cron (04:45 America/Los_Angeles) and do one manual rotation with `scripts/digest/rotate-digest.sh` before trusting the schedule.
