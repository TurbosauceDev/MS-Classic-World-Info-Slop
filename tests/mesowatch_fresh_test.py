#!/usr/bin/env python3
"""scripts/fetch_mesowatch.py live listings: stale ones dropped, "listed" = newest listing, "seen" carried forward across
polls in both stored shapes. Runs a copy of the script in a temp folder, so data/sources is never touched.
Run: python3 tests/mesowatch_fresh_test.py (CI: tests.yml)"""
import json, pathlib, shutil, subprocess, sys, tempfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
fails = 0
def check(ok, msg):
    global fails
    if not ok: fails += 1; print("FAIL", msg)

tmp = pathlib.Path(tempfile.mkdtemp())
(tmp / "scripts").mkdir(); (tmp / "data" / "sources").mkdir(parents=True)
shutil.copy(ROOT / "scripts" / "fetch_mesowatch.py", tmp / "scripts")
OUT = tmp / "data" / "sources" / "mesowatch_prices.json"
item = lambda i: {"id": f"basil:{i}", "price": 1000, "p25": 900, "p75": 1100, "sold": 20}
(tmp / "market.json").write_text(json.dumps({"generated_at": "2026-10-21T12:00:00Z", "items": [item(2000000), item(4010001)]}))
HEAD = "id,seller,price,qty,stock,map,room,channel,seen,market,generated_at\n"
def poll(rows, gen):
    (tmp / "l.csv").write_text(HEAD + "".join(f"basil:{i},{s},{p},1,,{m},,,{seen},Classic World,{gen}\n" for i, s, p, m, seen in rows))
    r = subprocess.run([sys.executable, str(tmp / "scripts" / "fetch_mesowatch.py"), str(tmp / "market.json"), str(tmp / "l.csv")], capture_output=True, text=True)
    check(r.returncode == 0, f"script failed: {r.stderr[-300:]}")
    return json.loads(OUT.read_text())

# 1. market.json fallback shape: file generated 4 days before the price read, listings last seen then -> all dropped
j = poll([(2000000, "Old", 50, "", "2026-10-17T12:04:00Z")], "2026-10-17T12:04:00Z")
check(j["now"] == {} and j["asks"] == {} and j["listed"] == "", f"4-day-old listings kept: {j['now']} listed={j['listed']!r}")
# 2. stale file time but a fresh per-listing time: kept, listed = the listing's time
j = poll([(2000000, "Fresh", 50, "", "2026-10-21T11:50:00Z"), (4010001, "Old", 60, "", "2026-10-17T12:00:00Z")], "2026-10-17T12:04:00Z")
check(list(j["now"]) == ["2000000"], f"fresh kept, stale dropped: {list(j['now'])}")
check(j["listed"] == "2026-10-21 11:50", f"listed = newest listing: {j['listed']!r}")
t0 = j["seen"]["2000000"][0]
# 3. next poll, same (price, seller) seen again later: first-seen time carried forward from the parallel-array shape
j = poll([(2000000, "Fresh", 50, "Henesys", "2026-10-21T11:59:00Z"), (2000000, "New", 70, "Henesys", "2026-10-21T11:59:00Z")], "2026-10-21T12:00:00Z")
check(j["seen"]["2000000"] == [t0, t0 + 9], f"seen carry-forward (current shape): {j['seen']['2000000']} vs first {t0}")
# 4. pre-10-22 shape [[price, seller, t]] still carries forward
OUT.write_text(json.dumps({"asks": {"2000000": [[50, 1, None, "", "Fresh"]]}, "seen": {"2000000": [[50, "Fresh", 123]]}}))
j = poll([(2000000, "Fresh", 50, "Henesys", "2026-10-21T11:59:00Z")], "2026-10-21T12:00:00Z")
check(j["seen"]["2000000"] == [123], f"seen carry-forward (old shape): {j['seen']['2000000']}")

shutil.rmtree(tmp)
print("all good" if not fails else f"{fails} failed"); sys.exit(1 if fails else 0)
