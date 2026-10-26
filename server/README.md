# Shared grind data server

Cloudflare Worker + D1 that collects 15-minute runs from the grind tracker (sharing on) and serves an anonymous summary
for the site. Deployed by `.github/workflows/server.yml` on pushes to `server/**` (needs the two Cloudflare repo secrets).

- `POST /api/runs`: one run (tracker `createRunSlicer` output + `install` = random ID of that tracker copy).
  Checked in `src/check.js`; failed runs are stored with the reason but not counted. 6 runs/hour per install, 100/day per IP.
- `POST /api/party`: live party view. `{install, partyCode, nick?, job, level, mapName, expHr, expHr5, killsHr, mesosHr}` ->
  everyone with the same code seen in the last 3 minutes (no IDs back). Max 6 per code, one post per 20 s, 6 trackers per IP;
  rows deleted after an hour, never used in the summary.
- `GET /api/summary`: `{runs, players, hours, rows, mobs, times, kpq, archived}`. `rows` = one per player per map and
  solo/party (their median run: expHr, mesosHr, killsHr, level, job). `mobs` = kills, meso drops and item counts per
  monster. `archived` = `{runs, rounds}` sitting in the archive tables. No IDs, no IPs.
- `GET /api/kpq/recent`: owner inbox (same key as the feedback inbox, `authorization: Bearer <FEEDBACK_KEY>`): the last
  `?limit=` (1-500, default 100) KPQ rounds the server received, counted or not, newest first, each with `ok`, `why`,
  stage times and source, plus `total` = rounds on file. Read-only; no install or IP data.
- `GET /api/runs/recent`: the runs-side twin of the KPQ inbox (same key and rules): the last `?limit=` shared runs,
  counted or not, newest first, each with `ok`, `why`, `deaths`/`hour`/`used_cost` when the tracker sent them and the
  run's mobs/items JSON reduced to counts (`mobs: {kinds, kills, mesos, drops, items}`), plus `total` = runs on file.
- `GET /admin`: the owner panel in a browser — no curl needed. Asks for the key once (kept in `localStorage fbkey`,
  same spot as the site's Feedback admin), then shows the KPQ inbox (today filter in Pacific time, 30 s auto-refresh,
  stage splits on click), the shared-runs inbox (same today filter, what the run saw on click), the feedback inbox
  (mark done / delete) and the public summary (with the archive totals). The page itself carries no data; every route
  it calls stays behind the key.
- Archive (2026-10-26): runs and KPQ rounds older than 180 days (`ARCHIVE_DAYS`) move from `runs` / `kpq_rounds` into
  `runs_archive` / `kpq_rounds_archive` during the summary rebuild (idempotent, `INSERT OR IGNORE` on the id). The
  rebuild's runs aggregates see the rolling 180-day window; the KPQ leaderboard reads live + archive (UNION ALL), so
  all-time bests never fall off a board. Rate limits and the owner inboxes (newest N) are unaffected.
- Stored: the run plus the install ID and a salted hash of IP + day (rate limit only). Never the character name.
- Local: `npm install && npm run data && npm test` (Node 22: tests use node:sqlite in place of D1).
