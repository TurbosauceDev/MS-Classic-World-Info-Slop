#!/usr/bin/env python3
"""Build data/sources/mesowatch_prices.json from meso.watch player-shop prices. Used with the meso.watch creator's
permission (Danny, 2026-10-09). Keeps only per-item summary stats, not the sales log.

The site's /data/ is behind a Cloudflare bot check, so nothing here pulls it. The CI poller in
.github/workflows/mesowatch-poll.yml fetches meso.watch via agent-browser (headless Chrome), extracts
the payloads to localStorage, reads them back to disk, then runs this script on them. Both inputs
are supported:
  python3 scripts/fetch_mesowatch.py <export.csv> [listings.csv]   # a dev export Danny drops in chat
  python3 scripts/fetch_mesowatch.py <market.json> [listings.csv]  # the raw market file + fresh listings CSV
listings.csv = the live Free Market listings (meso_watch_fresh_listings_csv format): keeps the cheapest listing per
non-equipment item ("now") plus ALL listings per item ("asks"), since equips vary by rolls and scrolls (Danny, 2026-10-19).
The "asks" field gives the frontend a "Where to buy" list with every shop that has the item, sorted by price.
"seen" (added 2026-10-22) is a parallel array to "asks" giving the first time we observed each (price, seller) pair,
carried forward from the previous mesowatch_prices.json so a listing that's been up for 3 days is identifiable as stale.
Then: python3 scripts/build_data.py prices && python3 scripts/build.py"""
import csv, json, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
if not sys.argv[1:]:
    sys.exit("usage: fetch_mesowatch.py <export.csv | market.json>  (meso.watch /data/ is Cloudflare-gated; ask the dev for a CSV export)")
src = pathlib.Path(sys.argv[1])
num = lambda x: float(x) if x not in (None, "") else None


def row(iid, price, p25, p75, sold, low, per_set, trend=None, sell=None, askMedian=None):
    # [median sale price, 25th pct, 75th pct, sales seen, flags: 1 = low data, 2 = priced per set, meso.watch trend or null,
    #  sell-through or null, askMedian or null (median of current ask prices — from list.json only, null for CSV input)]
    return iid, [round(price), round(p25 if p25 is not None else price), round(p75 if p75 is not None else price),
                 int(sold), (1 if low else 0) | (2 if per_set else 0), None if trend is None else round(trend, 3),
                 None if sell is None else round(sell, 3),
                 None if askMedian is None else round(askMedian)]


out, generated, hist, totals = {}, None, {}, None
if src.suffix.lower() == ".csv":
    for r in csv.DictReader(open(src, newline="")):
        generated = generated or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not int(r.get("sold") or 0): continue   # cash-shop items aren't in our item list
        iid, v = row(str(int(n)), num(r["price"]), num(r["p25"]), num(r["p75"]), r["sold"],
                     r.get("lowData") == "true", r.get("unitBasis") == "set", num(r.get("trend")), num(r.get("sellThrough")))
        out[iid] = v
else:
    d = json.load(open(src)); generated = d.get("generated_at")
    totals = d.get("totals")
    for it in d["items"]:
        kind, _, n = it["id"].partition(":")
        if kind != "basil" or not it.get("sold"): continue
        iid, v = row(str(int(n)), it["price"], it.get("p25"), it.get("p75"), it["sold"],
                     it.get("lowData"), it.get("unitBasis") == "set", it.get("trend"), it.get("sellThrough"),
                     it.get("askMedian"))
        out[iid] = v
        h = it.get("history")
        if h: hist[iid] = [[e.get("date",""), round(e["median"]) if e.get("median") is not None else None, e.get("sold",0)] for e in h]

j = {"source": "https://meso.watch/", "read": (generated or "")[:10], "market": "Classic World", "items": out}
if hist: j["hist"] = hist
if totals: j["totals"] = totals
if sys.argv[2:]:
    # cheapest live listing per item: {itemId: [price each, qty, channel, map name, seller]}; equipment (1xxxxxx) and
    # per-set items (stars, arrows sold by the set) left out
    # ALSO: all listings per item in "asks" for the "Where to buy" / deal finder UI (v0.12.7)
    # ALSO: "seen" — parallel array to asks, first-seen Unix-min for each (price, seller) pair.
    #   Carried forward from the previous mesowatch_prices.json so listings that have been up
    #   for days are identifiable as stale inventory (held stock, not moving). (2026-10-22)
    now, asks, at = {}, {}, None
    prev_seen = {}
    prev_asks = {}
    prev_path = ROOT / "data" / "sources" / "mesowatch_prices.json"
    if prev_path.exists():
        try:
            prev = json.load(open(prev_path))
            # Old shape (pre-2026-10-22) stored seen[iid] as [[price, seller, t], ...].
            # New shape stores seen[iid] = [t0, t1, ...] parallel to asks[iid].
            # Detect old shape by peeking at the first entry — if it's a list/tuple, it's the old shape.
            prev_seen = prev.get("seen", {})
            prev_asks = prev.get("asks", {})
            for iid, arr in list(prev_seen.items()):
                if arr and isinstance(arr[0], (list, tuple)):
                    # Old shape: convert to {(price, seller): t} map keyed by index in prev_asks
                    prev_asks_arr = prev_asks.get(iid, [])
                    new_arr = []
                    for i, entry in enumerate(arr):
                        if i < len(prev_asks_arr):
                            pa = prev_asks_arr[i]
                            new_arr.append((pa[0], pa[4], entry[2] if len(entry) > 2 else None))
                        else:
                            new_arr.append(tuple(entry))
                    prev_seen[iid] = new_arr
        except Exception as e:
            print(f"[warn] could not read prev mesowatch_prices.json for seen carry-forward: {e}", file=sys.stderr)
            prev_seen, prev_asks = {}, {}
    # prev_seen_int: {iid: {(price, seller): unixMin}}
    prev_seen_int = {}
    for iid, arr in prev_seen.items():
        m = {}
        for entry in arr:
            if isinstance(entry, (list, tuple)) and len(entry) == 3:
                p, s, t = entry
                if t is not None:
                    m[(p, s)] = t
        if m:
            prev_seen_int[iid] = m

    for r in csv.DictReader(open(sys.argv[2], newline="")):
        at = at or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not n.isdigit() or int(n) // 1000000 == 1 or int(n) // 10000 == 207 or (out.get(str(int(n))) or [0] * 5)[4] & 2: continue
        iid, p = str(int(n)), num(r["price"])
        if p is None: continue
        seller = r.get("seller") or ""
        qty = int(r.get("qty") or 1)
        ch = r["channel"] if (r.get("channel") or "").isdigit() else None
        mp = r.get("map") or ""
        entry = [p if p < 1 else round(p), qty, int(ch) if ch is not None else None, mp, seller]
        asks.setdefault(iid, []).append(entry)
        if iid not in now or p < now[iid][0]:
            now[iid] = entry
    for iid in asks: asks[iid].sort(key=lambda x: x[0])

    # Build seen[itemId] parallel to asks[itemId]: same length, same order (post-sort),
    # each entry = first_seen_unix_min for the (price, seller) at the same index in asks.
    # Compact shape: seen[iid] = [t0, t1, t2, ...]. To get (price, seller) for index i,
    # the frontend looks at asks[iid][i] = [price, qty, ch, map, seller].
    # Carry forward: if (price, seller) was seen in the previous run, keep its timestamp.
    # Otherwise, use the current run's `at` (listed) timestamp as the first-seen time.
    seen = {}
    default_t = None
    if at:
        # at is "YYYY-MM-DD HH:MM" UTC (the generated_at trimmed). Convert to unix minutes.
        try:
            from datetime import datetime, timezone
            default_t = int(datetime.strptime(at, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() / 60)
        except Exception:
            default_t = None
    if default_t is None:
        default_t = int(time.time() / 60)
    for iid, arr in asks.items():
        prev_map = prev_seen_int.get(iid, {})
        seen[iid] = [prev_map.get((entry[0], entry[4]), default_t) for entry in arr]
    j["now"], j["asks"], j["listed"], j["seen"] = now, asks, (at or "")[:16].replace("T", " "), seen
    # Health check: detect fresh.json empty-state by looking at the CSV's `map` column.
    # The market.json fallback CSV has no FM room/channel info (every map is empty).
    # Real fresh.json rows have a non-empty `map`. Warn loudly so this stays visible.
    maps_seen = 0
    for r in csv.DictReader(open(sys.argv[2], newline="")):
        if r.get("map"):
            maps_seen += 1
            if maps_seen >= 3:
                break
    if maps_seen == 0:
        print(f"[fresh] WARNING: listings CSV has no FM room info — meso.watch's /data/fresh/Classic World.json "
              f"returned 0 rows. Using market.json `listings` fallback. See docs/ai/mesowatch-sync.md", file=sys.stderr)
    else:
        print(f"[fresh] live FM listings (fresh.json OK, {maps_seen}+ rows have map info)", file=sys.stderr)
dst = ROOT / "data" / "sources" / "mesowatch_prices.json"
dst.write_text(json.dumps(j, separators=(",", ":")))
print(f"{len(out)} items with sales ({sum(not v[4] & 1 for v in out.values())} solid) as of {generated}"
      + (f", {len(j['now'])} cheapest + {sum(len(v) for v in j.get('asks',{}).values())} total listings now as of {j['listed']}" if "now" in j else "") + f" -> {dst}")


