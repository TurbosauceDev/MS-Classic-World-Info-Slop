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

WCODE = {30: "1h-sword", 31: "1h-axe", 32: "1h-blunt", 33: "dagger", 40: "2h-sword", 41: "2h-axe", 42: "2h-blunt", 43: "spear",
         44: "polearm", 45: "bow", 46: "crossbow", 47: "claw"}   # client skill weapon codes (Skill/<job>.img/skill/<id>/weapon)
VARIANT = {"swordOL": "Long swing", "swordOS": "Short swing", "swordTL": "Long swing", "swordTS": "Short swing"}

def merge_hitviz(hv, cl):
    """OSMS hitviz (fetch_osms_hitviz.py) + client tables (fetch_client_hitviz.py) -> D.hitact. Keys:
    weap [[key, label, set, actions, base, variant, item_ids], ...]: one row per weapon type AND swing family, because the
         box belongs to the item (items.json after_image). The family OSMS's viewer uses keeps the plain key ("2h-sword");
         the other gets "base:family" ("2h-sword:swordTS", variant "Short swing"). actions = the type's own swing/stab
         sprites (claw: stabs only, as OSMS).
    sets {family: [[action, left, right, top, bottom], ...]} facing right; every OSMS box must equal the client's.
    cls/anim/char/src from OSMS; sk = client weapon codes per skill (OSMS's pins win); ex = explosion boxes (Arrow Bomb...)."""
    for s, rows in hv["sets"].items():
        for a, *box in rows:
            if cl["ai"][s].get(a) != box: raise SystemExit(f"OSMS {s}/{a} {box} != client {cl['ai'][s].get(a)}")
    weap, used = [], {}
    for key, label, setk, pre in hv["weap"]:
        fams = hv["items"].get(label) or {setk: []}
        # OSMS's polearm row points at the identical 'spear' table while its items say poleArm: one family = default
        default = setk if setk in fams or len(fams) > 1 else next(iter(fams))
        acts = [a for a in cl["wacts"][key] if not pre or a.startswith(pre)]
        for fam in sorted(fams, key=lambda f: (f != default, -len(fams[f]))):
            box_fam = setk if fam == default and setk not in fams else fam
            miss = [a for a in acts if a not in cl["ai"][box_fam]]
            if miss: raise SystemExit(f"{key}/{fam}: no client box for {miss}")
            used.setdefault(box_fam, set()).update(acts)
            weap.append([key if fam == default else f"{key}:{fam}", label, box_fam, acts, key, VARIANT.get(fam, "") if len(fams) > 1 else "", fams[fam]])
    sets = {f: [[a, *cl["ai"][f][a]] for a in sorted(acts)] for f, acts in used.items()}
    sk = {sid: [WCODE[c] for c in codes if c in WCODE] for sid, codes in cl["skw"].items()}; sk.update(hv["sk"])
    return {"sets": sets, "weap": weap, "cls": hv["cls"], "sk": sk, "anim": hv["anim"], "ex": cl["ex"], "char": hv["char"],
            "src": f"{hv['src']} + items.json after_image; {cl['src']} (afterimage boxes, skill weapons, explosions)"}
