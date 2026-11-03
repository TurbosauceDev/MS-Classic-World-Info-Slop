#!/usr/bin/env python3
"""Re-apply one or more fetchers' step(D) to data/data.json (after a poll lost a push race and reset onto the new main).
Usage: python3 scripts/ci/apply_step.py fetch_shopscans [fetch_other ...]   (module names in scripts/)
Same write format the polls always used: compact JSON, no spaces."""
import importlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
mods = sys.argv[1:]
if not mods: raise SystemExit("usage: apply_step.py <scripts module> [...]")
path = ROOT / "data" / "data.json"
D = json.loads(path.read_text(encoding="utf-8"))
for m in mods: importlib.import_module(m).step(D)
path.write_text(json.dumps(D, separators=(",", ":")), encoding="utf-8")
print("applied", ", ".join(mods))
