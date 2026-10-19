"""Assemble the single-file page: src/index.html (+ src/pages/*.html) + src/styles.css + src/js/*.js + data/data.json -> dist/index.html.

The page must stay one self-contained HTML file (it is published as a claude.ai artifact and also opens from file://),
so CSS, JS and the data are inlined. JS files are concatenated in filename order into ONE <script>, so they share
top-level scope: later files can use functions/consts from earlier ones (e.g. 50-builder.js uses hitProb and rankMaps).
"""
import datetime, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "src"
html = (src / "index.html").read_text()
# each page's <section> lives in src/pages/<id>.html (so a thread reads only the page it touches); <!--@page id--> marks its slot
html = re.sub(r"<!--@page ([\w-]+)-->", lambda m: (src / "pages" / f"{m.group(1)}.html").read_text().rstrip("\n"), html)
assert not set(p.stem for p in (src / "pages").glob("*.html")) - set(re.findall(r'<section id="([\w-]+)"', html)), "page file not in index.html"
css = (src / "styles.css").read_text()
js = "\n".join(p.read_text() for p in sorted((src / "js").glob("*.js")))
# the grind tracker's screen readers (inventory price check uses them); one IIFE, exports window.GrindReaders
js = js.replace("/*@READERS*/", (ROOT / "tracker" / "app" / "readers.js").read_text(), 1)
# the tracker's themes (presets + MSCT1. share codes), so the site and the tracker can wear the same theme; window.TrackerThemes
js = js.replace("/*@THEMES*/", (ROOT / "tracker" / "app" / "themes.js").read_text(), 1)
data = (ROOT / "data" / "data.json").read_text()
# "Data last updated" (Credits): the pinned OSMS export (fetch_osms.sh, and when the pin last moved) + each source file's "read" date
def git_day(*args):
    try: return subprocess.run(["git", "log", "-1", "--format=%cs", *args], cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip() or None
    except Exception: return None
ref = re.search(r'OSMS_REF:-([0-9a-f]{7,40})', (ROOT / "scripts" / "fetch_osms.sh").read_text()).group(1)
srcd = {"osms": {"ref": ref, "pinned": git_day("-G", "OSMS_REF=", "--", "scripts/fetch_osms.sh")}}
for f in sorted((ROOT / "data" / "sources").glob("*.json")):
    try: srcd[f.stem] = json.loads(f.read_text()).get("read")
    except Exception: pass
assert "__SRCDATES__" in js
js = js.replace("__SRCDATES__", json.dumps(srcd).replace("<", "\\u003c"), 1)
assert "/*@CSS*/" in html and "/*@JS*/" in html and "__DATA__" in js
# site version on Home = when this file was built (UTC), so a landed update is easy to spot
ver = datetime.datetime.now(datetime.timezone.utc).strftime("%b %-d, %Y · %H:%M UTC")
assert "__BUILD__" in html
html = html.replace("__BUILD__", ver)
# the data rides in a JSON <script> and is read with JSON.parse: V8 parses JSON much faster than the same 5.6 MB as a
# JS object literal (page start ~0.4 s quicker). "<" -> \u003c (only inside strings) so no "</script>" can end it early.
html = html.replace("<script>\n/*@JS*/", '<script type="application/json" id="sitedata">' + data.strip().replace("<", "\\u003c") + "</script>\n<script>\n/*@JS*/", 1)
assert 'id="sitedata"' in html
out = html.replace("/*@CSS*/", css).replace("/*@JS*/", js.replace("__DATA__", 'JSON.parse(document.getElementById("sitedata").textContent)', 1))
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "index.html").write_text(out)
print(f"dist/index.html  {len(out)/1024:.0f} KB  (data {len(data)/1024:.0f} KB)")
if len(out) > 15 * 1024 * 1024: sys.exit("too big for an artifact (16MB limit)")
