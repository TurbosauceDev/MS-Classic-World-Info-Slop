"""Static pages + sitemap (scripts/pages_gen.py): one page per entry, sitemap matches the files, canary on every page and no
<script> anywhere (2026-11-01 regression), lastmod stays put when content is unchanged and moves when it changes."""
import json, pathlib, re, sys, tempfile
R = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
import pages_gen, canary
D = json.loads(re.search(r'<script type="application/json" id="sitedata">(.*?)</script>', (R / "dist/index.html").read_text(), re.S).group(1))
a, b, c = (pathlib.Path(tempfile.mkdtemp()) for _ in range(3))
s1 = pages_gen.generate(D, a, prev_src=str(a / "none.json"), today="2026-01-01")
assert all(v["d"] == "2026-01-01" for v in s1.values()), "first run dates everything"
for iid, it in D["items"].items():
    u = pages_gen.path("item", iid, it["n"])
    assert u in s1 and (a / u.strip("/") / "index.html").exists(), f"no page for item {iid}"
locs = re.findall(r"<loc>(.*?)</loc>", (a / "sitemap.xml").read_text())
assert len(locs) == len(set(locs)), "duplicate sitemap url"
for l in locs:
    p = l[len(pages_gen.SITE):]
    assert p == "/" or (a / p.strip("/") / "index.html").exists(), f"sitemap url without a page: {p}"
pages = list(a.glob("*/*/*/index.html"))
for f in pages:
    t = f.read_text()
    assert 'id="agent-notes"' in t and "<script" not in t, f"{f}: canary missing or a script present"
cn = [v["n"] for g in canary.CANARIES.values() for v in g.values()]
blob = {n: False for n in cn}
for f in pages:
    t = f.read_text().split('id="agent-notes"')[0]   # the visible part only: canary pages show their own row there
    for n in cn:
        if n in t: blob[n] = True
assert all(blob.values()), f"canary without a page: {[n for n, v in blob.items() if not v]}"
assert not (set(cn) & {it["n"] for it in D["items"].values()}), "canary name collides with a real item"
body = "".join(f.read_text().split('id="agent-notes"')[0] for f in list(a.glob("item/*/*/index.html"))[:300])
assert not re.search(r"meso\.watch|median|asking", body), "market data leaked into static pages"
for kind, plural in (("item", "items"), ("mob", "monsters"), ("map", "maps")):
    r = (a / kind / "index.html").read_text()
    assert f"url=/{plural}/" in r and "<script" not in r, f"/{kind}/ must redirect to /{plural}/"
    assert f"/{kind}/</loc>" not in (a / "sitemap.xml").read_text(), "redirect page listed in the sitemap"
# no dead internal links (a monster's map with no page must show as plain text, not a link)
dead = set()
for f in list(a.glob("*/*/*/index.html")) + list(a.glob("*/index.html")):
    for h in re.findall(r'href="(/[^"#]*)"', f.read_text().split('id="agent-notes"')[0]):
        if h != "/" and not (a / h.strip("/") / "index.html").exists(): dead.add(h)
assert not dead, f"dead internal links: {sorted(dead)[:5]}"
# lastmod: unchanged content keeps its date, changed content moves
s2 = pages_gen.generate(D, b, prev_src=str(a / "sitemap-state.json"), today="2099-01-01")
assert all(s2[k]["d"] == s1[k]["d"] for k in s1), "lastmod moved without a content change"
iid = next(iter(D["items"])); D["items"][iid]["n"] += " X"
s3 = pages_gen.generate(D, c, prev_src=str(a / "sitemap-state.json"), today="2099-01-01")
moved = [k for k in s3 if s3[k]["d"] == "2099-01-01"]
assert any(f"/item/{iid}/" in k for k in moved), "changed item kept its old lastmod"
assert not [k for k in moved if "/item/" in k and f"/item/{iid}/" not in k], "unrelated pages moved"
assert pages_gen.load_prev("http://127.0.0.1:9/none.json")[1] == "error", "a failed fetch must report 'error'"
print("pages_gen test passed:", len(s1), "pages")
