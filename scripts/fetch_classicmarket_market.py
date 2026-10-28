#!/usr/bin/env python3
"""classicmarket.kr's own combined item prices ("합산") -> data/sources/classicmarket_market.json + D.cmp ("Layer B").
Needs Danny's logged-in, character-verified session: repo secret CLASSICMARKET_COOKIE = "cmm_session=...". The site's owner
OK'd this on 2026-10-21 as long as classicmarket.kr is credited (their API says so too). Minerva's Owl shop data is NOT
pulled (their API blocks it for scripts); /api/prices/list's anti-scrape token is never worked around.
Run: CLASSICMARKET_COOKIE=... python3 scripts/fetch_classicmarket_market.py && python3 scripts/build.py   (no vendor/ needed;
build_data.py's "cmarket" step does the same on a full rebuild). No cookie, expired cookie or any failure: keeps the old
file, prints a GitHub warning, exits 0.

D.cmp = {read: "YYYY-MM-DD HH:MM" UTC, it: {itemId: [median, low, high, sold, seen, forSaleNow, day]}}"""
import json, os, pathlib, sys, time, urllib.error, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://classicmarket.kr/api/prices/recent?limit=100&offset=%d"
DST = ROOT / "data" / "sources" / "classicmarket_market.json"

def fetch(cookie):
    out, off = [], 0
    while True:
        req = urllib.request.Request(URL % off, headers={"Cookie": cookie, "Accept": "application/json", "User-Agent": "ms-classic-world-info site build (price summary)"})
        with urllib.request.urlopen(req, timeout=30) as r: d = json.load(r)
        out += d["items"]; off += len(d["items"])
        if not d["items"] or off >= d["total"] or off >= 5000: return out
        time.sleep(1)

def rows(items):
    """{itemId: [median, low, high, sold, seen, forSaleNow, day]}: items with a median only, newest day wins."""
    it = {}
    for x in items:
        iid, m = str(x.get("itemId") or ""), x.get("median")
        if not iid or not m or m <= 0: continue
        r = [m, x.get("low"), x.get("high"), x.get("sold") or 0, x.get("sample") or 0, x.get("forSale") or 0, x.get("day")]
        if iid not in it or (r[6] or "") > (it[iid][6] or ""): it[iid] = r
    return dict(sorted(it.items(), key=lambda kv: int(kv[0])))

def step(D):
    """build_data.py "cmarket" step (with fetch_classicmarket_listings.step): D.cmp, items the page knows only."""
    if not DST.exists(): return
    j = json.loads(DST.read_text())
    from price_blacklist import is_bl
    D["cmp"] = {"read": j["read"], "it": {k: v for k, v in j["it"].items() if k in D["items"] and not is_bl(k)}}

if __name__ == "__main__":
    ck = os.environ.get("CLASSICMARKET_COOKIE", "").strip()
    if not ck: print("::warning::CLASSICMARKET_COOKIE not set: classicmarket.kr combined prices not refreshed"); sys.exit(0)
    try: items = fetch(ck)
    except urllib.error.HTTPError as e:
        print(f"::warning::classicmarket.kr prices {e.code} (cookie expired or verification lost? re-copy cmm_session into CLASSICMARKET_COOKIE)"); sys.exit(0)
    except Exception as e: print("::warning::classicmarket.kr prices fetch failed, keeping the old file:", type(e).__name__); sys.exit(0)
    j = {"source": "https://classicmarket.kr/ (combined prices, owner's OK 2026-10-21)", "read": time.strftime("%Y-%m-%d %H:%M", time.gmtime()), "it": rows(items)}
    if not j["it"]: print("::warning::classicmarket.kr returned no prices, keeping the old file"); sys.exit(0)
    try:   # same prices: keep the old read time so the job doesn't commit just a timestamp
        old = json.loads(DST.read_text())
        if old.get("it") == j["it"]: j["read"] = old["read"]
    except (OSError, ValueError): pass
    DST.write_text(json.dumps(j, separators=(",", ":")))
    print(f"{len(items)} prices, {len(j['it'])} items -> {DST}")
    D = json.load(open(ROOT / "data" / "data.json"))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
    print(f"data/data.json: cmp prices for {len(D.get('cmp', {}).get('it', {}))} items")
