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
