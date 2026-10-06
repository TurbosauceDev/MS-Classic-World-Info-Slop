#!/usr/bin/env bash
# Get the OSMS Data Explorer export (COT2 game-file dump) that every number in the page comes from.
# Pinned to the commit this project was built against; bump OSMS_REF to pick up a newer export (e.g. launch data).
# Shallow + sparse: only the pinned commit and the folders the scripts read (data/current, data/patches/v49), ~100 MB.
# A full clone with history is ~8.6 GB.
set -euo pipefail
cd "$(dirname "$0")/.."
OSMS_REF="${OSMS_REF:-d9e226365d161f168d77c23dc9f72ee48e3d59ad}"
R=vendor/osms_datamine_dashboard
mkdir -p "$R"
if [ ! -d "$R/.git" ]; then
  git -C "$R" init --quiet
  git -C "$R" remote add origin https://github.com/ohmi69/osms_datamine_dashboard.git
fi
git -C "$R" sparse-checkout set data/current data/patches/v49
git -C "$R" fetch --quiet --depth 1 --filter=blob:none origin "$OSMS_REF"
git -C "$R" checkout --quiet FETCH_HEAD
echo "OSMS export at $(git -C "$R" rev-parse --short HEAD)"
