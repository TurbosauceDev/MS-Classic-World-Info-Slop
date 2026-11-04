"""Guessable addresses (scripts/routes.py + scripts/router404.js): every alias of every entity lands on its ONE canonical page,
shared names land on a "which one?" page, and Danny's own examples work (2026-11-01)."""
import json, pathlib, re, subprocess, sys, tempfile
R_ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R_ / "scripts"))
import pages_gen
from routes import Routes, KINDS, SYNONYMS, slug, CLASS_OF, PAGE_PATHS
D = json.loads(re.search(r'<script type="application/json" id="sitedata">(.*?)</script>', (R_ / "dist/index.html").read_text(), re.S).group(1))
out = pathlib.Path(tempfile.mkdtemp())
pages_gen.generate(D, out, prev_src=str(out / "none.json"), today="2026-01-01")
R = Routes(D)
exists = lambda p: (out / p.strip("/") / "index.html").exists()
SING = {k: k for k in KINDS}   # item= mob= map= skill= quest= npc=
cases, seen = [], set()
def add(addr, want):
    assert exists(want), f"expected page missing: {want}"
    if exists(addr) or addr in seen: return          # a real page is served directly, the router never runs
    seen.add(addr); cases.append([addr, want])
for en in R.ents:
    k, i, s, c = en["kind"], en["id"], en["slug"], en["canon"]
    plural = KINDS[k]
    add(f"/{plural}/{i}", c); add(f"/{plural}/{i}/{s}", c); add(f"/{k}={i}/{s}", c); add(f"/{k}={i}", c)
    add(f"/{k}/{i}/{s}/", c)                      # the first scheme (/item/<id>/<slug>/)
    if k == "skill":
        add(f"/spell={i}/{s}", c); add(f"/spells/{i}", c)
        job = en["parent"].strip("/").split("/")[-1]
        if len({x["parent"] for x in R.ents if x["kind"] == "skill" and x["slug"] == s}) == 1: add(f"/skills/{job}/{s}", c)
    want = R.disambig.get(f"/{plural}/{en['parent']}{s}/") and f"/{plural}/{en['parent']}{s}/"
    if k == "skill" and f"/skills/{s}/" in R.disambig: want = f"/skills/{s}/"
    add(f"/{k}/{s}", want or c); add(f"/{k}={s}", want or c); add(f"/{plural}/{s}", want or c)
# Danny's examples, by name
def one(kind, name):
    return next(en for en in R.ents if en["kind"] == kind and en["name"] == name)
fighter_axe = one("skill", "Axe Mastery")
examples = {f"/skills/{fighter_axe['id']}": fighter_axe["canon"], "/skills/warrior/fighter/axe-mastery": "/skills/warrior/fighter/axe-mastery/",
            f"/spell={fighter_axe['id']}/axe-mastery": fighter_axe["canon"], "/skills/arrow-blow": one("skill", "Arrow Blow")["canon"]}
for a, w in examples.items():
    assert (w == a.rstrip("/") + "/" and exists(w)) or any(c[0] == a and c[1] == w for c in cases), f"example not covered: {a}"
for a, w in {"/skills/warrior": "/skills/warrior/", "/skills/fighter": "/skills/warrior/fighter/", "/skills/rogue": "/skills/thief/rogue/", "/items": "/items/", "/item": "/items/"}.items():
    if not exists(a): cases.append([a, w]); assert exists(w)
# the planner's own pages (Turbozo 2026-11-04): every tab address is a real page, and sloppy guesses route to it
for tab, path in PAGE_PATHS.items():
    assert exists(path), f"page address has no page: {path} ({tab})"
for addr, want in {"/worldmap": "/world-map/", "/worldmap/": "/world-map/", "/grind-tracker/kpqtimer": "/grind-tracker/kpq-timer/",
                   "/changelog": "/changelog/", "/journal": "/journal/"}.items():
    if not exists(addr): cases.append([addr, want]); assert exists(want), want
cj = out / "cases.json"; cj.write_text(json.dumps(cases))
r = subprocess.run(["node", str(R_ / "tests/router_harness.js"), str(out / "routes.json"), str(cj)], capture_output=True, text=True)
assert r.returncode == 0, r.stderr[-500:]
res = json.loads(r.stdout.strip().splitlines()[-1])
assert not res["nbad"], f"{res['nbad']} of {res['n']} addresses misrouted, e.g. {res['bad'][:5]}"
# JS "Copy link" paths match the Python ones, and the JS page table (the address bar's source) matches PAGE_PATHS
(out / "want.json").write_text(json.dumps({f"{e['kind']}:{e['id']}": e["canon"] for e in R.ents if e["kind"] in ("item", "mob", "skill", "quest")}))
(out / "pages.json").write_text(json.dumps(PAGE_PATHS))
cp = subprocess.run(["node", str(R_ / "tests/routes_js_check.js"), str(R_ / "dist/index.html"), str(out / "want.json"), str(out / "pages.json")], capture_output=True, text=True)
assert cp.returncode == 0, cp.stderr[-500:] + cp.stdout[-500:]
print("routes test passed:", res["n"], "aliases;", cp.stdout.strip())
