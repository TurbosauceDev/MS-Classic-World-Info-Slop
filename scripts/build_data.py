"""Build data/data.json (everything the page embeds) from the OSMS Data Explorer export (Public Release, Oct 6 2026; was COT2).

Run:  python3 scripts/build_data.py      (then python3 scripts/build.py)
Needs the export at vendor/osms_datamine_dashboard (scripts/fetch_osms.sh) or OSMS_DATA=/path/to/data/.

Steps, in order (each adds keys to the data dict):
  base      mobs, maps, mobdiff, skilldiff, exp           <- analyze.py
  weapons   weapons                                       <- items.json
  skills    skills, icons                                 <- skills.json + images/skills
  quests    quests, citq (+ info, chain, cpos, cn)        <- quests.json
  rewards   ri on every quest row, items, iicons          <- quests.json + items.json + images/items
  launch    latermobs, latermobnames                      <- monsters.json + maps (Forgotten Hollow / not-at-launch)
  extras    mobatk, potshops                              <- monsters.json + meowdb shops (`build_data.py extras`)
  mobdb     mobdb, mskill (+ mobimg)                     <- monsters.json + meowdb drops/mesos (`build_data.py mobdb`)
  worldmap  wmap                                          <- maplestory.io MCW CBT2 WorldMap000/001 (`build_data.py worldmap`)
  crafting  craft (+ items)                               <- crafting.json + Crafting quests (`build_data.py crafting` = this step only)
  itemdb    items/iicons for every item, ishop             <- items.json + meowdb shops (`build_data.py itemdb`)
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
def reach(s):
    """[front, back] px an attack reaches at max level: hitbox range, a centred attack rectangle (Thunder Bolt), or the
    300 px corridor/pierce of projectiles (client default / weapon base, before The Eye of Amazon)."""
    rv = s.get("range_visual") or {}
    if s.get("range"): r = s["range"]; return [r[-1] if isinstance(r, list) else r, 0]
    if rv.get("family") == "fixed_rectangle" and rv.get("levels"): b = rv["levels"][-1]; return [b["rb"]["x"], -b["lt"]["x"]]
    if (rv.get("attack_range") or {}).get("base"): return [rv["attack_range"]["base"], 0]
    return None

def step_skills(D):
    src = json.load(open(C + "skills.json")); out, icons = {}, {}
    for gs in src.values():
        if not isinstance(gs, list): continue
        for g in gs:
            if not isinstance(g, dict) or g["class_name"] not in JOBS: continue
            L = []
            for s in g["skills"]:
                req = []
                for part in (s.get("required_skill") or "").split(","):
                    m = re.match(r"\s*(.+?) Lv\.(\d+)", part)
                    if m: req.append([m.group(1), int(m.group(2))])
                L.append({"id": s["id"], "n": s["name"], "max": s["max_level"], "req": req,
                          "k": (s.get("mechanics") or {}).get("kind") or ("passive" if s.get("passive") else ""),
                          "att": s.get("attack_count", 1), "mob": s.get("mob_count", 1), "rg": reach(s), "st": s["all_level_stats"],
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
    D["items"], D["iicons"] = {}, {}
    add_items(D, need)

def add_items(D, ids):
    """items {itemId: tooltip info} + iicons {itemId: base64 png} for every id not there yet."""
    for iid in sorted(set(ids) - set(D["items"])):   # sorted so rebuilds are byte-identical
        i = ITEM[iid]
        st = {k: v for k, v in (i.get("stats") or {}).items() if k in KEEP}
        D["items"][iid] = {"n": i["name"], "c": i.get("category") or ("Scroll" if i.get("stat_type") or "Scroll" in i["name"] else ""),
                     "s": i.get("sub_category") or i.get("equip_slot") or "", "st": st, "job": i.get("req_job_label"),
                     "p": i.get("price") or st.get("price"), "d": (i.get("description") or "").strip(),
                     "wt": i.get("weapon_type"), "spd": i.get("attack_speed_label"), "sp": i.get("spec")}
        p = C + f"images/items/{int(iid):08d}.png"
        if os.path.exists(p): D["iicons"][iid] = b64(p)

def step_npcs(D):
    """npcs {npcId: [name, [[mapId, x, y], ...]]} for every NPC named by a quest, x/y as minimap fractions (filled in by
    step_portals once render sizes are known), npcid {name: npcId}, npcimg {npcId: base64 png}. npcmaps = launch maps
    they stand on (towns aren't in `maps`, so their minimaps are added too)."""
    names = {r["npc"] for r in D["quests"] + D["citq"] if r.get("npc")}
    look = json.load(open(C + "lookups.json"))["npc_names"]
    at = collections.defaultdict(list)
    for r in a.mapsj["regions"]:
        for m in r["maps"]:
            if a.launch_status(m["id"]) != "Open at launch": continue
            placed = set()
            for p in m.get("npc_positions") or []: at[str(p["id"])].append([str(m["id"]), p["x"], p["y"]]); placed.add(p["id"])
            for n in m.get("npcs") or []:   # listed on the map without a position (e.g. Dances with Balrog)
                if n not in placed: at[str(n)].append([str(m["id"]), None, None])
    ids = {}
    for i, n in look.items():
        if n in names and (n not in ids or (at.get(i) and not at.get(ids[n]))): ids[n] = i   # same name twice: prefer one placed at launch
    D["npcid"] = ids
    D["npcs"] = {i: [n, at.get(i, [])] for n, i in ids.items()}
    D["npcimg"] = {i: b64(C + f"images/npcs/{int(i):07d}.png") for i in ids.values() if os.path.exists(C + f"images/npcs/{int(i):07d}.png")}
    D["npcmaps"] = sorted({loc[0] for v in D["npcs"].values() for loc in v[1]})

def step_mobimg(D):
    """mobimg {mobId: base64 png}: the export's thumbnail of each launch monster (~150 KB total), fetched one file at a time
    by URL (the clone is blob-filtered) and cached in vendor/mob_thumbs/."""
    import subprocess
    mon = {str(m["id"]): m for m in a.monsters}
    ref = os.environ.get("OSMS_REF") or subprocess.run(["git", "-C", str(ROOT / "vendor" / "osms_datamine_dashboard"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    cache = ROOT / "vendor" / "mob_thumbs"; cache.mkdir(exist_ok=True)
    out = {}
    for mid in D["mobs"]:
        mid = str(mid); h = mon.get(mid, {}).get("thumbnail")
        if not h: continue
        f = cache / f"{h}.png"
        if not f.exists():
            subprocess.run(["curl", "-sSf", "--max-time", "30", "-o", str(f), f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/data/images/monsters/{h}.png"])
        if f.exists() and f.stat().st_size: out[mid] = base64.b64encode(f.read_bytes()).decode()
    D["mobimg"] = out

def step_nav(D):
    """nav {mapId: [neighbour mapIds]}: walkable links between launch maps (map exits, made two-way); cabs [town mapIds with
    a Regular/VIP Cab or Phil] for taxi hops. Names of every nav map go into mapnames."""
    look = json.load(open(C + "lookups.json"))["npc_names"]
    cabnpc = {i for i, n in look.items() if n in ("Regular Cab", "VIP Cab", "Phil")}
    nav, cabs = collections.defaultdict(set), set()
    for r in a.mapsj["regions"]:
        for m in r["maps"]:
            if a.launch_status(m["id"]) != "Open at launch": continue
            k = str(m["id"]); nav[k]
            for e in m.get("exits") or []:
                if a.launch_status(e) == "Open at launch": nav[k].add(str(e)); nav[str(e)].add(k)
            if any(str(n) in cabnpc for n in m.get("npcs") or []): cabs.add(k)
    D["nav"] = {k: sorted(v) for k, v in nav.items()}
    # monster spawn points per open map (map pixels), for how many monsters an area attack reaches
    pos, openids, mobids = {}, {int(k) for k, v in D["maps"].items() if v[1]}, {str(k) for k in D["mobs"]}
    for r in a.mapsj["regions"]:
        for m in r["maps"]:
            if m["id"] in openids:
                pos[str(m["id"])] = [[p["x"], p["y"]] for p in m.get("mob_positions") or [] if str(p["id"]) in mobids]
    D["mpos"] = pos
    D["cabs"] = sorted(cabs)
    D["mapnames"].update({k: a.map_name.get(int(k), "") for k in nav})

def step_weapon_sources(D):
    """wsrc {weapon name: {shop: [[npc, mapId, mapName, price]], craft: [discipline, level, mesos, [[item, n]]],
    quest: [questId], drops: [[monster, level]], dropsFrom: "community" | "msea"}} for every weapon.
    Shops: meowdb NPC shop list (data/sources/meowdb_shops.json). Craft: the export's crafting.json. Quest: our reward data.
    Drops: meowdb item pages (data/sources/meowdb_weapon_drops.json): community reports, else meowdb's pre-Big-Bang
    MapleSEA reference list (flagged on the page as likely, not confirmed)."""
    src = ROOT / "data" / "sources"
    names = {w[0] for w in D["weapons"]}
    byname = {}
    for k, v in a.map_name.items(): byname.setdefault(v, str(k))
    out = {n: {} for n in names}
    shops = json.load(open(src / "meowdb_shops.json"))["shops"]
    for s in shops:
        for nm, price, tag in s["items"]:
            if nm in out: out[nm].setdefault("shop", []).append([s["npc"], byname.get(s["map"], ""), s["map"], price])
    cr = json.load(open(C + "crafting.json"))
    for d in cr["disciplines"]:
        for ot in d["output_types"]:
            for lv in ot["levels"]:
                for r in lv["recipes"]:
                    if r["result_item_name"] in out:
                        out[r["result_item_name"]]["craft"] = [d["discipline"], r["req_level"], r["meso_cost"], [[i["item_name"], i["count"]] for i in r["ingredients"]]]
    wid = {w[12]: w[0] for w in D["weapons"]}
    for q in D["quests"] + D["citq"]:
        for g in q.get("ri") or []:
            for it in g["it"]:
                if it[0] in wid: out[wid[it[0]]].setdefault("quest", []).append(q["id"])
    f = src / "meowdb_weapon_drops.json"
    if f.exists():
        for nm, v in json.load(open(f))["weapons"].items():
            if nm in out and v.get("drops"): out[nm]["drops"], out[nm]["dropsFrom"] = v["drops"], v["from"]
    D["wsrc"] = {k: v for k, v in out.items() if v}

def step_crafting(D):
    """craft {disc: [[name, skillId, master NPC, apprentice quest, weekly quest, Lv 5 quest]],
    rec: [[disc index, output type, craft level, itemId, count, craft EXP, mesos, [[itemId, n]]]],
    src: {itemId: {mob: [mobId], why: "name"|"desc", meow: [mobId from meowdb], shop: [[npc, mapId, mapName, price]]}} for raw materials}
    from the export's crafting.json + the Crafting quests. Monster = the item is named after it ("Jr. Necki Skin") or its
    description names it ("firewood from an Axe Stump"); the export has no drop tables. Shops: meowdb NPC shop list."""
    cr = json.load(open(C + "crafting.json"))
    byname = {}
    for i in ALL_ITEMS: byname.setdefault(i["name"], str(i["id"]))
    disc, rec, made = [], [], set()
    for di, d in enumerate(cr["disciplines"]):
        qs = [q for q in QUESTS if q.get("region") == "Crafting" and any(x.get("id") == d["skill_id"] for x in q.get("requirements_list") or [])]
        npc = qs[0]["npc_name"] if qs else None
        mine = sorted([q for q in QUESTS if q.get("region") == "Crafting" and q.get("npc_name") == npc], key=lambda q: int(q["id"]))
        app = next((q["id"] for q in mine if not any(x.get("is_crafting") for x in q.get("requirements_list") or [])), None)
        wk = next((q["id"] for q in mine if q.get("is_weekly")), None)
        own = next((q["id"] for q in mine if q["id"] not in (app, wk)), None)
        disc.append([d["discipline"], d["skill_id"], npc, app, wk, own])
        for ot in d["output_types"]:
            for lv in ot["levels"]:
                for r in lv["recipes"]:
                    oid = str(r["output_id"]); made.add(oid)
                    rec.append([di, ot["output_type"], r["req_level"], oid, r["result_count"], r["craft_exp"], r["meso_cost"],
                                [[byname[i["item_name"]], i["count"]] for i in r["ingredients"]]])
    raw = sorted({i for r in rec for i, _ in r[7]} - made, key=int)
    shops = json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]
    meow = json.load(open(ROOT / "data" / "sources" / "meowdb_material_drops.json"))["drops"]
    mapid = {}
    for k, v in a.map_name.items(): mapid.setdefault(v, str(k))
    src = {}
    for iid in raw:
        it, o = ITEM[iid], {}
        m = a.item_source(it["name"])
        if m: o["mob"], o["why"] = [str(m["id"])], "name"
        else:
            desc = it.get("description") or ""
            hit = next((n for n in a.mob_names_sorted if re.search(r"\b" + re.escape(n) + r"\b", desc)), None)
            if hit: o["mob"], o["why"] = [str(m["id"]) for m in a.monsters if m["name"] == hit][:1], "desc"
        for nm in meow.get(it["name"], []):   # meowdb grind-maps guide: monsters that drop it
            ids = [str(m["id"]) for m in a.monsters if m["name"] == nm][:1]
            if ids and ids[0] not in o.get("mob", []): o.setdefault("mob", []).extend(ids); o.setdefault("meow", []).extend(ids)
        for s in shops:
            if "\t" in s["npc"]: continue   # two mis-parsed meowdb rows (Jane, Arwen the Fairy): no NPC name or price
            for nm, price, _ in s["items"]:
                if nm == it["name"] and price: o.setdefault("shop", []).append([s["npc"], mapid.get(s["map"], ""), s["map"], price])
        if o: src[iid] = o
    D["craft"] = {"disc": disc, "rec": rec, "src": src}
    add_items(D, {r[3] for r in rec} | {i for r in rec for i, _ in r[7]} | {"4130000", "4130001", "4130002", "4130003"} |
              {str(x) for x in range(2002005, 2002011)})

POTIONS = {"Red Potion", "Orange Potion", "White Potion", "Blue Potion", "Lemon", "Meat", "Orange", "Fried Chicken"}
def step_extras(D):
    """mobatk {mobId: [touch attack (PADamage), accuracy, (magic attack MADamage, 1) when it has a magic attack]} for danger; potshops [[npc, mapId, mapName]] = meowdb
    NPC shops that sell HP/MP potions, for "portals to potions" (refill walk)."""
    mob = {str(m["id"]): m for m in a.monsters}
    mq = json.load(open(ROOT / "data" / "sources" / "mq_mob_magic.json"))["mobs"]   # maplestory.quest raw client: magic attack
    D["mobatk"] = {k: [mob[k].get("PADamage") or 0, mob[k].get("acc") or 0] + (mq[k][:1] + mq[k][2:3] if k in mq and mq[k][2] else [])
                   for k in D["mobs"] if k in mob}
    mapid = {}
    for k, v in a.map_name.items(): mapid.setdefault(v, str(k))
    out = []
    for s in json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]:
        if "\t" in s["npc"] or not any(nm in POTIONS for nm, price, _ in s["items"] if price): continue
        if mapid.get(s["map"]): out.append([s["npc"], mapid[s["map"]], s["map"]])
    D["potshops"] = out
    # every item a quest asks for gets tooltip info + icon (Keep list, quest tooltips)
    byname = {}
    for i in ALL_ITEMS: byname.setdefault(i["name"], str(i["id"]))
    add_items(D, {byname[n] for r in D["quests"] + D["citq"] for n, *_ in r["il"] if n in byname})
    # shopsell {itemId: [npc, mapName, price]}: cheapest meowdb NPC shop for every item a quest asks for (Keep list)
    want, sell = {n for r in D["quests"] + D["citq"] for n, *_ in r["il"]}, {}
    for s in json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]:
        if "\t" in s["npc"]: continue
        for nm, price, _ in s["items"]:
            if nm in want and price and nm in byname and (byname[nm] not in sell or price < sell[byname[nm]][2]): sell[byname[nm]] = [s["npc"], s["map"], price]
    D["shopsell"] = sell
    # meso {mobId: [mesos per kill, reports]}: community reports on meowdb monster pages (median min/max × drop chance, trusted
    # reports only). mesok = mesos per kill per monster level, the median over reported non-boss monsters: estimate for the rest.
    rep = json.load(open(ROOT / "data" / "sources" / "meowdb_mesos.json"))["monsters"]
    D["meso"] = {k: [round((v["summary"]["medianMin"] + v["summary"]["medianMax"]) / 2 * v["summary"]["medianDropChancePct"] / 100, 1), v["summary"]["trustedCount"]]
                 for k, v in rep.items() if k in D["mobs"] and v["summary"]["trustedCount"]}
    ratios = sorted(v[0] / D["mobs"][k][1] for k, v in D["meso"].items() if D["mobs"][k][1] > 1)
    D["mesok"] = round(ratios[len(ratios) // 2], 2)
    # drops {itemId: [[mobId, net votes], ...]}: items players report and confirm on meowdb monster pages (net votes >= 1),
    # launch and later monsters alike (the page marks later ones). Drop rates are server-side, so there are no rates.
    dr = {}
    for mid, rows in json.load(open(ROOT / "data" / "sources" / "meowdb_drops.json"))["mobs"].items():
        if mid not in D["mobs"] and mid not in mob: continue   # field monsters + bosses/KPQ/JQ; step_mobdb drops non-launch ones
        for iid, _, up, down in rows:
            if up - down >= 1: dr.setdefault(str(iid), []).append([mid, up - down])
    D["drops"] = {k: sorted(v, key=lambda x: -x[1]) for k, v in dr.items()}
    # potval {itemId: cheapest meowdb shop price} for HP/MP consumables a quest hands out (counted as potions you don't buy)
    price = {}
    for s_ in json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]:
        if "\t" in s_["npc"]: continue
        for nm, pr, _ in s_["items"]:
            if pr and (nm not in price or pr < price[nm]): price[nm] = pr
    heal = {str(i["id"]): i["name"] for i in ALL_ITEMS if (i.get("spec") or {}).get("hp") or (i.get("spec") or {}).get("mp")}
    D["potval"] = {k: price[n] for k, n in heal.items() if n in price and any(k == str(x[0]) for r in D["quests"] for g in r.get("ri") or [] if g["k"] == "get" for x in g["it"])}
    # timed spawns on launch maps (bosses and anything with a respawn timer over 60 s, which the map ranking leaves out):
    # [mobId, name, level, hp, exp, mapId, mapName, count, timer s, boss]
    rows = []
    for m in a.monsters:
        for sp in m.get("maps") or []:
            try: t = float(sp.get("mob_time") or 0)
            except Exception: t = 0
            if (t > 60 or m.get("is_boss")) and a.launch_status(sp["id"]) == "Open at launch":
                rows.append([str(m["id"]), m["name"], m["level"], m["hp"], m["exp"], str(sp["id"]), a.map_name.get(sp["id"], ""), sp.get("count", 1), t, 1 if m.get("is_boss") else 0])
    D["timed"] = sorted(rows, key=lambda r: (-r[9], r[2], r[1]))
    # armor for the Character Builder: [id, name, slot, reqLevel, job label, gender, [reqSTR, DEX, INT, LUK], {stat: +n}, shop price]
    # (stats: STR DEX INT LUK PDD MDD MHP MMP ACC EVA CRT CRD Speed Jump; shop price from meowdb's list, 0 = not sold)
    price = {}
    for s in json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]:
        if "\t" in s["npc"]: continue
        for nm, p, _ in s["items"]:
            if p and (nm not in price or p < price[nm]): price[nm] = p
    KEEP_ST = {"incSTR": "STR", "incDEX": "DEX", "incINT": "INT", "incLUK": "LUK", "incPDD": "PDD", "incMDD": "MDD", "incMHP": "MHP", "incMMP": "MMP",
               "incACC": "ACC", "incEVA": "EVA", "incCRT": "CRT", "incCRD": "CRD", "incSpeed": "Speed", "incJump": "Jump"}
    arm = []
    for i in ALL_ITEMS:
        if i.get("category") != "Equipment" or i.get("sub_category") in (None, "Weapon"): continue
        st = i.get("stats") or {}
        arm.append([str(i["id"]), i["name"], i["sub_category"], st.get("reqLevel", 0), i.get("req_job_label") or "All", i.get("gender"),
                    [st.get(k, 0) for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK")], {v: st[k] for k, v in KEEP_ST.items() if st.get(k)}, price.get(i["name"], 0)])
    D["armor"] = sorted(arm, key=lambda r: (r[2], r[3], r[1]))

def step_minimaps(D):
    """mmaps {mapId: base64}: minimap of every open map, for the map hover card. WebP q80 (~1 MB for 177 maps) when
    Pillow is installed (pip install pillow), else the original PNGs (~1.9 MB). mmapType says which."""
    try:
        from PIL import Image
        import io
    except ImportError:
        Image = None; print("Pillow not installed: minimaps stay PNG (bigger page)")
    out, dim = {}, {}
    want = [mid for mid, m in D["maps"].items() if m[1]] + [m for m in D.get("npcmaps", []) if m not in D["maps"]]
    for mid in want:
        p = C + f"images/maps/{int(mid):09d}.png"
        if not os.path.exists(p): continue
        if Image:
            im = Image.open(p); dim[str(mid)] = list(im.size)
            buf = io.BytesIO(); im.convert("RGBA").save(buf, "WEBP", quality=80, method=6)
            out[str(mid)] = base64.b64encode(buf.getvalue()).decode()
        else:
            out[str(mid)] = b64(p)
    D["mmaps"], D["mmapType"], D["mmdim"] = out, "webp" if Image else "png", dim
    step_portals(D)

def render_dims(ids):
    """Width/height of the dashboard's full map renders (portal x/y are in render pixels). Reads only the first 64 bytes
    of each WebP (HTTP range request, ~11 KB for all open maps) instead of the ~900 MB of renders. Cached in vendor/."""
    import subprocess, concurrent.futures as cf
    cache = ROOT / "vendor" / "render_dims.json"
    got = json.loads(cache.read_text()) if cache.exists() else {}
    man = json.load(open(C + "map_manifest.json"))
    ref = os.environ.get("OSMS_REF") or subprocess.run(["git", "-C", str(ROOT / "vendor" / "osms_datamine_dashboard"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    def head(mid):
        h = man.get(f"{int(mid):09d}")
        if not h: return mid, None
        b = subprocess.run(["curl", "-sS", "--max-time", "20", "-r", "0-63", f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/data/maps/{h}.webp"], capture_output=True).stdout
        if b[:4] != b"RIFF" or b[8:12] != b"WEBP": return mid, None
        t = b[12:16]
        if t == b"VP8X": return mid, [int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1]
        if t == b"VP8L": v = int.from_bytes(b[21:25], "little"); return mid, [(v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1]
        return mid, [int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF]
    todo = [i for i in ids if i not in got]
    if todo:
        with cf.ThreadPoolExecutor(12) as ex:
            for mid, dm in ex.map(head, todo):
                if dm: got[mid] = dm
        cache.write_text(json.dumps(got))
    return got

def step_portals(D):
    """portals {mapId: [[x, y, destId, hidden]]}: exits to other maps as fractions of the minimap (render pixels stretched
    per axis: 92% of monster spawn points then land on drawn platforms). mapnames {id: name} for every destination."""
    P = json.load(open(C + "portals.json"))
    dims = render_dims([k for k in D["mmdim"]])
    names = {m["id"]: m["name"] for r in a.mapsj["regions"] for m in r["maps"]}
    out, dest = {}, set()
    for mid in D["mmdim"]:
        if mid not in dims: continue
        rw, rh = dims[mid]; L = []
        for p in P.get(f"{int(mid):09d}", []):
            dm = p.get("dest_map")
            if not dm or dm == "999999999" or int(dm) == int(mid) or p["type"] not in (1, 2, 3): continue
            L.append([round(min(max(p["x"] / rw, 0), 1), 3), round(min(max(p["y"] / rh, 0), 1), 3), str(int(dm)), 1 if p["type"] == 1 else 0])
            dest.add(int(dm))
        if L: out[mid] = L
    D["portals"] = out
    for i, (n, locs) in D.get("npcs", {}).items():
        # keep every map they're on; x/y only when the minimap can place them
        D["npcs"][i][1] = [[mid, round(x / dims[mid][0], 3), round(y / dims[mid][1], 3)] if mid in dims and x is not None else [mid, None, None] for mid, x, y in locs]
    dest |= {int(mid) for mid in D["mmdim"]}
    D["mapnames"] = {str(i): names.get(i, "") for i in sorted(dest)}

def step_launch(D):
    mob = {str(m["id"]): m for m in a.monsters}
    openm = lambda m: any(a.launch_status(x["id"]) == "Open at launch" for x in (m.get("maps") or []))
    ok = {m["name"] for m in a.monsters if openm(m)}
    later = [k for k in D["mobs"] if not openm(mob[str(k)])]
    D["latermobs"] = [str(k) for k in later]
    D["latermobnames"] = sorted({mob[str(k)]["name"] for k in later} - ok)

def step_mobdb(D):
    """mobdb {mobId: export fields}: every monster you can meet at launch (open launch maps, KPQ, 2nd-job test maps) for the
    Monsters tab, with spawn maps [[mapId, name, count, respawn s ("7.56" or "min-max [avg]"), kind]], meowdb drop reports dr [[itemId, name, net votes]]
    meowdb mesos [per kill, reports, min, max, drop %] and sp {mapId: [[x, y]]} spawn points as minimap fractions. Adds missing thumbnails to mobimg and mob skill icons to mskill."""
    import subprocess
    ref = os.environ.get("OSMS_REF") or subprocess.run(["git", "-C", str(ROOT / "vendor" / "osms_datamine_dashboard"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    raw = f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/data/"
    def fetch(path, f):
        if not f.exists(): subprocess.run(["curl", "-sSf", "--max-time", "30", "-o", str(f), raw + path])
        return base64.b64encode(f.read_bytes()).decode() if f.exists() and f.stat().st_size else None
    def kind(mid):
        if a.launch_status(mid) == "Open at launch": return ""
        if 80000000 <= mid < 80001000: return "KPQ"
        if 80001000 <= mid < 80002000: return "2nd job test"
    drops = json.load(open(ROOT / "data" / "sources" / "meowdb_drops.json"))["mobs"]
    mesos = json.load(open(ROOT / "data" / "sources" / "meowdb_mesos.json"))["monsters"]
    SKIP = {"gif", "gifs", "thumbnail", "maps", "id"}
    out, cache = {}, ROOT / "vendor" / "mob_thumbs"; cache.mkdir(exist_ok=True)
    D.setdefault("mskill", {})
    # spawn points per monster on each map with a minimap, as minimap fractions (same per-axis stretch as portals)
    dims, spots = render_dims([k for k in D["mmdim"]]), collections.defaultdict(dict)
    for r in a.mapsj["regions"]:
        for mp in r["maps"]:
            k = str(mp["id"])
            if k not in dims: continue
            rw, rh = dims[k]
            for p in mp.get("mob_positions") or []:
                spots[str(p["id"])].setdefault(k, []).append([round(min(max(p["x"] / rw, 0), 1), 3), round(min(max(p["y"] / rh, 0), 1), 3)])
    for m in a.monsters:
        maps = [[x["id"], a.map_name.get(x["id"], x.get("name") or "").strip(), x.get("count") or 0, str(x.get("mob_time") or ""), kind(x["id"])]
                for x in m.get("maps") or [] if kind(x["id"]) is not None]
        if not maps: continue
        k = str(m["id"]); o = {f: v for f, v in m.items() if f not in SKIP and v not in (None, [], {})}
        o["maps"] = sorted(maps, key=lambda x: (x[4] != "", -x[2]))
        o["sp"] = spots.get(k, {})
        o["dr"] = sorted(([i, n, up - dn] for i, n, up, dn in drops.get(k, []) if up - dn >= 0), key=lambda x: -x[2])
        sm = mesos.get(k, {}).get("summary") or {}
        if sm.get("trustedCount"):
            o["meso"] = [round((sm["medianMin"] + sm["medianMax"]) / 2 * sm["medianDropChancePct"] / 100, 1), sm["trustedCount"], sm["medianMin"], sm["medianMax"], sm["medianDropChancePct"]]
        for sk in (o.get("self_buffs") or []) + (o.get("debuffs") or []):
            ic = sk.pop("icon", None); sid = str(sk["id"])
            if ic and sid not in D["mskill"]:
                b = fetch("current/" + ic, cache / f"skill_{sid}.png")
                if b: D["mskill"][sid] = b
        if k not in D["mobimg"] and m.get("thumbnail"):
            b = fetch(f"images/monsters/{m['thumbnail']}.png", cache / f"{m['thumbnail']}.png")
            if b: D["mobimg"][k] = b
        out[k] = o
    D["mobdb"] = out
    # meowdb drops: keep monsters you can meet at launch (field ones + the bosses/KPQ/JQ in mobdb); Orbis/El Nath ones go
    D["drops"] = {k: w for k, v in D["drops"].items() if (w := [x for x in v if x[0] in D["mobs"] or x[0] in out])}

def step_worldmap(D):
    """wmap [[key, island, w, h, base64 webp, [[x, y, type, [mapIds]]]]]: the client's world maps (WorldMap.wz) for Maple
    Island (WorldMap000) and Victoria Island (WorldMap001), from maplestory.io's Classic World client (region MCW, version
    CBT2 = COT2; no newer MCW client there yet). x/y = spot as a fraction of the image; type = the client's marker
    (0 town, 1/3 field, 2 dungeon). Ossyria (002/003) is left out: not in the launch. Cached in vendor/worldmap/."""
    import io, subprocess
    from PIL import Image
    cache = ROOT / "vendor" / "worldmap"; cache.mkdir(parents=True, exist_ok=True)
    out = []
    for key, island in (("WorldMap000", "Maple Island"), ("WorldMap001", "Victoria Island")):
        f = cache / f"{key}.json"
        if not f.exists():   # curl: maplestory.io answers Python's default client with 403
            subprocess.run(["curl", "-sSf", "-m", "120", "-o", str(f), f"https://maplestory.io/api/MCW/CBT2/map/worldmap/{key}"], check=True)
        w = json.load(open(f)); base = w["baseImage"][0]; ox, oy = base["origin"]["x"], base["origin"]["y"]
        im = Image.open(io.BytesIO(base64.b64decode(base["image"]))); W, H = im.size
        buf = io.BytesIO(); im.convert("RGBA").save(buf, "WEBP", quality=80, method=6)
        spots = [[round((ox + m["spot"]["x"]) / W, 4), round((oy + m["spot"]["y"]) / H, 4), m["type"], [str(i) for i in m["mapNumbers"]]] for m in w["maps"]]
        out.append([key, island, W, H, base64.b64encode(buf.getvalue()).decode(), spots])
    D["wmap"] = out

def step_itemdb(D):
    """Item database: every item in the export (items + scrolls) gets a D.items entry and icon (add_items), g = gender
    for gender-locked equipment, and ishop {itemId: [[npc, mapId, mapName, price]]} = every meowdb NPC shop that sells it."""
    add_items(D, ITEM)
    for iid, i in ITEM.items():
        if i.get("gender"): D["items"][iid]["g"] = i["gender"]
    byname = collections.defaultdict(list)
    for iid, i in ITEM.items(): byname[i["name"]].append(iid)
    mapid = {}
    for k, v in a.map_name.items(): mapid.setdefault(v, str(k))
    out = {}
    for s in json.load(open(ROOT / "data" / "sources" / "meowdb_shops.json"))["shops"]:
        if "\t" in s["npc"]: continue   # two mis-parsed meowdb rows (see step_crafting)
        for nm, price, _ in s["items"]:
            ids = byname.get(nm, [])
            if len(ids) > 1 and not all(ITEM[i].get("gender") for i in ids):   # same name: male + female versions both sold; else the sellable one
                ids = [i for i in ids if (ITEM[i].get("price") or 0) > 0][:1] or ids[:1]
            for iid in ids: out.setdefault(iid, []).append([s["npc"], mapid.get(s["map"], ""), s["map"], price])
    D["ishop"] = out

PARTIAL = {"itemdb": ("ishop", lambda D: step_itemdb(D)), "crafting": ("craft", lambda D: step_crafting(D)), "extras": ("mobatk", lambda D: step_extras(D)), "mobdb": ("mobdb", lambda D: step_mobdb(D)), "worldmap": ("wmap", lambda D: step_worldmap(D))}   # (key it owns, step)
if __name__ == "__main__" and sys.argv[1:] and all(x in PARTIAL for x in sys.argv[1:]):   # cheap partial rebuild of these steps only
    D = json.load(open(ROOT / "data" / "data.json"))
    for x in sys.argv[1:]: D.pop(PARTIAL[x][0], None); PARTIAL[x][1](D)
    D = json.loads(json.dumps(D)); s = json.dumps(D, separators=(",", ":"))
    (ROOT / "data" / "data.json").write_text(s)
    print(f"data/data.json {len(s)/1024:.0f} KB · steps: {' '.join(sys.argv[1:])}"); sys.exit()

if __name__ == "__main__":
    D = step_base()
    step_weapons(D); step_skills(D); step_quests(D); step_rewards(D); step_launch(D); step_npcs(D); step_mobimg(D); step_minimaps(D); step_nav(D); step_weapon_sources(D)
    D = json.loads(json.dumps(D))  # str keys, as in the partial rebuild path (crafting/extras look mobs up by str id)
    step_crafting(D); step_extras(D); step_mobdb(D); step_worldmap(D); step_itemdb(D)
    for k in ("mobdiff", "skilldiff", "latermobnames"): D.pop(k, None)   # only the removed "What changed since 2008" tab used these
    D = json.loads(json.dumps(D))  # normalise int keys -> strings, same as what the page sees
    (ROOT / "data").mkdir(exist_ok=True)
    s = json.dumps(D, separators=(",", ":"))
    (ROOT / "data" / "data.json").write_text(s)
    print(f"data/data.json {len(s)/1024:.0f} KB · {len(D['quests'])} quests · {len(D['citq'])} citizenship · {len(D['maps'])} maps · {len(D['weapons'])} weapons")
