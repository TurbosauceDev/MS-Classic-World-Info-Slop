"""GitHub Pages copy of the built page: python3 scripts/pages_site.py <out dir>   (pages.yml runs it; no vendor/, no PIL)

dist/index.html stays the one self-contained file (claude.ai artifact, file://). For Pages this script:
  - moves the item icons, minimaps and skill frames (D.iicons, D.mmaps, D.skanim: about half the page) into
    assets-<hash>.json behind a stable-named pointer assets.json — the same trick prices.json uses below — so a cached
    shell always finds the current file, even after a deploy renamed the hashed one (2026-11-02: cached shells met a 404
    there and every minimap read "No minimap in the game files"). The page fetches it right after it starts (00-core.js,
    D.lazy) and patches into anything already drawn. Icons Home shows stay inline.
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
LAZY = ("iicons", "mmaps", "skanim")   # skanim: skill preview frames (~1 MB), only the Skills page uses them
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
    D["lazy"] = {"url": "assets.json", "keys": list(LAZY)}   # stable pointer: the shell's bytes survive asset churn
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
    # boot: parse the shell data, fetch pointer + prices, merge, and only then run the app (wrapped below).
    # The chain ends .catch(() => null): only HTTP-error statuses became null before, so a transport-level
    # reject (offline first visit, connection reset mid-boot, truncated json) rejected __PRICES itself and the
    # whole app — living inside __PRICES.then — never ran (round 2: dead buttons, no error, no retry). The app
    # tolerates missing market data (54-invprice guards D.pw), so degrade to a no-prices boot instead.
    boot = ('<script>\nwindow.__D = JSON.parse(document.getElementById("sitedata").textContent);\n'
            'window.D = window.__D;   // the app declares its own const D inside the wrapper; this one is for tests and the console\n'
            'window.__DIR = new URL("./", location.href).href;   // the copy directory at boot: the address bar follows the open page later (00-routes.js), and these relative fetches must not chase it\n'
            # the app indexes several of these unguarded (D.ishop[id] in 49-items.js): a missing payload seeds
            # empties, so a no-prices boot is a real boot (a prices 404 could hit this even before the round-2 fix)
            'for (const k of ' + json.dumps(list(PRICES)) + ') window.__D[k] || (window.__D[k] = {});\n'
            'window.__PRICES = (window.__D.lazy2 ? fetch(new URL(window.__D.lazy2, window.__DIR), {cache: "no-store"})\n'
            '  .then(r => r.ok ? r.json() : null).then(m => m ? fetch(new URL(m.url, window.__DIR)).then(r => r.ok ? r.json() : null).then(p => {\n'
            '    if (p) { for (const k of m.keys) if (p[k]) Object.assign(window.__D[k] || (window.__D[k] = {}), p[k]); if (p.srcd) window.__SRCD = p.srcd }\n'
            '    return p }) : null) : Promise.resolve(null)).catch(() => null);\n</script>\n')
    app = re.search(r'<script>\n(const D = JSON\.parse\(document\.getElementById\("sitedata"\)\.textContent\);)', out)
    assert app, "app script not found"
    out = out[:app.start()] + boot + '<script>\nwindow.__PRICES.then(() => {\nconst D = window.__D;\n' + out[app.end():]
    # the Credits source dates now arrive with the prices file
    out = out.replace('const SRCDATES = ' + srcd.group(1) + ';', 'const SRCDATES = window.__SRCD || {};', 1)
    assert 'const SRCDATES = window.__SRCD || {};' in out, "SRCDATES not relocated"
    i = out.rfind('</script>')
    out = out[:i] + '\nwindow.ASSETS = ASSETS;window.__BOOTED = true;});' + out[i:]
    head = ('<link rel="manifest" href="/manifest.webmanifest">\n<meta name="theme-color" content="#7d58d6">\n'
            '<link rel="icon" href="/icon-32.png" sizes="32x32">\n<link rel="icon" href="/icon-192.png" sizes="192x192">\n<link rel="apple-touch-icon" href="/icon-maskable.png">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="MS Classic">\n'
            # root-absolute: the address bar follows the open page now (00-routes.js path healing), so relative links here
            # would resolve against whatever page's path the reader is on. The copy serves from its domain root.
            # link previews in Discord etc. (blind-spot report B6, 2026-10-31): one site-wide card, hash pages share it
            '<meta property="og:type" content="website">\n<meta property="og:site_name" content="MS Classic World Data Slop">\n'
            '<meta property="og:title" content="MS Classic World Data Slop">\n'
            '<meta property="og:description" content="Planner, prices and grind tracker for MapleStory Classic World, built from the game files.">\n'
            '<meta property="og:image" content="https://maplestory.scumlord.studio/icon-512.png">\n'   # the canonical host (00-routes.js, sitemap): the legacy github.io project URL breaks silently on a rename (round 2)
            '<meta name="twitter:card" content="summary">\n<meta name="description" content="Planner, prices and grind tracker for MapleStory Classic World, built from the game files.">\n')
    assert "<title>" in out
    out = out.replace("<title>", head + "<title>", 1)
    return out, name, blob, pname, pblob, market

def update_posts(html):
    """The built changelog's entries as the update-post list for news_pages, mirroring 77-journal.js's runtime
    slugs ("log-" + version-or-date, same character classes): [slug, ver, title, date, desc]."""
    i = html.find('<div class="changelog">')
    if i < 0:
        return []
    div = re.compile(r'<div\b|</div>')
    out, pos = [], html.find('<div class="card"', i)
    while pos >= 0:
        depth, m, end = 0, div.search(html, pos), pos
        while m:
            depth += 1 if m.group(0) == "<div" else -1
            if depth == 0:
                end = m.end(); break
            m = div.search(html, m.end())
        card = html[pos:end]
        t, h3 = re.search(r'data-t="([^"]+)"', card), re.search(r'<h3>(.*?)</h3>', card, re.S)
        ver = re.search(r'<span class="ver">(v[\d.]+)</span>', card)
        if t and h3:
            key = ver.group(1) if ver else t.group(1)
            txt = re.sub(r"<[^>]+>", "", h3.group(1))   # the built h3 carries the version span; the app reads textContent
            title = re.sub(r"^[A-Z][a-z]{2} \d{1,2}, \d{4} · ", "", re.sub(r"^v[\d.]+\s*", "", txt))
            body = re.sub(r"<[^>]+>", " ", card[card.find("</div>", card.find("cardhead") + 20):])
            out.append({"slug": "log-" + re.sub(r"[^\w]+", "-", key, flags=re.A).strip("-"),
                        "ver": ver.group(1) if ver else "", "title": title, "date": t.group(1)[:10],
                        "desc": re.sub(r"\s+", " ", body).strip()[:200]})
        pos = html.find('<div class="card"', end)
    return out


def main(dst):
    dst = pathlib.Path(dst); dst.mkdir(parents=True, exist_ok=True)
    html = (ROOT / "dist" / "index.html").read_text()
    out, name, blob, pname, pblob, market = split(html)
    import pages_gen   # static per-item/mob/map pages + sitemap (scripts/pages_gen.py)
    import posts       # src/posts parsing (the update pages' shared banner name lives in posts.UPDATES_IMG)
    D = json.loads(re.search(r'<script type="application/json" id="sitedata">(.*?)</script>', html, re.S).group(1))
    upd = update_posts(html)
    news, imgs = pages_gen.news_pages(D, upd)
    # an article's og:image points at a real URL (link previews skip data URIs), so the post image is copied out
    heads = {f"/news/{pathlib.Path(rel).stem}/": '<meta property="og:type" content="article">\n'
             f'<meta property="og:image" content="https://maplestory.scumlord.studio/{rel}">\n' for _src, rel in imgs}
    # the changelog posts share one banner: every update page's og:image points at it
    banner = next((rel for _src, rel in imgs if _src.name == posts.UPDATES_IMG.name), "")
    if upd and banner:
        heads.update({f"/news/{u['slug']}/": '<meta property="og:type" content="article">\n'
                      f'<meta property="og:image" content="https://maplestory.scumlord.studio/{banner}">\n' for u in upd})
        heads.pop("/news/" + posts.UPDATES_IMG.stem + "/", None)   # the shared banner's stem is not a page
    pages_gen.generate(D, dst, news=news, heads=heads)
    for src, rel in imgs:
        f = dst / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, f)
    (dst / "index.html").write_text(out); (dst / name).write_text(blob); (dst / pname).write_text(pblob)
    (dst / "assets.json").write_text(json.dumps({"url": name, "keys": list(LAZY)}))
    (dst / "prices.json").write_text(json.dumps({"url": pname, "keys": list(PRICES)}))
    (dst / "market.json").write_text(market)
    for f in ("manifest.webmanifest", "sw.js", "icon-32.png", "icon-192.png", "icon-512.png", "icon-maskable.png"): shutil.copy(ROOT / "src" / "pwa" / f, dst / f)
    kb = lambda s: f"{len(s.encode()) / 1024:.0f} KB ({len(gzip.compress(s.encode())) / 1024:.0f} KB gzip)"
    # page-weight limit (blind-spot report C1): fails the deploy if the first load grows past it. Now 1251 KB gzip; raise it on purpose.
    limit = int(os.environ.get("FIRST_LOAD_GZIP_KB", "1600")); got = len(gzip.compress(out.encode())) // 1024
    assert got <= limit, f"first load is {got} KB gzip, over the {limit} KB limit (scripts/pages_site.py)"
    print(f"first load: {kb(html)} -> {kb(out)}; {name} {kb(blob)} + {pname} {kb(pblob)} fetched after start (assets.json / prices.json name them)")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site")
