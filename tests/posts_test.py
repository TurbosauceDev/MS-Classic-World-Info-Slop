#!/usr/bin/env python3
"""Run: python3 tests/posts_test.py (CI: tests.yml core shard). The journal post pipeline (scripts/posts.py):
front matter contract, the markdown dialect, HTML escaping (raw HTML can never render), auto links (first
mention only, never inside code/a/heading, capped, clean paths that routes.py really serves), and load()'s
ordering over the real src/posts/ directory."""
import json, pathlib, re, shutil, subprocess, sys, tempfile

R = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
import posts

D = json.loads((R / "data" / "data.json").read_text())
ok = 0
def check(cond, msg):
    global ok
    if not cond: raise SystemExit(f"FAILED: {msg}")
    ok += 1; print("ok ", msg)

# ---- front matter contract
tmp = pathlib.Path(tempfile.mkdtemp())
def post(text, name = "2026-11-03-test-post.md"):
    f = tmp / name; f.write_text(text); return f
for text, why in [
    ("no front matter here", "missing block rejected"),
    ("---\nauthor: X\n---\nbody", "missing title rejected"),
    ("---\ntitle: T\ndate: 11-03-2026\n---\nbody", "bad date rejected"),
    ("---\ntitle: T\ndate: 2026-11-04\n---\nbody", "file name date must match front matter"),
    ("---\ntitle: T\ndate: 2026-11-03\n---\n", "empty body rejected"),
    ("---\ntitle: T\ndate: 2026-11-03\nprotocol: hybrid\n---\nbody", "unknown front matter key rejected"),
]:
    try:
        posts.parse_post(text, "2026-11-03-test-post.md"); check(False, why)
    except SystemExit as e:
        check(str(e).startswith("src/posts/2026-11-03-test-post.md: "), why + " (message names the file)")
meta, body = posts.parse_post("---\ntitle: Hi there\ndate: 2026-11-03\n---\nhello", "2026-11-03-x.md")
check(meta["author"] == posts.DEFAULT_AUTHOR and meta["title"] == "Hi there", "author defaults, title kept")
meta, _ = posts.parse_post("---\ntitle: T\ndate: 2026-11-03\ntags: Maple News, Guide\nfeatured: true\n---\nbody", "2026-11-03-x.md")
check(meta["tags"] == ["Maple News", "Guide"] and meta["featured"] is True, "tags parse into a list, featured: true reads as true")
meta, _ = posts.parse_post("---\ntitle: T\ndate: 2026-11-03\n---\nbody", "2026-11-03-x.md")
check(meta["tags"] == [posts.DEFAULT_TAG] and meta["featured"] is False, "a post without tags defaults to Blog Post, featured off")
for text, why in [
    ("---\ntitle: T\ndate: 2026-11-03\nfeatured: maybe\n---\nbody", "non-boolean featured rejected"),
    ("---\ntitle: T\ndate: 2026-11-03\ntags: ,,\n---\nbody", "an empty tags list falls through to the default"),
]:
    if why.startswith("non-boolean"):
        try:
            posts.parse_post(text, "2026-11-03-test-post.md"); check(False, why)
        except SystemExit as e:
            check(str(e).startswith("src/posts/2026-11-03-test-post.md: "), why + " (message names the file)")
    else:
        meta, _ = posts.parse_post(text, "2026-11-03-test-post.md")
        check(meta["tags"] == [posts.DEFAULT_TAG], why)

# ---- markdown dialect + escaping
h = posts.md_html("<script>alert(1)</script> & **bold** *it* `a*b`")
check("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; <strong>bold</strong> <em>it</em> <code>a*b</code></p>" in h,
      "raw HTML shows as text; bold, italic and code render; code blocks other marks")
h = posts.md_html("## Big\n### Small\n- one\n- two\n> quoted\n---\ntext")
check("<h2>Big</h2>" in h and "<h3>Small</h3>" in h and "<ul><li>one</li><li>two</li></ul>" in h
      and "<blockquote><p>quoted</p></blockquote>" in h and "<hr>" in h and h.endswith("<p>text</p>"),
      "headings, lists, quotes, rules, closing paragraph")
h = posts.md_html("see [the site](https://maplestory.scumlord.studio/) and [local](/items/work-gloves/) and [junk](javascript:alert(1))")
check('<a href="https://maplestory.scumlord.studio/" target="_blank" rel="noopener">the site</a>' in h
      and '<a href="/items/work-gloves/">local</a>' in h and "javascript:alert(1)" not in h,
      "links: https gets rel/target, site-relative stays, other schemes dropped")

# ---- auto links over real game data
paths = posts.name_paths(D)
check(paths.get("blue snail") == ("Blue Snail", "/monsters/blue-snail/", "mob", "3"), "monster name -> clean page + kind:id for the tooltip")
check(paths.get("work gloves") == ("Work Gloves", "/items/work-gloves/", "item", "1082000"), "item name -> clean page + kind:id")
check(paths.get("heal") is None or len(paths["heal"][0]) >= 4, "short names never enter the map")
out = posts.auto_link("<p>Blue Snail then blue SNAIL then Blue Snails</p>", paths)
check(out.count("<a ") == 1 and "blue SNAIL</a>" not in out and "Blue Snails</a>" not in out, "first mention only, any casing; plurals stay text")
out = posts.auto_link("<h2>Blue Snail</h2><p>run <code>Blue Snail</code> at <a href=\"/x\">Blue Snail</a> home. Blue Snail!</p>", paths)
check(out.count('<a href="/monsters/blue-snail/" data-ent="mob:3">') == 1 and "<h2>Blue Snail</h2>" in out and "<code>Blue Snail</code>" in out,
      "headings, code and existing links are skipped; the anchor carries data-ent for the hover tooltip")
cap = {f"mobname{i:02d}": (f"mobname{i:02d}", f"/monsters/mobname{i:02d}/", "mob", str(i)) for i in range(50)}
check(posts.auto_link("<p>" + " ".join(f"mobname{i:02d}" for i in range(50)) + "</p>", cap).count("<a ") == posts.AUTO_LINK_CAP,
      f"link count is capped at {posts.AUTO_LINK_CAP}")
Rt = __import__("routes").Routes(D)
sample = next((v for v in paths.values() if v[1] in Rt.disambig), None)
check(sample is not None and all(v[1] in Rt.by_canon or v[1] in Rt.disambig for v in paths.values()),
      'every link target is a path routes.py serves (canon or "which one?")')

# ---- the post format's main image (Turbozo 2026-11-04): image: front matter bakes a data URI
def _png():   # a real 1x1 PNG, no PIL: sig + IHDR + IDAT + IEND
    import struct, zlib
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))
PNG = _png()
tmp2 = pathlib.Path(tempfile.mkdtemp())
(tmp2 / "img").mkdir()
(tmp2 / "img" / "pic.png").write_bytes(PNG)
def wimgpost(img):
    f = tmp2 / "2026-11-03-x.md"
    f.write_text("---\ntitle: T\ndate: 2026-11-03\nimage: " + img + "\n---\nbody")
    return f
for img, why in [("img/missing.png", "missing image file rejected"),
                 ("https://x.example/a.png", "remote image URL rejected"),
                 ("../out.png", "escaping path rejected")]:
    wimgpost(img)
    try:
        posts.load(D, tmp2); check(False, why)
    except SystemExit as e:
        check(str(e).startswith("src/posts/2026-11-03-x.md: "), why + " (message names the file)")
meta, _ = posts.parse_post(wimgpost("img/pic.png").read_text(), "2026-11-03-x.md")
check(meta.get("image") == "img/pic.png", "image: is an accepted front matter key")
one = posts.load(D, tmp2)
check(one and one[0]["img"].startswith("data:image/png;base64,"), "load() bakes the post image as a data URI")
check(one[0]["imgfile"] == "img/pic.png", "load() keeps the image's repo path for the Pages copy (og:image)")
(tmp2 / "img" / "pic.png").unlink()
(tmp2 / "2026-11-03-x.md").write_text("---\ntitle: T\ndate: 2026-11-03\n---\nbody")
check(posts.load(D, tmp2)[0]["img"] == "" and posts.load(D, tmp2)[0]["imgfile"] == "", "a post without image: carries an empty img and imgfile")

# ---- poster avatars (Turbozo's green Slime, the site updates' Orange Mushroom)
avs = tmp2 / "avatars"; avs.mkdir()
(avs / "Turbozo.png").write_bytes(PNG)
(avs / "glorg.png").write_bytes(PNG)
av = posts.avatars(avs)
check(set(av) == {"turbozo", "glorg"} and all(v.startswith("data:image/png;base64,") for v in av.values()),
      "avatars(): file stems lower-cased into data URIs (poster files in src/posts/avatars/)")
(avs / "big.png").write_bytes(PNG + b"0" * (21 * 1024))
try:
    posts.avatars(avs); check(False, "oversized avatar rejected")
except SystemExit as e:
    check("src/posts/avatars/big.png" in str(e), "an avatar over 20 KB fails the build (it rides the whole page)")

# ---- load() over the real posts directory
got = posts.load(D)
check(len(got) >= 1, f"the real src/posts parses ({len(got)} post(s))")
check(all(set(p) == {"slug", "title", "date", "author", "html", "excerpt", "img", "imgfile", "tags", "featured"} for p in got), "post shape")
check(all(isinstance(p["tags"], list) and p["tags"] and all(isinstance(t, str) and t for t in p["tags"]) for p in got), "every post carries a non-empty tag list")
check(sum(1 for p in got if p["featured"]) == 1, "one sample post ships featured (the feed's hero has content)")
j = json.loads(posts.inject(D))
check(isinstance(j, list) and len(j) == len(got), "inject() is the JSON list build.py bakes")
check(all("imgfile" not in x for x in j), "inject() strips imgfile (the baked page needs no repo paths)")
check([p["date"] for p in got] == sorted((p["date"] for p in got), reverse=True), "newest first")
check(len({p["slug"] for p in got}) == len(got), "slugs unique")
check(all(len(p["excerpt"]) <= 210 and "<" not in p["excerpt"] for p in got), "excerpts are short plain text")
check(sum(1 for p in got if p["img"].startswith("data:image/")) == 2, "the two sample posts ship with their main images")
Rt2 = __import__("routes").Routes(D)
bad = [a for p in got for a in re.findall(r'href="([^"]+)"', p["html"]) if a.startswith("/") and a not in Rt2.by_canon and a not in Rt2.disambig]
check(not bad, f"every auto link in the shipped posts resolves ({bad[:2]})")
check(all(set(p) == {"slug", "title", "date", "author", "html", "excerpt", "img", "tags", "featured"} for p in j), "the baked post shape matches what 77-journal.js reads")

shutil.rmtree(tmp)
print(f"posts test passed ({ok} checks)")
