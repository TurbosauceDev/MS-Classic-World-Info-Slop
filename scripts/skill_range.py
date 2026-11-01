"""Skill range / hitbox data from the OSMS export (shared by build_data.py step_skills and fetch_osms_hitviz.py).

Sources (both OSMS, ohmi69/osms_datamine_dashboard at the pinned OSMS_REF):
- data/current/skills.json `range_visual` per skill (family, stored lt/rb rectangles, corridor geometry, ranges).
- lib/skill-range-viz.js ACTION_SETS etc.: the client's Character.Afterimage boxes per weapon action, used by
  action_hitbox / action_extended skills (Power Strike, Double Stab, Slash Blast, Final Attack...). Saved as
  data/sources/osms_hitviz.json by scripts/fetch_osms_hitviz.py.
Stored rectangles (lt/rb) face LEFT in the client: x < 0 is in front. Everything here is mirrored to face right
(front = +x, up = -y), the same way OSMS's own range viewer draws them (mirroredBoxes).
"""
import json, re

def boxes(level):
    """[[left, right, top, bottom], ...] facing right for one stored-rectangle level (lt/rb, plus lt2/rb2 if any)."""
    out = []
    for a, b in (("lt", "rb"), ("lt2", "rb2")):
        if level.get(a) and level.get(b):
            lt, rb = level[a], level[b]
            out.append([min(-rb["x"], -lt["x"]), max(-rb["x"], -lt["x"]), min(lt["y"], rb["y"]), max(lt["y"], rb["y"])])
    return out

def reach(s):
    """[front, back] px an attack reaches at max level, for Where to train / Builder area estimates.
    Stored rectangle -> its mirrored right edge / left edge; otherwise the stored range (Slash Blast extension) or the
    projectile base range (client default / weapon base, before The Eye of Amazon / Keen Eyes)."""
    rv = s.get("range_visual") or {}
    if rv.get("family") == "fixed_rectangle" and rv.get("levels"):
        l, r = boxes(rv["levels"][-1])[0][:2]; return [r, max(0, -l)]
    if s.get("range"): r = s["range"]; return [r[-1] if isinstance(r, list) else r, 0]
    if (rv.get("attack_range") or {}).get("base"): return [rv["attack_range"]["base"], 0]
    return None

def compact(s):
    """Small copy of range_visual for the Skills page (D.skills[job][i].rv). Keys:
    f family; L [[from_level, [[left,right,top,bottom],...]], ...] stored rectangles facing right;
    r stored range per level (action_extended forward limit; Rush's own value); b [base, source] projectile range;
    p [passive_id, passive_name, values] range bonus; g [near, reference_y, base_half_height, height_divisor];
    t 1 = projectile needs line of sight (terrain_check); d teleport distance per level."""
    rv = s.get("range_visual")
    if not rv: return None
    o = {"f": rv["family"]}
    if rv.get("levels"): o["L"] = [[x["level"], boxes(x)] for x in rv["levels"]]
    if rv.get("range") is not None: o["r"] = rv["range"]
    ar = rv.get("attack_range")
    if ar:
        o["b"] = [ar["base"], ar.get("source", "")]
        if ar.get("passive"): o["p"] = [ar["passive"]["id"], ar["passive"]["name"], ar["passive"]["values"]]
    g = rv.get("geometry")
    if g: o["g"] = [g["near"], g["reference_y"], g["base_half_height"], g["height_divisor"]]
    if rv.get("terrain_check"): o["t"] = 1
    if rv.get("distance"): o["d"] = rv["distance"]
    return o

def parse_viz(js):
    """OSMS lib/skill-range-viz.js -> {sets, weap, cls, sk, anim} (data tables only; the JS is never executed)."""
    def block(name):
        m = re.search(r"const %s = (\{.*?\n\});" % name, js, re.S) or re.search(r"const %s = (\[.*?\n\]);" % name, js, re.S)
        if not m: raise SystemExit(f"skill-range-viz.js: {name} not found (OSMS layout changed?)")
        return m.group(1)
    sets = {}
    for name, body in re.findall(r"\n  (\w+): \[(.*?)\n  \],", block("ACTION_SETS"), re.S):
        sets[name] = [[a, int(l), int(r), int(t), int(b)] for a, l, r, t, b in re.findall(
            r"action: '(\w+)', left: (-?\d+), right: (-?\d+), top: (-?\d+), bottom: (-?\d+)", body)]
    weap = []
    for key, label, src, rest in re.findall(r"\{ key: '([\w-]+)', label: '([^']+)', source: '\w+', actions: ACTION_SETS\.(\w+)([^}]*)\}",
                                            block("ACTION_WEAPON_TYPES")):
        m = re.search(r"startsWith\('(\w+)'\)", rest)
        weap.append([key, label, src, m.group(1) if m else ""])
    def keymap(name):
        return {k: re.findall(r"'([\w-]+)'", v) for k, v in re.findall(r"\n  '?([\w/ ]+?)'?: \[([^\]]*)\]", block(name))}
    out = {"sets": sets, "weap": weap, "cls": keymap("ACTION_WEAPONS_BY_CLASS"), "sk": keymap("ACTION_WEAPONS_BY_SKILL"),
           "anim": keymap("ACTION_ANIMATIONS_BY_SKILL")}
    if len(sets) < 5 or len(weap) < 10 or "Warrior" not in out["cls"]: raise SystemExit("skill-range-viz.js parse looks wrong")
    return out
