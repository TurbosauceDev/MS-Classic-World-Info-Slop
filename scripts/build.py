"""Assemble the single-file page: src/index.html (+ src/pages/*.html) + src/styles.css + src/js/*.js + data/data.json -> dist/index.html.

The page must stay one self-contained HTML file (it is published as a claude.ai artifact and also opens from file://),
so CSS, JS and the data are inlined. JS files are concatenated in filename order into ONE <script>, so they share
top-level scope: later files can use functions/consts from earlier ones (e.g. 50-builder.js uses hitProb and rankMaps).
"""
import datetime, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "src"
html = (src / "index.html").read_text()
# each page's <section> lives in src/pages/<id>.html (so a thread reads only the page it touches); <!--@page id--> marks its slot
html = re.sub(r"<!--@page ([\w-]+)-->", lambda m: (src / "pages" / f"{m.group(1)}.html").read_text().rstrip("\n"), html)
assert not set(p.stem for p in (src / "pages").glob("*.html")) - set(re.findall(r'<section id="([\w-]+)"', html)), "page file not in index.html"
# an unclosed <div> nests every later box inside it (10-21: a stray changelog card swallowed all older ones, smoke red)
for p in (src / "pages").glob("*.html"):
    t = p.read_text(); assert len(re.findall(r"<div\b", t)) == t.count("</div>"), f"{p.name}: <div> and </div> counts differ"
css = (src / "styles.css").read_text()
js = "\n".join(p.read_text() for p in sorted((src / "js").glob("*.js")))
# the grind tracker's screen readers (inventory price check uses them); one IIFE, exports window.GrindReaders
js = js.replace("/*@READERS*/", (ROOT / "tracker" / "app" / "readers.js").read_text(), 1)
# the tracker's game data shaping (D -> G) and session maths, for the EXP/hr live reader (63-expclive.js); window.GrindGamedata, window.GrindSession
js = js.replace("/*@GAMEDATA*/", (ROOT / "tracker" / "core" / "gamedata.js").read_text(), 1)
js = js.replace("/*@SESSION*/", (ROOT / "tracker" / "core" / "session.js").read_text(), 1)
# the tracker's themes (presets + MSCT1. share codes), so the site and the tracker can wear the same theme; window.TrackerThemes
js = js.replace("/*@THEMES*/", (ROOT / "tracker" / "app" / "themes.js").read_text(), 1)
# the tracker's patch notes for the Grind Tracker page (window.TrackerChangelog)
js = js.replace("/*@TRKLOG*/", (ROOT / "tracker" / "app" / "changelog.js").read_text(), 1)
data = (ROOT / "data" / "data.json").read_text()
# "Data last updated" (Credits): the pinned OSMS export (fetch_osms.sh; its date comes from data.json "osms" once build_data.py
# has run with it) + each data/sources file's "read" date
ref = re.search(r'OSMS_REF:-([0-9a-f]{7,40})', (ROOT / "scripts" / "fetch_osms.sh").read_text()).group(1)
srcd = {"osms": {"ref": ref}}
for f in sorted((ROOT / "data" / "sources").glob("*.json")):
    try: srcd[f.stem] = json.loads(f.read_text()).get("read")
    except Exception: pass
assert "__SRCDATES__" in js
js = js.replace("__SRCDATES__", json.dumps(srcd).replace("<", "\\u003c"), 1)
assert "/*@CSS*/" in html and "/*@JS*/" in html and "__DATA__" in js
# site version on Home = when this file was built (UTC), so a landed update is easy to spot
# the page shows it in the viewer's own time zone (70-theme.js); the HTML keeps the UTC text for curl/live checks
now = datetime.datetime.now(datetime.timezone.utc)
ver = now.strftime("%b %-d, %Y · %H:%M UTC")
assert "__BUILD__" in html and "__BUILDISO__" in html
html = html.replace("__BUILDISO__", now.strftime("%Y-%m-%dT%H:%M:%SZ")).replace("__BUILD__", ver)
# site version number (Danny 10-19) = changelog entries counted from the oldest (0.1.0): each card is one version, a card
# marked data-minor starts the next 0.x.0. A new changelog card bumps it, nobody has to remember a number.
# each card carries data-t = when that version shipped (Danny 10-21, backfilled from git history). A new card without one gets
# this build's time written into src/pages/log.html itself, so commit it with the card (tests/docs.test.js checks).
LOGSRC = ROOT / "src" / "pages" / "log.html"
src_log = LOGSRC.read_text()
stamped = re.sub(r'<div class="card"( data-minor)?><div class="cardhead">', lambda m: f'<div class="card"{m.group(1) or ""} data-t="{now.strftime("%Y-%m-%dT%H:%M:%SZ")}"><div class="cardhead">', src_log)
if stamped != src_log:
    LOGSRC.write_text(stamped); html = html.replace(src_log.strip(), stamped.strip(), 1); print("changelog: stamped new card(s) with this build's time in src/pages/log.html")
head, rest = html.split('<section id="log"', 1)
log, tail = rest.split("</section>", 1)
card = r'(<div class="card"( data-minor)?(?: data-t="[^"]+")?><div class="cardhead"><h3>)'
cards = list(re.finditer(card, log))
assert cards and cards[-1].group(2), "oldest changelog card must be data-minor (0.1.0)"
vers, mi, pa = [], 0, 0
for c in reversed(cards):
    mi, pa = (mi + 1, 0) if c.group(2) else (mi, pa + 1)
    vers.append(f"0.{mi}.{pa}")
vers.reverse()
it = iter(vers)
log = re.sub(card, lambda m: m.group(1) + f'<span class="ver">v{next(it)}</span> ', log)
html = head + '<section id="log"' + log + "</section>" + tail
assert "__SITEVER__" in html
html = html.replace("__SITEVER__", vers[0])
# the data rides in a JSON <script> and is read with JSON.parse: V8 parses JSON much faster than the same 5.6 MB as a
# JS object literal (page start ~0.4 s quicker). "<" -> \u003c (only inside strings) so no "</script>" can end it early.
html = html.replace("<script>\n/*@JS*/", '<script type="application/json" id="sitedata">' + data.strip().replace("<", "\\u003c") + "</script>\n<script>\n/*@JS*/", 1)
assert 'id="sitedata"' in html
out = html.replace("/*@CSS*/", css).replace("/*@JS*/", js.replace("__DATA__", 'JSON.parse(document.getElementById("sitedata").textContent)', 1))
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "index.html").write_text(out)
print(f"dist/index.html  {len(out)/1024:.0f} KB  (data {len(data)/1024:.0f} KB)")
if len(out) > 15 * 1024 * 1024: sys.exit("too big for an artifact (16MB limit)")
