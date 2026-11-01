"""Save OSMS's weapon-action hitboxes (lib/skill-range-viz.js, Character.Afterimage boxes) to data/sources/osms_hitviz.json,
plus `char`: the standing character sprite the OSMS range viewer draws (data/current/images/hair/00030000.png, base64), and
`items`: every weapon's swing family (items.json after_image) by weapon type. The swing box belongs to the ITEM, not the type:
Gladius (swordOS) swings shorter than Sword (swordOL); OSMS's own viewer uses one family per type (11-01 audit).
Uses the same pinned OSMS_REF as fetch_osms.sh. Run: python3 scripts/fetch_osms_hitviz.py  (then scripts/patch_skill_data.py)."""
import base64, json, pathlib, re, sys, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from skill_range import parse_viz
ref = re.search(r'OSMS_REF:-([0-9a-f]{40})', (ROOT / "scripts/fetch_osms.sh").read_text()).group(1)
url = f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/lib/skill-range-viz.js"
out = parse_viz(urllib.request.urlopen(url, timeout=60).read().decode())
raw = f"https://raw.githubusercontent.com/ohmi69/osms_datamine_dashboard/{ref}/"
out["char"] = base64.b64encode(urllib.request.urlopen(raw + "data/current/images/hair/00030000.png", timeout=60).read()).decode()
items = json.loads(urllib.request.urlopen(raw + "data/current/items.json", timeout=60).read())["items"]
out["items"] = {}
for it in sorted(items.values() if isinstance(items, dict) else items, key=lambda i: i["id"]):
    if it.get("after_image") and it.get("weapon_type"): out["items"].setdefault(it["weapon_type"], {}).setdefault(it["after_image"], []).append(it["id"])
out["src"] = f"OSMS {ref[:7]} lib/skill-range-viz.js"
(ROOT / "data/sources/osms_hitviz.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"{len(out['sets'])} action sets, {len(out['weap'])} weapon types from {out['src']}")
