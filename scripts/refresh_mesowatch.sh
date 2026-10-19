#!/usr/bin/env bash
# "refresh" for meso.watch prices: take the newest items + live listings CSVs Danny's poller pushed to branch data/mesowatch-sync
# (docs/ai/mesowatch-sync.md) and run it through fetch_mesowatch.py -> build_data.py prices -> build.py.
# Reads only what the poller pushed; never fetches meso.watch itself (its /data/ is Cloudflare-gated).
set -euo pipefail
cd "$(dirname "$0")/.."
B=data/mesowatch-sync CSV=data/sources/mesowatch_csv/meso_watch_items.csv LIST=data/sources/mesowatch_csv/meso_watch_fresh_listings.csv
git fetch -q origin "$B"
echo "poller: $(git log -1 --format='%h %cd %s' --date=iso-strict FETCH_HEAD)"
tmp=$(mktemp --suffix=.csv) tmp2=$(mktemp --suffix=.csv); trap 'rm -f "$tmp" "$tmp2"' EXIT
git show "FETCH_HEAD:$CSV" > "$tmp"; git show "FETCH_HEAD:$LIST" > "$tmp2"
before=$(python3 -c "import json;print(json.load(open('data/sources/mesowatch_prices.json'))['read'])")
python3 scripts/fetch_mesowatch.py "$tmp" "$tmp2"
if git diff --quiet -- data/sources/mesowatch_prices.json; then echo "unchanged (market read $before): nothing to rebuild"; exit 0; fi
python3 scripts/build_data.py prices
python3 scripts/build.py | tail -3
echo "prices: market read $before -> $(python3 -c "import json;print(json.load(open('data/sources/mesowatch_prices.json'))['read'])")"
