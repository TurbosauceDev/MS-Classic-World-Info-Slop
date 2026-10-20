#!/usr/bin/env bash
# Chat-CLI trigger for the meso.watch poll workflow. Danny says "refresh" in
# chat → I run this script → triggers workflow_dispatch on the scheduled
# 'meso.watch poll' workflow in GitHub Actions. ~60s later, the workflow
# fetches meso.watch, regenerates prices, commits to main, Pages redeploys.
#
# The scheduled cron '0,30 * * * *' already runs the workflow every 30 min.
# This script is the on-demand path for instant updates outside the cron.
#
# Architecture history: this script used to do the meso.watch fetch itself
# (agent-browser + localStorage + CSV generation + push to data/mesowatch-sync
# side branch + trigger mesowatch-sync.yml workflow). That architecture was
# replaced 2026-10-20 by the scheduled mesowatch-poll.yml workflow, which
# does everything in CI (faster, no chat-CLI dependency, no PAT in CI, no
# side branch). This script is now a 1-line wrapper around workflow_dispatch.
# The old behavior is in git history if we ever need to bring it back.

set -euo pipefail

TOKEN_FILE="${MESO_WATCH_ROOT:-/home/z/my-project}/.secrets/gh-token"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "ERROR: no token at $TOKEN_FILE — can't trigger workflow_dispatch." >&2
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")

REPO="TurbosauceDev/MS-Classic-World-Info-Slop"
WORKFLOW="mesowatch-poll.yml"
REF="${MESO_WATCH_BRANCH:-main}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Triggering workflow_dispatch on $WORKFLOW (ref=$REF)..."
HTTP=$(curl -sS -o /tmp/_dispatch_resp.txt -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "{\"ref\":\"$REF\"}" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches")
if [ "$HTTP" = "204" ]; then
  echo "  workflow_dispatch accepted (HTTP 204)."
  echo "  Watch the run at: https://github.com/$REPO/actions/workflows/$WORKFLOW"
else
  echo "ERROR: workflow_dispatch failed (HTTP $HTTP)" >&2
  cat /tmp/_dispatch_resp.txt >&2
  exit 1
fi
