#!/usr/bin/env python3
"""scripts/fetch_classicmarket_listings.py on real classicmarket.kr posts (tests/fixtures/classicmarket_listings.json,
pulled 2026-10-21, author/note stripped). Run: python3 tests/classicmarket_test.py (CI: tests.yml)"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_classicmarket_listings as cm

P = json.loads((ROOT / "tests" / "fixtures" / "classicmarket_listings.json").read_text())
D = json.loads((ROOT / "data" / "data.json").read_text())
IT = cm.aggregate(P, D["items"])
fails = 0
def check(ok, msg):
    global fails
    if not ok: fails += 1; print("FAIL", msg)
def ids(name): return {str(x["itemId"]) for x in P if x["itemName"] == name}
def row(name): return IT.get(next(iter(ids(name))))

# scrolls join by itemId: every Lesser/Intermediate/Greater post names the same item as our OSMS data
for x in P:
    if "Scroll:" in x["itemName"]:
        check(D["items"].get(str(x["itemId"]), {}).get("n") == x["itemName"], f"scroll id {x['itemId']} is {x['itemName']}")
check({t for x in P for t in ("Lesser", "Intermediate", "Greater") if x["itemName"].endswith(t)} == {"Lesser", "Intermediate", "Greater"}, "fixture has 3 scroll tiers")

# placeholders: 0 meso "make an offer", 9999 / 99999 / 9999999 all-same digits
for p, bad in ((0, 1), (9999, 1), (99999, 1), (9999999, 1), (77777, 1), (1234567, 1), (19999, 0), (300, 0), (650000, 0)):
    check(cm.placeholder(p) == bool(bad), f"placeholder({p})")

# contamination: Work Gloves sold +4 at 7m, upper-roll bids at 100k and a 0 meso +1 never touch the clean price;
# the only clean post is a buy order at 320k with no roll set
check(row("Work Gloves") == [None, None, 0, 320000, 320000, 1], f"Work Gloves {row('Work Gloves')}")
# White Crusader Chainmail: 0 / 99999 / upper / unknown posts out, the one exact roll at 30k stays
check(row("White Crusader Chainmail")[:3] == [30000, 30000, 1], f"White Crusader Chainmail {row('White Crusader Chainmail')}")
# Squishy Shoes: lower/upper/unknown rolls and the 9999 "DM me" out; exact at 10k stays
check(row("Squishy Shoes")[:3] == [10000, 10000, 1], f"Squishy Shoes {row('Squishy Shoes')}")
# scroll with 5 buy orders and 1 ask: unit price (each), bulk quantities don't multiply
g = row("Gloves Attack Scroll: Intermediate")
check(g[:3] == [700000, 700000, 1] and g[3] == 650000 and g[5] == 5, f"Gloves ATT 60% {g}")
# stackable ore: cheap prices are real (each), not placeholders
check(row("Iron Ore") == [300, 380, 3, None, None, 0], f"Iron Ore {row('Iron Ore')}")
# cash items and ids we don't have never show
check(not any(k for k in ids("Selective 5-slot Coupon") if k in IT), "cash coupon skipped")
check(all(k in D["items"] for k in IT), "only known items")

# trim: one 10x-off post among 3+ is dropped, a pair is kept as is
check(cm.trim([100, 110, 120, 5000]) == [100, 110, 120], "trim high")
check(cm.trim([1, 1000]) == [1, 1000], "trim needs 3+")
# a buy order over 2x the ask median is dropped
check(cm.aggregate([{"kind": "sell", "itemId": 4011000, "category": "Etc", "price": 400, "status": "open"},
                    {"kind": "buy", "itemId": 4011000, "category": "Etc", "price": 900, "status": "open"},
                    {"kind": "buy", "itemId": 4011000, "category": "Etc", "price": 350, "status": "open"}])["4011000"] == [400, 400, 1, 350, 350, 1], "bid over 2x ask")

# Layer B (scripts/fetch_classicmarket_market.py): their combined prices; values from the 2026-10-21 probe run
import fetch_classicmarket_market as cmm
R = cmm.rows([{"itemId": 2040801, "day": "2026-10-21", "median": 650000, "low": 599999, "high": 1499999, "sold": 30, "sample": 420, "forSale": 410},
              {"itemId": 4010001, "day": "2026-10-20", "median": 400, "low": 100, "high": 750, "sold": 9, "sample": 99, "forSale": 1},
              {"itemId": 4010001, "day": "2026-10-21", "median": 449, "low": 100, "high": 750, "sold": 2246, "sample": 2461, "forSale": 2316},
              {"itemId": 2000002, "day": "2026-10-21", "median": 0, "sold": 0, "sample": 0}, {"itemId": None, "median": 5}])
check(R == {"2040801": [650000, 599999, 1499999, 30, 420, 410, "2026-10-21"], "4010001": [449, 100, 750, 2246, 2461, 2316, "2026-10-21"]}, f"Layer B rows {R}")

print("classicmarket:", "OK" if not fails else f"{fails} failed", f"({len(P)} posts, {len(IT)} items)")
sys.exit(1 if fails else 0)
