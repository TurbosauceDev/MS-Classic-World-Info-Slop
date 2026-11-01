"""Regression 2026-11-01: OSMS items.json drops Ü/ü from names ("bel Face Coupon"). scripts/name_fix.py restores five of them."""
import json, pathlib, re, sys
R = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
from name_fix import ITEM_NAME_FIX
items = json.load(open(R / "data/data.json"))["items"]
for iid, n in ITEM_NAME_FIX.items():
    assert items[iid]["n"] == n, f"item {iid} is {items[iid]['n']!r}, want {n!r} (build_data.py must apply ITEM_NAME_FIX)"
bad = [(i, o["n"]) for i, o in items.items() if o["n"][:1].islower() and i not in ITEM_NAME_FIX]
assert not bad, f"item names starting lowercase look like a dropped first letter: {bad[:5]}"
assert "ITEM_NAME_FIX.get(iid" in (R / "scripts/build_data.py").read_text(), "build_data.py no longer applies ITEM_NAME_FIX"
print("name fix test passed", len(ITEM_NAME_FIX), "names")
