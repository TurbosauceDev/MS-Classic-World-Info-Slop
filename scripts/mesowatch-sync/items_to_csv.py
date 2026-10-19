#!/usr/bin/env python3
"""Convert meso.watch items.json to a clean CSV of pricing information.

Paths are relative to $MESO_WATCH_ROOT (default: /home/z/my-project),
so the same script works in the chat-CLI sandbox AND in a local Claude Code
clone after `export MESO_WATCH_ROOT=/path/to/your/work/dir`.
"""
import json
import csv
import os
from pathlib import Path

ROOT = Path(os.environ.get("MESO_WATCH_ROOT", "/home/z/my-project"))
SRC = ROOT / "tmp" / "items.json"
DST = ROOT / "download" / "meso_watch_items.csv"
DST.parent.mkdir(parents=True, exist_ok=True)

with SRC.open("r", encoding="utf-8") as f:
    items = json.load(f)

print(f"Loaded {len(items)} items from {SRC}")

# Field ordering — identification first, then pricing stats, then listing context
fields = [
    "id",
    "name",
    "category",
    "classes",
    "unitBasis",
    "level",
    # Pricing stats
    "price",          # typical / median price
    "p25",            # 25th percentile
    "p75",            # 75th percentile
    "low",            # recent low
    "high",           # recent high
    "priceAll",       # median across all sales
    "priceBasis",     # e.g. "24h" basis window
    "priceSales",     # number of sales used for price calc
    "trend",          # 24h % change (e.g. -0.04 = -4%)
    "sold",           # total units sold
    "askMedian",      # median listing ask
    "asks",           # total listings count
    "sellThrough",    # sell-through ratio
    "lastSold",       # ISO timestamp of last sale
    "lowData",        # low sample size flag
    "scrolled",       # scroll count
    "scrolledOnly",   # scrolled-only flag
    # Live listings summary
    "numListings",
    "bestListingPrice",
    "bestListingSeller",
    "listingShops",
    # History summary
    "historyDays",
    "historyFirstDate",
    "historyLastDate",
    # Snapshot metadata
    "market",
    "generated_at",
]

with DST.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for it in items:
        # Keep nulls as empty cells for readability in spreadsheet apps
        row = {}
        for k in fields:
            v = it.get(k)
            if v is None:
                row[k] = ""
            elif isinstance(v, bool):
                row[k] = "true" if v else "false"
            else:
                row[k] = v
        writer.writerow(row)

print(f"Wrote {len(items)} rows to {DST}")
print(f"File size: {DST.stat().st_size:,} bytes")

# Print a small preview
print("\nPreview (first 3 rows, key columns):")
preview_keys = ["id", "name", "category", "price", "trend", "sold", "lastSold"]
with DST.open("r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 3:
            break
        print(" | ".join(f"{k}={row[k]}" for k in preview_keys))
