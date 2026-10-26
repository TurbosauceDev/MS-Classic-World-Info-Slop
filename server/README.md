# Shared grind data server

Cloudflare Worker + D1 that collects 15-minute runs from the grind tracker (sharing on) and serves an anonymous summary
for the site. Deployed by `.github/workflows/server.yml` on pushes to `server/**` (needs the two Cloudflare repo secrets).

- `POST /api/runs`: one run (tracker `createRunSlicer` output + `install` = random ID of that tracker copy).
  Checked in `src/check.js`; failed runs are stored with the reason but not counted. 6 runs/hour per install, 100/day per IP.
- `POST /api/party`: live party view. `{install, partyCode, nick?, job, level, mapName, expHr, expHr5, killsHr, mesosHr}` ->
  everyone with the same code seen in the last 3 minutes (no IDs back). Max 6 per code, one post per 20 s, 6 trackers per IP;
  rows deleted after an hour, never used in the summary.
- `GET /api/summary`: `{runs, players, hours, rows, mobs}`. `rows` = one per player per map and solo/party (their median
  run: expHr, mesosHr, killsHr, level, job). `mobs` = kills, meso drops and item counts per monster. No IDs, no IPs.
- `GET /api/kpq/recent`: owner inbox (same key as the feedback inbox, `authorization: Bearer <FEEDBACK_KEY>`): the last
  `?limit=` (10-500, default 100) KPQ rounds the server received, counted or not, newest first, each with `ok`, `why`,
  stage times and source, plus `total` = rounds on file. Read-only; no install or IP data.
- `GET /admin`: the owner panel in a browser — no curl needed. Asks for the key once (kept in `localStorage fbkey`,
  same spot as the site's Feedback admin), then shows the KPQ inbox (today filter in Pacific time, 30 s auto-refresh,
  stage splits on click), the feedback inbox (mark done / delete) and the public summary. The page itself carries no
  data; every route it calls stays behind the key.
- Stored: the run plus the install ID and a salted hash of IP + day (rate limit only). Never the character name.
- Local: `npm install && npm run data && npm test` (Node 22: tests use node:sqlite in place of D1).
