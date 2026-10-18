-- Shared grind runs (D1 / SQLite). One row per 15-minute run sent by the tracker with sharing on.
CREATE TABLE IF NOT EXISTS runs (
  id        INTEGER PRIMARY KEY,
  install   TEXT NOT NULL,          -- random ID of the tracker copy (not the character)
  ipday     TEXT NOT NULL,          -- hash of IP + day + salt: rate limit only, can't be turned back into an IP
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
