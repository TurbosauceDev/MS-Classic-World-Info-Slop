#!/usr/bin/env bash
# Commit poll output and push it to main, surviving a push race (Hermes 2026-11-02; replaced 6 copy-pasted loops).
# Another poll can land on main between our fetch and our push; then we reset to the new main, put our fresh source
# files back, re-run the rebuild step (if any) and try again. Exits 0 on "pushed" or "nothing changed".
#
#   scripts/ci/commit_push.sh -n "shopscans bot" -m "shop-scan prices $(date -u '+%F %H:%M')" \
#     -s data/sources/shopscans.json -a data/data.json -r "python3 -c '...step(D)...'"
#
#   -n NAME    commit author name (email is actions@github.com)
#   -m MSG     commit message
#   -s FILE    a source file this run produced: staged, and restored after a lost race (repeat; missing files skipped)
#   -a FILE    a derived file: staged, NOT restored (the rebuild regenerates it on the new main) (repeat)
#   -r CMD     rebuild command run after a lost race, after the sources are restored
#   -t N       attempts (default 3); -b BRANCH (default main)
# Tested by tests/commit_push_test.py (a real race against a local bare repo).
set -uo pipefail
NAME="" MSG="" REBUILD="" TRIES=3 BRANCH=main SRC=() ADD=()
while getopts "n:m:s:a:r:t:b:" o; do case $o in
  n) NAME=$OPTARG;; m) MSG=$OPTARG;; s) SRC+=("$OPTARG");; a) ADD+=("$OPTARG");; r) REBUILD=$OPTARG;; t) TRIES=$OPTARG;; b) BRANCH=$OPTARG;;
  *) echo "commit_push.sh: bad option" >&2; exit 2;; esac; done
# [skip ci]: polls push with the POLL_DEPLOY_KEY deploy key (main is PR-only; deploy keys are the ruleset's only
# bypass, Hermes 2026-11-03). Unlike GITHUB_TOKEN those pushes fire push events; the poll's workflow_run already
# triggers pages.yml, so skip the duplicate push-triggered pages/tests runs.
case "$MSG" in *"[skip ci]"*) ;; *) MSG="$MSG [skip ci]";; esac
[ -n "$NAME" ] && [ -n "$MSG" ] && [ ${#SRC[@]} -gt 0 ] || { echo "commit_push.sh: -n, -m and at least one -s are required" >&2; exit 2; }
SNAP=$(mktemp -d)
for f in "${SRC[@]}"; do [ -f "$f" ] && mkdir -p "$SNAP/$(dirname "$f")" && cp "$f" "$SNAP/$f"; done
for i in $(seq 1 "$TRIES"); do
  for f in "${SRC[@]}" "${ADD[@]}"; do [ -e "$f" ] && git add "$f"; done
  if git diff --cached --quiet; then echo "no change"; exit 0; fi
  git -c user.name="$NAME" -c user.email="actions@github.com" commit -qm "$MSG"
  if git push -q origin "HEAD:$BRANCH"; then echo "pushed (attempt $i)"; exit 0; fi
  echo "::warning::push lost a race (attempt $i of $TRIES); rebasing onto the new $BRANCH"
  [ "$i" -lt "$TRIES" ] || break
  sleep $((i * ${COMMIT_PUSH_SLEEP:-15}))
  git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH"
  for f in "${SRC[@]}"; do [ -f "$SNAP/$f" ] && cp "$SNAP/$f" "$f"; done
  if [ -n "$REBUILD" ]; then bash -c "$REBUILD" || { echo "::error::rebuild failed after a lost race"; exit 1; }; fi
done
echo "::error::push failed after $TRIES attempts"; exit 1
