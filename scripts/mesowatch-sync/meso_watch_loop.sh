#!/usr/bin/env bash
# Long-running loop wrapper: invokes meso_watch_poll.sh every POLL_INTERVAL
# seconds. Designed to be launched with nohup so it survives logout (but
# NOT container/session restart — see notes in chat).

set -u

POLL_INTERVAL="${1:-3600}"   # default: 1 hour
# Allow override for local Claude Code setups: export MESO_WATCH_ROOT=/path/to/your/work/dir
PROJECT_ROOT="${MESO_WATCH_ROOT:-/home/z/my-project}"
POLL_SCRIPT="$PROJECT_ROOT/scripts/meso_watch_poll.sh"
LOOP_LOG="$PROJECT_ROOT/tmp/poller-loop.log"

mkdir -p "$PROJECT_ROOT/tmp"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop] $*" >> "$LOOP_LOG"
}

log "Started poller loop. interval=${POLL_INTERVAL}s"

while true; do
  log "Tick — invoking $POLL_SCRIPT"
  bash "$POLL_SCRIPT" >> "$LOOP_LOG" 2>&1
  log "Tick finished — sleeping ${POLL_INTERVAL}s"
  sleep "$POLL_INTERVAL"
done
