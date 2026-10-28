#!/usr/bin/env python3
"""Pull the two shop-scan price sites into data/sources/shopscans.json and D.mw / D.ma.
Both read Free Market shops off players' shared game windows (in the browser) and publish what they saw; neither needs a
login, both are public JSON. robots.txt: maplestory.watch only has content signals (AI training), mesoarbitrage.com allows
all. Run: python3 scripts/fetch_shopscans.py && python3 scripts/build.py  (no vendor/ needed; build_data.py's "shopscans"
step does the same on a full rebuild). A failed fetch keeps the old file and exits 0 so CI never breaks.

mesoarbitrage.com /data/prices.json (real item ids, 2 h hold before data goes public). Its `npc` column is the game-file
NPC sell price (what an NPC pays you; 733 of 734 non-null match our items[id].p, 2026-10-21), so it's not stored.
  D.ma = {read: "YYYY-MM-DD HH:MM" UTC (its `generated`), it: {itemId: [soldMedian, soldN, askMin, listingsSeen, sold72Median, sold72N, lastSeenUnixMin]}}
maplestory.watch /api/items (names only, 14-day window) and /api/item?name= (per-listing: seller, shop title, FM room,
channel). Names map to ids through our items, ties (male/female versions, quest copies) broken by mesoarbitrage's id
for the same name, else dropped (name_ids()).
  D.mw = {read, it: {itemId: [typical, unitsSold14d, lowest, listedNow, dayAgo, lastSeenUnixMin]},
          ls: {itemId: [[priceEach, bundle, channel|null, fmRoom|null, seller, shopTitle, seenUnixMin], ...]}}
ls keeps open, not-sold-out listings seen in the last day, cheapest LS_MAX per item: the Items page where-to-buy list needs
seller + room to find the shop. Nothing else about sellers is stored. Prices are per item (bundles divided out)."""
import json, os, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_fetch import BrowserSession

ROOT = pathlib.Path(__file__).resolve().parent.parent
DST = ROOT / "data" / "sources" / "shopscans.json"
MA = "https://mesoarbitrage.com/data/prices.json"
MW = "https://maplestory.watch/api/items"
MW_ITEM = "https://maplestory.watch/api/item?name=%s"
UA = {"User-Agent": "ms-classic-world-info site build (price summary)", "Accept": "application/json"}
LS_MAX, DAY = 8, 86400
BROWSER = None

def get(url):
    """Plain urllib first; on a 403 challenge wall fall back to a real headless Chromium
    (browser_fetch.py; allowed since Danny lifted the 10-20 never-bypass rule, decisions.md 2026-10-28)."""
    if not os.environ.get("FORCE_BROWSER"):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 403: raise
    global BROWSER
    if BROWSER is None: BROWSER = BrowserSession()
    return BROWSER.get(url)

def umin(t):
    """unix seconds or ms -> unix minutes"""
    return None if not t else int(t / 60000 if t > 1e11 else t / 60)

def ma_rows(j):
    """mesoarbitrage cols -> {id: [sold, soldN, ask, n, sold72, n72, lastMin]} (rows with neither a sale nor an ask dropped)"""
    c = {k: i for i, k in enumerate(j["cols"])}
    out = {}
    for r in j["items"]:
        g = lambda k: r[c[k]]
        rnd = lambda v: None if v is None else round(v)
        if not (g("sold") or g("ask")): continue
        out[str(g("id"))] = [rnd(g("sold")), g("soldN") or 0, rnd(g("ask")), g("n") or 0, rnd(g("sold72")), g("n72") or 0, umin(g("last"))]
    return out

def name_ids(items, ma_names):
    """lower-case name -> one item id. Unique name in our items wins; a tie goes to mesoarbitrage's id for that name if it's
    one of the tied ids; otherwise the name is dropped (Blue Moon is both an earring and a top)."""
    by = {}
    for k, v in items.items(): by.setdefault(v["n"].lower(), []).append(k)
    out = {}
    for n, ids in by.items():
        if len(ids) == 1: out[n] = ids[0]
        elif ma_names.get(n) in ids: out[n] = ma_names[n]
    return out

ROOM = re.compile(r"<(\d+)>")
def mw_listings(data, now):
    """per-listing reply -> cheapest open, not-sold-out listings seen in the last day, deduped (shops repeat a stack)"""
    seen, out = set(), []
    for l in data.get("listings", []):
        if l.get("soldOut") or l.get("open") is False or not l.get("unit") or now - (l.get("seen") or 0) > DAY: continue
        m = ROOM.search(l.get("map") or "")
        row = [round(l["unit"]), l.get("bundle") or 1, l.get("channel"), int(m.group(1)) if m else None,
               l.get("seller") or "", (l.get("title") or "")[:60], umin(l["seen"])]
        key = tuple(row[:6])
        if key in seen: continue
        seen.add(key); out.append(row)
    out.sort(key=lambda r: (r[0], -r[6]))
    return out[:LS_MAX]

def mw_rows(items, nid):
    """summary -> {id: [typical, units, lowest, listed, dayAgo, seenMin]}; names we can't map are dropped"""
    out = {}
    for r in items:
        i = nid.get(r["name"].lower())
        if i and (r.get("typical") or r.get("lowest")):
            rnd = lambda v: None if v is None else round(v)
            out[i] = [rnd(r.get("typical")), r.get("units") or 0, rnd(r.get("lowest")), r.get("listed") or 0, rnd(r.get("dayAgo")), umin(r.get("seen"))]
    return out

def step(D):
    """build_data.py "shopscans" step: D.ma / D.mw from the saved file, items the page knows only."""
    if not DST.exists(): return
    j = json.loads(DST.read_text())
    keep = lambda d: {k: v for k, v in d.items() if k in D["items"]}
    if j.get("ma"): D["ma"] = {"read": j["ma"]["read"], "it": keep(j["ma"]["it"])}
    if j.get("mw"): D["mw"] = {"read": j["mw"]["read"], "it": keep(j["mw"]["it"]), "ls": keep(j["mw"]["ls"])}

def fetch(old):
    now = time.time()
    ts = lambda t: time.strftime("%Y-%m-%d %H:%M", time.gmtime(t))
    out = {"source": [MA, MW]}
    D = json.load(open(ROOT / "data" / "data.json"))
    try:
        j = get(MA)
        out["ma"] = {"read": ts(j["generated"] / 1000), "it": ma_rows(j)}
        ma_names = {r[1].lower(): str(r[0]) for r in j["items"]}
    except Exception as e:
        print(f"::warning::mesoarbitrage fetch failed, keeping the old rows: {type(e).__name__} {e}"); out["ma"] = old.get("ma"); ma_names = {}
    try:
        j = get(MW)
        nid = name_ids(D["items"], ma_names)
        it = mw_rows(j["items"], nid)
        name = {nid[r["name"].lower()]: r["name"] for r in j["items"] if r["name"].lower() in nid}
        # per-item listings only where the summary moved since last run (or listings may have aged out), ~0.3 s apart
        ols, oit, ls, calls = (old.get("mw") or {}).get("ls", {}), (old.get("mw") or {}).get("it", {}), {}, 0
        for i, r in it.items():
            if not r[3]: continue
            if oit.get(i) == r and i in ols and all(now / 60 - x[6] < DAY / 60 for x in ols[i]): ls[i] = ols[i]; continue
            try: rows = mw_listings(get(MW_ITEM % urllib.parse.quote(name[i])), now)
            except Exception as e: print("listing fetch failed for", name[i], e); rows = ols.get(i, [])
            calls += 1; time.sleep(0.3)
            if rows: ls[i] = rows
        out["mw"] = {"read": ts(j.get("at") or now), "it": it, "ls": ls}
        print(f"maplestory.watch: {len(j['items'])} items, {len(it)} mapped, {calls} listing calls, {len(ls)} with listings")
    except Exception as e:
        print(f"::warning::maplestory.watch fetch failed, keeping the old rows: {type(e).__name__} {e}"); out["mw"] = old.get("mw")
    return out

if __name__ == "__main__":
    try: old = json.loads(DST.read_text())
    except (OSError, ValueError): old = {}
    j = fetch(old)
    if not (j.get("ma") or j.get("mw")): print("both fetches failed"); sys.exit(0)
    DST.write_text(json.dumps(j, separators=(",", ":")))
    print(f"mesoarbitrage: {len((j.get('ma') or {}).get('it', {}))} items -> {DST}")
    D = json.load(open(ROOT / "data" / "data.json"))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
