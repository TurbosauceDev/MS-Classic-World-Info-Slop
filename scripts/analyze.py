"""Step 1 of the data pipeline: map rankings, quest value rows, and diffs vs the 2008 (GMS v49) client.

Reads the OSMS Data Explorer export (set OSMS_DATA, default vendor/osms_datamine_dashboard/data/).
Writes build/analysis.json. Imported by build_data.py, which reuses its helpers (mob_by_id, item_source, ...).
"""
import json, math, re, collections, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = os.environ.get("OSMS_DATA", str(ROOT / "vendor" / "osms_datamine_dashboard" / "data")).rstrip("/") + "/"
cur = lambda f: json.load(open(D + "current/" + f + ".json"))
old = lambda f: json.load(open(D + "patches/v49/" + f + ".json"))

EXP_TABLE = {1:15,2:34,3:57,4:92,5:135,6:372,7:560,8:840,9:1242,10:1716,11:2360,12:3216,13:4200,14:5460,15:7050,
16:8840,17:11040,18:13716,19:16680,20:20216,21:24402,22:28980,23:34320,24:40512,25:47216,26:54900,27:63666,28:73080,
29:83720,30:95700,31:108480,32:122760,33:138666,34:155540,35:174216,36:194832,37:216600,38:240500,39:266682,40:294216,
41:324240,42:356916,43:391160,44:428280,45:468450,46:510420,47:555680,48:604416,49:655200,50:709716,51:748608,52:789631,
53:832902,54:878545,55:926689,56:977471,57:1031036,58:1087536,59:1147132,60:1209994,61:1276301,62:1346242,63:1420016,
64:1497832,65:1579913,66:1666492,67:1757815,68:1854143,69:1955750,70:2062925}
assert sum(EXP_TABLE[l] for l in range(10, 30)) == 545290

monsters = cur("monsters")["monsters"]
mapsj = cur("maps")
map_region, map_name = {}, {}
for r in mapsj["regions"]:
    for m in r["maps"]:
        map_region[m["id"]] = r["region"]; map_name[m["id"]] = m["name"]

def launch_status(mid):
    reg = map_region.get(mid)
    if reg not in ("Maple Island", "Victoria Island"): return None
    if 10006000 <= mid < 10007000: return "Forgotten Hollow (opens later)"
    return "Open at launch"

# ---------- client formulas (maplestory.quest / OSMS client audit) ----------
def hit_prob(acc, avoid, lvl_diff):
    base = acc * 100 / ((max(0, lvl_diff) * 2 + 51) * 5)
    if base <= 0: return 0.0
    spread = 0.15 + 0.2 / (1 + math.exp((base - avoid) / 12))
    p = (1 + spread - avoid / base) / (2 * spread)
    return max(0.0, min(1.0, p))

def lvl_penalty(diff):
    if diff <= 0: return 1.0
    return 1 / (diff * diff * 0.005 + 1) if diff < 10 else 1 / (diff * 0.05 + 1)

ELEM = {"Weak": 1.25, "Strong": 0.75, "Immune": 0.0}

# Baseline build: AP 5/level, 25 at creation; secondary stat ~= level (gear requirement), 4 in the unused stats.
def class_acc(cls, L):
    prim = 5 * L + 20 - L - 8
    sec = L
    if cls == "Warrior":
        a = (sec * 1.2 + L * 2 + 4 * 0.6) / 2.5 + 10
        if L >= 15: a += 50          # Precise Strikes (1st job passive, Acc +50 at max)
    elif cls == "Bowman":
        a = (prim * 1.2 + L * 2 + 4 * 0.6) / 4.8 + 20
    elif cls == "Thief":
        a = (sec * 1.2 + L * 2 + prim * 0.6) / 4 + 15
        if L >= 15: a += 20          # Nimble Body (1st job passive, Acc +20)
    else:  # magician lines
        a = (prim * 1.2 + L * 2 + sec * 0.6) / 5.1 + 20
    return a

CLASSES = ["Warrior", "Bowman", "Thief", "Magician", "I/L Wizard", "F/P Wizard", "Cleric"]
def magic_elems(cls):
    return {"I/L Wizard": ["Ice", "Lightning"], "F/P Wizard": ["Fire", "Poison"], "Cleric": ["Holy"]}.get(cls, [])

def eff_hp(mob, cls, L):
    magic = cls in ("Magician", "I/L Wizard", "F/P Wizard", "Cleric")
    base_cls = "Magician" if magic else cls
    diff = mob["level"] - L
    hit = hit_prob(class_acc(base_cls, L), mob.get("eva") or 0, diff)
    if hit < 0.05: return None, hit
    df = (mob.get("MDDamage") if magic else mob.get("PDDamage")) or 0
    elem = 1.0
    els = magic_elems(cls)
    if els:
        elem = max(ELEM.get((mob.get("elements") or {}).get(e), 1.0) for e in els)
        if elem == 0: elem = 1.0  # can fall back to a non-elemental skill
    mult = hit * lvl_penalty(diff) * elem * 100 / (df + 100)
    return mob["hp"] / mult, hit

# Rough one-hit damage floor so trivially weak mobs don't win (you still spend one attack per kill).
def dps(L):
    return 20 * L          # rough single-target damage/sec for a level-L character in level-L gear
KILL_OVERHEAD = 1.0        # seconds of walking/aggro/animation per kill
SOLO_SPAWN = 0.75          # solo player keeps ~75% of spawns alive (COT2 measurement)
RESPAWN = 7.56

# ---------- 1. Map ranking ----------
by_map = collections.defaultdict(list)
for m in monsters:
    if m.get("is_boss"): continue
    for sp in m.get("maps") or []:
        try: t = float(sp.get("mob_time") or 0)
        except: t = 0
        if t > 60: continue
        st = launch_status(sp["id"])
        if not st: continue
        by_map[sp["id"]].append((m, sp["count"]))

LEVELS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
map_rank = {}
for cls in CLASSES:
    if cls in ("I/L Wizard", "F/P Wizard", "Cleric"): lv = [l for l in LEVELS if l >= 30]
    elif cls == "Magician": lv = [l for l in LEVELS if l < 30]
    else: lv = LEVELS
    for L in lv:
        rows = []
        for mid, mobs in by_map.items():
            total = sum(c for _, c in mobs)
            if total < 8: continue
            exp = cost = 0; hits = []; lvls = []
            ok = True
            for mob, c in mobs:
                e, hit = eff_hp(mob, cls, L)
                if e is None: ok = False; break
                exp += mob["exp"] * c
                cost += (e / dps(L) + KILL_OVERHEAD) * c   # seconds spent per kill
                hits.append((hit, c)); lvls.append((mob["level"], c))
            if not ok or cost == 0: continue
            cap = exp * SOLO_SPAWN / RESPAWN              # EXP/s if you cleared every respawn
            rate = min(exp / cost, cap)
            avg_lvl = sum(a * c for a, c in lvls) / total
            if avg_lvl < L - 12: continue
            hit_avg = sum(h * c for h, c in hits) / total
            names = sorted({mob["name"] for mob, _ in mobs})
            rows.append(dict(map=map_name[mid], id=mid, status=launch_status(mid), mobs=", ".join(names),
                             count=total, avg_lvl=round(avg_lvl, 1), hit=round(hit_avg * 100),
                             score=rate, clear_exp=exp, capped=rate < exp / cost))
        rows.sort(key=lambda r: -r["score"])
        top = rows[:10]
        if top:
            best = top[0]["score"]
            for r in top: r["rel"] = round(100 * r["score"] / best); r["score"] = round(r["score"], 4)
        map_rank[f"{cls}|{L}"] = top

# ---------- 2. Quest scoring ----------
quests = cur("quests")["quests"]
mob_by_id = {m["id"]: m for m in monsters}
mob_names_sorted = sorted({m["name"] for m in monsters}, key=len, reverse=True)
mob_by_name = {}
for m in monsters: mob_by_name.setdefault(m["name"], m)

def item_source(name):
    for mn in mob_names_sorted:
        if name.startswith(mn + " ") or name.startswith(mn + "'s "):
            return mob_by_name[mn]
    return None

def reward_note(q):
    notes = []
    for r in q.get("rewards") or []:
        if r.get("type") == "item" and r.get("guaranteed", True) and r.get("count", 1) > 0:
            notes.append(f"{r['name']}" + (f" x{r['count']}" if r.get('count', 1) > 1 else ""))
    if q.get("reward_weighted"):
        for g in q["reward_weighted"]:
            for grp in g.get("groups", []):
                n = len(grp.get("items", []))
                sample = grp["items"][0]["name"] if n else ""
                notes.append(f"random 1 of {n} ({sample.split(':')[0].split(' Scroll')[0]}…)" if n > 1 else sample)
                break
    if q.get("reward_choices"):
        notes.append("choose-one reward")
    out = "; ".join(dict.fromkeys(notes))
    return out[:160]

quest_rows = []
for q in quests:
    if q.get("region") in ("Ossyria",) or q.get("rotation") or q.get("is_daily") or q.get("is_weekly"): continue
    exp = q.get("rewards_exp") or 0
    lv = q.get("level_min") or 0
    reqs = q.get("requirements_list") or []
    kill_exp = 0; kills = 0; items_unknown = []; parts = []
    for r in reqs:
        if r["type"] == "mob":
            m = mob_by_id.get(r["id"])
            if m: kill_exp += m["exp"] * r["count"]; kills += r["count"]
            parts.append(f"kill {r['count']} {r['name']}")
        elif r["type"] == "item":
            src = item_source(r["name"])
            if src:
                parts.append(f"{r['count']} {r['name']}")
                items_unknown.append((r["count"], src))
            else:
                parts.append(f"{r['count']} {r['name']} (source n/a)")
    # quest EXP expressed as "equivalent kills" of the quest's own target mob
    target = None
    for r in reqs:
        if r["type"] == "mob" and r["id"] in mob_by_id: target = mob_by_id[r["id"]]; break
    if not target and items_unknown: target = items_unknown[0][1]
    eq_kills = round(exp / target["exp"]) if target and target["exp"] else None
    pct_level = round(100 * exp / EXP_TABLE.get(max(lv, 1), 1), 1) if lv and lv <= 70 else None
    # Multiplier on kill-quest EXP: (kills' own EXP + quest EXP) / kills' own EXP
    mult = round((kill_exp + exp) / kill_exp, 2) if kill_exp else None
    quest_rows.append(dict(name=q["name"], lvl=lv, npc=q.get("npc_name"), region=q.get("region"),
        exp=exp, mesos=q.get("rewards_money") or 0, req="; ".join(parts) or "talk / deliver only",
        kills=kills, mult=mult, eq_kills=eq_kills, eq_mob=target["name"] if target else None,
        pct_level=pct_level, reward=reward_note(q), chain=q.get("parent")))

# ---------- 3. Diff vs v49 (Jan 2008) ----------
old_all = collections.defaultdict(list)
for m in old("monsters")["monsters"]:
    old_all[m["name"]].append(m)
class _OM(dict):
    def get(self, name, cur=None):
        c = old_all.get(name)
        if not c: return None
        return min(c, key=lambda o: abs((o.get("level") or 0) - (cur or 0)))
old_mobs = _OM()
mob_diff = []
used = set()
for m in sorted(monsters, key=lambda x: x["level"]):
    if m["name"] in used: continue
    used.add(m["name"])
    if not any(launch_status(sp["id"]) for sp in m.get("maps") or []) and not m.get("is_boss"): continue
    o = old_mobs.get(m["name"], m["level"])
    if not o:
        mob_diff.append(dict(name=m["name"], lvl=m["level"], new=True)); continue
    row = dict(name=m["name"], lvl=m["level"], new=False)
    for k in ["level", "hp", "exp", "acc", "eva", "PADamage", "PDDamage", "MDDamage"]:
        row[k] = [o.get(k), m.get(k)]
    row["exp_hp_old"] = round(o["exp"] / o["hp"], 3) if o.get("hp") else None
    row["exp_hp_new"] = round(m["exp"] / m["hp"], 3) if m.get("hp") else None
    mob_diff.append(row)

def flat_skills(sk):
    out = {}
    for k, grp in sk.items():
        if not isinstance(grp, list): continue
        for g in grp:
            if not isinstance(g, dict): continue
            for s in g.get("skills", []):
                out.setdefault((s["name"], g.get("class_name")), s)
    return out
cs, os_ = flat_skills(cur("skills")), flat_skills(old("skills"))
os_by_name = {}
for (n, c), s in os_.items(): os_by_name.setdefault(n, s)
def norm(t): return re.sub(r"[^a-z0-9%+\-]", "", (t or "").lower().replace("avoidability","evasion").replace("range of attack","attack range").replace("seconds","sec"))
skill_diff = []
for (n, c), s in cs.items():
    if s.get("job") not in ("Beginner", "1st Job", "2nd Job"): continue
    o = os_.get((n, c)) or os_by_name.get(n)
    new_max = (s.get("all_level_stats") or [""])[-1]
    old_max = (o.get("all_level_stats") or [""])[-1] if o else None
    skill_diff.append(dict(cls=c, job=s.get("job"), name=n, new=not o,
        old=old_max, cur=new_max, old_ml=o.get("max_level") if o else None, cur_ml=s.get("max_level"),
        changed=(not o) or (norm(old_max) != norm(new_max))))
skill_diff.sort(key=lambda r: (r["job"], r["cls"] or "", r["name"]))

out = dict(maps=map_rank, quests=quest_rows, mob_diff=mob_diff, skill_diff=skill_diff,
           levels=LEVELS, classes=CLASSES)
(ROOT / "build").mkdir(exist_ok=True)
json.dump(out, open(ROOT / "build" / "analysis.json", "w"))
print("maps keys", len(map_rank), "quests", len(quest_rows), "mob diff", len(mob_diff), "skills", len(skill_diff))
