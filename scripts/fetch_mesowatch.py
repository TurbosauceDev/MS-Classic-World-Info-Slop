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

j = {"source": "https://meso.watch/", "read": (generated or "")[:10], "generated": generated or "", "market": "Classic World", "items": out}   # generated: full time (scripts/watchdog.py)
if hist: j["hist"] = hist
if totals: j["totals"] = totals
if sys.argv[2:]:
    # cheapest live listing per item: {itemId: [price each, qty, channel, map name, seller]}; equipment (1xxxxxx) and
    # per-set items (stars, arrows sold by the set) left out
    # ALSO: all listings per item in "asks" for the "Where to buy" / deal finder UI (v0.12.7)
    # ALSO: "seen" — parallel array to asks, first-seen Unix-min for each (price, seller) pair.
    #   Carried forward from the previous mesowatch_prices.json so listings that have been up
    #   for days are identifiable as stale inventory (held stock, not moving). (2026-10-22)
    from datetime import datetime, timezone
    def tmin(v):
        # ISO text or Unix s/ms -> Unix minutes (None if unreadable)
        v = (v or "").strip()
        try:
            if v.isdigit(): return int(int(v) / (60000 if int(v) > 1e11 else 60))
            if not v: return None
            d = datetime.fromisoformat(v.replace("Z", "+00:00").replace(" ", "T"))
            return int((d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp() / 60)
        except ValueError: return None
    # "live" listings older than this before the price read are dropped: the market.json fallback (2026-10-21) carried
    # meso.watch's 10-17 listings, which FM Sniper graded as deals 4 days later
    LIVE_MIN = 6 * 60
    ref = tmin(generated) or int(time.time() / 60)
    now, asks, at, newest, stale = {}, {}, None, None, 0
    # first-seen carry-forward: {iid: {(price, seller): unixMin}} from the previous file. seen[iid] is either parallel
    # to asks[iid] ([t0, t1, ...], current shape) or the pre-10-22 [[price, seller, t], ...]
    prev_seen_int = {}
    prev_path = ROOT / "data" / "sources" / "mesowatch_prices.json"
    if prev_path.exists():
        try:
            prev = json.load(open(prev_path))
            for iid, arr in (prev.get("seen") or {}).items():
                pa, m = (prev.get("asks") or {}).get(iid, []), {}
                for i, e in enumerate(arr or []):
                    if isinstance(e, (list, tuple)) and len(e) == 3: p_, s_, t_ = e
                    elif isinstance(e, (int, float)) and i < len(pa): p_, s_, t_ = pa[i][0], pa[i][4], e
                    else: continue
                    if t_ is not None: m[(p_, s_)] = t_
                if m: prev_seen_int[iid] = m
        except Exception as e:
            print(f"[warn] could not read prev mesowatch_prices.json for seen carry-forward: {e}", file=sys.stderr)
            prev_seen_int = {}

    for r in csv.DictReader(open(sys.argv[2], newline="")):
        at = at or r.get("generated_at")
        kind, _, n = r["id"].partition(":")
        if kind != "basil" or not n.isdigit() or int(n) // 1000000 == 1 or int(n) // 10000 == 207 or (out.get(str(int(n))) or [0] * 5)[4] & 2: continue
        iid, p = str(int(n)), num(r["price"])
        if p is None: continue
        t = tmin(r.get("seen")) or tmin(r.get("generated_at"))
        if t is not None and ref - t > LIVE_MIN: stale += 1; continue
        if t is not None: newest = max(newest or t, t)
        seller = r.get("seller") or ""
        qty = int(r.get("qty") or 1)
        ch = r["channel"] if (r.get("channel") or "").isdigit() else None
        mp = r.get("map") or ""
        entry = [p if p < 1 else round(p), qty, int(ch) if ch is not None else None, mp, seller]
        asks.setdefault(iid, []).append(entry)
        if iid not in now or p < now[iid][0]:
            now[iid] = entry
    for iid in asks: asks[iid].sort(key=lambda x: x[0])
    if stale: print(f"[fresh] WARNING: dropped {stale} listings last seen over {LIVE_MIN // 60} h before the price read", file=sys.stderr)

    # seen[iid]: parallel to asks[iid], first time we saw each (price, seller), carried forward from the previous file;
    # a new one gets the time this listing data was made
    default_t = newest or tmin(at) or int(time.time() / 60)
    seen = {iid: [prev_seen_int.get(iid, {}).get((e[0], e[4]), default_t) for e in arr] for iid, arr in asks.items()}
    # listed = when this listing data is from (newest listing seen, else the file's time); "" when every listing was stale
    listed = datetime.fromtimestamp(newest * 60, timezone.utc).strftime("%Y-%m-%d %H:%M") if newest else (at or "")[:16].replace("T", " ") if asks else ""
    j["now"], j["asks"], j["listed"], j["seen"] = now, asks, listed, seen
    # src_listed: when meso.watch made the listing file we read (fresh.json, or market.json in the fallback), even if every
    # listing was too old to keep: the site says "meso.watch's newest list is from Oct 17" instead of only showing none
    j["src_listed"] = (at or "")[:16].replace("T", " ")
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


