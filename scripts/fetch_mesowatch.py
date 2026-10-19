#!/usr/bin/env python3
"""Build data/sources/mesowatch_prices.json from meso.watch player-shop prices. Used with the meso.watch creator's
permission (Danny, 2026-10-09). Keeps only per-item summary stats, not the sales log.

The site's /data/ is behind a Cloudflare bot check, so nothing here pulls it. Danny's poller pushes a CSV to branch
data/mesowatch-sync; scripts/refresh_mesowatch.sh feeds it through this script. Both inputs are supported:
  python3 scripts/fetch_mesowatch.py <export.csv> [listings.csv]   # poller CSVs, or a dev export Danny drops in chat
  python3 scripts/fetch_mesowatch.py <market.json>    # the raw market file, if a copy is available
listings.csv = the poller's live Free Market listings (meso_watch_fresh_listings.csv): keeps the cheapest listing per
non-equipment item ("now"), since equips vary by roll and scrolls (Danny, 2026-10-19).
Then: python3 scripts/build_data.py prices && python3 scripts/build.py"""
import csv, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
if not sys.argv[1:]:
    sys.exit("usage: fetch_mesowatch.py <export.csv | market.json>  (meso.watch /data/ is Cloudflare-gated; ask the dev for a CSV export)")
src = pathlib.Path(sys.argv[1])
num = lambda x: float(x) if x not in (None, "") else None


def row(iid, price, p25, p75, sold, low, per_set, trend=None):
    # [median sale price, 25th pct, 75th pct, sales seen, flags: 1 = low data, 2 = priced per set, meso.watch trend or null]
    return iid, [round(price), round(p25 if p25 is not None else price), round(p75 if p75 is not None else price),
                 int(sold), (1 if low else 0) | (2 if per_set else 0), None if trend is None else round(trend, 3)]


out, generated = {}, None
if src.suffix.lower() == ".csv":
    for r in csv.DictReader(open(src, newline="")):
        generated = generated or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not int(r.get("sold") or 0): continue   # cash-shop items aren't in our item list
        iid, v = row(str(int(n)), num(r["price"]), num(r["p25"]), num(r["p75"]), r["sold"],
                     r.get("lowData") == "true", r.get("unitBasis") == "set", num(r.get("trend")))
        out[iid] = v
else:
    d = json.load(open(src)); generated = d.get("generated_at")
    for it in d["items"]:
        kind, _, n = it["id"].partition(":")
        if kind != "basil" or not it.get("sold"): continue
        iid, v = row(str(int(n)), it["price"], it.get("p25"), it.get("p75"), it["sold"],
                     it.get("lowData"), it.get("unitBasis") == "set", it.get("trend"))
        out[iid] = v

j = {"source": "https://meso.watch/", "read": (generated or "")[:10], "market": "Classic World", "items": out}
if sys.argv[2:]:
    # cheapest live listing per item: {itemId: [price each, qty, channel, map name, seller]}; equipment (1xxxxxx) and
    # per-set items (stars, arrows sold by the set) left out
    now, at = {}, None
    for r in csv.DictReader(open(sys.argv[2], newline="")):
        at = at or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not n.isdigit() or int(n) // 1000000 == 1 or int(n) // 10000 == 207 or (out.get(str(int(n))) or [0] * 5)[4] & 2: continue
        iid, p = str(int(n)), num(r["price"])
        if p is None or (iid in now and now[iid][0] <= p): continue
        now[iid] = [p if p < 1 else round(p), int(r.get("qty") or 1), int(r["channel"]) if (r.get("channel") or "").isdigit() else None,
                    r.get("map") or "", r.get("seller") or ""]
    j["now"], j["listed"] = now, (at or "")[:16].replace("T", " ")
dst = ROOT / "data" / "sources" / "mesowatch_prices.json"
dst.write_text(json.dumps(j, separators=(",", ":")))
print(f"{len(out)} items with sales ({sum(not v[4] & 1 for v in out.values())} solid) as of {generated}"
      + (f", {len(j['now'])} listed now as of {j['listed']}" if "now" in j else "") + f" -> {dst}")
