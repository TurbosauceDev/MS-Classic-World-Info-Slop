#!/usr/bin/env bash
# rotate-digest.sh — reference implementation of the digest rotation.
# See docs/ai/discord-digest-runbook.md. Parameterized; no secrets in this file.
#
# Environment:
#   DIGEST_WEBHOOK_FILE  path to the file holding the #daily-updates webhook URL (required; never printed)
#   DIGEST_STATE_FILE    path to digest-state.json           (default: /home/z/my-project/.secrets/digest-state.json)
#   DIGEST_CONFIG        path to routing config              (default: <repo>/config/digest.json relative to this script)
#   DIGEST_AUTHOR        webhook username                    (default: "Glorg [z.ai] Daily Digest")
#
# Args:
#   $1  new issue .md file (contract shape, lint-passed)
#   $2  TL;DR caption line (optional)
#
# Order matters: archive-guard, delete stale, post new, update state.
# Rotation steps are best-effort (a failure never stops the new post); only
# the post itself is fatal. Run scripts/lint_digest.js on $1 BEFORE calling this.
set -uo pipefail

NEW_FILE="${1:?usage: rotate-digest.sh <new-issue.md> [caption-line]}"
CAPTION="${2:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${DIGEST_CONFIG:-$HERE/../../config/digest.json}"
STATE="${DIGEST_STATE_FILE:-/home/z/my-project/.secrets/digest-state.json}"
AUTHOR="${DIGEST_AUTHOR:-Glorg [z.ai] Daily Digest}"

[ -f "$CONFIG" ] || { echo "config not found: $CONFIG" >&2; exit 2; }
[ -f "$NEW_FILE" ] || { echo "new digest not found: $NEW_FILE" >&2; exit 2; }
[ -f "$STATE" ] || { echo "state not found: $STATE" >&2; exit 2; }
[ -n "${DIGEST_WEBHOOK_FILE:-}" ] && [ -f "$DIGEST_WEBHOOK_FILE" ] || { echo "DIGEST_WEBHOOK_FILE not set or missing" >&2; exit 2; }
WH="$(tr -d '[:space:]' < "$DIGEST_WEBHOOK_FILE")"

# routing + new-issue front matter, via node (no jq dependency)
read -r ARCHIVE_THREAD ISSUE_DATE ISSUE_NUM ATTACH_NAME <<< "$(node - "$CONFIG" "$NEW_FILE" << 'JS'
const cfg = require(process.argv[2]);
const m = require("fs").readFileSync(process.argv[3], "utf8").match(/^---\n([\s\S]*?)\n---\n/);
const fm = {};
for (const line of m[1].split("\n")) { const kv = line.match(/^([a-z_]+):\s*"?(.*?)"?\s*$/); if (kv) fm[kv[1]] = kv[2]; }
const name = cfg.files.attachment_name.replace("{date}", fm.date).replace("{issue}", fm.issue);
console.log(cfg.discord.archive_thread_id, fm.date, fm.issue, name);
JS
)"
[ -n "$ARCHIVE_THREAD" ] && [ "$ARCHIVE_THREAD" != "null" ] || { echo "archive_thread_id not set in config" >&2; exit 2; }

LAST_MSG=$(node -pe "require('$STATE').last_message_id")
LAST_ISSUE=$(node -pe "require('$STATE').last_issue")
LAST_FILE=$(node -pe "require('$STATE').last_file")
ARCH_THROUGH=$(node -pe "require('$STATE').archived_through")
echo "[1] state: last_issue=$LAST_ISSUE msg=$LAST_MSG archived_through=$ARCH_THROUGH"

# [2] archive upload, guarded against double-archiving
if [ "$LAST_ISSUE" -le "$ARCH_THROUGH" ]; then
  echo "[2] archive upload SKIPPED ($LAST_ISSUE <= $ARCH_THROUGH)"
else
  echo "[2] archiving Issue $LAST_ISSUE ($LAST_FILE)"
  printf '{"username":"%s","content":"**Issue %s** moved to archive on creation of Issue %s."}' \
    "$AUTHOR" "$LAST_ISSUE" "$ISSUE_NUM" > /tmp/wh_arch.json
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${WH}?thread_id=${ARCHIVE_THREAD}" \
    -F 'payload_json=</tmp/wh_arch.json' -F "files[0]=@${LAST_FILE};type=text/markdown") || CODE=000
  rm -f /tmp/wh_arch.json
  echo "    archive POST -> HTTP $CODE"
  if [ "$CODE" = "200" ]; then
    node -e "const f='$STATE';const s=require(f);s.archived_through=$LAST_ISSUE;require('fs').writeFileSync(f,JSON.stringify(s))"
  else
    echo "    archive failed; continuing (never blocks the new post)" >&2
  fi
fi

# [3] delete the stale #daily-updates post (best effort)
echo "[3] deleting stale post $LAST_MSG"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${WH}/messages/${LAST_MSG}") || CODE=000
echo "    DELETE -> HTTP $CODE"

# [4] post the new digest as an .md attachment, capture the message id
echo "[4] posting Issue $ISSUE_NUM as $ATTACH_NAME (wait=true)"
printf '{"username":"%s","content":"**Daily digest - Issue %s** (%s)"}' \
  "$AUTHOR" "$ISSUE_NUM" "$ISSUE_DATE" > /tmp/wh_new.json
[ -z "$CAPTION" ] || printf '%s' "$CAPTION" > /tmp/wh_cap.txt
RESP=$(curl -s -X POST "${WH}?wait=true" \
  -F 'payload_json=</tmp/wh_new.json' -F "files[0]=@${NEW_FILE};type=text/markdown")
rm -f /tmp/wh_new.json
NEW_ID=$(printf '%s' "$RESP" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(j.id||"")}catch(e){console.log("")}')
[ -n "$NEW_ID" ] || { echo "post failed; response: $RESP" >&2; exit 1; }
echo "    posted -> message $NEW_ID"

# [5] update state
node -e "const f='$STATE';const s=require(f);s.last_message_id='$NEW_ID';s.last_issue=$ISSUE_NUM;s.last_file='$NEW_FILE';require('fs').writeFileSync(f,JSON.stringify(s))"
echo "[5] state updated: $(cat "$STATE")"
