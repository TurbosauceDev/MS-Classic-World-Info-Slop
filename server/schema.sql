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
-- test run sent by hand on 2026-10-17 (not real farming)
DELETE FROM runs WHERE install = 'zzzzzzzzzzzzzzzzzz';
