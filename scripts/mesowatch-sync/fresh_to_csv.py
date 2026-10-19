#!/usr/bin/env python3
"""Convert meso.watch fresh.json (live Free Market listings) to CSV.

Paths are relative to $MESO_WATCH_ROOT (default: /home/z/my-project),
so the same script works in the chat-CLI sandbox AND in a local Claude Code
clone after `export MESO_WATCH_ROOT=/path/to/your/work/dir`.
"""
import json
import csv
import os
from pathlib import Path

ROOT = Path(os.environ.get("MESO_WATCH_ROOT", "/home/z/my-project"))
SRC = ROOT / "tmp" / "fresh.json"
DST = ROOT / "download" / "meso_watch_fresh_listings.csv"
DST.parent.mkdir(parents=True, exist_ok=True)

with SRC.open("r", encoding="utf-8") as f:
    data = json.load(f)

rows = data.get("rows", [])
print(f"Loaded {len(rows)} live listings from {SRC}")
print(f"Snapshot generated_at: {data.get('generated_at')}")

fields = [
    "id",            # item catalog id (e.g. basil:01002128)
    "seller",
    "price",
    "qty",
    "stock",
    "map",           # e.g. "Free Market <9>"
    "room",
    "channel",
    "seen",          # ISO timestamp of last sighting
    "market",
    "generated_at",
]

with DST.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        row = {k: ("" if r.get(k) is None else r.get(k)) for k in fields}
        if "market" not in r:
            row["market"] = data.get("market", "")
        if "generated_at" not in r:
            row["generated_at"] = data.get("generated_at", "")
        writer.writerow(row)

print(f"Wrote {len(rows)} rows to {DST}")
print(f"File size: {DST.stat().st_size:,} bytes")
print()
print("Preview (first 5 rows, key columns):")
preview_keys = ["id", "seller", "price", "map", "channel", "seen"]
with DST.open("r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 5:
            break
        print(" | ".join(f"{k}={row[k]}" for k in preview_keys))
