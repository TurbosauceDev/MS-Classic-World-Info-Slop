#!/usr/bin/env python3
"""scripts/fetch_mesoindex.py on real mesoindex.com replies (tests/fixtures/mesoindex.json: /api/catalog rows + /api/item?game=1002101,
pulled 2026-10-21; shop names and titles replaced). Run: python3 tests/mesoindex_test.py (CI: tests.yml)"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_mesoindex as m

F = json.loads((ROOT / "tests" / "fixtures" / "mesoindex.json").read_text())
D = json.loads((ROOT / "data" / "data.json").read_text())
fails = 0
def check(ok, msg):
    global fails
    if not ok: fails += 1; print("FAIL", msg)

# catalog: columns by name, keyed by the real item id (`game`), not mesoindex's own id
IT = m.cat_rows(F["catalog"], D["items"])
check(IT.get("1002101") == [2949, 2899, 3749, 6, 23, 1450, 144, 2, -1, 29875964], f"Bronze Pride {IT.get('1002101')}")
check(IT.get("4010001", [None])[0] == 400 and IT["4010001"][2] == 444, f"Iron Ore p25/p75 rounded {IT.get('4010001')}")
check("2043103" not in IT, "no price and no ask: dropped")
check(all(k in D["items"] for k in IT), "items we don't have (cash coupons) dropped")
noprice = [k for k, v in IT.items() if v[0] is None]
check(len(noprice) == 1 and IT[noprice[0]][5], "ask-only row kept (no usual price)")
# its npc column is the game-file NPC sell price, not a shop price: matches our items[id].p
c = {k: i for i, k in enumerate(F["catalog"]["cols"])}
for r in F["catalog"]["rows"]:
    it = D["items"].get(r[c["game"]])
    if it and it.get("p") is not None: check(int(it["p"]) == r[c["npc"]], f"npc {r[1]} {r[c['npc']]} vs p {it['p']}")
    if it: check(it["n"].lower() == r[1].lower(), f"name {r[1]} vs {it['n']}")

# per-item listings: unsold, last day, deduped, cheapest first, channel + FM room kept
L = m.listings(F["item"], F["now"])
check(len(L) == m.LS_MAX and [r[0] for r in L] == sorted(r[0] for r in L), f"cheapest {m.LS_MAX} {L}")
check(len({tuple(r[:6]) + (r[7],) for r in L}) == len(L), "repeated slots deduped")
sold = {(l["shop"], l["price"]) for l in F["item"]["listings"] if l["sold"]}
unsold = {(l["shop"], l["price"]) for l in F["item"]["listings"] if not l["sold"]}
check(not any((r[4], r[0]) in sold - unsold for r in L), "sold slots out")
check(all(r[2] for r in L), f"channel on every row {L}")
check(all((r[3] is not None) != bool(r[7]) for r in L), f"FM room, or the map name outside the FM {L}")
out = [r for r in m.listings(F["item"], F["now"]) if r[3] is None]
check(out and out[0][7] == "Kerning City Construction Site", f"outside-FM shop keeps its map {out}")
check(m.listings(F["item"], F["now"] + 2 * m.DAY) == [], "older than a day: out")

print("mesoindex:", "OK" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
