#!/usr/bin/env python3
"""Fetch pricing data from maplestory.watch and mesoarbitrage.com.

Both sites have PUBLIC APIs (no auth):
- maplestory.watch: GET /api/items — 944 items, 12 fields (typical, range, dayAgo, samples, prices, lowest, listed, sold, units, volume, seen).
  Behind a Cloudflare challenge for non-browser clients since 10-28 (same class of block as classicrank.com); fetches fail 403
  and we keep the old file — no bypassing, per the 10-20 rule. The site's stale pills / Source-health panel flag the freeze.
- mesoarbitrage.com: GET /data/prices.json — 983 items, 15 fields (id, name, group, sub, jobs, n, soldN, sold, ask, last, npc, sold72, n72, sold14, n14)

Both use crowdsourced shop scans (browser-based game window sharing via getDisplayMedia API).
mesoarbitrage.com has the RICHEST data: item IDs matching OSMS, NPC prices, 72h/14-day windows, anti-abuse 2h hold.

Output:
  data/sources/maplestorywatch_prices.json
  data/sources/mesoarbitrage_prices.json

Usage: python3 scripts/fetch_alt_sources.py
"""
import json
import os
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "data" / "sources"

MSW_URL = "https://maplestory.watch/api/items"
MA_URL = "https://mesoarbitrage.com/data/prices.json"


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "meso-watch-poller/1.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_maplestorywatch():
    """Fetch maplestory.watch /api/items — 944 items with typical/range/dayAgo/samples/volume/lowest."""
    print("[maplestorywatch] Fetching /api/items...")
    d = fetch(MSW_URL)
    items = d.get("items", [])
    print(f"[maplestorywatch] Got {len(items)} items, version: {d.get('version',{}).get('timestamp','?')}")

    # Transform to compact {itemId: {fields}} — match by name to OSMS items later
    out = {
        "source": "https://maplestory.watch/api/items (crowdsourced shop scans via browser game-window sharing)",
        "generated_at": d.get("version", {}).get("timestamp", ""),
        "items": {}
    }
    for it in items:
        name = it.get("name", "")
        if not name:
            continue
        out["items"][name] = {
            "typical": it.get("typical"),
            "range": it.get("range"),
            "dayAgo": it.get("dayAgo"),
            "samples": it.get("samples"),
            "prices": it.get("prices"),
            "lowest": it.get("lowest"),
            "listed": it.get("listed"),
            "sold": it.get("sold"),
            "units": it.get("units"),
            "volume": it.get("volume"),
            "seen": it.get("seen"),
        }

    dst = SRC_DIR / "maplestorywatch_prices.json"
    dst.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[maplestorywatch] Wrote {len(out['items'])} items ({dst.stat().st_size / 1024:.0f} KB) -> {dst}")
    return out


def fetch_mesoarbitrage():
    """Fetch mesoarbitrage.com /data/prices.json — 983 items with 15 fields including NPC prices + 72h/14-day windows."""
    print("[mesoarbitrage] Fetching /data/prices.json...")
    d = fetch(MA_URL)

    cols = d.get("cols", [])
    items_raw = d.get("items", [])
    print(f"[mesoarbitrage] Got {len(items_raw)} items, hold: {d.get('hold')}h, cols: {len(cols)}")

    # Items are arrays matching cols order. Convert to {itemId: {field: value}}
    out = {
        "source": "https://mesoarbitrage.com/data/prices.json (crowdsourced shop scans, 2h anti-abuse hold)",
        "generated_at": d.get("generated"),
        "hold_hours": d.get("hold"),
        "items": {}
    }
    for row in items_raw:
        if len(row) < len(cols):
            continue
        item = dict(zip(cols, row))
        iid = str(item.get("id", ""))
        if not iid or iid == "None":
            continue
        out["items"][iid] = {
            "name": item.get("name"),
            "group": item.get("group"),
            "sub": item.get("sub"),
            "jobs": item.get("jobs"),
            "n": item.get("n"),          # total observations
            "soldN": item.get("soldN"),    # number sold
            "sold": item.get("sold"),      # median sold price
            "ask": item.get("ask"),        # cheapest asking price
            "last": item.get("last"),      # last seen timestamp
            "npc": item.get("npc"),        # NPC shop price!
            "sold72": item.get("sold72"),   # sold in last 72h
            "n72": item.get("n72"),         # observations in last 72h
            "sold14": item.get("sold14"),   # sold in last 14 days
            "n14": item.get("n14"),         # observations in last 14 days
        }

    dst = SRC_DIR / "mesoarbitrage_prices.json"
    dst.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[mesoarbitrage] Wrote {len(out['items'])} items ({dst.stat().st_size / 1024:.0f} KB) -> {dst}")
    return out


def main():
    # A failed fetch keeps the old file and exits 0 so CI never breaks (same contract as fetch_shopscans.py).
    # Before the 10-28 fix any HTTP error here crashed the shopscans poll step under `bash -e` (2 failed runs).
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    bad = []
    for label, fn in (("maplestorywatch", fetch_maplestorywatch), ("mesoarbitrage", fetch_mesoarbitrage)):
        try:
            fn()
        except Exception as e:
            bad.append(label)
            print(f"::warning::{label} fetch failed, keeping the old file: {type(e).__name__}: {e}")
        else:
            print()
    if bad:
        print(f"\nDone with {len(bad)} failed source(s) ({', '.join(bad)}); fresh files kept for the rest.")
    else:
        print("\nDone. Both sources fetched.")


if __name__ == "__main__":
    main()
