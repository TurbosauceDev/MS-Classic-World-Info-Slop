#!/usr/bin/env python3
"""Build data/sources/mesowatch_prices.json from meso.watch player-shop prices. Used with the meso.watch creator's
permission (Danny, 2026-10-09). Keeps only per-item summary stats, not the sales log.

The site's /data/ is behind a Cloudflare bot check, so nothing here pulls it. Danny's poller pushes a CSV to branch
data/mesowatch-sync; scripts/refresh_mesowatch.sh feeds it through this script. Both inputs are supported:
  python3 scripts/fetch_mesowatch.py <export.csv>     # poller CSV, or a dev export Danny drops in chat
  python3 scripts/fetch_mesowatch.py <market.json>    # the raw market file, if a copy is available
Then: python3 scripts/build_data.py prices && python3 scripts/build.py"""
import csv, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
if not sys.argv[1:]:
    sys.exit("usage: fetch_mesowatch.py <export.csv | market.json>  (meso.watch /data/ is Cloudflare-gated; ask the dev for a CSV export)")
src = pathlib.Path(sys.argv[1])
num = lambda x: float(x) if x not in (None, "") else None


def row(iid, price, p25, p75, sold, low, per_set):
    # [median sale price, 25th pct, 75th pct, sales seen, flags: 1 = low data, 2 = priced per set]
    return iid, [round(price), round(p25 if p25 is not None else price), round(p75 if p75 is not None else price),
                 int(sold), (1 if low else 0) | (2 if per_set else 0)]


out, generated = {}, None
if src.suffix.lower() == ".csv":
    for r in csv.DictReader(open(src, newline="")):
        generated = generated or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not int(r.get("sold") or 0): continue   # cash-shop items aren't in our item list
        iid, v = row(str(int(n)), num(r["price"]), num(r["p25"]), num(r["p75"]), r["sold"],
                     r.get("lowData") == "true", r.get("unitBasis") == "set")
        out[iid] = v
else:
    d = json.load(open(src)); generated = d.get("generated_at")
    for it in d["items"]:
        kind, _, n = it["id"].partition(":")
        if kind != "basil" or not it.get("sold"): continue
        iid, v = row(str(int(n)), it["price"], it.get("p25"), it.get("p75"), it["sold"],
                     it.get("lowData"), it.get("unitBasis") == "set")
        out[iid] = v

j = {"source": "https://meso.watch/", "read": (generated or "")[:10], "market": "Classic World", "items": out}
dst = ROOT / "data" / "sources" / "mesowatch_prices.json"
dst.write_text(json.dumps(j, separators=(",", ":")))
print(f"{len(out)} items with sales ({sum(not v[4] & 1 for v in out.values())} solid) as of {generated} -> {dst}")
