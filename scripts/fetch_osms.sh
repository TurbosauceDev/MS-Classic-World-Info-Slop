#!/usr/bin/env bash
# Get the OSMS Data Explorer export (COT2 game-file dump) that every number in the page comes from.
# Pinned to the commit this project was built against; bump OSMS_REF to pick up a newer export (e.g. launch data).
set -euo pipefail
cd "$(dirname "$0")/.."
OSMS_REF="${OSMS_REF:-d744a66e48fe5c80a33ce464693b869c0a4f556c}"
mkdir -p vendor
if [ ! -d vendor/osms_datamine_dashboard/.git ]; then
  git clone https://github.com/ohmi69/osms_datamine_dashboard.git vendor/osms_datamine_dashboard
fi
git -C vendor/osms_datamine_dashboard fetch --quiet origin
git -C vendor/osms_datamine_dashboard checkout --quiet "$OSMS_REF"
echo "OSMS export at $(git -C vendor/osms_datamine_dashboard rev-parse --short HEAD)"
