#!/usr/bin/env bash
# Poll meso.watch for new snapshots. Produces two CSVs:
#   1. meso_watch_items.csv          - from /data/market.json (full pricing snapshot)
#   2. meso_watch_fresh_listings.csv  - from /data/fresh/Classic World.json (live FM listings)
#
# Each file is only rewritten when its source's `generated_at` advances past
# the value recorded in the matching state file.
#
# Data extraction strategy:
#   We avoid Chrome's broken second-blob-download behavior by using
#   localStorage as the transport. The eval fetches data and stores it under
#   a known key; `agent-browser storage local <key>` reads it back to stdout.
#
# State files:
#   /home/z/my-project/tmp/last_market_at.txt
#   /home/z/my-project/tmp/last_fresh_at.txt

set -u

PROJECT_ROOT="/home/z/my-project"
# Allow override for local Claude Code setups: export MESO_WATCH_ROOT=/path/to/your/work/dir
# before invoking this script. All paths (tmp/, download/, .secrets/, scripts/) resolve
# under $MESO_WATCH_ROOT.
PROJECT_ROOT="${MESO_WATCH_ROOT:-$PROJECT_ROOT}"
TMP_DIR="$PROJECT_ROOT/tmp"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
DOWNLOAD_DIR="$PROJECT_ROOT/download"
MARKET_STATE="$TMP_DIR/last_market_at.txt"
FRESH_STATE="$TMP_DIR/last_fresh_at.txt"
WORKLOG="$PROJECT_ROOT/worklog.md"

MARKET="Classic World"
MARKET_URL_ENC="Classic%20World"

# localStorage keys
LS_ITEMS="mw_items"           # extracted items payload (JSON string)
LS_MARKET_TS="mw_market_ts"   # market.json generated_at
LS_FRESH="mw_fresh"           # raw fresh.json
LS_FRESH_TS="mw_fresh_ts"     # fresh.json generated_at

mkdir -p "$TMP_DIR" "$DOWNLOAD_DIR"

export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.npm-global/bin:$HOME/.local/bin"

log() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$ts] [meso-watch-poller] $*"
}

write_worklog() {
  local summary="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    echo "---"
    echo "Task ID: meso-watch-poll"
    echo "Agent: cron-poller"
    echo "Task: Poll meso.watch for new snapshots; regenerate CSVs if updated."
    echo ""
    echo "Work Log:"
    echo "- $summary"
    echo ""
    echo "Stage Summary:"
    echo "- Polling attempt at $ts"
    echo
  } >> "$WORKLOG"
}

# --- Open page & pass Cloudflare ---
log "Opening meso.watch..."
agent-browser open https://meso.watch --timeout 30000 >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1
agent-browser wait 5000 >/dev/null 2>&1  # let Cloudflare + JS settle

# --- Single eval: fetch both endpoints, extract items, stash in localStorage ---
log "Fetching market + fresh endpoints, stashing in localStorage..."
FETCH_RESULT=$(agent-browser eval "(async () => {
  try {
    const [m, f] = await Promise.all([
      fetch('/data/market.json').then(r=>r.text()),
      fetch('/data/fresh/${MARKET_URL_ENC}.json').then(r=>r.text())
    ]);
    const mj = JSON.parse(m);
    const fj = JSON.parse(f);
    // Extract pricing-relevant fields per item, drop the heavy listings/history arrays-of-objects
    const items = mj.items;
    const ids = Object.keys(items);
    const out = ids.map(k => { const it = items[k]; return {
      id: it.id, name: it.name, category: it.category,
      classes: (it.classes||[]).join('|'),
      unitBasis: it.unitBasis, level: it.level,
      price: it.price, p25: it.p25, p75: it.p75, low: it.low, high: it.high,
      priceAll: it.priceAll, priceBasis: it.priceBasis, priceSales: it.priceSales,
      trend: it.trend, sold: it.sold, askMedian: it.askMedian, asks: it.asks,
      sellThrough: it.sellThrough, lastSold: it.lastSold, lowData: it.lowData,
      scrolled: it.scrolled, scrolledOnly: it.scrolledOnly,
      numListings: (it.listings||[]).length,
      bestListingPrice: (it.listings && it.listings.length) ? Math.min(...it.listings.map(l=>l.price)) : null,
      bestListingSeller: (it.listings && it.listings.length) ? it.listings.reduce((a,b)=>a.price<b.price?a:b).seller : null,
      listingShops: it.listingShops,
      historyDays: (it.history||[]).length,
      historyFirstDate: (it.history && it.history.length) ? it.history[0].date : null,
      historyLastDate: (it.history && it.history.length) ? it.history[it.history.length-1].date : null,
      generated_at: mj.generated_at, market: mj.market
    };});
    const itemsStr = JSON.stringify(out);
    localStorage.setItem('${LS_ITEMS}', itemsStr);
    localStorage.setItem('${LS_MARKET_TS}', mj.generated_at);
    localStorage.setItem('${LS_FRESH}', f);
    localStorage.setItem('${LS_FRESH_TS}', fj.generated_at);
    return 'OK|items=' + itemsStr.length + '|market_ts=' + mj.generated_at + '|fresh_ts=' + fj.generated_at + '|rows=' + (fj.rows||[]).length;
  } catch (e) {
    return 'ERR|' + (e && e.message ? e.message : String(e));
  }
})()" 2>&1 | tail -1 | sed 's/^"//; s/"$//')

log "Fetch eval result: $FETCH_RESULT"

if [[ "$FETCH_RESULT" != OK\|* ]]; then
  log "ERROR: fetch failed: $FETCH_RESULT"
  agent-browser close >/dev/null 2>&1
  write_worklog "ERROR: fetch failed: $FETCH_RESULT"
  exit 1
fi

# --- Read timestamps back from localStorage ---
NEW_MARKET_TS=$(agent-browser storage local "$LS_MARKET_TS" 2>/dev/null | sed 's/^'"$LS_MARKET_TS"': //; s/^"//; s/"$//')
NEW_FRESH_TS=$(agent-browser storage local "$LS_FRESH_TS" 2>/dev/null | sed 's/^'"$LS_FRESH_TS"': //; s/^"//; s/"$//')

log "Read timestamps: market='$NEW_MARKET_TS' fresh='$NEW_FRESH_TS'"

if [ -z "$NEW_MARKET_TS" ] || [ "$NEW_MARKET_TS" = "null" ]; then
  log "ERROR: market timestamp empty after storage read; aborting"
  agent-browser close >/dev/null 2>&1
  exit 1
fi
if [ -z "$NEW_FRESH_TS" ] || [ "$NEW_FRESH_TS" = "null" ]; then
  log "ERROR: fresh timestamp empty after storage read; aborting"
  agent-browser close >/dev/null 2>&1
  exit 1
fi

# --- Compare to state files ---
OLD_MARKET_TS=""
[ -f "$MARKET_STATE" ] && OLD_MARKET_TS="$(tr -d '[:space:]' < "$MARKET_STATE")"
OLD_FRESH_TS=""
[ -f "$FRESH_STATE" ] && OLD_FRESH_TS="$(tr -d '[:space:]' < "$FRESH_STATE")"

MARKET_CHANGED=0
FRESH_CHANGED=0
[ "$NEW_MARKET_TS" != "$OLD_MARKET_TS" ] && MARKET_CHANGED=1
[ "$NEW_FRESH_TS" != "$OLD_FRESH_TS" ] && FRESH_CHANGED=1

if [ $MARKET_CHANGED -eq 0 ] && [ $FRESH_CHANGED -eq 0 ]; then
  log "No changes. market=$NEW_MARKET_TS fresh=$NEW_FRESH_TS"
  agent-browser close >/dev/null 2>&1
  write_worklog "No new snapshots. market=$NEW_MARKET_TS fresh=$NEW_FRESH_TS"
  exit 0
fi

# --- Extract localStorage values to files ---
# `agent-browser storage local <key>` prints `<key>: <value>` on stdout.
# We strip the prefix and any surrounding quotes, then write to disk.

extract_ls_to_file() {
  local key="$1"
  local dest="$2"
  local label="$3"
  log "Extracting $label from localStorage key '$key' -> $dest"
  agent-browser storage local "$key" 2>/dev/null \
    | sed 's/^'"$key"': //' \
    > "$dest.tmp"
  # Sanity check: file should start with '[' or '{'
  local first_char
  first_char="$(head -c 1 "$dest.tmp")"
  if [ "$first_char" != "[" ] && [ "$first_char" != "{" ]; then
    log "ERROR: $label - first char is '$first_char', expected [ or { ; aborting extract"
    rm -f "$dest.tmp"
    return 1
  fi
  mv "$dest.tmp" "$dest"
  local sz
  sz=$(stat -c %s "$dest")
  log "$label extracted: $sz bytes"
  return 0
}

if [ $MARKET_CHANGED -eq 1 ]; then
  log "Market snapshot changed: '$OLD_MARKET_TS' -> '$NEW_MARKET_TS'"
  if extract_ls_to_file "$LS_ITEMS" "$TMP_DIR/items.json" "items payload"; then
    python3 "$SCRIPTS_DIR/items_to_csv.py"
    echo "$NEW_MARKET_TS" > "$MARKET_STATE"
    log "Items CSV regenerated. market_state=$NEW_MARKET_TS"
  fi
fi

if [ $FRESH_CHANGED -eq 1 ]; then
  log "Fresh listings changed: '$OLD_FRESH_TS' -> '$NEW_FRESH_TS'"
  if extract_ls_to_file "$LS_FRESH" "$TMP_DIR/fresh.json" "fresh payload"; then
    python3 "$SCRIPTS_DIR/fresh_to_csv.py"
    echo "$NEW_FRESH_TS" > "$FRESH_STATE"
    log "Fresh CSV regenerated. fresh_state=$NEW_FRESH_TS"
  fi
fi

agent-browser close >/dev/null 2>&1

# --- Push to GitHub if any CSV was regenerated ---
# Target: data/mesowatch-sync side branch (NOT the default branch) to avoid
# racing Danny's active pushes + wasteful Pages/CI rebuilds. The branch is
# created on first push from the default branch HEAD.
#
# IMPORTANT: pushes via the Git Data API (blob/tree/commit/ref) do NOT fire
# GitHub Actions push events — only `git push` via HTTPS/SSH or the Contents
# API does. So after the push succeeds, we explicitly trigger workflow_dispatch
# on the mesowatch-sync workflow to run refresh_mesowatch.sh. This needs
# Actions:write permission on the PAT (Danny added it 2026-10-19).
PUSHED_SOMETHING=0
if [ $MARKET_CHANGED -eq 1 ] || [ $FRESH_CHANGED -eq 1 ]; then
  if [ -f "$PROJECT_ROOT/.secrets/gh-token" ]; then
    log "Pushing regenerated CSVs to data/mesowatch-sync branch..."
    if python3 "$SCRIPTS_DIR/gh_push_files.py" \
        --branch "data/mesowatch-sync" \
        --message "chore(mesowatch): refresh CSVs ($(date -u +%Y-%m-%d\ %H:%M\ UTC))" \
        --file "$DOWNLOAD_DIR/meso_watch_items.csv:data/sources/mesowatch_csv/meso_watch_items.csv" \
        --file "$DOWNLOAD_DIR/meso_watch_fresh_listings.csv:data/sources/mesowatch_csv/meso_watch_fresh_listings.csv" \
        2>&1 | tail -10; then
      log "GitHub push complete."
      PUSHED_SOMETHING=1
    else
      log "ERROR: GitHub push failed (see output above)"
    fi
  else
    log "No GitHub token found at $PROJECT_ROOT/.secrets/gh-token — skipping push."
  fi
fi

# --- Trigger the mesowatch-sync workflow so refresh_mesowatch.sh runs ---
# This is necessary because Git Data API ref updates don't fire push events
# (only git push via HTTPS/SSH or the Contents API does). We rely on
# workflow_dispatch + Actions:write permission on the PAT instead.
if [ $PUSHED_SOMETHING -eq 1 ]; then
  log "Triggering workflow_dispatch on mesowatch-sync..."
  HTTP_CODE=$(curl -sS -o /tmp/_dispatch_resp.txt -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $(cat "$PROJECT_ROOT/.secrets/gh-token")" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -d '{"ref":"claude/trusting-bell-fqgar6"}' \
    "https://api.github.com/repos/TurbosauceDev/MS-Classic-World-Info-Slop/actions/workflows/mesowatch-sync.yml/dispatches")
  if [ "$HTTP_CODE" = "204" ]; then
    log "workflow_dispatch accepted (HTTP 204). Workflow should fire shortly."
  else
    log "ERROR: workflow_dispatch failed (HTTP $HTTP_CODE)"
    cat /tmp/_dispatch_resp.txt
  fi
fi

write_worklog "Tick complete. market_changed=$MARKET_CHANGED fresh_changed=$FRESH_CHANGED market=$NEW_MARKET_TS fresh=$NEW_FRESH_TS"
