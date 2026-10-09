#!/usr/bin/env python3
"""Re-pull meso.watch player-shop prices (Classic World market file) into data/sources/mesowatch_prices.json.
Used with the meso.watch creator's permission (Danny, 2026-10-09). Keeps only per-item summary stats, not the sales log.
Run: python3 scripts/fetch_mesowatch.py [market.json]   then   python3 scripts/build_data.py prices && python3 scripts/build.py
With no argument it downloads https://meso.watch/data/market.json (~10 MB) to vendor/mesowatch_market.json first."""
import json, pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1]) if sys.argv[1:] else ROOT / "vendor" / "mesowatch_market.json"
if not sys.argv[1:]:
    src.parent.mkdir(exist_ok=True)
    subprocess.run(["curl", "-sS", "-m", "60", "-o", str(src), "https://meso.watch/data/market.json"], check=True)
d = json.load(open(src))
out = {}
for it in d["items"]:
    kind, _, num = it["id"].partition(":")
    if kind != "basil" or not it.get("sold"): continue   # cash-shop items aren't in our item list
    # [median sale price, 25th pct, 75th pct, sales seen, flags: 1 = low data, 2 = priced per set]
    out[str(int(num))] = [round(it["price"]), round(it["p25"] or it["price"]), round(it["p75"] or it["price"]), it["sold"],
                          (1 if it.get("lowData") else 0) | (2 if it.get("unitBasis") == "set" else 0)]
j = {"source": "https://meso.watch/", "read": d["generated_at"][:10], "market": d.get("market"), "items": out}
dst = ROOT / "data" / "sources" / "mesowatch_prices.json"
dst.write_text(json.dumps(j, separators=(",", ":")))
print(f"{len(out)} items with sales ({sum(not v[4] & 1 for v in out.values())} solid) as of {d['generated_at']} -> {dst}")
