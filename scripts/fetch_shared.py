#!/usr/bin/env python3
"""Pull the grind tracker's shared runs (our server, server/ in this repo) into data/sources/shared_runs.json.
Only the per-monster drop counts are kept (the "Confirmed Drops" box on monster pages).
Run: python3 scripts/fetch_shared.py && python3 scripts/build.py   (also puts it into data/data.json: no vendor/ needed;
build_data.py's "shared" step does the same on a full rebuild)"""
import json, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://ms-classic-tracker.maplestoryclassic.workers.dev/api/summary"
req = urllib.request.Request(URL, headers={"User-Agent": "ms-classic-world-info site build"})   # Cloudflare refuses Python's default
with urllib.request.urlopen(req, timeout=60) as r: d = json.load(r)
j = {"source": URL, "read": d["updated"][:10], "runs": d["runs"], "players": d["players"], "hours": d["hours"], "mobs": d["mobs"]}
dst = ROOT / "data" / "sources" / "shared_runs.json"
try:   # nothing new: keep the old read date so the daily job doesn't commit just a date
    old = json.loads(dst.read_text())
    if {k: v for k, v in old.items() if k != "read"} == {k: v for k, v in j.items() if k != "read"}: j["read"] = old["read"]
except (OSError, ValueError, KeyError): pass
dst.write_text(json.dumps(j, separators=(",", ":")))
print(f"{d['runs']} runs, {d['players']} players, {len(d['mobs'])} monsters -> {dst}")

# same as build_data.py step_shared: only monsters and items the page knows
D = json.load(open(ROOT / "data" / "data.json"))
mobs = {k: {**v, "items": {i: n for i, n in v["items"].items() if i in D["items"]}} for k, v in j["mobs"].items() if k in D["mobdb"] and v["kills"] > 0}
D["shared"] = {"read": j["read"], "runs": j["runs"], "players": j["players"], "hours": j["hours"], "mobs": mobs}
(ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
print(f"data/data.json: shared drops for {len(mobs)} monsters")
