#!/usr/bin/env bash
# CI-friendly meso.watch poller. Runs in GitHub Actions (mesowatch-poll.yml).
# Fetches meso.watch via agent-browser, regenerates mesowatch_prices.json +
# data/data.json (pages.yml builds the page), commits to main if anything changed.
#
# Differences from the chat-CLI meso_watch_poll.sh:
#   - No state files (uses git diff against existing mesowatch_prices.json)
#   - No side branch / no workflow_dispatch triggering (we ARE the workflow)
#   - No PAT (uses GITHUB_TOKEN auto-injected by Actions)
#   - Uses $MESO_WATCH_ROOT for working files (default: /tmp/mesowatch-ci)
#
# Exits 0 with no commit if nothing changed; exits 0 with a commit if it did.

set -euo pipefail

# Resolve repo root: this script lives at scripts/mesowatch-sync/meso_watch_poll_ci.sh
# Repo root is two levels up.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

# Working dir for fetched payloads + temp CSVs
WORKDIR="${MESO_WATCH_CI_WORKDIR:-/tmp/mesowatch-ci}"
mkdir -p "$WORKDIR/tmp" "$WORKDIR/download"
export MESO_WATCH_ROOT="$WORKDIR"

# agent-browser on PATH (installed via npm in the workflow)
export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.npm-global/bin:$HOME/.local/bin"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [meso.watch-ci] $*"
}

# --- Step 1: Open meso.watch + pass Cloudflare ---
log "Opening meso.watch..."
agent-browser open https://meso.watch --timeout 30000 >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1
agent-browser wait 5000 >/dev/null 2>&1   # let Cloudflare check settle

# --- Step 2: Single eval: fetch both endpoints, stash in localStorage ---
# We wrap the extracted market items as {items, generated_at, market} so
# fetch_mesowatch.py's JSON branch can parse it directly (no CSV conversion
# needed for the items side). The fresh.json is stored raw — fresh_to_csv.py
# converts it to CSV before fetch_mesowatch.py reads it (the listings arg
# must be CSV format).
# NOTE: Switched from /data/market.json to /data/list.json on 2026-10-21.
# list.json is version 2 of meso.watch's data format: 13x smaller (1.7 MB vs 22.5 MB),
# updates hourly (vs market.json's ~daily), items is a list (array, 1758 items) vs
# dict (1752 keys), and includes askMedian + history + 7 NEW fields not in market.json.
# fetch_mesowatch.py's JSON branch handles both list and dict items.
log "Fetching /data/list.json + /data/fresh/Classic World.json..."
# NOTE: fresh.json has been returning 0 rows since the list.json switch (2026-10-21).
# When fresh.json is empty, we fall back to market.json's per-item `listings` field
# for live listing data. market.json listings don't have map/room/channel (location is
# null), but they have seller + price + qty + stock — enough for the cheap filter.
FETCH_RESULT=$(agent-browser eval "(async () => {
  try {
    const [m, f] = await Promise.all([
      fetch('/data/list.json').then(r=>r.text()),
      fetch('/data/fresh/Classic%20World.json').then(r=>r.text())
    ]);
    const mj = JSON.parse(m);
    const fj = JSON.parse(f);
    const extracted = JSON.stringify({
      items: mj.items,
      generated_at: mj.generated_at,
      market: mj.market,
      totals: mj.totals
    });
    localStorage.setItem('mw_market', extracted);
    localStorage.setItem('mw_market_ts', mj.generated_at);
    const freshRows = (fj.rows || []).length;
    if (freshRows > 0) {
      localStorage.setItem('mw_fresh', f);
      localStorage.setItem('mw_fresh_ts', fj.generated_at);
      localStorage.setItem('mw_fresh_format', 'json');
    } else {
      // fresh.json empty — fetch market.json, extract listings to CSV
      const mkt = await fetch('/data/market.json').then(r=>r.text());
      const mktJ = JSON.parse(mkt);
      let csv = 'id,seller,price,qty,stock,map,room,channel,seen,market,generated_at\\n';
      for (const [iid, item] of Object.entries(mktJ.items || {})) {
        if (!item.listings) continue;
        for (const l of item.listings) {
          csv += [item.id||iid, (l.seller||'').replace(/,/g,' '), l.price||'', l.qty||1, l.stock||'', '', '', '', (l.lastSeen||'').replace(/,/g,' '), 'Classic World', mktJ.generated_at].join(',') + '\\n';
        }
      }
      localStorage.setItem('mw_fresh', csv);
      localStorage.setItem('mw_fresh_ts', mktJ.generated_at);
      localStorage.setItem('mw_fresh_format', 'csv');
    }
    const itemCount = Array.isArray(mj.items) ? mj.items.length : Object.keys(mj.items||{}).length;
    return 'OK|market_ts=' + mj.generated_at + '|fresh_ts=' + localStorage.getItem('mw_fresh_ts') + '|items=' + itemCount + '|rows=' + freshRows + (freshRows === 0 ? '|fallback=market.json' : '');
  } catch (e) {
    return 'ERR|' + (e && e.message ? e.message : String(e));
  }
})()" 2>&1 | tail -1 | sed 's/^"//; s/"$//')
log "Fetch eval result: $FETCH_RESULT"

if [[ "$FETCH_RESULT" != OK\|* ]]; then
  log "ERROR: fetch failed: $FETCH_RESULT"
  agent-browser close >/dev/null 2>&1
  exit 1
fi

# Read timestamps back from localStorage
NEW_MARKET_TS=$(agent-browser storage local mw_market_ts 2>/dev/null \
  | sed 's/^mw_market_ts: //; s/^"//; s/"$//')
NEW_FRESH_TS=$(agent-browser storage local mw_fresh_ts 2>/dev/null \
  | sed 's/^mw_fresh_ts: //; s/^"//; s/"$//')
log "Read timestamps: market='$NEW_MARKET_TS' fresh='$NEW_FRESH_TS'"

# --- Step 3: Extract localStorage values to files ---
log "Extracting payloads to $WORKDIR/tmp/..."
agent-browser storage local mw_market 2>/dev/null \
  | sed 's/^mw_market: //' \
  > "$WORKDIR/tmp/market.json"

# Check fresh data format (json from fresh.json, or csv from market.json fallback)
FRESH_FORMAT=$(agent-browser storage local mw_fresh_format 2>/dev/null \
  | sed 's/^mw_fresh_format: //; s/^"//; s/"$//')
log "Fresh data format: $FRESH_FORMAT"

if [ "$FRESH_FORMAT" = "csv" ]; then
  # market.json fallback — mw_fresh is already CSV, write directly
  log "fresh.json empty — using market.json listings (pre-converted CSV)"
  agent-browser storage local mw_fresh 2>/dev/null \
    | sed 's/^mw_fresh: //' \
    > "$WORKDIR/download/meso_watch_fresh_listings.csv"
  cp "$WORKDIR/download/meso_watch_fresh_listings.csv" "$WORKDIR/tmp/fresh.json"
  FIRST_F=$(head -c 1 "$WORKDIR/tmp/fresh.json")
  if [ "$FIRST_F" != "i" ]; then
    log "ERROR: CSV fallback doesn't start with 'i' (id header)"
    agent-browser close >/dev/null 2>&1
    exit 1
  fi
else
  # fresh.json has data — raw JSON, convert via fresh_to_csv.py
  agent-browser storage local mw_fresh 2>/dev/null \
    | sed 's/^mw_fresh: //' \
    > "$WORKDIR/tmp/fresh.json"
  FIRST_F=$(head -c 1 "$WORKDIR/tmp/fresh.json")
  if [ "$FIRST_F" != "{" ]; then
    log "ERROR: fresh.json doesn't start with '{' (first char: '$FIRST_F')"
    agent-browser close >/dev/null 2>&1
    exit 1
  fi
fi

# Sanity check market.json (always JSON)
FIRST_M=$(head -c 1 "$WORKDIR/tmp/market.json")
if [ "$FIRST_M" != "{" ]; then
  log "ERROR: market.json doesn't start with '{' (first char: '$FIRST_M')"
  agent-browser close >/dev/null 2>&1
  exit 1
fi

MARKET_SIZE=$(stat -c %s "$WORKDIR/tmp/market.json")
FRESH_SIZE=$(stat -c %s "$WORKDIR/tmp/fresh.json")
log "Extracted: list.json payload=$MARKET_SIZE bytes, fresh data=$FRESH_SIZE bytes (format=$FRESH_FORMAT)"

agent-browser close >/dev/null 2>&1

# --- Step 4: Convert fresh.json -> CSV (only if format is json, not csv) ---
if [ "$FRESH_FORMAT" != "csv" ]; then
  log "Converting fresh.json -> CSV via fresh_to_csv.py..."
  python3 "$SCRIPT_DIR/fresh_to_csv.py"
else
  log "Skipping fresh_to_csv.py — CSV already generated from market.json fallback"
fi

# --- Step 5: Run fetch_mesowatch.py with market.json (JSON branch) + fresh CSV ---
# This writes data/sources/mesowatch_prices.json with the new prices + live listings
log "Running fetch_mesowatch.py..."
python3 scripts/fetch_mesowatch.py "$WORKDIR/tmp/market.json" "$WORKDIR/download/meso_watch_fresh_listings.csv"

# --- Step 6: Check if mesowatch_prices.json actually changed ---
if git diff --quiet -- data/sources/mesowatch_prices.json; then
  log "No changes to mesowatch_prices.json — nothing to rebuild, no commit."
else
  log "mesowatch_prices.json changed — running build steps."

  # --- Step 7: Rebuild data/data.json (just the prices step); pages.yml builds dist from it (2026-10-21) ---
  log "Running build_data.py prices..."
  python3 scripts/build_data.py prices


  # --- Step 8: Build commit message from the diff ---
  log "Building commit message from diff..."
  python3 scripts/mesowatch_claude_review.py > /tmp/commit_msg.txt 2>/tmp/claude_err.txt || {
    # If the commit-message script fails for any reason, fall back to a plain message
    echo "chore(mesowatch): refresh prices ($(date -u +%F))" > /tmp/commit_msg.txt
    echo "[warn] commit-message script failed, using fallback" >> /tmp/claude_err.txt
  }
  cat /tmp/claude_err.txt || true
  echo "--- commit message ---"
  cat /tmp/commit_msg.txt

  # --- Step 9: Commit + push to main ---
  log "Committing + pushing to main..."
  git config user.name "meso.watch helper"
  git config user.email "actions@github.com"
  git add data/sources/mesowatch_prices.json data/data.json
  git commit -F /tmp/commit_msg.txt
  # Use GITHUB_TOKEN's git credentials — Actions auto-injects them via
  # extraheader config in the checkout step. Push to main.
  # On a push race (the other polls commit often), start again from the new main and rebuild; never merge data.json.
  cp data/sources/mesowatch_prices.json /tmp/mw_prices.json
  pushed=0
  git push origin HEAD:main && pushed=1
  for i in 1 2 3; do
    [ "$pushed" = 1 ] && break
    log "push rejected, rebuilding on the new main (try $i)"
    sleep $((i*15)); git fetch -q origin main; git reset -q --hard origin/main
    cp /tmp/mw_prices.json data/sources/mesowatch_prices.json
    python3 scripts/build_data.py prices
    git add data/sources/mesowatch_prices.json data/data.json
    git commit -q -F /tmp/commit_msg.txt
    git push origin HEAD:main && pushed=1
  done
  [ "$pushed" = 1 ] || { log "ERROR: push failed after 3 tries"; exit 1; }

  log "Done. Pages will redeploy via pages.yml workflow_run trigger."
fi

# Step 10 (freshness check) moved out to .github/workflows/watchdog.yml (2026-10-21): it measured the commit this run had
# just made, so it always read "0h 0m ago" and could never see skipped runs.
