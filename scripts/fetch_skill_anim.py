"""Animated skill previews: real Classic World client frames from maplestory.io (MCW region, CBT2 = our COT2 client; the same
source as the Builder avatar and the meso icons, Danny OK'd 2026-10-19). OSMS exports no character action or skill effect
frames (11-01 check), so this is the only first-party source.

Saves data/sources/skill_anim.json; `build_data.py skills` copies it into D.skanim. Run: python3 scripts/fetch_skill_anim.py
Cache: vendor/skill_anim/ (delete it to refetch). Every frame is [webp base64, ox, oy, delay ms, w, h]: (ox, oy) is the anchor
inside the image (character: feet; skill effect/hit/projectile: the WZ origin), facing LEFT like the client draws it.
  look  item ids worn in every character frame (default face/hair, Grey T-Shirt, Brown Cotton Shorts)
  wid   weapon key (D.hitact.weap) -> the item id drawn
  act   "weaponKey|action" -> character frames (Character/00002000.img/<action>/<n>/delay for timing)
  sk    skill id -> {w: weapon key, a: action or null (= the swing picked on the page), e/h/b: effect/hit/projectile frames}
  ammo  weapon key -> projectile frames for skills without their own (arrow 2060000, bolt 2061000, Subi 2070000)
A frame without a delay node uses 100 ms (assumed client default; most frames carry their own)."""
import base64, io, json, pathlib, sys, time, urllib.request
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://maplestory.io/api"
REG = "MCW/CBT2"
CACHE = ROOT / "vendor/skill_anim"; CACHE.mkdir(parents=True, exist_ok=True)
LOOK = [20000, 30000, 1040002, 1060002]
WID = {"1h-sword": 1302000, "1h-axe": 1312000, "1h-blunt": 1322000, "dagger": 1332000, "2h-sword": 1402002, "2h-axe": 1412000,
       "2h-blunt": 1422000, "spear": 1432000, "polearm": 1442000, "bow": 1452000, "crossbow": 1462000, "claw": 1472000, "wand": 1372000}
CLASSW = {"Warrior": "1h-sword", "Fighter": "1h-sword", "Page": "1h-sword", "Spearman": "spear", "Magician": "wand", "F/P Wizard": "wand",
          "I/L Wizard": "wand", "Cleric": "wand", "Archer": "bow", "Hunter": "bow", "Crossbowman": "crossbow", "Rogue": "claw",
          "Assassin": "claw", "Bandit": "dagger"}
JOBID = {"Warrior": 100, "Fighter": 110, "Page": 120, "Spearman": 130, "Magician": 200, "F/P Wizard": 210, "I/L Wizard": 220, "Cleric": 230,
         "Archer": 300, "Hunter": 310, "Crossbowman": 320, "Rogue": 400, "Assassin": 410, "Bandit": 420}
SHOOT = {"bow": "shoot1", "crossbow": "shoot2"}
AMMO = {"bow": "Item/Consume/0206.img/02060000/bullet", "crossbow": "Item/Consume/0206.img/02061000/bullet",
        "claw": "Item/Consume/0207.img/02070000/bullet"}
TWO_H = ("2h-sword", "2h-axe", "2h-blunt", "spear", "polearm")


def get(url, binary=False):
    f = CACHE / (url.replace(API + "/", "").replace("/", "_").replace("?", "_").replace(",", "-").replace("=", "-") + (".bin" if binary else ".json"))
    if not f.exists():
        for i in range(4):
            try:
                f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ms-classic-info-slop"}), timeout=90).read()); break
            except Exception as e:
                if i == 3: raise RuntimeError(f"{url}: {e}")
                time.sleep(2 ** i)
    return f.read_bytes() if binary else json.loads(f.read_bytes())


def webp(img):
    b = io.BytesIO(); img.save(b, "WEBP", lossless=True, quality=100, method=6); return base64.b64encode(b.getvalue()).decode()


def frame_from_b64(b64, ox, oy, delay):
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA"); bb = img.getbbox()
    if not bb: return None
    c = img.crop(bb); return [webp(c), ox - bb[0], oy - bb[1], abs(int(delay or 100)), c.width, c.height]


def char_frames(wkey, action):
    """Composite actions (alert2, rushO, savage...) list {action, frame, delay} per step; the renderer only draws base actions."""
    wid = WID[wkey]; base = f"{API}/wz/{REG}/Character/00002000.img/{action}"; out = []
    for i in sorted((c for c in get(base)["children"] if c.isdigit()), key=int):
        kids = get(f"{base}/{i}")["children"]; act, fi = action, i
        if "action" in kids: act, fi = get(f"{base}/{i}/action")["value"], get(f"{base}/{i}/frame")["value"] if "frame" in kids else 0
        d = get(f"{base}/{i}/delay")["value"] if "delay" in kids else 100
        img = Image.open(io.BytesIO(get(f"{API}/{REG}/character/2000/{','.join(map(str, LOOK + [wid]))}/{act}/{fi}?renderMode=4", True))).convert("RGBA")
        bb = img.getbbox()   # FeetCenter render: feet at the image centre
        c = img.crop(bb); out.append([webp(c), img.width // 2 - bb[0], img.height // 2 - bb[1], abs(int(d)), c.width, c.height])
    return out


def wz_frames(path):
    node = get(f"{API}/wz/{REG}/{path}"); out = []
    for i in sorted((c for c in node["children"] if c.isdigit()), key=int):
        f = get(f"{API}/wz/{REG}/{path}/{i}"); kids = f["children"]
        o = get(f"{API}/wz/{REG}/{path}/{i}/origin")["value"] if "origin" in kids else {"x": 0, "y": 0}
        d = get(f"{API}/wz/{REG}/{path}/{i}/delay")["value"] if "delay" in kids else 100
        fr = frame_from_b64(f["value"], o["x"], o["y"], d)
        if fr: out.append(fr)
    return out


def main():
    D = json.load(open(ROOT / "data/data.json")); H = D["hitact"]
    out = {"src": f"maplestory.io {REG} (Classic World client)", "look": LOOK, "wid": WID, "act": {}, "sk": {}, "ammo": {}}
    need = set()
    def want(w, a): need.add((w, a))
    for wkey, label, setk, pre in H["weap"]:
        for a in H["sets"].get(setk, []):
            if not pre or a[0].startswith(pre): want(wkey, a[0])
    for w in WID: want(w, "stand2" if w in TWO_H else "stand1")
    for w, a in SHOOT.items(): want(w, a)
    books = {}
    for job, lst in D["skills"].items():
        for s in lst:
            if not s.get("rv"): continue
            if job not in books: books[job] = {str(x["id"]): x for x in get(f"{API}/{REG}/job/{JOBID[job]}/skillbook")["skills"]}
            b = books[job].get(str(s["id"]))
            if not b: print("no client data for", s["id"], s["n"]); continue
            fam, acts = s["rv"]["f"], [a for a in (b.get("actions") or []) if a != "alert2"]
            w = (H["sk"].get(str(s["id"])) or [CLASSW[job]])[0]
            if s["n"] == "Rush" and job == "Spearman": w = "spear"
            a = None
            if fam.startswith("action") and s["n"] != "Power Knockback": a = None          # page's weapon/swing picker drives it
            elif acts: a = acts[0]
            elif w in SHOOT: a = SHOOT[w]
            elif fam == "effect_rectangle" or "alert2" in (b.get("actions") or []): a = "alert2"
            elif w == "claw": a = "stabO1"
            elif fam != "teleport_range": a = "stabO1" if w == "dagger" else "swingO1"
            if s["n"] == "Power Knockback": a = SHOOT.get(w, "shoot1")
            if a: want(w, a)
            pick = lambda k: (b.get(k) or [{}])[0].get("frames") or []
            fr = lambda k: [x for x in (frame_from_b64(f["image"], f["origin"]["x"], f["origin"]["y"], f.get("delay")) for f in pick(k)) if x]
            out["sk"][str(s["id"])] = {"w": w, "a": a, "e": fr("effect"), "h": fr("hit"), "b": fr("ball")}
    for w, a in sorted(need):
        try: out["act"][f"{w}|{a}"] = char_frames(w, a)
        except RuntimeError as e: print("skip", w, a, e)
    for w, p in AMMO.items(): out["ammo"][w] = wz_frames(p)
    (ROOT / "data/sources/skill_anim.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    n = sum(len(v) for v in out["act"].values()); print(f"{len(out['act'])} actions ({n} frames), {len(out['sk'])} skills, "
          f"{(ROOT / 'data/sources/skill_anim.json').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
