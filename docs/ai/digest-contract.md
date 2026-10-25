# Digest contract

The repo is the source of truth for digests. If chat and this file disagree, this file wins. Checks run in CI
(`node tests/digest.test.js`, workflow docs.yml) and before every post (`node scripts/lint_digest.js <file>`).
Routing lives in `config/digest.json`. It names secrets and never holds them.

## Where things live

| What | Path | Rule |
|---|---|---|
| Live digest for Danny | `docs/ai/danny-digest.md` | Overwrite daily, one issue only. History is `git log` plus the Discord [Archive] thread. |
| Agent briefing | `docs/ai/daily-briefing.md` | Overwrite daily. Free-form, not linted. |
| Gold standard | `docs/ai/examples/danny-digest.gold.md` | Audited and stamped. Change only with a Danny-approved format change. |
| Routing config | `config/digest.json` | Schedule, file paths, attachment name, secret name, archive thread id. |
| Linter | `scripts/lint_digest.js` | Pass/fail, no dependencies. |
| Discord attachment | `danny-digest-{date}-issue-{issue}.md` | Same bytes as the live file. `{date}` is the front matter `date`. |

## Required front matter

A `---` block at the top, simple `key: value` lines.

| Field | Format |
|---|---|
| `kind` | `digest` |
| `status` | `live` (daily file) or `gold` (the stamped example) |
| `issue` | positive integer, +1 each issue |
| `date` | `YYYY-MM-DD` (America/Los_Angeles) |
| `written_utc` | `"HH:MM"` 24h UTC |
| `author` | signature, e.g. `"Glorg [z.ai]"` |
| `site_version` | `X.Y.Z` of the live site when written |
| `audited_by` | gold only: who stamped it |

## Required structure

One `# ` title, then these `##` sections in this order (matched by prefix, so "Wins since digest 5" counts):
Where things stand, Wins since, Anything broken, Decisions I need, Today's priorities, Where to go deeper.
Body at most 150 lines. Decisions are a numbered list, each starting with a bold subject.

## Tone and copy (design.md section 10)

Plain US English, short sentences. No emoji, no exclamation marks, no simply/just/easily/basically/obviously,
no em-dashes. Commit hashes and file names go in backticks (code spans are exempt from word checks).
Link https://maplestory.scumlord.studio, never the github.io URL. Every number has a source or says "estimate".

## Secrets

Webhook URLs and tokens live in repo or sandbox secrets only. The lint fails on webhook URLs and token shapes.
`config/digest.json` holds the secret name (`discord.webhook_secret`), never its value.

## Config fields (`config/digest.json`)

`schedule` (04:45 America/Los_Angeles), `files.*`, `discord.channel`, `discord.webhook_secret`,
`discord.archive_thread_name`, `discord.archive_thread_id` (digits string, null until Z.ai fills it in),
`archive.keep_latest_in_channel` (1), `archive.stale_after_hours` (24), `lint.run_before_post`.
The scheduled job should read these values instead of hardcoding them.

## Changing the format

Edit the gold file, `scripts/lint_digest.js` and this doc in one commit. The test mutates the gold file to prove each
rule fires, so a rule that stops working fails CI.
