#!/usr/bin/env python3
"""Run: python3 tests/live_data_test.py (CI: docs.yml). Polled sections are built from data/sources at build time
(scripts/live_data.py), not from data.json's committed copies. Checks:
  1. every live key is replaced: a stale value planted in D is gone after apply() (when its source file exists)
  2. apply() is idempotent (running it twice changes nothing)
  3. no poll workflow commits data/data.json again (meso.watch's poll excepted: its step needs the OSMS export)"""
import copy, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import live_data
fails = []
SRC = {"cm": "classicmarket_prices.json", "cmp": "classicmarket_market.json", "ma": "shopscans.json", "mw": "shopscans.json",
       "mi": "mesoindex.json", "mdb": "meowdb_market.json", "shared": "shared_runs.json"}
D0 = json.loads((ROOT / "data" / "data.json").read_text(encoding="utf-8"))
D = copy.deepcopy(D0)
for k in SRC: D[k] = "STALE"
live_data.apply(D)
for k, f in SRC.items():
    if (ROOT / "data" / "sources" / f).exists() and D.get(k) == "STALE": fails.append(f"D.{k} kept the stale committed copy (source {f} exists)")
once = json.dumps(D, sort_keys=True); live_data.apply(D)
if json.dumps(D, sort_keys=True) != once: fails.append("apply() is not idempotent")
for k in set(D0) - set(SRC) - {"ma", "mw"}:
    if D0[k] != D[k]: fails.append(f"apply() changed D.{k}, which is not a live key")
for wf in (ROOT / ".github" / "workflows").glob("*.yml"):
    t = wf.read_text(encoding="utf-8")
    # classicrank: parked since 10-31, its step lives in fetch_classicrank.py
    if wf.name not in ("mesowatch-poll.yml", "classicrank-census.yml") and re.search(r"(git add|-a)\s[^\n]*data/data\.json", t):
        fails.append(f"{wf.name} commits data/data.json again; polls commit only data/sources/* (build.py applies them)")
for f in fails: print("FAILED:", f)
if fails: sys.exit(1)
print(f"live data test passed ({len(live_data.STEPS)} steps, {len(SRC)} keys rebuilt from data/sources)")
