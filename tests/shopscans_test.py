#!/usr/bin/env python3
"""scripts/fetch_shopscans.py on real mesoarbitrage.com + maplestory.watch replies (tests/fixtures/shopscans.json, pulled
2026-10-21; seller names and shop titles replaced). Run: python3 tests/shopscans_test.py (CI: tests.yml)"""
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

# maplestory.watch names -> ids
nid = s.name_ids(D["items"], {r[1].lower(): str(r[0]) for r in F["ma"]["items"]})
check(nid.get("iron ore") == "4010001", "unique name")
check(nid.get("red potion") == "2000000", "Red Potion tie (2000000 / 2000007) -> mesoarbitrage's id")
check(nid.get("dark shadow pants") == "1060059", "male/female tie -> mesoarbitrage's id")
check("blue moon" not in nid, "Blue Moon (earring + top), no tie-break: dropped")
check("selective 5-slot coupon" not in nid, "cash item we don't have: dropped")
# every mapped name really is that item's name
check(all(D["items"][i]["n"].lower() == n for n, i in nid.items()), "mapping names match")

MW = s.mw_rows(F["mw"]["items"], nid)
check(MW["4010001"] == [410, 201, 380, 155, 439, 29876090], f"Iron Ore mw {MW.get('4010001')}")
check(MW["1082000"][0] == 2000, "half-meso typical rounded")
check(MW["1002107"][1] == 0, "Pink Jester: asked, none sold (page says asks)")

# per-listing: open, not sold out, last day, deduped, cheapest first, room number from "Free Market <6>"
L = s.mw_listings(F["mw_item"], F["now"])
check(len(L) == s.LS_MAX and [r[0] for r in L] == sorted(r[0] for r in L), f"cheapest {s.LS_MAX} {L}")
check(L[0][:4] == [380, 1, None, 1] and L[1][:4] == [380, 1, 2, 6], f"first rows {L[:2]}")
check(len({tuple(r[:6]) for r in L}) == len(L), "repeated stacks deduped")
closed = {(l["seller"], l["unit"]) for l in F["mw_item"]["listings"] if l["open"] is False or l["soldOut"]}
check(not any((r[4], r[0]) in closed and not any(l["seller"] == r[4] and l["unit"] == r[0] and l["open"] and not l["soldOut"]
              for l in F["mw_item"]["listings"]) for r in L), "closed / sold-out shops out")
check(all(F["now"] / 60 - r[6] < 1440 for r in L), "seen in the last day")

print("shopscans:", "OK" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
