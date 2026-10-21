#!/usr/bin/env python3
"""One-off: with CLASSICMARKET_COOKIE (repo secret), print the SHAPE of classicmarket.kr's logged-in price endpoints
(keys, types, list lengths; never values) so Layer B can be built without seeing anyone's data. CI: classicmarket-probe.yml"""
import json, os, urllib.request, urllib.error
CK = os.environ.get("CLASSICMARKET_COOKIE", "").strip()
print("cookie set:", bool(CK), "| looks like name=value:", "=" in CK, "| name:", CK.split("=", 1)[0] if "=" in CK else "?")
def shape(v, d=0):
    if isinstance(v, dict): return "{" + ", ".join(f"{k}: {shape(x, d + 1)}" for k, x in list(v.items())[:40]) + "}" if d < 5 else "{...}"
    if isinstance(v, list): return f"[{len(v)} x {shape(v[0], d + 1) if v else '-'}]"
    return type(v).__name__
for p in ["/api/me", "/api/v1/owl/status", "/api/prices/recent?limit=5", "/api/prices/now?ids=2040801,4010001,2000002",
          "/api/prices?item=2040801&days=30", "/api/v1/owl/items/2040801", "/api/prices/list"]:
    req = urllib.request.Request("https://classicmarket.kr" + p, headers={"Cookie": CK, "Accept": "application/json", "User-Agent": "ms-classic-world-info site build (price summary)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r); print(p, r.status, shape(j))
            if p == "/api/me" and j.get("user"): print("  account flags:", {k: j["user"].get(k) for k in ("verified", "inGuild", "isAdmin")})
    except urllib.error.HTTPError as e:   # error code/message are the site's own text, safe to print
        b = json.loads(e.read() or b"{}") if e.code < 500 else {}; print(p, e.code, b.get("code"), str(b.get("error"))[:160])
    except Exception as e: print(p, "failed:", type(e).__name__)
# where classicmarket's own prices come from (source names, not values), and how many items it has
import collections
def get(p):
    req = urllib.request.Request("https://classicmarket.kr" + p, headers={"Cookie": CK, "Accept": "application/json", "User-Agent": "ms-classic-world-info site build (price summary)"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
try:
    j = get("/api/prices/recent?limit=100")
    print("recent total:", j.get("total"), "| sources:", collections.Counter(x.get("source") for x in j["items"]), "| sourceUrls:", collections.Counter(x.get("sourceUrl") for x in j["items"]))
    print("days:", collections.Counter(x.get("day") for x in j["items"]).most_common(3), "| estimated flags:", "n/a")
    g = get("/api/prices/now?ids=2040801,4010001,2000002,1082002")
    print("now (public item prices, to compare with meso.watch):", [(x["itemId"], x["source"], x["day"], x["median"], x["low"], x["high"], x["sold"], x["sample"], x["forSale"]) for x in g["prices"]])
except Exception as e: print("sources check failed:", type(e).__name__, e)
