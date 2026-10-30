#!/usr/bin/env python3
"""scripts/fetch_shopscans.py on a real mesoarbitrage.com reply (tests/fixtures/shopscans.json, pulled
2026-10-21). Run: python3 tests/shopscans_test.py (CI: tests.yml)"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_shopscans as s

F = json.loads((ROOT / "tests" / "fixtures" / "shopscans.json").read_text())
D = json.loads((ROOT / "data" / "data.json").read_text())
fails = 0
def check(ok, msg):
    global fails
    if not ok: fails += 1; print("FAIL", msg)

# mesoarbitrage: columns by name, float medians rounded, npc not stored
MA = s.ma_rows(F["ma"])
check(MA["4010001"] == [489, 473, 399, 1045, 422, 13, 29874793], f"Iron Ore ma {MA.get('4010001')}")
check(MA["1060059"][2] is None and MA["1060059"][0] == 46239, "sale with no live ask kept")
# its npc column is the game-file NPC sell price, not a shop price: matches our items[id].p
c = F["ma"]["cols"].index("npc")
for r in F["ma"]["items"]:
    it = D["items"].get(str(r[0]))
    if it and it["p"] is not None and r[c] is not None: check(int(it["p"]) == r[c], f"npc {r[1]} {r[c]} vs p {it['p']}")

print("shopscans:", "OK" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
