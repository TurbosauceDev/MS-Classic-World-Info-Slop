"""GitHub Pages copy of the built page: python3 scripts/pages_site.py <out dir>   (pages.yml runs it; no vendor/, no PIL)

dist/index.html stays the one self-contained file (claude.ai artifact, file://). For Pages this script:
  - moves the item icons and minimaps (D.iicons, D.mmaps: about half the page) into assets-<hash>.json, which the page
    fetches right after it starts (00-core.js, D.lazy) and patches into anything already drawn. Icons Home shows stay inline.
  - moves the per-poll market data (audit P9: pw/cm/cmp/mdb/ma/mw/mi + crank/shared/ishop, ~1.3 MB raw) into
    prices-<hash>.json behind a stable-named pointer prices.json = {url, keys}. A boot script parses the inline shell
    data, fetches pointer + file, merges the keys into D (and the Credits source dates into window.__SRCD), and the
    whole app script runs only after that (wrapped in window.__PRICES.then by this script). The shell no longer changes
    when a poll only moves prices, so the service worker can serve the cached shell and only the prices file re-downloads.
  - adds the web app manifest, home-screen icons and the offline service worker (src/pwa/; sw.js registers on any https host).
  - writes market.json = D.pw (meso.watch prices + live listings), which the FM Sniper page re-reads while it's open
    (56-snipe.js), so a deploy from the meso.watch poll reaches an open tab without a reload.
Prints first-load sizes (raw and gzip) before/after.
"""
import os, gzip, hashlib, json, pathlib, re, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
LAZY = ("iicons", "mmaps")
PRICES = ("pw", "cm", "cmp", "mdb", "ma", "mw", "mi", "crank", "shared", "ishop")

def split(html):
    m = re.search(r'(<script type="application/json" id="sitedata">)(.*?)(</script>)', html, re.S)
    assert m, "no sitedata block"
    D = json.loads(m.group(2))
    keep = set(re.findall(r'data-ic="i:(\d+)"', html))   # Home sprites read D.iicons before anything else
    assets = {k: {i: v for i, v in D[k].items() if not (k == "iicons" and i in keep)} for k in LAZY}
    for k in LAZY: D[k] = {i: v for i, v in D[k].items() if i not in assets[k]}
    blob = json.dumps(assets, separators=(",", ":"))
    name = f"assets-{hashlib.sha1(blob.encode()).hexdigest()[:10]}.json"
    D["lazy"] = {"url": name, "keys": list(LAZY)}
    market = json.dumps(D.get("pw") or {}, separators=(",", ":"))
    # audit P9: the market data moves out too. The pointer keeps its name, so a cached shell always finds the current
    # prices-<hash>.json even when a newer deploy replaced the old hashed file.
    srcd = re.search(r'const SRCDATES = (\{.*?\});\n\{ const day', html, re.S)
    assert srcd, "SRCDATES literal not found"
    prices = {k: D.pop(k) for k in PRICES if k in D}
    prices["srcd"] = json.loads(srcd.group(1))
    pblob = json.dumps(prices, separators=(",", ":"))
    pname = f"prices-{hashlib.sha1(pblob.encode()).hexdigest()[:10]}.json"
    D["lazy2"] = "prices.json"
    data = json.dumps(D, separators=(",", ":")).replace("<", "\\u003c")
    out = html[:m.start(2)] + data + html[m.end(2):]
    # boot: parse the shell data, fetch pointer + prices, merge, and only then run the app (wrapped below)
    boot = ('<script>\nwindow.__D = JSON.parse(document.getElementById("sitedata").textContent);\n'
            'window.D = window.__D;   // the app declares its own const D inside the wrapper; this one is for tests and the console\n'
            'window.__PRICES = (window.__D.lazy2 ? fetch(window.__D.lazy2, {cache: "no-store"})\n'
            '  .then(r => r.ok ? r.json() : null).then(m => m ? fetch(m.url).then(r => r.ok ? r.json() : null).then(p => {\n'
            '    if (p) { for (const k of m.keys) if (p[k]) Object.assign(window.__D[k] || (window.__D[k] = {}), p[k]); if (p.srcd) window.__SRCD = p.srcd }\n'
            '    return p }) : null) : Promise.resolve(null));\n'
            'window.__PRICES.catch(() => {});\n</script>\n')
    app = re.search(r'<script>\n(const D = JSON\.parse\(document\.getElementById\("sitedata"\)\.textContent\);)', out)
    assert app, "app script not found"
    out = out[:app.start()] + boot + '<script>\nwindow.__PRICES.then(() => {\nconst D = window.__D;\n' + out[app.end():]
    # the Credits source dates now arrive with the prices file
    out = out.replace('const SRCDATES = ' + srcd.group(1) + ';', 'const SRCDATES = window.__SRCD || {};', 1)
    assert 'const SRCDATES = window.__SRCD || {};' in out, "SRCDATES not relocated"
    i = out.rfind('</script>')
    out = out[:i] + '\nwindow.ASSETS = ASSETS;window.__BOOTED = true;});' + out[i:]
    head = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#7d58d6">\n'
            '<link rel="icon" href="icon-32.png" sizes="32x32">\n<link rel="icon" href="icon-192.png" sizes="192x192">\n<link rel="apple-touch-icon" href="icon-maskable.png">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="MS Classic">\n'
            # link previews in Discord etc. (blind-spot report B6, 2026-10-31): one site-wide card, hash pages share it
            '<meta property="og:type" content="website">\n<meta property="og:site_name" content="MS Classic World Data Slop">\n'
            '<meta property="og:title" content="MS Classic World Data Slop">\n'
            '<meta property="og:description" content="Planner, prices and grind tracker for MapleStory Classic World, built from the game files.">\n'
            '<meta property="og:image" content="https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/icon-512.png">\n'
            '<meta name="twitter:card" content="summary">\n<meta name="description" content="Planner, prices and grind tracker for MapleStory Classic World, built from the game files.">\n')
    assert "<title>" in out
    out = out.replace("<title>", head + "<title>", 1)
    return out, name, blob, pname, pblob, market

def main(dst):
    dst = pathlib.Path(dst); dst.mkdir(parents=True, exist_ok=True)
    html = (ROOT / "dist" / "index.html").read_text()
    out, name, blob, pname, pblob, market = split(html)
    (dst / "index.html").write_text(out); (dst / name).write_text(blob); (dst / pname).write_text(pblob)
    (dst / "prices.json").write_text(json.dumps({"url": pname, "keys": list(PRICES)}))
    (dst / "market.json").write_text(market)
    for f in ("manifest.webmanifest", "sw.js", "icon-32.png", "icon-192.png", "icon-512.png", "icon-maskable.png"): shutil.copy(ROOT / "src" / "pwa" / f, dst / f)
    kb = lambda s: f"{len(s.encode()) / 1024:.0f} KB ({len(gzip.compress(s.encode())) / 1024:.0f} KB gzip)"
    # page-weight limit (blind-spot report C1): fails the deploy if the first load grows past it. Now 1251 KB gzip; raise it on purpose.
    limit = int(os.environ.get("FIRST_LOAD_GZIP_KB", "1600")); got = len(gzip.compress(out.encode())) // 1024
    assert got <= limit, f"first load is {got} KB gzip, over the {limit} KB limit (scripts/pages_site.py)"
    print(f"first load: {kb(html)} -> {kb(out)}; {name} {kb(blob)} + {pname} {kb(pblob)} fetched after start")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site")
