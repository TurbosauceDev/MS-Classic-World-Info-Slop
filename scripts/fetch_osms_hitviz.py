"""Save OSMS's weapon-action hitboxes (lib/skill-range-viz.js, Character.Afterimage boxes) to data/sources/osms_hitviz.json.
Uses the same pinned OSMS_REF as fetch_osms.sh. Run: python3 scripts/fetch_osms_hitviz.py  (then build_data.py skills)."""
import json, pathlib, re, sys, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from skill_range import parse_viz
ref = re.search(r'OSMS_REF:-([0-9a-f]{40})', (ROOT / "scripts/fetch_osms.sh").read_text()).group(1)
url = f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/lib/skill-range-viz.js"
out = parse_viz(urllib.request.urlopen(url, timeout=60).read().decode())
out["src"] = f"OSMS {ref[:7]} lib/skill-range-viz.js"
(ROOT / "data/sources/osms_hitviz.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"{len(out['sets'])} action sets, {len(out['weap'])} weapon types from {out['src']}")
