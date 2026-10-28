#!/usr/bin/env python3
"""Pull classicmarket.kr's public trade posts (sell = ask, buy = bid) into data/sources/classicmarket_prices.json and D.cm.
Public JSON API (/api/listings, 30 per page, no login); posts expire after 3 days. robots.txt only blocks AI-training
crawlers (GPTBot, ChatGPT-User, Google-Extended); no terms page. We keep prices only: no author, Discord id or note.
Run: python3 scripts/fetch_classicmarket_listings.py && python3 scripts/build.py   (no vendor/ needed; build_data.py's
"cmarket" step does the same on a full rebuild). A failed fetch keeps the old file and exits 0 so CI never breaks.

D.cm = {read: "YYYY-MM-DD HH:MM" UTC, posts: open posts seen, it: {itemId: [askMin, askMedian, askN, bidMax, bidMedian, bidN]}}
Only stackables (use/etc) and clean equips (0 upgrades, base stats "exact" per classicmarket's own check) count, so a
scrolled +5 or an above-average roll never moves the base price. Placeholder prices are dropped (see clean())."""
import json, pathlib, statistics, sys, time, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://classicmarket.kr/api/listings?page=%d"
DST = ROOT / "data" / "sources" / "classicmarket_prices.json"
EQUIP = {"Weapon", "Cap", "Coat", "Longcoat", "Pants", "Shoes", "Glove", "Cape", "Shield", "Accessory", "Ring"}
STACK = {"Consume", "Etc"}   # Cash and anything new are skipped

def fetch():
    """All open posts, fields we use only (author/note never leave this function)."""
    out, page = [], 1
    while True:
        req = urllib.request.Request(URL % page, headers={"User-Agent": "ms-classic-world-info site build (price summary)", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r: d = json.load(r)
        out += [{k: x.get(k) for k in ("kind", "itemId", "category", "price", "quantity", "upgrades", "optionLevel", "status")} for x in d["items"]]
        if not d["items"] or page * d["pageSize"] >= d["total"] or page >= 60: return out
        page += 1; time.sleep(1)   # be polite: ~20 pages

def placeholder(p):
    """'Whisper me' prices seen on the live site: 0, all-same digits (9999, 99999, 77777, 9999999), 123456..."""
    s = str(p)
    return p <= 0 or (len(s) >= 4 and len(set(s)) == 1) or s in ("123456", "1234567", "12345678", "123456789")

def clean(x):
    """Bucket a post: 'stack', 'equip' (clean exact) or None (scrolled, upper/lower/unknown roll, cash, placeholder)."""
    p, cat = x.get("price") or 0, x.get("category")
    if placeholder(p): return None
    if cat in STACK: return "stack"
    # equips: unscrolled and an exact roll; a buy post with no roll set means "any clean one"
    roll = x.get("optionLevel")
    if cat in EQUIP and not x.get("upgrades") and (roll == "exact" or (roll is None and x.get("kind") == "buy")) and p >= 1000: return "equip"
    return None

def trim(ps):
    """Drop prices 10x off the median (troll bids, fat-finger asks) once there are 3+ posts."""
    if len(ps) < 3: return ps
    m = statistics.median(ps)
    return [p for p in ps if m / 10 <= p <= m * 10]

def aggregate(posts, known=None):
    """{itemId: [askMin, askMedian, askN, bidMax, bidMedian, bidN]}; known = item ids the page has (others dropped)."""
    side = {}
    for x in posts:
        iid = str(x.get("itemId") or "")
        if not iid or (known is not None and iid not in known) or x.get("status") not in ("open", "reserved") or not clean(x): continue
        side.setdefault(iid, ([], []))[0 if x["kind"] == "sell" else 1].append(x["price"])
    it = {}
    for iid, (a, b) in side.items():
        a, b = trim(sorted(a)), trim(sorted(b))
        if a and b: b = [p for p in b if p <= 2 * statistics.median(a)]   # buy order over 2x what sellers ask: typo or troll
        r = [min(a), round(statistics.median(a)), len(a)] if a else [None, None, 0]
        r += [max(b), round(statistics.median(b)), len(b)] if b else [None, None, 0]
        if r[2] or r[5]: it[iid] = r
    return dict(sorted(it.items(), key=lambda kv: int(kv[0])))

def step(D):
    """build_data.py "cmarket" step: D.cm from the saved file, items the page knows only."""
    if not DST.exists(): return
    j = json.loads(DST.read_text())
    from price_blacklist import is_bl
    D["cm"] = {"read": j["read"], "posts": j["posts"], "it": {k: v for k, v in j["it"].items() if k in D["items"] and not is_bl(k)}}

if __name__ == "__main__":
    try: posts = fetch()
    except Exception as e:
        print(f"::warning::classicmarket posts fetch failed, keeping the old file: {type(e).__name__} {e}"); sys.exit(0)
    j = {"source": "https://classicmarket.kr/", "read": time.strftime("%Y-%m-%d %H:%M", time.gmtime()), "posts": len(posts), "it": aggregate(posts)}
    try:   # same prices: keep the old read time so the job doesn't commit just a timestamp
        old = json.loads(DST.read_text())
        if old.get("it") == j["it"]: j["read"], j["posts"] = old["read"], old["posts"]
    except (OSError, ValueError): pass
    DST.write_text(json.dumps(j, separators=(",", ":")))
    print(f"{len(posts)} posts, {len(j['it'])} items priced -> {DST}")
    D = json.load(open(ROOT / "data" / "data.json"))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
    print(f"data/data.json: cm prices for {len(D.get('cm', {}).get('it', {}))} items")
