"""Assemble the single-file page: src/index.html + src/styles.css + src/js/*.js + data/data.json -> dist/index.html.

The page must stay one self-contained HTML file (it is published as a claude.ai artifact and also opens from file://),
so CSS, JS and the data are inlined. JS files are concatenated in filename order into ONE <script>, so they share
top-level scope: later files can use functions/consts from earlier ones (e.g. 50-builder.js uses hitProb and rankMaps).
"""
import datetime, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "src"
html = (src / "index.html").read_text()
css = (src / "styles.css").read_text()
js = "\n".join(p.read_text() for p in sorted((src / "js").glob("*.js")))
# the grind tracker's screen readers (inventory price check uses them); one IIFE, exports window.GrindReaders
js = js.replace("/*@READERS*/", (ROOT / "tracker" / "app" / "readers.js").read_text(), 1)
data = (ROOT / "data" / "data.json").read_text()
assert "/*@CSS*/" in html and "/*@JS*/" in html and "__DATA__" in js
# site version on Home = when this file was built (UTC), so a landed update is easy to spot
ver = datetime.datetime.now(datetime.timezone.utc).strftime("%b %-d, %Y · %H:%M UTC")
assert "__BUILD__" in html
html = html.replace("__BUILD__", ver)
out = html.replace("/*@CSS*/", css).replace("/*@JS*/", js.replace("__DATA__", data, 1))
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "index.html").write_text(out)
print(f"dist/index.html  {len(out)/1024:.0f} KB  (data {len(data)/1024:.0f} KB)")
if len(out) > 15 * 1024 * 1024: sys.exit("too big for an artifact (16MB limit)")
