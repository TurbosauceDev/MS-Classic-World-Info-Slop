# Recovery runbook

last-verified: 2026-10-31 by Claude Agent : blind-spot batch

## Roll back a bad push to `main` (site, tracker data, server)
1. Find the bad commit: `git log --oneline -15` (bot price commits are `chore(mesowatch)`, `... prices <date>`; skip them).
2. `git fetch origin main && git rebase origin/main && git revert <hash> && git push origin HEAD:main`. Never force-push `main`.
3. `pages.yml` redeploys (smoke + golden tests run first). Check the Home "Site version: built ..." stamp on the live site.
4. Server changes (`server/**`) redeploy through `server.yml` on the same push; tracker releases are separate (`tracker.yml`): ship a new patch version, never delete a published release (installed copies already updated from it).

## Restore the shared-runs database
Backups: `.github/workflows/d1-backup.yml`, nightly, 30 days, encrypted with the `BACKUP_PASSPHRASE` repo secret (Actions run page > Artifacts).
1. Download the artifact, then `openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in ms-classic-runs.sql.gz.enc | gunzip > backup.sql`.
2. In `server/`: `npx wrangler d1 execute ms-classic-runs --remote --file ../backup.sql` into an EMPTY database (create a new one, point `wrangler.toml` at it, or drop tables first).
3. `server/README.md` lists the tables; the summary rebuilds itself on the next `GET /api/summary`.
Do a restore into a throwaway database once to prove the file works.

## Never commit
Database exports, install IDs, API keys. The repo is public; the backup exists only as an encrypted workflow artifact.
