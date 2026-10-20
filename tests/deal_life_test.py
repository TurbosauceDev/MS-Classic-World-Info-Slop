#!/usr/bin/env python3
"""scripts/deal_life.py on a throwaway git repo of fake meso.watch snapshots. Run: python3 tests/deal_life_test.py (CI: tests.yml)"""
import json, pathlib, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import deal_life

IT = {"1": [1000, 900, 1100, 50, 0, 0, 0.2], "2": [400, 350, 450, 50, 0, 0, 0.2], "3": [100, 90, 110, 50, 0, 0, 0.2]}
SNAPS = [("2099-01-01 00:00", {"9": [500, 1, 1, "", "s0"]}),                       # there before our records: skipped
         ("2099-01-01 00:30", {"1": [450, 1, 1, "", "a"], "2": [300, 1, 1, "", "b"], "3": [5000, 1, 1, "", "c"]}),   # 5000/100 = 50x: over (inf cut-off)
         ("2099-01-01 01:00", {"2": [250, 1, 1, "", "b2"], "3": [5000, 1, 1, "", "c"]}),   # 1 gone, 2 undercut
         ("2099-01-01 01:30", {"2": [250, 1, 1, "", "b2"], "3": [5000, 1, 1, "", "c"]}),
         ("2099-01-01 05:00", {"2": [250, 1, 1, "", "b2"]})]                          # 3 ends across a 210 min gap: skipped
fails = 0
def check(ok, msg):
    global fails
    print(("ok  " if ok else "FAILED: ") + msg); fails += not ok

with tempfile.TemporaryDirectory() as d:
    git = lambda *a: subprocess.run(["git", "-C", d, "-c", "user.name=t", "-c", "user.email=t@t", *a], check=True, capture_output=True)
    git("init", "-q"); f = pathlib.Path(d) / deal_life.SRC; f.parent.mkdir(parents=True)
    for i, (t, now) in enumerate(SNAPS):
        f.write_text(json.dumps({"listed": t, "items": IT, "now": now})); git("add", "-A"); git("commit", "-qm", f"s{i}")
    check(len(deal_life.snapshots(d)) == 5, "reads every committed snapshot (git cat-file --batch)")
    L = deal_life.life(d)
    check(L["snaps"] == 5 and L["from"] == "2099-01-01 00:00" and L["to"] == "2099-01-01 05:00" and L["gap"] == 30, "range and median gap")
    check(L["g"].get("steal") == [1, 1, 0, 30], "a steal gone by the next snapshot: lasted 0-30 min")
    check(L["g"].get("good") == [1, 0, None, None], "replaced by a cheaper listing = undercut, not gone")
    check("over" not in L["g"] and not any(k.startswith("9|") for k in L["since"]), "runs from the first snapshot or across a >3 h gap are left out")
    check(L["since"] == {"2|250|b2": "2099-01-01 01:00"}, f"open listings get their first-seen time ({L['since']})")
    check(deal_life.grade(50, False) == "over" and deal_life.grade(None, False) == "nosales" and deal_life.grade(0.4, True) == "rough", "grades")
print(f"\n{fails} failed" if fails else "\nall good"); sys.exit(1 if fails else 0)
