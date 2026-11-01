"""Refresh only D.hitact and D.skanim in data/data.json (no OSMS checkout needed): after fetch_osms_hitviz.py,
fetch_client_hitviz.py or fetch_skill_anim.py. build_data.py step_skills does the same in a full rebuild.
Run: python3 scripts/patch_skill_data.py"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from skill_range import merge_hitviz

def hitact(jobs):
    S = ROOT / "data/sources"
    h = merge_hitviz(json.load(open(S / "osms_hitviz.json")), json.load(open(S / "client_hitviz.json")))
    h["cls"] = {k: v for k, v in h["cls"].items() if k in jobs}; return h

if __name__ == "__main__":
    p = ROOT / "data/data.json"; D = json.loads(p.read_text())
    D["hitact"] = hitact(set(D["skills"]))
    sa = ROOT / "data/sources/skill_anim.json"
    if sa.exists(): D["skanim"] = json.load(open(sa))
    s = json.dumps(D, separators=(",", ":")); p.write_text(s)
    print(f"data/data.json {len(s) / 1024:.0f} KB · hitact {len(D['hitact']['weap'])} weapon rows · skanim {len(D.get('skanim', {}).get('sk', {}))} skills")
