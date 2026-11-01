import re, subprocess, sys, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
import canary
subprocess.run([sys.executable, str(R / "scripts/build.py")], check=True, capture_output=True)
html = (R / "dist/index.html").read_text()
assert 'id="agent-notes"' in html and ' hidden ' in html.split('id="agent-notes"')[0][-40:] + ' ', "canary block missing or not hidden"
assert "cookie recipe" in html and "Cool 2 minutes" in html
data = (R / "data/data.json").read_text()
names = [v["n"] for grp in canary.CANARIES.values() for v in grp.values()]
for n in names:
    assert n not in data, f"canary {n} leaked into data.json"
    assert n in html, f"canary {n} missing from dist"
print("canary test passed", len(names), "names")
