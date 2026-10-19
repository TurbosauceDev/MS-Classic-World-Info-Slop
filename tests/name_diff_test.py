"""scripts/name_diff.py catches the Oct 19 rename ("Arrow Bomb: Bow" -> "Arrow Bomb"). Run: python3 tests/name_diff_test.py (CI: osms-names.yml)"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import name_diff as nd

old = {"skills": {"Hunter": [{"id": "3101005", "n": "Arrow Bomb: Bow"}, {"id": "3101002", "n": "Bow Booster"}]},
       "items": {"2000000": {"n": "Red Potion"}, "4000000": {"n": "Snail Shell"}}, "mobs": {"2": ["Snail"]}, "maps": {"1": ["Henesys"]}}
new = {"skills": {"Hunter": [{"id": "3101005", "n": "Arrow Bomb"}]},
       "items": {"2000000": {"n": "Red Potion"}, "4000000": {"n": "Snail Shell"}, "4000001": {"n": "Blue Snail Shell"}}, "mobs": {"2": ["Snail"]}, "maps": {"1": ["Henesys"]}}
d = nd.diff(nd.names(old), nd.names(new))
assert d["skill"][0] == [("3101005", "Arrow Bomb: Bow (Hunter)", "Arrow Bomb (Hunter)")], d["skill"]
assert d["skill"][1] == [("3101002", "Bow Booster (Hunter)")], d["skill"]
assert d["item"] == ([], [], 1), d["item"]
assert d["monster"] == ([], [], 0) and d["map"] == ([], [], 0)
print("ok  name_diff finds the Arrow Bomb rename, a removed skill and an added item")
