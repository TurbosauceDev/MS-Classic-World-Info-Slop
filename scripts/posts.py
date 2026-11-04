"""Journal posts (Danny 2026-11-03): src/posts/*.md -> the POSTS list in src/js/77-journal.js, baked at build time.

File contract (docs/ai/journal.md; the Discord bridge writes the same files):
  a `---` front matter block with `title:` (required), `date:` YYYY-MM-DD (required, must match the file name's
  date), `author:` (optional, default "Turbozo"), then the body in a small markdown dialect:
  ## / ### headings, paragraphs, **bold**, *italic*, `code`, "- " lists, "> " quotes, [text](url) links, --- rules.
  The body is HTML-escaped before any formatting, so raw HTML in a post shows as plain text and can never render.

Auto links (Danny: "the auto links idea is great!"): monster, item, quest and skill names from the game data become
links to their clean pages (scripts/routes.py) on their FIRST mention in a post, never inside `code`, a heading or
an existing link, at most AUTO_LINK_CAP per post, and never for names under 4 letters. A name two entries share
resolves to that kind's "which one?" page.

Front matter may also carry `image:` (Turbozo 2026-11-04, the wowhead-style post format): a path under src/posts/
(e.g. `image: img/welcome-to-the-journal.jpg`), baked into the post as a data URI so the page stays self-contained.
build.py also replaces __AVATARS__ with avatars(): one sprite per poster (src/posts/avatars/<author>.png, lower-case
file name), so a card can wear its poster's avatar and a changelog entry can be a post by the site's own poster.

build.py replaces __POSTS__ with json([...]) (newest first). tests/posts_test.py checks the contract end to end.
"""
import base64 as _b64
import html as _html
import json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import routes as _routes

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "src" / "posts"
DEFAULT_AUTHOR = "Turbozo"
IMG_CAP = 200 * 1024  # a post's main image (baked in as a data URI) may not weigh more than this
IMG_MIME = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg"}
MIN_NAME = 4          # shorter names never link ("Heal" does, "HP" does not)
AUTO_LINK_CAP = 40    # a pathological body cannot turn into one giant link farm
KIND_ORDER = {"mob": 0, "item": 1, "quest": 2, "skill": 3}  # cross-kind name clash: monsters win, then items
FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$")


def _esc(s):
    return _html.escape(str(s), quote=True)


def parse_post(text, fname):
    """-> (meta dict, body markdown). Raises SystemExit with a file-named message on a broken contract."""
    bad = lambda msg: SystemExit(f"src/posts/{fname}: {msg}")
    m = re.match(r"\s*---\s*\n(.*?)\n---\s*\n?(.*)", text, re.S)
    if not m:
        raise bad("missing the --- front matter block (title, date, author)")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        k, _, v = line.partition(":")
        if not _ or not k.strip() or k.strip() != k.lower() or k.strip() not in ("title", "date", "author", "image"):
            raise bad(f"front matter line is not one of title/date/author/image: {line.strip()[:60]}")
        meta[k.strip()] = v.strip()
    if not meta.get("title"):
        raise bad("front matter needs a title:")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta.get("date", "")):
        raise bad('front matter needs a date: as YYYY-MM-DD')
    if not fname.startswith(meta["date"]):
        raise bad("file name must start with the front matter date (YYYY-MM-DD-slug.md)")
    body = m.group(2).strip()
    if not body:
        raise bad("the post body is empty")
    meta["author"] = meta.get("author") or DEFAULT_AUTHOR
    return meta, body


def _inline(s):
    """One already-escaped line: code spans first (protected), then links, bold, italic."""
    codes = []
    s = re.sub(r"`([^`]+)`", lambda m: (codes.append(m.group(1)), f"\x00{len(codes) - 1}\x00")[1], s)

    def link(m):
        t, u = m.group(1), m.group(2)
        if re.fullmatch(r"https?://[^)\s]+", u):
            return f'<a href="{u}" target="_blank" rel="noopener">{t}</a>'
        if u.startswith("/"):
            return f'<a href="{u}">{t}</a>'
        return t
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)
    return re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{codes[int(m.group(1))]}</code>", s)


def md_html(body):
    """The markdown dialect -> HTML. Everything is escaped first; the output carries no raw HTML from the post."""
    out, para, lst, quote = [], [], [], []

    def flush():
        if para: out.append("<p>" + _inline(" ".join(para)) + "</p>"); para.clear()
        if lst: out.append("<ul>" + "".join(f"<li>{_inline(x)}</li>" for x in lst) + "</ul>"); lst.clear()
        if quote: out.append("<blockquote><p>" + _inline(" ".join(quote)) + "</p></blockquote>"); quote.clear()

    for line in body.splitlines():
        raw = line.rstrip()
        s = _esc(raw)   # markers are tested on the raw line; content is escaped ("> " would read "&gt; " after _esc)
        if not raw.strip(): flush()
        elif re.fullmatch(r"-{3,}", raw.strip()): flush(); out.append("<hr>")
        elif raw.startswith("### "): flush(); out.append("<h3>" + _inline(_esc(raw[4:])) + "</h3>")
        elif raw.startswith("## "): flush(); out.append("<h2>" + _inline(_esc(raw[3:])) + "</h2>")
        elif raw.startswith("- "):
            if para or quote: flush()
            lst.append(_esc(raw[2:]))
        elif raw.startswith("> "):
            if para or lst: flush()
            quote.append(_esc(raw[2:]))
        else:
            if lst or quote: flush()
            para.append(s.strip())
    flush()
    return "\n".join(out)


def name_paths(D):
    """lower-case name -> (display name, clean path, kind, id). Names two entries share resolve to the
    "which one?" page. kind+id ride along so the anchor can carry data-ent="kind:id" for the hover tooltip."""
    R = _routes.Routes(D)
    by_name = {}
    for e in R.ents:
        if e["kind"] in KIND_ORDER and len(e["name"]) >= MIN_NAME:
            by_name.setdefault(e["name"].lower(), []).append(e)
    out = {}
    for low, es in by_name.items():
        es.sort(key=lambda e: KIND_ORDER[e["kind"]])
        top = es[0]
        same = [e for e in es if e["kind"] == top["kind"]]
        plain = f"/{_routes.KINDS[top['kind']]}/{top['parent']}{top['slug']}/"
        if len(same) > 1 and plain in R.disambig:
            path = plain
        elif top["kind"] == "skill" and len(same) > 1 and f"/skills/{top['slug']}/" in R.disambig:
            path = f"/skills/{top['slug']}/"
        else:
            path = top["canon"]
        out[low] = (top["name"], path, top["kind"], top["id"])
    return out


_TAG = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(/?)>")


def auto_link(html, paths, cap=AUTO_LINK_CAP):
    """Link the first mention of each known name, outside a/code/h2-h4 elements."""
    if not paths:
        return html
    pat = re.compile(r"(?<!\w)(" + "|".join(re.escape(name) for name, _, _, _ in sorted(paths.values(), key=lambda x: -len(x[0]))) + r")(?!\w)", re.I)
    state, out, pos = {"skip": 0, "count": 0, "used": set()}, [], 0

    def seg(s):
        if state["skip"] or state["count"] >= cap: return s
        def rep(m):
            if state["count"] >= cap: return m.group(0)
            low = m.group(0).lower()
            if low in state["used"]: return m.group(0)
            state["used"].add(low); state["count"] += 1
            return f'<a href="{paths[low][1]}" data-ent="{paths[low][2]}:{paths[low][3]}">{m.group(0)}</a>'
        return pat.sub(rep, s)

    for m in _TAG.finditer(html):
        out.append(seg(html[pos:m.start()]))
        closing, tag, selfclose = m.group(1), m.group(2).lower(), m.group(3)
        if tag in ("a", "code", "h1", "h2", "h3", "h4") and not selfclose:
            state["skip"] += 1 if not closing else -1
            state["skip"] = max(0, state["skip"])
        out.append(m.group(0)); pos = m.end()
    out.append(seg(html[pos:]))
    return "".join(out)


def _data_uri(p, fname, base=None):
    """An image file under the posts dir as a data URI (the page is one self-contained file)."""
    bad = lambda msg: SystemExit(f"src/posts/{fname}: {msg}")
    rel = pathlib.PurePosixPath(p)
    if rel.is_absolute() or ".." in rel.parts:
        raise bad(f"image: must be a repo-relative path under src/posts/ (got {p!r})")
    if re.search(r"^[a-z-]+:", p):
        raise bad("image: must be a file under src/posts/ (remote URLs would break the self-contained page)")
    f = (base or POSTS_DIR) / p
    if not f.is_file():
        raise bad(f"image: file not found: {p} (put it in src/posts/img/ and commit it)")
    data = f.read_bytes()
    if len(data) > IMG_CAP:
        raise bad(f"image: {p} is {len(data) // 1024} KB, over the {IMG_CAP // 1024} KB cap (resize/compress it)")
    mime = next((m for magic, m in IMG_MIME.items() if data.startswith(magic)), None)
    if not mime:
        raise bad(f"image: {p} is not a PNG or JPEG file")
    return f"data:{mime};base64," + _b64.b64encode(data).decode()


def avatars(pdir=None):
    """poster avatars: src/posts/avatars/<author>.png (lower-case file name) -> {author: data URI}.
    A post whose author has no file renders a letter chip instead (77-journal.js)."""
    d = pathlib.Path(pdir) if pdir else POSTS_DIR / "avatars"
    out = {}
    for f in sorted(d.glob("*.png")) if d.is_dir() else []:
        data = f.read_bytes()
        if len(data) > 20 * 1024:
            raise SystemExit(f"src/posts/avatars/{f.name}: {len(data) // 1024} KB - an avatar rides the whole page, keep it under 20 KB")
        out[f.stem.lower()] = "data:image/png;base64," + _b64.b64encode(data).decode()
    return out


def _excerpt(html, n=200):
    text = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", html))).strip()
    if len(text) <= n: return text
    return text[:n].rsplit(" ", 1)[0].rstrip(" ,.;:") + " …"


def load(D, pdir=None):
    """Every post, newest first. One broken file fails the build on purpose (the bridge learns immediately)."""
    pdir = pathlib.Path(pdir) if pdir else POSTS_DIR
    files = sorted(p for p in pdir.glob("*.md")) if pdir.is_dir() else []
    paths = name_paths(D)
    posts, seen = [], set()
    for f in files:
        if not FILE_RE.fullmatch(f.name):
            raise SystemExit(f"src/posts/{f.name}: file name must be YYYY-MM-DD-slug.md (lower case, dashes)")
        meta, body = parse_post(f.read_text(), f.name)
        slug = f.name[len(meta["date"]) + 1:-3]
        if slug in seen:
            raise SystemExit(f"src/posts/{f.name}: duplicate slug {slug}")
        seen.add(slug)
        html = auto_link(md_html(body), paths)
        posts.append({"slug": slug, "title": meta["title"], "date": meta["date"], "author": meta["author"],
                      "html": html, "excerpt": _excerpt(html),
                      "img": _data_uri(meta["image"], f.name, pdir) if meta.get("image") else ""})
    posts.sort(key=lambda p: (p["date"], p["slug"]), reverse=True)
    return posts


def inject(D):
    """The __POSTS__ literal for build.py."""
    return json.dumps(load(D), separators=(",", ":"), ensure_ascii=False)
