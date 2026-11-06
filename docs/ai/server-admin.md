# Server admin tool

The shared-data Worker's owner tooling (area doc; the rest of the server is in `docs/ai/tracker.md`).

## Admin key (2026-11-05)

- **What:** `/api/admin/*` on the Worker (code: `server/src/index.js` above `adminAuth`; panel: the Admin tab of `/admin`, `server/src/admin.js`; tests: `server/tests/server.test.js`). Routes: GET `stats`, `installs`, `log`; POST `runs/delete`, `kpq/delete`, `purge` (all of one install's data), `summary/rebuild`. Deletes need `{"confirm":"delete"}`; ids are capped at 100 per call. Every call that passes auth is a row in the `admin_log` table (ids only; GET `log` shows the last 200).
- **Where the key is:** `C:/Users/danny/.ms-classic-world/admin.key` — **Danny's PC only**, not in the repo, not a GitHub or Cloudflare secret. The Worker holds only its SHA-256 (the `ADMIN_KEY_SHA256` var in `server/wrangler.toml`, deployed by `.github/workflows/server.yml` with the rest of the file). The old FEEDBACK_KEY never opens admin routes; the admin key also opens the old inboxes (`/api/feedback`, `/api/kpq/recent`, `/api/runs/recent`).
- **How an agent calls it** (worker: `https://ms-classic-tracker.maplestoryclassic.workers.dev`):
  `curl -s -H "authorization: Bearer $(cat C:/Users/danny/.ms-classic-world/admin.key)" https://ms-classic-tracker.maplestoryclassic.workers.dev/api/admin/stats`
  POSTs add `-H "content-type: application/json" -d '{"ids":[12],"confirm":"delete"}'`. The key goes straight from the file into the header: never `echo`/print it, never paste it into chat, a PR, a log or a commit.
- **Deletes are real data.** SOUL hard line: ask first before deleting data. Reads (`stats`, `installs`, `log`) and `summary/rebuild` are free to use; every delete or purge needs Danny's OK for that specific action.
- **Guard rails:** 20 wrong keys per network per day, then 429 (the right key from that network is held too until the next UTC day); wrong-key replies are a generic 401; responses are `no-store` with no CORS headers. The panel keeps the admin key in `sessionStorage` only.
- **Rotate:** write a new random key to the file (e.g. `python -c "import secrets;print(secrets.token_urlsafe(32),end='')"` straight into the file, no trailing newline), hash the exact file bytes with SHA-256, commit the new hash to `server/wrangler.toml`, merge (deploy swaps it). Never commit the key.
