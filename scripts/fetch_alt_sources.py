#!/usr/bin/env python3
"""Fetch pricing data from mesoarbitrage.com (public API, no auth):
- mesoarbitrage.com: GET /data/prices.json — 983 items, 15 fields (id, name, group, sub, jobs, n, soldN, sold, ask, last, npc, sold72, n72, sold14, n14)

Crowdsourced shop scans (browser-based game window sharing via getDisplayMedia API).
mesoarbitrage.com has rich data: item IDs matching OSMS, NPC prices, 72h/14-day windows, anti-abuse 2h hold.

Output:
  data/sources/mesoarbitrage_prices.json

Usage: python3 scripts/fetch_alt_sources.py
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_fetch import BrowserSession

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "data" / "sources"

MA_URL = "https://mesoarbitrage.com/data/prices.json"

BROWSER = None


def fetch(url):
    """Plain urllib first; on a 403 challenge wall fall back to a real headless Chromium
    (browser_fetch.py; allowed since Danny lifted the 10-20 never-bypass rule, decisions.md 2026-10-28)."""
    if not os.environ.get("FORCE_BROWSER"):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "meso-watch-poller/1.0",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code != 403:
                raise
    global BROWSER
    if BROWSER is None:
        BROWSER = BrowserSession()
    return BROWSER.get(url)


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
    for label, fn in (("mesoarbitrage", fetch_mesoarbitrage),):
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
        print("\nDone.")


if __name__ == "__main__":
    main()
