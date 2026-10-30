#!/usr/bin/env python3
"""Cross-source price audit (docs/ai/overnight-price-audit-2026-10-26.md): how closely do the prices the site shows
match the sources we ingest? Reads data/data.json + data/sources/* only (no network), replicates the site's headline
price choice (pwPrice in src/js/11-cmarket.js) and reports coverage, cross-source divergence, headline-vs-live-ask
gaps, per-set handling, NPC-price reconciliation against mesoarbitrage's game-file column, meowdb-vs-shared-runs mob
meso, and every source's freshness. Run: python3 scripts/price_audit.py  (prints one JSON report)."""
import json, pathlib, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = json.load(open(ROOT / "data" / "data.json"))
J = lambda p: json.load(open(ROOT / "data" / "sources" / p))

def age_h(iso):
    if not iso: return None
    import datetime
    s = str(iso).replace(" ", "T")
    if len(s) == 10: s += "T00:00:00Z"
    elif not s.endswith("Z"): s += "Z"
    try: return (time.time() - datetime.datetime.fromisoformat(s[:19].replace("Z", "")).replace(tzinfo=datetime.timezone.utc).timestamp()) / 3600
    except ValueError: return None

PW  = (D.get("pw")  or {}).get("it", {})
CMP = (D.get("cmp") or {}).get("it", {})
CM  = (D.get("cm")  or {}).get("it", {})
MDB = (D.get("mdb") or {}).get("it", {})
MA  = (D.get("ma")  or {}).get("it", {})
MI  = (D.get("mi")  or {}).get("it", {})
ITEMS = D["items"]
PWNOW = (D.get("pw") or {}).get("now", {})

def pw_price(iid):
    """the site's headline price (src/js/11-cmarket.js pwPrice): (source, value, n, rough, per_set) or None"""
    p, c, m, k = PW.get(iid), CM.get(iid), MDB.get(iid), CMP.get(iid)
    if p and p[0] > 0: return ("meso.watch", p[0], p[3], bool(p[4] & 1), bool(p[4] & 2))
    if k and k[0] and k[0] > 0: return ("classicmarket.kr market", k[0], k[3], k[3] < 5, False)
    if m and m[0] and m[0] > 0: return ("meowdb", m[0], m[1] + m[2], m[2] < 5, False)
    if c and c[2]: return ("classicmarket.kr asks", c[1], c[2], True, False)
    if c and c[5]: return ("classicmarket.kr buy orders", c[4], c[5], True, False)
    return None

def solid_sources(iid):
    """every source's price for the item: {src: (value, data points)}"""
    out = {}
    p = PW.get(iid)
    if p and p[0] > 0: out["meso.watch"] = (p[0], p[3])
    k = CMP.get(iid)
    if k and k[0]: out["classicmarket"] = (k[0], k[3])
    m = MDB.get(iid)
    if m and m[0]: out["meowdb"] = (m[0], m[2])
    ma = MA.get(iid)
    if ma and ma[0]: out["mesoarbitrage"] = (ma[0], ma[1])
    mi = MI.get(iid)
    if mi and mi[0]: out["mesoindex"] = (mi[0], mi[3])
    return out

report = {}
headline = {i: h for i in ITEMS if (h := pw_price(i))}
report["coverage"] = {
    "items_total": len(ITEMS),
    "items_any_price": sum(1 for i in ITEMS if solid_sources(i)),
    "items_headline": len(headline),
    "items_no_source_price": sum(1 for i in ITEMS if not solid_sources(i)),
    "per_source": {"meso.watch": len(PW), "classicmarket.combined": len(CMP), "classicmarket.posts": len(CM),
                   "meowdb": len(MDB), "mesoarbitrage": len(MA), "mesoindex": len(MI),
                   "live_listings_pw": len(PWNOW)},
    "headline_from": {},
}
for _, h in headline.items(): report["coverage"]["headline_from"][h[0]] = report["coverage"]["headline_from"].get(h[0], 0) + 1

divs, rough_better, divergent = [], [], []
for iid, h in headline.items():
    srcs = solid_sources(iid)
    for k, (v, n) in srcs.items():
        if k == h[0] or not v: continue
        r = max(h[1], v) / max(1, min(h[1], v))
        divs.append((iid, h[0], k, h[1], v, r))
        if h[3] and n >= 20 and r > 1.3: rough_better.append((iid, ITEMS[iid]["n"], h[0], h[1], k, v, n))
    vals = [(k, v) for k, (v, n) in srcs.items() if v and n >= 5]
    if len(vals) >= 2 and max(v for _, v in vals) / min(v for _, v in vals) > 2:
        divergent.append((iid, ITEMS[iid]["n"], sorted(vals, key=lambda x: -x[1])))
divs.sort(key=lambda x: -x[5])
report["divergence"] = {
    "pairs_compared": len(divs), "pairs_over_1.5x": sum(1 for d in divs if d[5] > 1.5), "pairs_over_2x": sum(1 for d in divs if d[5] > 2),
    "worst_25": [(d[0], ITEMS[d[0]]["n"], d[1], d[2], d[3], d[4], round(d[5], 2)) for d in divs[:25]],
    "rough_headline_but_better_source": len(rough_better), "rough_examples": rough_better[:10],
    "divergent_items_2x_n5": len(divergent), "divergent_examples": divergent[:15]}

stale_live = sorted(((iid, ITEMS[iid]["n"], h[0], h[1], n[0], round(h[1] / n[0], 1)) for iid, n in PWNOW.items()
                     if (h := headline.get(iid)) and n and n[0] > 0 and h[1] / n[0] >= 3), key=lambda x: -x[5])
report["headline_vs_cheapest_live_ask_ge3x"] = {"count": len(stale_live), "examples": stale_live[:20]}

report["per_set"] = {"count": sum(1 for p in PW.values() if p[4] & 2), "ids": [i for i, p in PW.items() if p[4] & 2]}

ma_raw = J("mesoarbitrage_prices.json")
npc_bad, npc_ok = [], 0
for iid, row in ma_raw["items"].items():
    try: npc = float(row.get("npc")) if row.get("npc") is not None else None
    except (TypeError, ValueError): npc = None
    if iid in ITEMS and npc is not None:
        ours = float(ITEMS[iid].get("p") or 0)
        if abs(npc - ours) <= max(1, 0.02 * max(npc, ours)): npc_ok += 1
        else: npc_bad.append((iid, ITEMS[iid]["n"], ours, npc))
report["npc_crosscheck_mesoarbitrage"] = {"checked": npc_ok + len(npc_bad), "match": npc_ok, "mismatches": npc_bad}

sh, est = (D.get("shared") or {}).get("mobs", {}), D.get("meso", {})
report["mob_meso_meowdb_vs_shared"] = [
    (ob, D["mobs"].get(ob, ["?"])[0] if ob in D["mobs"] else ob, est[ob][0] if ob in est else None,
     round(v.get("mesos", 0) / v["kills"], 1) if v.get("kills") else None, v.get("kills")) for ob, v in sh.items()]

top = {k: (D.get(k) or {}).get("read") for k in ("pw", "cm", "cmp", "mdb", "ma", "mi")}
report["freshness_hours"] = {k: (round(a, 1) if (a := age_h(v)) is not None else None) for k, v in top.items()}
report["freshness_hours"]["pw.listed"] = (round(a, 1) if (a := age_h((D.get("pw") or {}).get("listed"))) is not None else None)

print(json.dumps(report, indent=1, default=str))
