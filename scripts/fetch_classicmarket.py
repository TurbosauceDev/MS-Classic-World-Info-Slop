#!/usr/bin/env python3
"""Fetch classicmarket.kr's public item catalog and save as a compact JSON.

classicmarket.kr exposes /data/items.json publicly (no auth, no Cloudflare,
BunnyCDN-backed). Contains 5,235 items with:
- Item ID (matches our OSMS item IDs — cross-referencing is trivial)
- English + Korean names
- Full item stats (WAT, MAD, PDD, STR, DEX, INT, LUK, ACC, EVA, etc.)
- NPC shop price (NOT player market price — that requires Discord login)
- Category, requirements, slots

This fetcher downloads the full catalog and outputs a compact version with
only the fields useful for the planner site (names, NPC price, stats, category).

Used by: scripts/mesowatch-sync/mesowatch_poll_ci.sh (runs alongside the
meso.watch fetch in the same CI workflow run).

Output: data/sources/classicmarket_items.json
"""
import json
import os
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_URL = "https://classicmarket.kr/data/items.json"
DST = ROOT / "data" / "sources" / "classicmarket_items.json"

def fetch():
    """Fetch the public items.json from classicmarket.kr."""
    req = urllib.request.Request(SRC_URL, headers={
        "User-Agent": "meso-watch-poller/1.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    return data

def transform(items):
    """Transform the full item list into a compact format.

    Keep: id, name, nameKo, category, overall, price (NPC), key stats,
    reqLevel, reqJob, slots.
    Drop: desc (verbose), vslots/islots (visual configs), isCash, noIcon.
    """
    compact = {}
    for item in items:
        iid = str(item.get("id", ""))
        if not iid:
            continue
        compact[iid] = {
            "n": item.get("name", ""),
            "nk": item.get("nameKo", ""),
            "c": item.get("category", ""),
            "o": item.get("overall", ""),
            "npc": item.get("price", 0),
            "rL": item.get("reqLevel", 0),
            "rJ": item.get("reqJob", 0),
            "s": item.get("slots", 0),
            # Key stats (0 if not applicable)
            "w": item.get("incWAT", 0),
            "m": item.get("incMAD", 0),
            "pdd": item.get("incPDD", 0),
            "mdd": item.get("incMDD", 0),
            "str": item.get("incSTR", 0),
            "dex": item.get("incDEX", 0),
            "int": item.get("incINT", 0),
            "luk": item.get("incLUK", 0),
            "acc": item.get("incACC", 0),
            "eva": item.get("incEVA", 0),
            "mhp": item.get("incMHP", 0),
            "mmp": item.get("incMMP", 0),
            "spd": item.get("incSpeed", 0),
            "jmp": item.get("incJump", 0),
            "crt": item.get("incCRT", 0),
            "crd": item.get("incCRD", 0),
            "aS": item.get("attackSpeed", 0),
        }
    return compact

def main():
    print("[classicmarket] Fetching /data/items.json...")
    items = fetch()
    print(f"[classicmarket] Fetched {len(items)} items")

    compact = transform(items)
    print(f"[classicmarket] Transformed to {len(compact)} compact items")

    DST.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(compact, separators=(",", ":"))
    DST.write_text(s)
    print(f"[classicmarket] Wrote {len(s)/1024:.0f} KB to {DST}")

    # Summary
    categories = {}
    for v in compact.values():
        cat = v.get("c", "?")
        categories[cat] = categories.get(cat, 0) + 1
    print(f"[classicmarket] Categories: {dict(sorted(categories.items(), key=lambda x: -x[1])[:10])}")

    npc_priced = sum(1 for v in compact.values() if v.get("npc", 0) > 0)
    print(f"[classicmarket] Items with NPC price > 0: {npc_priced}")

if __name__ == "__main__":
    main()
