# Standing handoff — Discord surface (Glorg [z.ai])

## Snapshot
- Last updated: 2026-10-28 19:2xZ by Glorg [z.ai]
- Repo HEAD: b9fb34e + the docs commit this file ships in (tracker market arc v0.2.83-0.2.85 released; site v0.19.4; data-quality gates green incl. the arrows blacklist)
- Deployed site: v0.19.4, meowdb data stamped 2026-10-28 16:23 live
- Tracker: v0.2.85 published 10-28 evening (0.2.83 Watchlist + Market pulse, 0.2.84 Compare watched, 0.2.85 Ctrl+K quick jump)
- My sandbox: /home/z/my-project (alive)

## What I own
- The daily digest pipeline: `docs/ai/danny-digest.md` (contract shape per `docs/ai/digest-contract.md`), posted as a Markdown attachment to Discord #daily-updates at 04:45 America/Los_Angeles, stale issues rotated to the [Archive] thread. Mechanics: `docs/ai/discord-digest-runbook.md`.
- `docs/ai/daily-briefing.md` daily refresh (folded into the same cron run).
- The agent ping bridge for Discord-side agents (#agent-pings webhook; rules in `docs/ai/agent-mailbox.md` § How to use).

## In flight right now
- Digest cron (04:45 PT, lint-gated, contract shape): issue 7 posted 10-28 (state: last_issue 7, archived_through 5); rotation proven live — issue 6 archived to the [Archive] thread, stale channel post deleted.
- Quiet-day policy DECIDED 10-28 (Danny): full short issues every day, no bare heartbeats — runbook stamped, T-07 thread Closed.
- Tracker market arc shipped 10-28 evening (Danny picked all four menu items): Watchlist + Market pulse modules + priceAbove/priceBelow alert kinds + core/prices.js (0.2.83), Compare watched from the site's prices-<hash>.json payload (0.2.84), Ctrl+K quick-jump palette (0.2.85). Releases dispatched via tracker.yml release=true; Danny's next restart walks him to 0.2.85.
- Price-tracking blacklist exists (`data/price_blacklist.json` + `scripts/price_blacklist.py`): quest-item block + all 8 arrows. New price steps must import `price_blacklist.is_bl`.
- docs/ai/INDEX.md added (Danny's mailbox-everything mandate): topic → file map; extend it when adding docs.
- Week catch-up for Claude written: `docs/ai/handoff-to-claude-2026-10-28.md` + mailbox thread (Danny's ask, 10-28); corrected prompt v1.2 delivered in #glorg-chat.

## State pointers (paths, never values)
- `/home/z/my-project/.secrets/discord-daily-webhook` — #daily-updates webhook URL (name in config: `DISCORD_DAILY_UPDATES_WEBHOOK`)
- `/home/z/my-project/.secrets/agent-pings-webhook` — #agent-pings webhook URL
- `/home/z/my-project/.secrets/digest-state.json` — `{last_message_id, last_issue, last_file, archived_through}`
- `/home/z/my-project/.secrets/gh-pat` + `~/.git-credentials` — GitHub fine-grained PAT (credential-URL line format, not a bare token)
- `/home/z/my-project/scripts/check-ci.sh` — CI status per commit (actions API; needs full sha)
- `/home/z/my-project/scripts/rotate-digest.sh` — sandbox rotation script (repo reference: `scripts/digest/rotate-digest.sh`)
- `/home/z/my-project/download/digest-archive/` — local copies of posted issues

## Open threads waiting on me
- T-07 digest thread Closed 10-28 (quiet-day decided). T-08 (Claude, project-side) shipped its own sub-1000-meso guard in the spread check — both fixes coexist with the blacklist (1160fd6 + 1855c47).
- Next tracker rocks are unpicked again; do NOT start big tracker work without Danny's pick.

## Gotchas learned (don't re-learn these)
- Fine-grained PAT lacks checks:read — the check-runs API returns empty; use `actions/runs?head_sha=<full sha>` instead (short shas silently match nothing).
- Discord webhook content caps at 2000 chars (HTTP 400 past it) — post files via multipart `payload_json` + `files[n]`.
- `?wait=true` is required to capture a message id, and only messages posted with an id are deletable by the webhook.
- `?thread_id=` lands the post in the thread; bad ids give 400/403, so 2xx is positive confirmation.
- Webhooks cannot read channel history or discovery endpoints (no bot token) — don't try.
- Digest lint bans em-dashes and "basically/obviously" on top of design.md §10 — write the digest with that in mind from the first draft.
- Discord webhook multipart: `curl -F 'payload_json=<inline JSON>'` corrupts the JSON with this curl build (400 "Expected payload_json to be a valid JSON string") — write it to a temp file and use `-F 'payload_json=</tmp/p.json;type=application/json'`.
- The update manifest (latest.yml) is a Release asset, not a repo file — backticking it in any docs/ai file fails the docs test path check.
- Sandbox IP is Cloudflare-walled harder than GH runners (headless AND headed browsers stuck on challenges; r.jina.ai rejects it too) — probe blocked sites from a throwaway CI workflow, never from the sandbox.
- Local git clone is shallow (back to 10-25 17:22) — older history lives in decisions.md / site-history.md, not git log.
- A workflow file that exists only on a side branch 404s on API dispatch — the workflow must be on the default branch first.

## If I vanish tomorrow
1. Clone the repo; read `docs/ai/digest-contract.md`, `config/digest.json` and `docs/ai/discord-digest-runbook.md`.
2. Re-store the two webhook URLs from Danny's Discord channel settings into the secrets paths listed above (chmod 600).
3. Rebuild `/home/z/my-project/.secrets/digest-state.json`: last issue number from `git log docs/ai/danny-digest.md` front matter, message id from the newest #daily-updates post (Danny can read it out), archived_through from the [Archive] thread contents.
4. Run `node scripts/lint_digest.js docs/ai/danny-digest.md` + `node tests/digest.test.js`; fix until green.
5. Schedule the cron per the runbook (04:45 America/Los_Angeles) and do one manual rotation with `scripts/digest/rotate-digest.sh` to prove the flow.
