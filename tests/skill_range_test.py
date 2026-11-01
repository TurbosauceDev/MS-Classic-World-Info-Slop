"""scripts/skill_range.py: stored lt/rb boxes face LEFT in the client, so x < 0 is in front (bug 11-01: Steal read as
"0 px in front, 180 behind", Savage Blow as -18 px). Also checks the OSMS weapon-swing table parses. Run: python3 tests/skill_range_test.py"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from skill_range import boxes, reach, compact, parse_viz, merge_hitviz
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
# 11-01 audit: the swing box belongs to the ITEM (items.json after_image), not the weapon type. 7 of the 11 2H swords
# (Two-Handed Sword, Zard...) use swordTS, OSMS's viewer drew them all with swordTL; Gladius-type 1H swords and Zamadar-type
# daggers had the same problem. Client weapon codes restrict skills (Final Attack: Sword offered axes).
cl = json.load(open(ROOT / "data/sources/client_hitviz.json"))
H = merge_hitviz(hv, cl)
row = {w[0]: w for w in H["weap"]}
assert row["2h-sword"][2] == "swordTL" and row["2h-sword:swordTS"][2] == "swordTS" and row["2h-sword:swordTS"][5] == "Short swing"
assert 1402002 in row["2h-sword:swordTS"][6] and 1402005 in row["2h-sword"][6], "Two-Handed Sword swings short, Scimitar long"
assert 1302008 in row["1h-sword:swordOS"][6] and row["dagger"][2] == "swordOS" and 1332002 in row["dagger:swordOL"][6]
ts = {a[0]: a[1:] for a in H["sets"]["swordTS"]}
assert ts["swingT2"] == [35, 75, -75, 5] and ts["swingT1"] == [47, 86, -81, 5], ts
assert row["bow"][3] == ["swingT1", "swingT3"] and row["claw"][3] == ["stabO1", "stabO2"]
assert H["sk"]["1101000"] == ["1h-sword", "2h-sword"] and H["sk"]["1101001"] == ["1h-axe", "2h-axe"] and H["sk"]["1301001"] == ["polearm"]
assert H["ex"]["3101004"]["L"] == [[1, [[-130, 130, -100, 100]]], [16, [[-150, 150, -100, 100]]]], "Arrow Bomb explosion 260x200 -> 300x200"
assert H["ex"]["2101004"]["L"][-1] == [16, [[-150, 150, -50, 50]]], "Poison Breath explosion 300x100 from Lv 16"
assert cl["act"]["4201002"] == "swingO2", "Steal plays swingO2 (WZ action is a value, not a list)"
bad = json.loads(json.dumps(hv)); bad["sets"]["swordOL"][0][2] = 99
try: merge_hitviz(bad, cl); raise AssertionError("an OSMS box that disagrees with the client must stop the build")
except SystemExit: pass
print("skill_range ok")
