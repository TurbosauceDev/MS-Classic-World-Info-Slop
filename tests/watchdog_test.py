#!/usr/bin/env python3
"""scripts/watchdog.py checks + issue plan, no network. Run: python3 tests/watchdog_test.py (CI: tests.yml)"""
import pathlib, sys
from datetime import datetime, timezone
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import watchdog as w

fails = 0
def check(ok, msg):
    global fails
    print(("ok  " if ok else "FAILED: ") + msg); fails += not ok

NOW = datetime(2026, 10, 21, 18, 0, tzinfo=timezone.utc)
GOOD = {"generated": "2026-10-21T17:30:49+00:00", "listed": "2026-10-21 17:20", "src_listed": "2026-10-21 17:20"}
keys = lambda p: [k for k, _ in p]
check(w.problems(NOW, "2026-10-21T17:41:36Z", GOOD) == [], "healthy: no problems")
check(keys(w.problems(NOW, "2026-10-21T15:30:00Z", GOOD)) == ["poll"] and keys(w.problems(NOW, None, GOOD)) == ["poll"], "poll over 2 h ago or none")
check(keys(w.problems(NOW, "2026-10-21T17:41:36Z", {**GOOD, "generated": "2026-10-21T14:00:00Z"})) == ["prices"], "prices over 3 h old")
# 10-21: market.json fallback from 10-17, every listing dropped -> upstream stopped, not our drop
p = w.problems(NOW, "2026-10-21T17:41:36Z", {**GOOD, "listed": "", "src_listed": "2026-10-17 12:04"})
check(keys(p) == ["listings"] and "stopped publishing" in p[0][1], f"stale listing file = upstream ({p})")
p = w.problems(NOW, "2026-10-21T17:41:36Z", {**GOOD, "listed": ""})
check("check scripts/fetch_mesowatch.py" in p[0][1], "fresh listing file but nothing kept = our side")

bad = w.problems(NOW, None, GOOD)
check(w.plan(None, [], NOW)[0] == "none" and w.plan(None, bad, NOW)[0] == "create", "no issue: nothing when clean, create on a problem")
iss = {"body": w.body(NOW, bad)}
check(w.plan(iss, bad, NOW)[0] == "update", "same problems: refresh the body only (no email)")
check(w.plan(iss, bad + [("prices", "x")], NOW)[0] == "comment", "problems changed: comment")
one = w.plan(iss, [], NOW); check(one[0] == "update" and w.plan({"body": one[1]}, [], NOW)[0] == "close", "closes after 2 clean checks, not 1")
check(w.plan({"body": one[1]}, bad, NOW)[0] == "comment", "a problem after a clean check resets the count")

# 2026-10-26: the other price sources (a failed fetch keeps the old file + green CI; mesoindex froze 3 days this way)
FRESH = {f: {"read": "2026-10-21 17:30"} for f in ("shopscans.json", "classicmarket_prices.json", "classicmarket_market.json", "meowdb_market.json", "mesoindex.json")}
SHOP_FRESH = {**FRESH, "shopscans.json": {"ma": {"read": "2026-10-21 17:30"}}}
check(w.source_problems(NOW, SHOP_FRESH) == [], "all sources fresh: no problems")
old = w.source_problems(NOW, {**SHOP_FRESH, "mesoindex.json": {"read": "2026-10-18 18:00"}})
check(len(old) == 1 and old[0][0] == "mesoindex.json" and "72 h old" in old[0][1] and "keeps the old file" in old[0][1], f"mesoindex 3-day freeze trips ({old})")
p = w.source_problems(NOW, {**SHOP_FRESH, "shopscans.json": {"ma": {"read": "2026-10-20 00:00"}}})
check([k for k, _ in p] == ["shopscans.json:ma.read"], f"a stale shopscans file trips ({p})")
check(w.source_problems(NOW, {**SHOP_FRESH, "meowdb_market.json": None})[0][1].startswith("meowdb"), "missing file flags by name")
check(w.source_problems(NOW, {**SHOP_FRESH, "mesoindex.json": {"read": "garbage"}})[0][0] == "mesoindex.json", "unreadable read time flags")
all_old = w.source_problems(NOW, {f: None for f in SHOP_FRESH})
check(len(all_old) == 5, f"every source file covered ({len(all_old)}: {[k for k, _ in all_old]})")

print("all good" if not fails else f"{fails} failed"); sys.exit(1 if fails else 0)
