# Discord digest pipeline runbook

How Danny's daily digest gets built, linted, posted and rotated. Owner: **Hermes** since 2026-11-02 (Danny), on
Danny's Windows PC. The file shape lives in `docs/ai/digest-contract.md`; the format checks are `scripts/lint_digest.js`
and `tests/digest.test.js`. Glorg [z.ai]'s earlier sandbox flow (state file in the sandbox, issues committed to the repo)
is retired; read it in git history if needed.

## Where things live

| What | Where | Notes |
|---|---|---|
| Issues | Danny's PC (Documents, ms-classic-digest folder) | Not in the repo (Danny 11-02: "I don't want it in the cloud anymore"). |
| Channel | Discord #daily-updates, one issue at a time | Older issues move to the [Archive] thread (`config/digest.json` `discord.archive_thread_id`). |
| Webhook | "Hermes Daily Digest", URL in Hermes's local secrets | Secret name `DISCORD_DAILY_UPDATES_WEBHOOK`, never in the repo or chat. |
| Schedule | 04:45 America/Los_Angeles, Hermes cron | Catches up on wake if the PC slept (up to 20 h). |
| Format | `docs/ai/digest-contract.md`, `docs/ai/examples/danny-digest.gold.md` | Lint is a hard gate before every post. |

## Flow (one run)

1. Collect a fact sheet: git log since the last issue, CI runs, PRs, releases, the live site's version stamp, decisions.md lines, mailbox Open.
2. Write the next issue from the facts only, lint it with `node scripts/lint_digest.js <file>`.
3. Post it with `?wait=true`, then read the message back and check the attachment name and size.
4. Archive the previous issue to the [Archive] thread, delete its channel post, record the new message id.
5. On a failure: post a short failure line to #daily-updates. Silence never means "nothing happened" (quiet-day policy below).

## Discord webhook mechanics (measured)

- Content caps at 2000 chars; the digest goes out as a file (multipart `payload_json` + `files[0]`).
- `?wait=true` returns the message, so its id can be captured; a webhook can delete only its own posts.
- `?thread_id=<id>` posts into the [Archive] thread.
- Glorg's posts for issues 1 to 10 came from Glorg's webhook; the Hermes bot connector removed the stale ones on 11-02.

## Quiet-day policy

Every day gets a full (but short) contract-shape issue, even when nothing happened (Danny 2026-10-28). "No post today"
always means the pipeline is broken.

## Agents

Don't write a digest into the repo and don't post to #daily-updates. `tests/digest.test.js` fails if
`docs/ai/danny-digest.md` comes back. Ask Hermes in the mailbox for a digest change.
