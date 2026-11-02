"""One URL scheme for every entity, so a visitor can guess the address (Danny 2026-11-01):

  /items/axe-pole-arm/                      canonical. A name two entries share becomes /items/<slug>-<id>/ and
                                            /items/<slug>/ turns into a "which one?" page.
  /skills/warrior/fighter/axe-mastery/      skills: class / job / skill (a first job sits right under its class)
  also resolved: /item=1442005/axe-pole-arm, /spell=1100001/axe-mastery, /skills/1100001, /skills/arrow-blow,
                 /item/1442005, /monster/stirge, /mobs/lupin ... (404.html reads routes.json and redirects)

Kinds: item, mob (monsters), map, skill, quest, npc. This module only decides names and paths; pages_gen.py writes the pages.
The planner's JS (src/js/00-routes.js) re-derives the same canonical paths for "Copy link"; tests/routes_js_test.js checks both agree.
"""
import re, unicodedata

KINDS = {"item": "items", "mob": "monsters", "map": "maps", "skill": "skills", "quest": "quests", "npc": "npcs"}
# words people type for each kind (first path segment, or the part before "=")
SYNONYMS = {"item": "item", "items": "item", "mob": "mob", "mobs": "mob", "monster": "mob", "monsters": "mob", "map": "map", "maps": "map",
            "skill": "skill", "skills": "skill", "spell": "skill", "spells": "skill", "quest": "quest", "quests": "quest",
            "npc": "npc", "npcs": "npc"}
CLASS_OF = {"Warrior": "warrior", "Fighter": "warrior", "Page": "warrior", "Spearman": "warrior",
            "Magician": "magician", "F/P Wizard": "magician", "I/L Wizard": "magician", "Cleric": "magician",
            "Archer": "archer", "Hunter": "archer", "Crossbowman": "archer",
            "Rogue": "thief", "Assassin": "thief", "Bandit": "thief"}


def slug(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "page"


class Routes:
    """entities of a built data.json: list of {kind, id, name, slug, parent, dup, canon}; plus the slug -> members map."""

    def __init__(self, D):
        raw = []   # (kind, id, name, parent segments)
        for iid, it in D["items"].items(): raw.append(("item", str(iid), it["n"], ""))
        for mid, m in D["mobdb"].items(): raw.append(("mob", str(mid), m["name"], ""))
        for mid, m in D["maps"].items():
            if m[1]: raw.append(("map", str(mid), m[0], ""))
        for job, lst in D["skills"].items():
            cls = CLASS_OF[job]; parent = cls + "/" + ("" if slug(job) == cls else slug(job) + "/")
            for s in lst: raw.append(("skill", str(s["id"]), s["n"], parent))
        for i, q in enumerate(D["quests"]): raw.append(("quest", str(q["id"]), q["name"], ""))
        for name, nid in D["npcid"].items(): raw.append(("npc", str(nid), name, ""))
        count = {}
        for k, i, n, p in raw: count[(k, p, slug(n))] = count.get((k, p, slug(n)), 0) + 1
        self.ents, self.by_canon, self.by_id = [], {}, {}
        for k, i, n, p in raw:
            s = slug(n); dup = count[(k, p, s)] > 1
            e = {"kind": k, "id": i, "name": n, "slug": s, "parent": p, "dup": dup,
                 "canon": f"/{KINDS[k]}/{p}{s}{'-' + i if dup else ''}/"}
            self.ents.append(e); self.by_canon[e["canon"]] = e; self.by_id[(k, i)] = e
        # "which one?" pages: the plain slug path of every shared name, and a skill name used by several jobs
        self.disambig = {}
        flat = {}
        for e in self.ents:
            if e["dup"]: self.disambig.setdefault(f"/{KINDS[e['kind']]}/{e['parent']}{e['slug']}/", []).append(e)
            if e["kind"] == "skill": flat.setdefault(e["slug"], []).append(e)
        for s, es in flat.items():
            if len(es) > 1: self.disambig.setdefault(f"/skills/{s}/", []).extend(x for x in es if x not in self.disambig.get(f"/skills/{s}/", []))
        for p in self.disambig: assert p not in self.by_canon, f"disambiguation path {p} is also a canonical path"

    def canon(self, kind, id_):
        return self.by_id[(kind, str(id_))]["canon"]

    def job_index(self, job):
        """path of a job's skill list; the three first jobs that share their class's name use the class page"""
        c = CLASS_OF[job]
        return f"/skills/{c}/" if slug(job) == c else f"/skills/{c}/{slug(job)}/"

    def table(self):
        """compact form for the 404 router: kind -> [[id, slug, parent, dup]]; the router rebuilds canonical paths from it."""
        out = {k: [] for k in KINDS}
        for e in self.ents: out[e["kind"]].append([e["id"], e["slug"], e["parent"], 1 if e["dup"] else 0])
        return {"kinds": KINDS, "synonyms": SYNONYMS, "classes": sorted(set(CLASS_OF.values())),
                "jobs": {slug(j): c for j, c in CLASS_OF.items()}, "e": out}
