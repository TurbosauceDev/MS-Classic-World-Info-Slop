"""meowdb source files after a refresh (scripts/fetch_meowdb_*.js): shape the build relies on, and hand-copied meowdb prices
in the site code still match the shop list. Run: python3 tests/meowdb_test.py (CI: tests.yml)"""
import json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "data" / "sources"
fails = 0
def check(ok, msg):
    global fails
    print(("ok  " if ok else "FAILED: ") + msg); fails += not ok

shops = json.load(open(src / "meowdb_shops.json"))["shops"]
check(len(shops) >= 25 and all(s["npc"] and "\t" not in s["npc"] and s["prices"].endswith(" prices") and s.get("mapId") for s in shops),
      f"shops: {len(shops)} shops, each with an NPC, a price tag and a map id")
check(all(len(r) == 3 and isinstance(r[1], int) and r[1] > 0 for s in shops for r in s["items"]), "shops: every row is [name, price > 0, citizen grade]")
check(not any(s["mapId"].startswith("2") and len(s["mapId"]) >= 9 for s in shops), "shops: no Ossyria shops (not in the launch)")

# 2026-10-21: Citizenship tab shop prices were hand-copied from meowdb's COT2 page; 16 had changed at launch (Flint/Ben scrolls,
# Resident's Chairs 10,000 -> 500,000). Every civic shop row must match the shop list when meowdb has launch prices for it.
js = (ROOT / "src" / "js" / "40-citizenship.js").read_text()
civic = re.search(r"const SHOPS = (\{.*?\n\});", js, re.S).group(1)
rows = re.findall(r'\["[^"]+","([^"]+)",\[(.*?)\]\]', civic)
price = {(s["npc"], r[0]): r[1] for s in shops if s["prices"] == "Launch prices" for r in s["items"]}
bad, n = [], 0
for npc, items in rows:
    for nm, pr in re.findall(r'\["([^"]+)",(\d+),', items):
        if (npc, nm) in price:
            n += 1
            if price[npc, nm] != int(pr): bad.append(f"{npc} {nm}: {pr} vs {price[npc, nm]}")
check(n >= 30 and not bad, f"citizenship: {n} civic shop prices match meowdb launch prices {bad[:5]}")

drops = json.load(open(src / "meowdb_drops.json"))["mobs"]
check(len(drops) >= 60 and all(len(r) == 4 for v in drops.values() for r in v), f"drops: {len(drops)} monsters, rows [icon, name, up, down]")
mesos = json.load(open(src / "meowdb_mesos.json"))["monsters"]
check(len(mesos) >= 19 and all({"medianMin", "medianMax", "medianDropChancePct", "trustedCount"} <= set(v["summary"]) for v in mesos.values()), f"mesos: {len(mesos)} monsters with a summary")
print(f"\n{fails} failed" if fails else "\nall good"); raise SystemExit(1 if fails else 0)
