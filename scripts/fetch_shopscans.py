#!/usr/bin/env python3
"""Pull mesoarbitrage.com shop-scan prices into data/sources/shopscans.json and D.ma.
It reads Free Market shops off players' shared game windows (in the browser) and publishes what it saw; no login, public
JSON, robots.txt allows all. Run: python3 scripts/fetch_shopscans.py && python3 scripts/build.py  (no vendor/ needed; build_data.py's "shopscans"
step does the same on a full rebuild). A failed fetch keeps the old file and exits 0 so CI never breaks.

mesoarbitrage.com /data/prices.json (real item ids, 2 h hold before data goes public). Its `npc` column is the game-file
NPC sell price (what an NPC pays you; 733 of 734 non-null match our items[id].p, 2026-10-21), so it's not stored.
  D.ma = {read: "YYYY-MM-DD HH:MM" UTC (its `generated`), it: {itemId: [soldMedian, soldN, askMin, listingsSeen, sold72Median, sold72N, lastSeenUnixMin]}}"""
import json, os, pathlib, sys, time, urllib.error, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_fetch import BrowserSession

ROOT = pathlib.Path(__file__).resolve().parent.parent
DST = ROOT / "data" / "sources" / "shopscans.json"
MA = "https://mesoarbitrage.com/data/prices.json"
UA = {"User-Agent": "ms-classic-world-info site build (price summary)", "Accept": "application/json"}
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

def step(D):
    """build_data.py "shopscans" step: D.ma from the saved file, items the page knows only."""
    if not DST.exists(): return
    j = json.loads(DST.read_text())
    from price_blacklist import is_bl
    keep = lambda d: {k: v for k, v in d.items() if k in D["items"] and not is_bl(k)}
    if j.get("ma"): D["ma"] = {"read": j["ma"]["read"], "it": keep(j["ma"]["it"])}

def fetch(old):
    now = time.time()
    ts = lambda t: time.strftime("%Y-%m-%d %H:%M", time.gmtime(t))
    out = {"source": [MA]}
    try:
        j = get(MA)
        out["ma"] = {"read": ts(j["generated"] / 1000), "it": ma_rows(j)}
    except Exception as e:
        print(f"::warning::mesoarbitrage fetch failed, keeping the old rows: {type(e).__name__} {e}"); out["ma"] = old.get("ma")
    return out

if __name__ == "__main__":
    try: old = json.loads(DST.read_text())
    except (OSError, ValueError): old = {}
    j = fetch(old)
    if not j.get("ma"): print("fetch failed"); sys.exit(0)
    DST.write_text(json.dumps(j, separators=(",", ":")))
    print(f"mesoarbitrage: {len((j.get('ma') or {}).get('it', {}))} items -> {DST}")
    D = json.load(open(ROOT / "data" / "data.json"))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
