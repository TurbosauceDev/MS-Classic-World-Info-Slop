"""Build data/data.json (everything the page embeds) from the OSMS Data Explorer COT2 export.

Run:  python3 scripts/build_data.py      (then python3 scripts/build.py)
Needs the export at vendor/osms_datamine_dashboard (scripts/fetch_osms.sh) or OSMS_DATA=/path/to/data/.

Steps, in order (each adds keys to the data dict):
  base      mobs, maps, mobdiff, skilldiff, exp           <- analyze.py
  weapons   weapons                                       <- items.json
  skills    skills, icons                                 <- skills.json + images/skills
  quests    quests, citq (+ info, chain, cpos, cn)        <- quests.json
  rewards   ri on every quest row, items, iicons          <- quests.json + items.json + images/items
  launch    latermobs, latermobnames                      <- monsters.json + maps (Forgotten Hollow / not-at-launch)
"""
import base64, collections, json, os, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import analyze as a  # runs the analysis and exposes its helpers

C = a.D + "current/"
items_json = json.load(open(C + "items.json"))
ALL_ITEMS = [x for v in items_json.values() if isinstance(v, list) for x in v if isinstance(x, dict)]
ITEM = {str(i["id"]): i for i in ALL_ITEMS}
QUESTS = json.load(open(C + "quests.json"))
QUESTS = QUESTS if isinstance(QUESTS, list) else next(v for v in QUESTS.values() if isinstance(v, list))
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()

def step_base():
    mobs, maps = {}, {}
    for mid, lst in a.by_map.items():
        if sum(c for _, c in lst) < 8: continue               # ignore tiny maps
        maps[mid] = [a.map_name[mid], 1 if a.launch_status(mid) == "Open at launch" else 0, [[m["id"], c] for m, c in lst]]
        for m, c in lst:
            mobs[m["id"]] = [m["name"], m["level"], m["hp"], m["exp"], m.get("eva") or 0, m.get("PDDamage") or 0,
                             m.get("MDDamage") or 0, m.get("elements") or {}, 1 if m.get("undead") else 0]
    d = json.load(open(ROOT / "build" / "analysis.json"))
    md = []
    for r in d["mob_diff"]:
        if r.get("new"): md.append([r["name"], r["lvl"], None]); continue
        md.append([r["name"], r["lvl"], {k: r[k] for k in ("level", "hp", "exp", "acc", "eva", "PADamage", "PDDamage", "MDDamage")}])
    sd = [[r["cls"], r["job"], r["name"], r["old"], r["cur"], r["old_ml"], r["cur_ml"], 1 if r["changed"] else 0] for r in d["skill_diff"]]
    return dict(mobs=mobs, maps=maps, mobdiff=md, skilldiff=sd, exp=a.EXP_TABLE)

def step_weapons(D):
    W = []
    for i in items_json["items"]:
        if i.get("sub_category") != "Weapon": continue
        s = i.get("stats", {})
        W.append([i["name"], i["weapon_type"], s.get("reqLevel", 0), s.get("reqSTR", 0), s.get("reqDEX", 0), s.get("reqINT", 0),
                  s.get("reqLUK", 0), s.get("incPAD", 0), s.get("incMAD", 0), s.get("attackSpeed", 6), i.get("req_job_label") or "All", i.get("price"), str(i["id"])])
    D["weapons"] = W

JOBS = {"Warrior", "Fighter", "Page", "Spearman", "Magician", "F/P Wizard", "I/L Wizard", "Cleric",
        "Archer", "Hunter", "Crossbowman", "Rogue", "Assassin", "Bandit"}   # 1st + 2nd job only (no 3rd job at launch)
def step_skills(D):
    src = json.load(open(C + "skills.json")); out, icons = {}, {}
    for gs in src.values():
        if not isinstance(gs, list): continue
        for g in gs:
            if g["class_name"] not in JOBS: continue
            L = []
            for s in g["skills"]:
                req = []
                for part in (s.get("required_skill") or "").split(","):
                    m = re.match(r"\s*(.+?) Lv\.(\d+)", part)
                    if m: req.append([m.group(1), int(m.group(2))])
                L.append({"id": s["id"], "n": s["name"], "max": s["max_level"], "req": req,
                          "k": (s.get("mechanics") or {}).get("kind") or ("passive" if s.get("passive") else ""),
                          "att": s.get("attack_count", 1), "mob": s.get("mob_count", 1), "st": s["all_level_stats"],
                          "d": re.sub(r"^\[Master Level: \d+\]\s*", "", s.get("description", "")).strip()})
                p = C + f"images/skills/{s['id']}.png"
                if os.path.exists(p): icons[s["id"]] = b64(p)
            out[g["class_name"]] = L
    D["skills"], D["icons"] = out, icons

def trim(s, n):
    s = (s or "").strip(); return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"
def reward_ids(i):
    out = [r["id"] for r in i.get("rewards", []) if r.get("type") == "item" and r.get("id")]
    for blk in (i.get("reward_choices") or []) + (i.get("reward_weighted") or []):
        for g in blk.get("groups", []): out += [x["id"] for x in g.get("items", [])]
    return out

def quest_row(q, prev):
    exp = q.get("rewards_exp") or 0; lv = q.get("level_min") or 0
    reqs = q.get("requirements_list") or []
    kill_exp = kills = 0; items_unknown = []; parts = []
    for r in reqs:
        if r["type"] == "mob":
            m = a.mob_by_id.get(r["id"])
            if m: kill_exp += m["exp"] * r["count"]; kills += r["count"]
            parts.append(f"kill {r['count']} {r['name']}")
        elif r["type"] == "item":
            s = a.item_source(r["name"])
            if s: parts.append(f"{r['count']} {r['name']}"); items_unknown.append((r["count"], s))
            else: parts.append(f"{r['count']} {r['name']} (source n/a)")
    target = None
    for r in reqs:
        if r["type"] == "mob" and r["id"] in a.mob_by_id: target = a.mob_by_id[r["id"]]; break
    if not target and items_unknown: target = items_unknown[0][1]
    eq_kills = round(exp / target["exp"]) if target and target["exp"] and exp else None
    pct = round(100 * exp / a.EXP_TABLE.get(max(lv, 1), 1), 1) if lv and lv <= 70 else None
    mult = round((kill_exp + exp) / kill_exp, 2) if kill_exp and exp else None   # "Bonus" column
    rc = q.get("rewards_contribution") or {}
    grade = re.search(r"Citizenship Grade (\d+)\+", q.get("requirements") or "")
    lines = [trim(l, 220) for l in (q.get("rewards_items") or "").split("\n") if l.strip()]
    rep = "daily" if q.get("is_daily") else "weekly" if q.get("is_weekly") else None
    return dict(name=q["name"], lvl=lv, npc=q.get("npc_name"), region=q.get("region"), exp=exp,
        mesos=q.get("rewards_money") or 0, req="; ".join(parts) or "talk / deliver only", kills=kills, mult=mult,
        eq_kills=eq_kills, eq_mob=target["name"] if target else None, pct_level=pct, reward=a.reward_note(q), rep=rep,
        id=q["id"], grade=int(grade.group(1)) if grade else None,
        contrib=rc.get("amount"), contrib_by_grade=rc.get("by_grade"), town=rc.get("town_name"),
        pool=(q.get("rotation") or {}).get("group"), one_time=(q.get("rotation") or {}).get("one_time"),
        info=dict(d=trim(q.get("description"), 600),
            req=[x["label"] for x in reqs] or ([q["requirements"]] if q.get("requirements") else []),
            mesos=q.get("rewards_money") or 0, items=lines, start=[f"{x['name']} x{x['count']}" for x in q.get("start_items") or []],
            prev=prev.get(q["id"]), next=q.get("next_quest_name"), chain=q.get("parent") if q.get("chain_length") else None,
            rep=rep, contrib=(rc.get("amount") or (rc.get("label") + " by grade" if rc.get("label") else 0)),
            eq=1 if any(1000000 <= int(x) < 2000000 for x in reward_ids(q)) else 0))   # equip IDs are 1xxxxxx

def step_quests(D):
    prev = {i["next_quest"]: i["name"] for i in QUESTS if i.get("next_quest")}
    rows = [quest_row(q, prev) for q in QUESTS]
    # structured requirements for the Path Planner: kl [[mobId, n]], il [[item, n, sourceMobId|None]], pre [questId]
    byid = {q["id"]: q for q in QUESTS}
    for r in rows:
        reqs = byid[r["id"]].get("requirements_list") or []
        r["kl"] = [[str(x["id"]), x["count"]] for x in reqs if x["type"] == "mob"]
        r["il"] = [[x["name"], x["count"], (lambda s: str(s["id"]) if s else None)(a.item_source(x["name"]))] for x in reqs if x["type"] == "item"]
        r["pre"] = [str(x["id"]) for x in reqs if x["type"] == "quest"]
    D["quests"] = [r for r in rows if r["region"] != "Citizenship"]
    D["citq"] = [r for r in rows if r["region"] == "Citizenship"]
    # questlines: grouped by the export's "parent" name, ordered by level then quest id
    par = {i["id"]: i.get("parent") for i in QUESTS}
    groups = collections.defaultdict(list)
    for r in D["quests"] + D["citq"]:
        r["chain"] = par.get(r["id"])
        if r["chain"]: groups[r["chain"]].append(r)
    for L in groups.values():
        L.sort(key=lambda r: (r["lvl"], int(r["id"])))
        for i, r in enumerate(L): r["cpos"] = i + 1; r["cn"] = len(L)
    for r in D["quests"] + D["citq"]:
        if r["chain"] and r["cn"] < 2: r["chain"] = None

def reward_groups(i):
    out = []
    g = [[str(r["id"]), r.get("count", 1)] for r in i.get("rewards", []) if r.get("type") == "item" and r.get("guaranteed", True) and r.get("id") and r.get("count", 1) > 0]
    if g: out.append({"k": "get", "it": g})
    for blk in i.get("reward_choices") or []:
        for gr in blk.get("groups", []):
            out.append({"k": "pick", "job": gr.get("job_name"), "it": [[str(x["id"]), x.get("count", 1)] for x in gr.get("items", [])]})
    for blk in i.get("reward_weighted") or []:
        for gr in blk.get("groups", []):
            out.append({"k": "rand", "job": gr.get("job_name"), "it": [[str(x["id"]), x.get("count", 1), x.get("chance_pct")] for x in gr.get("items", [])]})
    if not out or not any(o["k"] in ("pick", "rand") for o in out):
        ng = [[str(r["id"]), r.get("count", 1)] for r in i.get("rewards", []) if r.get("type") == "item" and r.get("guaranteed") is False]
        if ng: out.append({"k": "rand", "job": None, "it": ng})
    return out

KEEP = ("reqLevel", "reqSTR", "reqDEX", "reqINT", "reqLUK", "incSTR", "incDEX", "incINT", "incLUK", "incPAD", "incMAD", "incPDD", "incMDD",
        "incACC", "incEVA", "incSpeed", "incJump", "incMHP", "incMMP", "incCRD", "incCR", "tuc", "attackSpeed", "price", "slotMax")
def step_rewards(D):
    qby = {i["id"]: i for i in QUESTS}; need = set()
    for r in D["quests"] + D["citq"]:
        r["ri"] = reward_groups(qby[r["id"]])
        for g in r["ri"]:
            for x in g["it"]: need.add(x[0])
    need |= {w[12] for w in D["weapons"]}   # weapon icons + tooltips for the builder and planner
    need |= {"1032021", "1032022"}  # Henesys / Kerning City Earrings (grade 10 Citizenship reward, shown on that tab)
    info, icons = {}, {}
    for iid in sorted(need):   # sorted so rebuilds are byte-identical
        i = ITEM[iid]
        st = {k: v for k, v in (i.get("stats") or {}).items() if k in KEEP}
        info[iid] = {"n": i["name"], "c": i.get("category") or ("Scroll" if i.get("stat_type") or "Scroll" in i["name"] else ""),
                     "s": i.get("sub_category") or i.get("equip_slot") or "", "st": st, "job": i.get("req_job_label"),
                     "p": i.get("price") or st.get("price"), "d": (i.get("description") or "").strip(),
                     "wt": i.get("weapon_type"), "spd": i.get("attack_speed_label"), "sp": i.get("spec")}
        p = C + f"images/items/{int(iid):08d}.png"
        if os.path.exists(p): icons[iid] = b64(p)
    D["items"], D["iicons"] = info, icons

def step_launch(D):
    mob = {str(m["id"]): m for m in a.monsters}
    openm = lambda m: any(a.launch_status(x["id"]) == "Open at launch" for x in (m.get("maps") or []))
    ok = {m["name"] for m in a.monsters if openm(m)}
    later = [k for k in D["mobs"] if not openm(mob[str(k)])]
    D["latermobs"] = [str(k) for k in later]
    D["latermobnames"] = sorted({mob[str(k)]["name"] for k in later} - ok)

if __name__ == "__main__":
    D = step_base()
    step_weapons(D); step_skills(D); step_quests(D); step_rewards(D); step_launch(D)
    D = json.loads(json.dumps(D))  # normalise int keys -> strings, same as what the page sees
    (ROOT / "data").mkdir(exist_ok=True)
    s = json.dumps(D, separators=(",", ":"))
    (ROOT / "data" / "data.json").write_text(s)
    print(f"data/data.json {len(s)/1024:.0f} KB · {len(D['quests'])} quests · {len(D['citq'])} citizenship · {len(D['maps'])} maps · {len(D['weapons'])} weapons")
