# Standing handoff — Discord surface (Glorg [z.ai])

## Snapshot
- Last updated: 2026-11-05 19:2xZ by Glorg [z.ai]
- Repo HEAD: 818b53c at write time — always re-check `git log --oneline -1`, never trust this line
- Deployed site / tracker: read docs/ai/daily-briefing.md (refreshed daily); at write time site v0.24.3, tracker v0.3.42
- My sandbox: fresh per session. `/home/z/my-project/` persisted on the DM instance, but the #glorg-chat instances have taken full wipes (2026-11-05). Sandbox state is cache, never storage.

## What I own
- Nothing scheduled. The digest, briefing refresh, [Archive] rotation and the #agent-pings bridge moved to Hermes on Danny's 11-02 call (docs/ai/agent-mailbox.md FYI 2026-11-03). The 10-28 version of this file claimed those duties — outdated, replaced by this rewrite (Danny approved 11-05).
- Role now: Discord-surface agent. Reads, reviews, docs/data/site/tracker tasks via PR when Danny asks. Coordination goes through the mailbox and the worklog; urgent pings go through Hermes.

## In flight right now
- Fleet identity (per-instance user accounts vs a GitHub App) — waiting on Danny to register accounts / the app; no repo-side action until then.
- Cold-start audit fixes for the docs/ai system — this PR: surface handoff rewritten, registry row corrected, 2 decisions prose warnings cleared.

## State pointers (paths, never values)
- The sandbox holds nothing durable: no secrets directory, no cron, no webhooks. The old paths from the 10-28 handoff died with the wiped sandbox, and their duties live with Hermes now.
- Credentials: none by default. A scoped fine-grained PAT arrives in Danny's Discord DM when a session needs push/PR rights, used in-memory only (never written to repo or sandbox files). The app-identity work replaces this with 1-hour installation tokens.

## Open threads waiting on me
- None addressed at write time (re-check docs/ai/agent-mailbox.md section Open before assuming).

## Gotchas learned (don't re-learn these)
- Fine-grained PAT lacks checks:read — the check-runs API returns empty; use `actions/runs?head_sha=<full sha>` instead (short shas silently match nothing).
- Sandbox egress is Cloudflare-walled harder than GH runners (headless and headed browsers stuck on challenges) — probe blocked sites from a throwaway CI workflow, never from the sandbox.
- The local clone is shallow (depth 1); older history lives in docs/ai/site-history.md, docs/ai/tracker-history.md and docs/ai/decisions.md, not git log.
- A workflow file that exists only on a side branch 404s on API dispatch — the workflow must be on the default branch first.
- docs/ai blobs are LF; Windows worktrees show CRLF via autocrlf — never flip endings wholesale (the START-HERE trap). On Linux, set core.autocrlf=false and edit in place.
- Unauthenticated GitHub REST is 60 requests/hour per IP — authenticate, or use raw.githubusercontent.com.
- Digest-webhook traps (2000-char cap, multipart payload_json, ?wait=true, thread_id) belong to the digest surface now (Hermes). If posting to Discord ever comes back, read docs/ai/discord-digest-runbook.md first.

## If I vanish tomorrow
1. Fresh shallow clone; read in order: CLAUDE.md, docs/ai/START-HERE.md, docs/ai/INDEX.md, docs/ai/daily-briefing.md, docs/ai/agent-worklog.md (section Recent).
2. Auth: nothing survives a wipe. Ask Danny to re-seed a scoped PAT (or the app PEM once fleet identity lands); do not work around it.
3. Until credentialed, stay read-only: updates go through Hermes (mailbox + worklog lines), or Danny pastes them.
4. Check docs/ai/agent-mailbox.md (section Open) and the worklog before picking anything up; take only Danny-tasked work.
5. Hand off on the way out per CLAUDE.md: this file, a worklog line, dated decisions lines for any Danny calls.
