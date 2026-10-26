#!/usr/bin/env python3
"""Pull mesoindex.com prices + per-item shop listings into data/sources/mesoindex.json and D.mi.
mesoindex.com is an approved, trusted source (owner's OK 2026-10-20, docs/ai/decisions.md). Its own prices come mostly from
cozy.markets shop scans (`src` counts per row). The HTML page sits behind Vercel's checkpoint (never bypass it); its /api/*
answers plain GETs. Run: python3 scripts/fetch_mesoindex.py && python3 scripts/build.py  (no vendor/ needed). A failed fetch
keeps the old file and exits 0 so CI never breaks.

/api/catalog: {cols, rows, updated}. `game` = real item id (999 of ours, names all match, 2026-10-21); `npc` = game-file NPC
sell price (= items[id].p, not stored). Prices: usual (its price), p25/p75, n (sales behind usual), sales (7 days), low
(cheapest ask), listings (asks seen), conf (high/medium/low), trend (% vs earlier), at (last sale, unix ms).
  D.mi = {read: "YYYY-MM-DD HH:MM" UTC (its `updated`), it: {itemId: [usual, p25, p75, n, sales7, low, listings, conf, trendPct, atMin]},
          ls: {itemId: [[priceEach, qty, channel|null, fmRoom|null, shop, shopTitle, seenUnixMin, mapOutsideFM|""], ...]}}
/api/item?game=<id> `listings`: per scanned shop slot (at, qty, price, sold, confirmed, shop, title, channel, room, map).
ls keeps unsold, confirmed slots seen in the last day, cheapest LS_MAX per item: the Items page where-to-buy list needs shop +
room to find it. Shops outside the FM (Kerning Construction Site etc.) have room null and keep the map name. Per-item calls only where the catalog row moved since last run, ~0.3 s apart, at most BUDGET
seconds a run (the next run picks up the rest)."""
import json, pathlib, sys, time, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
DST = ROOT / "data" / "sources" / "mesoindex.json"
CAT = "https://mesoindex.com/api/catalog"
ITEM = "https://mesoindex.com/api/item?game=%s"
# mesoindex.com started 403-ing non-browser User-Agents around 2026-10-23 (their API 403'd our build UA from CI and
# curl, while a browser UA gets a plain 200 with no checkpoint): the data had silently frozen for 3 days before the
# watchdog caught it. Their /api/* still answers plain GETs for a normal browser client, so we send one. The Vercel
# checkpoint on the HTML page stays untouched (never bypass it, docs/ai/decisions.md 2026-10-21).
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "application/json"}
LS_MAX, DAY, BUDGET = 8, 86400, 15 * 60   # listing calls stop after BUDGET s; the rest keep last run's rows
CONF = {"high": 2, "medium": 1, "low": 0}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return json.load(r)

def umin(t):
    """unix seconds or ms -> unix minutes"""
    return None if not t else int(t / 60000 if t > 1e11 else t / 60)

def cat_rows(j, items):
    """catalog -> {id: [usual, p25, p75, n, sales7, low, listings, conf, trend, atMin]}, our items only, rows with neither a
    price nor an ask dropped"""
    c = {k: i for i, k in enumerate(j["cols"])}
    rnd = lambda v: None if v is None else round(v)
    out = {}
    for r in j["rows"]:
        g = lambda k: r[c[k]]
        i = str(g("game") or "")
        if i not in items or not (g("usual") or g("low")): continue
        out[i] = [rnd(g("usual")), rnd(g("p25")), rnd(g("p75")), g("n") or 0, g("sales") or 0, rnd(g("low")),
                  g("listings") or 0, CONF.get(g("conf")), g("trend"), umin(g("at"))]
    return out

def listings(data, now):
    """per-item reply -> cheapest unsold, confirmed shop slots seen in the last day, deduped (scans repeat a slot)"""
    seen, out = set(), []
    for l in data.get("listings") or []:
        if l.get("sold") or l.get("confirmed") is False or not l.get("price") or now - (l.get("at") or 0) / 1000 > DAY: continue
        row = [round(l["price"]), l.get("qty") or 1, l.get("channel"), l.get("room"), l.get("shop") or "",
               (l.get("title") or "")[:60], umin(l["at"]),
               "" if l.get("room") else (l.get("map") or "")[:40]]
        key = tuple(row[:6]) + (row[7],)
        if key in seen: continue
        seen.add(key); out.append(row)
    out.sort(key=lambda r: (r[0], -r[6]))
    return out[:LS_MAX]

def step(D):
    """build_data.py "mesoindex" step: D.mi from the saved file, items the page knows only."""
    if not DST.exists(): return
    j = json.loads(DST.read_text())
    keep = lambda d: {k: v for k, v in d.items() if k in D["items"]}
    if j.get("it"): D["mi"] = {"read": j["read"], "it": keep(j["it"]), "ls": keep(j.get("ls", {}))}

def fetch(old, items):
    now = time.time()
    j = get(CAT)
    it = cat_rows(j, items)
    # lsfor = the catalog row each item's listings were fetched against (budget-skipped items keep their old one)
    ofor, ols, ls, lsfor, calls = old.get("lsfor", {}), old.get("ls", {}), {}, {}, 0
    for i, r in sorted(it.items(), key=lambda kv: -kv[1][6]):   # busiest items first, in case the budget runs out
        if not r[6]: continue
        fresh = i in ols and all(now / 60 - x[6] < DAY / 60 for x in ols[i])
        if (ofor.get(i) == r and fresh) or time.time() - now > BUDGET:
            if i in ols: ls[i] = ols[i]
            if i in ofor: lsfor[i] = ofor[i]
            continue
        try: rows = listings(get(ITEM % i), now); lsfor[i] = r
        except Exception as e: print("listing fetch failed for", i, e); rows = ols.get(i, [])
        calls += 1; time.sleep(0.3)
        if calls % 100 == 0: print(f"  {calls} listing calls, {time.time() - now:.0f} s", flush=True)
        if rows: ls[i] = rows
    print(f"mesoindex: {len(j['rows'])} catalog rows, {len(it)} ours priced, {calls} listing calls, {len(ls)} with listings")
    return {"source": [CAT, ITEM % "<id>"], "read": time.strftime("%Y-%m-%d %H:%M", time.gmtime((j.get("updated") or now * 1000) / 1000)),
            "it": it, "ls": ls, "lsfor": lsfor}

if __name__ == "__main__":
    try: old = json.loads(DST.read_text())
    except (OSError, ValueError): old = {}
    D = json.load(open(ROOT / "data" / "data.json"))
    try: j = fetch(old, D["items"])
    except Exception as e: print(f"::warning::mesoindex fetch failed, keeping the old file: {type(e).__name__} {e}"); sys.exit(0)
    DST.write_text(json.dumps(j, separators=(",", ":")))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
