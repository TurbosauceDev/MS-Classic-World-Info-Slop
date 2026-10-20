"""GitHub Pages copy of the built page: python3 scripts/pages_site.py <out dir>   (pages.yml runs it; no vendor/, no PIL)

dist/index.html stays the one self-contained file (claude.ai artifact, file://). For Pages this script:
  - moves the item icons and minimaps (D.iicons, D.mmaps: about half the page) into assets-<hash>.json, which the page
    fetches right after it starts (00-core.js, D.lazy) and patches into anything already drawn. Icons Home shows stay inline.
  - adds the web app manifest, home-screen icons and the offline service worker (src/pwa/; sw.js registers only on *.github.io).
Prints first-load sizes (raw and gzip) before/after.
"""
import gzip, hashlib, json, pathlib, re, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
LAZY = ("iicons", "mmaps")

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
    data = json.dumps(D, separators=(",", ":")).replace("<", "\\u003c")
    out = html[:m.start(2)] + data + html[m.end(2):]
    head = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#7d58d6">\n'
            '<link rel="icon" href="icon-32.png" sizes="32x32">\n<link rel="icon" href="icon-192.png" sizes="192x192">\n<link rel="apple-touch-icon" href="icon-maskable.png">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="MS Classic">\n')
    assert "<title>" in out
    out = out.replace("<title>", head + "<title>", 1)
    return out, name, blob

def main(dst):
    dst = pathlib.Path(dst); dst.mkdir(parents=True, exist_ok=True)
    html = (ROOT / "dist" / "index.html").read_text()
    out, name, blob = split(html)
    (dst / "index.html").write_text(out); (dst / name).write_text(blob)
    for f in ("manifest.webmanifest", "sw.js", "icon-32.png", "icon-192.png", "icon-512.png", "icon-maskable.png"): shutil.copy(ROOT / "src" / "pwa" / f, dst / f)
    kb = lambda s: f"{len(s.encode()) / 1024:.0f} KB ({len(gzip.compress(s.encode())) / 1024:.0f} KB gzip)"
    print(f"first load: {kb(html)} -> {kb(out)}; {name} {kb(blob)} fetched after start")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site")
