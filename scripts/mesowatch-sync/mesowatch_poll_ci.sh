#!/usr/bin/env bash
# CI-friendly meso.watch poller. Runs in GitHub Actions (mesowatch-poll.yml).
# Fetches meso.watch via agent-browser, regenerates mesowatch_prices.json +
# data/data.json + dist/index.html, commits to main if anything changed.
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
log "Fetching /data/market.json + /data/fresh/Classic World.json..."
FETCH_RESULT=$(agent-browser eval "(async () => {
  try {
    const [m, f] = await Promise.all([
      fetch('/data/market.json').then(r=>r.text()),
      fetch('/data/fresh/Classic%20World.json').then(r=>r.text())
    ]);
    const mj = JSON.parse(m);
    const fj = JSON.parse(f);
    // Wrap extracted items as a market.json-shaped object for fetch_mesowatch.py
    const extracted = JSON.stringify({
      items: mj.items,
      generated_at: mj.generated_at,
      market: mj.market
    });
    localStorage.setItem('mw_market', extracted);
    localStorage.setItem('mw_fresh', f);
    localStorage.setItem('mw_market_ts', mj.generated_at);
    localStorage.setItem('mw_fresh_ts', fj.generated_at);
    return 'OK|market_ts=' + mj.generated_at + '|fresh_ts=' + fj.generated_at + '|items=' + Object.keys(mj.items||{}).length + '|rows=' + (fj.rows||[]).length;
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
# agent-browser storage local <key> prints "<key>: <value>" on stdout.
# We strip the prefix and write the raw value to disk.
log "Extracting payloads to $WORKDIR/tmp/..."
agent-browser storage local mw_market 2>/dev/null \
  | sed 's/^mw_market: //' \
  > "$WORKDIR/tmp/market.json"
agent-browser storage local mw_fresh 2>/dev/null \
  | sed 's/^mw_fresh: //' \
  > "$WORKDIR/tmp/fresh.json"

# Sanity check — files should start with { (JSON object)
FIRST_M=$(head -c 1 "$WORKDIR/tmp/market.json")
FIRST_F=$(head -c 1 "$WORKDIR/tmp/fresh.json")
if [ "$FIRST_M" != "{" ] || [ "$FIRST_F" != "{" ]; then
  log "ERROR: extracted files don't look like JSON (first chars: market='$FIRST_M' fresh='$FIRST_F')"
  agent-browser close >/dev/null 2>&1
  exit 1
fi

MARKET_SIZE=$(stat -c %s "$WORKDIR/tmp/market.json")
FRESH_SIZE=$(stat -c %s "$WORKDIR/tmp/fresh.json")
log "Extracted: market.json=$MARKET_SIZE bytes, fresh.json=$FRESH_SIZE bytes"

agent-browser close >/dev/null 2>&1

# --- Step 4: Convert fresh.json -> CSV (for fetch_mesowatch.py's listings arg) ---
log "Converting fresh.json -> CSV via fresh_to_csv.py..."
python3 "$SCRIPT_DIR/fresh_to_csv.py"

# --- Step 5: Run fetch_mesowatch.py with market.json (JSON branch) + fresh CSV ---
# This writes data/sources/mesowatch_prices.json with the new prices + live listings
log "Running fetch_mesowatch.py..."
python3 scripts/fetch_mesowatch.py "$WORKDIR/tmp/market.json" "$WORKDIR/download/meso_watch_fresh_listings.csv"

# --- Step 6: Check if mesowatch_prices.json actually changed ---
if git diff --quiet -- data/sources/mesowatch_prices.json; then
  log "No changes to mesowatch_prices.json — nothing to rebuild, no commit."
  exit 0
fi

log "mesowatch_prices.json changed — running build steps."

# --- Step 7: Rebuild data/data.json (just the prices step) + dist/index.html ---
log "Running build_data.py prices..."
python3 scripts/build_data.py prices

log "Running build.py..."
python3 scripts/build.py | tail -3

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
git add data/sources/mesowatch_prices.json data/data.json dist/index.html
git commit -F /tmp/commit_msg.txt
# Use GITHUB_TOKEN's git credentials — Actions auto-injects them via
# extraheader config in the checkout step. Push to main.
git push origin HEAD:main

log "Done. Pages will redeploy via pages.yml workflow_run trigger."
