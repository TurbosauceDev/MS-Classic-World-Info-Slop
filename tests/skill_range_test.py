"""scripts/skill_range.py: stored lt/rb boxes face LEFT in the client, so x < 0 is in front (bug 11-01: Steal read as
"0 px in front, 180 behind", Savage Blow as -18 px). Also checks the OSMS weapon-swing table parses. Run: python3 tests/skill_range_test.py"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from skill_range import boxes, reach, compact, parse_viz
rect = lambda lt, rb: {"family": "fixed_rectangle", "levels": [{"level": 1, "lt": {"x": lt[0], "y": lt[1]}, "rb": {"x": rb[0], "y": rb[1]}}]}
steal = {"range_visual": rect((-180, -60), (0, 0))}
savage = {"range_visual": rect((-95, -62), (-18, -6))}
rush = {"range": [130, 150], "range_visual": {**rect((-220, -50), (0, 0)), "range": [130, 150]}}
assert boxes(steal["range_visual"]["levels"][0]) == [[0, 180, -60, 0]]
assert reach(steal) == [180, 0], reach(steal)
assert reach(savage) == [95, 0], reach(savage)
assert reach(rush) == [220, 0], "Rush's hit box is the 220 px rectangle, not its stored range value"
assert reach({"range": 350, "range_visual": {"family": "ranged_corridor", "attack_range": {"base": 350}}}) == [350, 0]
assert compact(rush)["L"] == [[1, [[0, 220, -50, 0]]]] and compact(rush)["r"] == [130, 150]
js = """const ACTION_SETS = {
  swordOL: [
    { action: 'swingO1', left: 18, right: 88, top: -62, bottom: -6 },
  ],
  a: [
    { action: 'stabO1', left: 1, right: 2, top: -3, bottom: 4 },
  ],
  b: [
  ],
  c: [
  ],
  d: [
  ],
};
const ACTION_WEAPON_TYPES = [
""" + "".join(f"  {{ key: 'k{i}', label: 'K {i}', source: 'swordOL', actions: ACTION_SETS.swordOL }},\n" for i in range(10)) + """  { key: 'claw', label: 'Claw', source: 'swordOL', actions: ACTION_SETS.swordOL.filter(a => a.action.startsWith('stab')) },
];
const ACTION_WEAPONS_BY_CLASS = {
  Warrior: ['k1', 'k2'],
  'F/P Wizard': ['k3'],
};
const ACTION_WEAPONS_BY_SKILL = {
  '4001002': ['claw'], // Double Stab
};
const ACTION_ANIMATIONS_BY_SKILL = {
  '4001002': ['stabO1', 'stabO2'],
};
"""
v = parse_viz(js)
assert v["sets"]["swordOL"] == [["swingO1", 18, 88, -62, -6]], v["sets"]
assert v["weap"][-1] == ["claw", "Claw", "swordOL", "stab"] and len(v["weap"]) == 11
assert v["cls"] == {"Warrior": ["k1", "k2"], "F/P Wizard": ["k3"]} and v["sk"] == {"4001002": ["claw"]}
# the saved table matches what the Skills page expects
hv = json.load(open(ROOT / "data/sources/osms_hitviz.json"))
assert hv["sets"]["swordOL"][0] == ["swingO1", 18, 88, -62, -6] and {"Warrior", "Rogue", "Archer"} <= set(hv["cls"])
print("skill_range ok")
