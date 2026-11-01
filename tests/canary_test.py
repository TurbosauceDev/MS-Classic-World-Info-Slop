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
# Regression 2026-11-01: a <script> in the canary block became the page's LAST </script>; pages_site.py closed the app wrapper
# there, the app script never closed and the live site was blank. The block must hold no script, in dist or in the Pages copy.
blk = html[html.index('id="agent-notes"'):]
assert "<script" not in blk and "</script" not in blk, "canary block must not contain a script"
import tempfile
out = pathlib.Path(tempfile.mkdtemp())
subprocess.run([sys.executable, str(R / "scripts/pages_site.py"), str(out)], check=True, capture_output=True)
site = (out / "index.html").read_text()
cut = site.index('id="agent-notes"')
assert site[:cut].rstrip().endswith("</script>\n<div hidden aria-hidden=\"true\"".split("\n")[0]) or "__BOOTED = true;});</script>" in site[:cut][-200:], "app wrapper not closed before canary block in Pages copy"
print("pages copy ok")
