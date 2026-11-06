-- Shared grind runs (D1 / SQLite). One row per 15-minute run sent by the tracker with sharing on.
CREATE TABLE IF NOT EXISTS runs (
  id        INTEGER PRIMARY KEY,
  install   TEXT NOT NULL,          -- random ID of the tracker copy (not the character)
  ipday     TEXT NOT NULL,          -- hash of IP + day + salt: rate limit only, equality-only — never an IP, and the salt is the Worker secret IP_SALT, NOT this database (a static salt stored here could be brute-forced back to IPs from a dump; audit 2026-11-05). Old hashes made with the retired meta 'salt' row stay valid for equality until the secret rolls; the caps are per-day buckets, so a roll just gives every network a fresh day
  received  TEXT NOT NULL,          -- ISO time the server got it
  date      TEXT NOT NULL,          -- day farmed (from the tracker)
  map       TEXT,                   -- our map id, or NULL for a map our data doesn't have
  map_name  TEXT,
  level     INTEGER, job TEXT, party INTEGER NOT NULL,
  minutes   REAL NOT NULL, exp INTEGER NOT NULL, msg_exp INTEGER, bar_exp INTEGER,
  kills     INTEGER NOT NULL, mesos INTEGER NOT NULL,
  ok        INTEGER NOT NULL,       -- 1 = passed the checks (check.js); 0 = kept but not counted
  why       TEXT,                   -- why not ok
  mobs      TEXT,                   -- JSON [{id, kills, mesos, mesoDrops, items}]
  items     TEXT                    -- JSON {itemId: count}
);
CREATE INDEX IF NOT EXISTS runs_map ON runs (map, party);
CREATE INDEX IF NOT EXISTS runs_install ON runs (install, received);
CREATE INDEX IF NOT EXISTS runs_ipday ON runs (ipday);
CREATE INDEX IF NOT EXISTS runs_received ON runs (received);
-- archive (Danny, 2026-10-26: "add an archive table"): runs older than the summary's 180-day window (ARCHIVE_DAYS in
-- src/index.js) move here during the summary rebuild, so that rebuild reads a bounded table instead of every run ever
-- sent. Same columns plus when the row was moved; INSERT OR IGNORE keyed on the id, so a crash between the copy and the
-- delete can't double-move a row (the next rebuild just deletes the original)
CREATE TABLE IF NOT EXISTS runs_archive (
  id        INTEGER PRIMARY KEY,
  install   TEXT NOT NULL,
  ipday     TEXT NOT NULL,
  received  TEXT NOT NULL,
  date      TEXT NOT NULL,
  map       TEXT,
  map_name  TEXT,
  level     INTEGER, job TEXT, party INTEGER NOT NULL,
  minutes   REAL NOT NULL, exp INTEGER NOT NULL, msg_exp INTEGER, bar_exp INTEGER,
  kills     INTEGER NOT NULL, mesos INTEGER NOT NULL,
  ok        INTEGER NOT NULL,
  why       TEXT,
  mobs      TEXT,
  items     TEXT,
  archived  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- party code (salted hash) a run was sent with: one party = one group in the "3 players" rules
CREATE TABLE IF NOT EXISTS run_groups (run_id INTEGER PRIMARY KEY, grp TEXT NOT NULL);
-- fields newer trackers send, in one table of their own so schema.sql stays re-runnable (no ALTER TABLE): deaths (EXP bar
-- drops without a level-up), the UTC hour the run started (best time to farm), mesos spent on potions/food/arrows (null:
-- the tracker couldn't see any item counts). run_deaths / run_hours from 0.2.2-0.2.5 are no longer used (no runs had come in).
CREATE TABLE IF NOT EXISTS run_extra (run_id INTEGER PRIMARY KEY, deaths INTEGER, hour INTEGER, used_cost INTEGER);
-- party view: each tracker with a party code posts its live numbers about once a minute; rows older than an hour are deleted
CREATE TABLE IF NOT EXISTS party_live (grp TEXT NOT NULL, install TEXT NOT NULL, updated TEXT NOT NULL, ip TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (grp, install));
CREATE INDEX IF NOT EXISTS party_live_updated ON party_live (updated);
-- test run sent by hand on 2026-10-17 (not real farming)
DELETE FROM runs WHERE install = 'zzzzzzzzzzzzzzzzzz';
-- KPQ leaderboard: one row per KPQ round a tracker saw cleared from the 1st stage (sharing on). clear = seconds from the 1st
-- stage to leaving the Last stage; total = to the Exit map (Bonus included); clock = 1 when timed off the in-game KPQ clock
CREATE TABLE IF NOT EXISTS kpq_rounds (id INTEGER PRIMARY KEY, install TEXT NOT NULL, ipday TEXT NOT NULL, received TEXT NOT NULL, date TEXT NOT NULL,
  hour INTEGER, mode TEXT NOT NULL, party INTEGER NOT NULL, level INTEGER, job TEXT, clear INTEGER NOT NULL, total INTEGER, clock INTEGER,
  exp INTEGER, mesos INTEGER, stages TEXT, grp TEXT, ok INTEGER NOT NULL, why TEXT);
CREATE INDEX IF NOT EXISTS kpq_install ON kpq_rounds (install, received);
CREATE INDEX IF NOT EXISTS kpq_ipday ON kpq_rounds (ipday);
CREATE INDEX IF NOT EXISTS kpq_received ON kpq_rounds (received);
-- KPQ archive: rounds older than the same 180-day window move here too. The leaderboard reads live + archive together
-- (UNION ALL in summary), so an all-time best never falls off a board when its round ages out of the hot table
CREATE TABLE IF NOT EXISTS kpq_rounds_archive (
  id INTEGER PRIMARY KEY, install TEXT NOT NULL, ipday TEXT NOT NULL, received TEXT NOT NULL, date TEXT NOT NULL,
  hour INTEGER, mode TEXT NOT NULL, party INTEGER NOT NULL, level INTEGER, job TEXT, clear INTEGER NOT NULL, total INTEGER, clock INTEGER,
  exp INTEGER, mesos INTEGER, stages TEXT, grp TEXT, ok INTEGER NOT NULL, why TEXT,
  archived TEXT NOT NULL
);
-- KPQ board names (tracker 0.2.44+): the character name a tracker sent with the round. Its own table because schema.sql
-- re-runs on every deploy and SQLite has no ADD COLUMN IF NOT EXISTS
CREATE TABLE IF NOT EXISTS kpq_names (kpq_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
-- KPQ round source (2026-10-21): 'site' for the site's KPQ timer page; no row = the grind tracker. Side table, same reason
CREATE TABLE IF NOT EXISTS kpq_src (kpq_id INTEGER PRIMARY KEY, src TEXT NOT NULL);
-- KPQ scoring (2026-10-29): the raw v2 round a tracker sends (stage seconds, Rush/Bonus loot counts by tab + NPC value, Bonus EXP/mesos/
-- kills) as JSON. Scores are NOT stored: summary() recomputes them with tracker/core/kpqscore.js, so a formula change re-scores history
CREATE TABLE IF NOT EXISTS kpq_raw (kpq_id INTEGER PRIMARY KEY, raw TEXT NOT NULL);
-- the one round sent before names existed (Rush 4:37, 2026-10-18) was Danny's Turbow (Danny, 2026-10-18)
INSERT OR IGNORE INTO kpq_names (kpq_id, name) SELECT id, 'Turbow' FROM kpq_rounds WHERE date = '2026-10-18' AND mode = 'Rush' AND clear = 277 AND received < '2026-10-18T21:00';
-- site Feedback page (2026-10-21): notes visitors leave for us. Read by Danny on the site with the FEEDBACK_KEY secret
-- (GET /api/feedback). ipday is the same rate-limit hash as runs; no IP or anything else about the sender is kept.
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY, received TEXT NOT NULL, ipday TEXT NOT NULL, kind TEXT NOT NULL,
  msg TEXT NOT NULL, contact TEXT, page TEXT, ver TEXT, done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS feedback_ipday ON feedback (ipday);
CREATE INDEX IF NOT EXISTS feedback_received ON feedback (received);

-- KPQ reset (Danny, 2026-10-30): all KPQ rounds, names, sources, raw v2 data and archive moved to kpq_bak_20261030_* once
-- (guarded by the meta flag, so re-running this file changes nothing); boards and stage averages (derived from rounds) start empty.
CREATE TABLE IF NOT EXISTS kpq_bak_20261030_rounds AS SELECT * FROM kpq_rounds WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
CREATE TABLE IF NOT EXISTS kpq_bak_20261030_archive AS SELECT * FROM kpq_rounds_archive WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
CREATE TABLE IF NOT EXISTS kpq_bak_20261030_names AS SELECT * FROM kpq_names WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
CREATE TABLE IF NOT EXISTS kpq_bak_20261030_src AS SELECT * FROM kpq_src WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
CREATE TABLE IF NOT EXISTS kpq_bak_20261030_raw AS SELECT * FROM kpq_raw WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM kpq_rounds WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM kpq_rounds_archive WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM kpq_names WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM kpq_src WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM kpq_raw WHERE NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
DELETE FROM meta WHERE k = 'summary' AND NOT EXISTS (SELECT 1 FROM meta WHERE k = 'kpq_reset_20261030');
INSERT OR IGNORE INTO meta (k, v) VALUES ('kpq_reset_20261030', '1');

-- Shop prices read off merchant shops by trackers with sharing on (Danny, 2026-10-31: crowd data of our own). One row per
-- shop row: item, quantity, price for the bundle, sold out or not. Rows leave after 14 days. The seller name/title/ch/room
-- a v2 upload shares lives in shop_obs_ext below (0.3.30, Turbozo 2026-11-01).
CREATE TABLE IF NOT EXISTS shop_obs (
  id       INTEGER PRIMARY KEY,
  install  TEXT NOT NULL,
  ipday    TEXT NOT NULL,
  received TEXT NOT NULL,
  item     INTEGER NOT NULL,
  qty      INTEGER NOT NULL,
  price    INTEGER NOT NULL,
  sold     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shop_obs_item ON shop_obs (item, received);
CREATE INDEX IF NOT EXISTS shop_obs_install ON shop_obs (install, received);
CREATE INDEX IF NOT EXISTS shop_obs_ipday ON shop_obs (ipday);
-- the 14-day TTL delete (shopSummary) and the per-install cap counts scan received directly (2026-11-02, round 3)
CREATE INDEX IF NOT EXISTS shop_obs_received ON shop_obs (received);
-- Shop uploads 0.3.30 name the shop (Turbozo 2026-11-01: "we want the seller, the fm room and which channel — us
-- anonymizing that was a mistake on our part"): one ext row per shop_obs row, same values for the whole upload (one
-- read = one shop window). Side table: schema.sql re-runs every deploy. The tracker's "Delete what I shared" clears it.
CREATE TABLE IF NOT EXISTS shop_obs_ext (
  obs_id   INTEGER PRIMARY KEY,      -- shop_obs.id
  seller   TEXT,                     -- the owner IGN from the shop window's title bar ("<owner> : <title>"), null when unread
  title    TEXT,                     -- the shop title, null when unread
  ch       INTEGER,                  -- channel, when the tracker can read it (null for now)
  room     INTEGER,                  -- FM room parsed off the map name ("Free Market <3>"), null elsewhere
  map      TEXT                      -- the game map id the read happened on
);
CREATE INDEX IF NOT EXISTS shop_obs_ext_seller ON shop_obs_ext (seller);
-- Shared boss spots (0.3.30, Turbozo: "make our boss tracker more automatic, more accurate, easier to use"): timed-kill
-- reports shared through the tracker's Share switch. One row per report; GET /api/spots?map= aggregates witnesses per
-- boss + channel over the last 24 h. No identity: the install ID only dedupes votes and powers "Delete what I shared".
CREATE TABLE IF NOT EXISTS boss_spots (
  id       INTEGER PRIMARY KEY,
  install  TEXT NOT NULL,
  ipday    TEXT NOT NULL,
  received TEXT NOT NULL,
  map      TEXT NOT NULL,            -- game map id, one of gamedata.json's timed maps
  mob      TEXT NOT NULL,            -- timed monster id on that map
  ch       INTEGER,                  -- channel when the tracker can read it (null for now)
  t        INTEGER NOT NULL          -- the kill's ms epoch (client clock, bounded to now +/- 10 min)
);
CREATE INDEX IF NOT EXISTS boss_spots_map ON boss_spots (map, received);
CREATE INDEX IF NOT EXISTS boss_spots_install ON boss_spots (install, received);
-- the 24 h TTL delete runs on POST /api/spots (moved off the public GET, 2026-11-05): received needs its own index
CREATE INDEX IF NOT EXISTS boss_spots_received ON boss_spots (received);

-- Weekly grind ladder (P1-5, 2026-11-02): the display name a tracker chose to send with a run (the Settings
-- nick, opt-in like the party view's; same IGN shape the KPQ board's names use). Side table: schema.sql
-- re-runs on every deploy. The tracker's "Delete what I shared" clears it along with the runs.
CREATE TABLE IF NOT EXISTS run_names (run_id INTEGER PRIMARY KEY, name TEXT NOT NULL);

-- Abuse-cap ledger (2026-11-02): the caps count live rows (COUNT(*) ... WHERE ipday = ?), so "Delete what I shared"
-- used to hand the daily budget back — hit the cap, forget, refill, forever. This table keeps each network-day's
-- high-water marks: posts (rows ever accepted today) and installs (distinct trackers ever seen today). Forget
-- deliberately leaves it — it is the network-day's tally, not the install's data: the same day-scoped salted,
-- non-reversible hash the rows themselves carry, kept at most until the day after tomorrow (archiveOld prunes it).
-- party_live's install cap reads this ledger too (2026-11-02, round 2): forget DOES delete its rows (it is the
-- install's data), so without the mark a forget handed the 6-trackers slot back; feedback alone needs no ledger (it
-- has no install column to forget by). The 20-second party throttle still resets with a forget — bounded by the
-- hourly self-expiry and the ledger-backed install cap.
CREATE TABLE IF NOT EXISTS ipday_ledger (
  ipday    TEXT PRIMARY KEY,         -- the same salted IP + UTC day hash the hot tables carry
  day      TEXT NOT NULL,            -- the UTC day inside that hash: the row ages out with it
  posts    INTEGER NOT NULL DEFAULT 0,    -- rows accepted today, ever (high-water mark, survives forget)
  installs INTEGER NOT NULL DEFAULT 0,    -- distinct tracker IDs seen today, ever (high-water mark)
  updated  TEXT NOT NULL
);

-- Admin audit log (2026-11-05): one row per authenticated /api/admin/* call. args = JSON with row ids only (never the key,
-- never a full install id); net = salted one-way hash of the caller's network (the salt() helper), equality only. Failed
-- key attempts are NOT rows here: they are counted per network-day in ipday_ledger (src/index.js adminAuth) and age out with it.
CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, action TEXT NOT NULL, args TEXT, net TEXT, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_log_ts ON admin_log (ts);
