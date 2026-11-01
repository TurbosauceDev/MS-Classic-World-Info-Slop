"""Classic World client tables for the Skills page range card, from maplestory.io MCW/CBT2 (the client's own WZ data; same
source as the animated previews, Danny OK'd 2026-10-19). OSMS covers most of this but not all (11-01 skill range audit):
  ai    Character/Afterimage/<name>.img/0/<action> lt/rb: the swing box of every swing/stab, mirrored to face right like
        OSMS's table. OSMS only lists the actions its own viewer needs (swordTS: swingT1/T3 for bows), but 7 of the 11
        two-handed swords use swordTS too (items.json after_image), so the 2H swing/stab boxes come from here.
        skill_range.merge_hitviz() checks every OSMS box against these and stops if one differs.
  wacts Character/Weapon/<item>.img children: the swing/stab actions each weapon type has sprites for.
  skw   Skill/<job>.img/skill/<id>/weapon..weapon4: weapon codes a skill needs (30 = 1H sword ... 47 = claw).
  ex    Skill/<job>.img/skill/<id>/extraSkillInfo -> hidden follow-up skill's lt/rb per level: the explosion around the first
        target (Poison Breath 2101005, Arrow Bomb 3101005). OSMS skills.json leaves hidden skills out; meowdb shows the same
        boxes (260 x 100 / 260 x 200, 300 wide from Lv 16).
  act   Skill/<job>.img/skill/<id>/action: the character action the skill plays (a value, or a list of children).
CBT2 is older than the live client: box SIZES of these tables matched OSMS (live v1.1.0) everywhere both have them; skill mob
counts did not (Rush 4 vs 6), so only geometry is taken from here. Afterimage level 10 (index by level / 10?) differs by a few
px; index 0 is used. Run: python3 scripts/fetch_client_hitviz.py  (then scripts/patch_skill_data.py or build_data.py)."""
import concurrent.futures as cf, json, pathlib, sys, time, urllib.error, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
W = "https://maplestory.io/api/wz/MCW/CBT2"
ITEM = {"1h-sword": 1302000, "1h-axe": 1312000, "1h-blunt": 1322000, "dagger": 1332000, "2h-sword": 1402002, "2h-axe": 1412000,
        "2h-blunt": 1422000, "spear": 1432000, "polearm": 1442000, "bow": 1452000, "crossbow": 1462000, "claw": 1472000}
AI = ["swordOL", "swordOS", "mace", "swordTL", "swordTS", "axe", "spear", "poleArm", "crossBow"]


def get(p):
    for i in range(5):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(f"{W}/{p}", headers={"User-Agent": "ms-classic-info-slop"}), timeout=60).read())
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if i == 4: raise
        except Exception:
            if i == 4: raise
        time.sleep(2 ** i)


val = lambda p: (get(p) or {}).get("value")
mirror = lambda lt, rb: [min(-lt["x"], -rb["x"]), max(-lt["x"], -rb["x"]), min(lt["y"], rb["y"]), max(lt["y"], rb["y"])]
attack = lambda a: a.startswith(("swing", "stab")) and not a.endswith("F")


def afterimage(name):
    acts = [a for a in get(f"Character/Afterimage/{name}.img/0")["children"] if attack(a)]
    return name, {a: mirror(val(f"Character/Afterimage/{name}.img/0/{a}/lt"), val(f"Character/Afterimage/{name}.img/0/{a}/rb")) for a in acts}


def skill(sid):
    b = f"Skill/{int(sid) // 10000}.img/skill/{sid}"; kids = (get(b) or {}).get("children", []); o = {}
    codes = [val(f"{b}/{k}") for k in ("weapon", "weapon2", "weapon3", "weapon4") if k in kids]
    if codes: o["skw"] = [int(c) for c in codes if c]
    if "action" in kids:
        n = get(f"{b}/action"); o["act"] = n["value"] if n.get("value") else [val(f"{b}/action/{c}") for c in sorted(n["children"], key=int)]
    if "extraSkillInfo" in kids:
        hid = str(val(f"{b}/extraSkillInfo/0/skill")); hb = f"Skill/{int(hid) // 10000}.img/skill/{hid}"; L, prev = [], None
        for lv in sorted((c for c in get(f"{hb}/level")["children"] if c.isdigit()), key=int):
            bx = mirror(val(f"{hb}/level/{lv}/lt"), val(f"{hb}/level/{lv}/rb"))
            if bx != prev: L.append([int(lv), [bx]]); prev = bx
        o["ex"] = {"id": hid, "L": L}
    return sid, o


def main():
    D = json.load(open(ROOT / "data/data.json"))
    ids = [s["id"] for l in D["skills"].values() for s in l if s.get("rv")]
    out = {"src": "maplestory.io MCW/CBT2 (Classic World client WZ)", "ai": {}, "wacts": {}, "skw": {}, "ex": {}, "act": {}}
    with cf.ThreadPoolExecutor(12) as ex:
        out["ai"] = dict(ex.map(afterimage, AI))
        out["wacts"] = {k: [a for a in get(f"Character/Weapon/0{i}.img")["children"] if attack(a)] for k, i in ITEM.items()}
        for sid, o in ex.map(skill, ids):
            for k, v in o.items(): out[k][sid] = v
    (ROOT / "data/sources/client_hitviz.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{len(out['ai'])} afterimages, {len(out['skw'])} skill weapon lists, {len(out['ex'])} explosions, {len(out['act'])} actions")


if __name__ == "__main__":
    main()
