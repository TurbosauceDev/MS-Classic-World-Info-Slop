# Shared grind data server

Cloudflare Worker + D1 that collects 15-minute runs from the grind tracker (sharing on) and serves an anonymous summary
for the site. Deployed by `.github/workflows/server.yml` on pushes to `server/**` (needs the two Cloudflare repo secrets).

- `POST /api/runs`: one run (tracker `createRunSlicer` output + `install` = random ID of that tracker copy).
  Checked in `src/check.js`; failed runs are stored with the reason but not counted. 6 runs/hour per install, 100/day per IP.
- `GET /api/summary`: `{runs, players, hours, rows, mobs}`. `rows` = one per player per map and solo/party (their median
  run: expHr, mesosHr, killsHr, level, job). `mobs` = kills, meso drops and item counts per monster. No IDs, no IPs.
- Stored: the run plus the install ID and a salted hash of IP + day (rate limit only). Never the character name.
- Local: `npm install && npm run data && npm test` (Node 22: tests use node:sqlite in place of D1).
