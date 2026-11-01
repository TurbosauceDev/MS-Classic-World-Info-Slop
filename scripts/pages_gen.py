"""Static per-item / per-monster / per-map pages + sitemap for the Pages copy (python3 scripts/pages_site.py calls generate()).

Why: the planner is one hash-routed page, so search engines and link previews see only the shell. This writes a small real
HTML page per entry (/item/<id>/<slug>/, /mob/..., /map/...), three browse indexes, sitemap.xml, robots.txt and
sitemap-state.json. Pages carry game data only (OSMS export; drop reports are meowdb net player votes). No market prices:
those change every poll and would make every page "modified" on every deploy.

lastmod is honest: each page's content hash is kept in sitemap-state.json, published with the site. The next deploy fetches
the live copy (SITEMAP_PREV = url or file path), keeps the old date when the hash is unchanged and writes today's date when
it changed. First run (404) dates everything today. A failed fetch writes no date at all (entries keep d = null until their
content next changes), so a network blip can never reset dates.

Canary: every page carries the hidden agent-notes block (scripts/canary.py, no <script>), and the canary rows also get real
pages that only the sitemap lists (nothing on the site links to them), so a crawler that ingests sitemap URLs picks them up.
"""
import struct, hashlib, html, json, os, re, unicodedata, urllib.request, urllib.error, base64, datetime, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import canary

SITE = os.environ.get("SITE_URL", "https://maplestory.scumlord.studio").rstrip("/")
NAME = "MS Classic World Data Slop"
STATNAME = {"incSTR": "STR", "incDEX": "DEX", "incINT": "INT", "incLUK": "LUK", "incMHP": "MaxHP", "incMMP": "MaxMP",
            "incPAD": "Weapon Attack", "incMAD": "Magic Attack", "incPDD": "Weapon Defense", "incMDD": "Magic Defense",
            "incACC": "Accuracy", "incEVA": "Avoidability", "incSpeed": "Speed", "incJump": "Jump",
            "incCRD": "Critical Damage %", "incCR": "Critical Rate %"}
e = lambda s: html.escape(str(s), quote=True)
fmt = lambda n: f"{n:,}" if isinstance(n, int) else str(n)


def slug(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "page"


def hashlink(key, val):
    """#i=<base64url(JSON)>: the planner's own share-link format (00-core.js HASH)."""
    return key + "=" + base64.urlsafe_b64encode(json.dumps(str(val)).encode()).decode().rstrip("=")


def path(kind, id_, name):
    return f"/{kind}/{id_}/{slug(name)}/"


CSS = """
:root{--bg:#e7ddf9;--panel:#f7f1ff;--ink:#2a2142;--muted:#685c94;--line:#cfbff0;--accent:#7d58d6;--accent-soft:#dccbfa;--on-accent:#f7f1ff;
--shadow:0 1px 2px rgba(0,0,0,.14),0 8px 18px -12px rgba(0,0,0,.35);
--f-display:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;--f-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media(prefers-color-scheme:dark){:root{--bg:#1f1931;--panel:#2a2243;--ink:#f0eafd;--muted:#b6aad8;--line:#453a64;--accent:#d2bffb;--accent-soft:#41346a;--on-accent:#2a2243;
--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 18px -12px rgba(0,0,0,.7);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 var(--f-body)}
.wrap{max-width:820px;margin:0 auto;padding-block:20px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:18px}
.top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;justify-content:space-between}
.brand{font:800 18px var(--f-display);color:var(--accent);text-decoration:none}
.top nav{display:flex;flex-wrap:wrap;gap:8px}
.top nav a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);text-decoration:none;font-size:14.5px;font-weight:500}
.top nav a:hover,.top nav a:focus-visible{background:var(--accent-soft)}
a{color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow);min-width:0}
.hero{display:flex;gap:16px;align-items:center}
.hero .spr{flex:none;padding:10px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
h1{margin:0;font:800 clamp(26px,4.4vw,38px)/1.15 var(--f-display);text-wrap:balance}
h2{margin:0 0 10px;font:800 20px var(--f-display);text-wrap:balance}
.chip{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:var(--accent-soft);font-size:13.5px;font-weight:600}
.sub{color:var(--muted);font-size:13.5px}.note{color:var(--muted);font-size:14.5px;max-width:78ch;margin:10px 0 0}
.desc{margin:0;max-width:68ch}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
.fact{margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);min-width:0}
.fact dt{font:600 12px var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.fact dd{margin:2px 0 0;font:500 16px var(--f-mono);overflow-wrap:anywhere}
.rows{list-style:none;margin:0;padding:0;display:grid}
.rows li{display:flex;gap:10px;align-items:center;padding:7px 2px;border-top:1px solid var(--line)}.rows li:first-child{border-top:0}
.rows a{font-weight:500;overflow-wrap:anywhere}.rows .val{margin-left:auto;font:13px var(--f-mono);color:var(--muted);white-space:nowrap}
.rows .spr{flex:none;height:40px;width:auto;max-width:56px;object-fit:contain}
.cols{columns:230px;column-gap:24px;margin:0;padding:0;list-style:none}.cols li{break-inside:avoid;padding:3px 0}
.btn{display:inline-block;padding:9px 16px;border-radius:9px;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600}
.btn:hover,.btn:focus-visible{filter:brightness(1.08)}
.spr{image-rendering:pixelated;display:block}
footer{font-size:13.5px;color:var(--muted);max-width:70ch}
"""
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800'
         '&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">')


def shell(title, desc, canon, body, extra_head=""):
    return (f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f'<title>{e(title)} · {NAME}</title><meta name="description" content="{e(desc)}">\n'
            f'<link rel="canonical" href="{e(SITE + canon)}"><meta property="og:title" content="{e(title)}">'
            f'<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{e(SITE + canon)}">\n'
            f'<meta name="theme-color" content="#7d58d6">{FONTS}<style>{CSS}</style>{extra_head}</head><body><div class="wrap">\n'
            f'<header class="top"><a class="brand" href="/">{NAME}</a><nav aria-label="Browse"><a href="/items/">Items</a><a href="/monsters/">Monsters</a><a href="/maps/">Maps</a></nav></header>\n'
            f'{body}\n<footer>Unofficial fan site for MapleStory Classic World, not affiliated with Nexon. '
            f'Game data from the OSMS export; drop reports from meowdb players.</footer></div>\n{{CANARY}}</body></html>\n')


def sprite(b64, scale=2):
    """Real game sprite (OSMS export) as an inline PNG, drawn at scale x its size."""
    if not b64: return ""
    try:
        w, h = struct.unpack(">II", base64.b64decode(b64[:48])[16:24])
    except Exception:
        w = h = 32
    return f'<img class="spr" src="data:image/png;base64,{b64}" alt="" width="{w * scale}" height="{h * scale}">'


def facts(rows):
    cells = "".join(f'<div class="fact"><dt>{e(k)}</dt><dd>{v}</dd></div>' for k, v in rows if v not in (None, "", []))
    return f'<dl class="facts">{cells}</dl>' if cells else ""


def hero(name, chip, spr=""):
    return f'<section class="card hero">{spr}<div><h1>{e(name)}</h1><span class="chip">{e(chip)}</span></div></section>'


def card(title, inner, note=""):
    return f'<section class="card"><h2>{e(title)}</h2>{inner}' + (f'<p class="note">{note}</p>' if note else "") + "</section>"


def rows(entries):
    """entries: [(html link, value text, sprite html)]"""
    return '<ul class="rows">' + "".join(f'<li>{s}{a}' + (f'<span class="val">{e(v)}</span>' if v != "" else "") + "</li>" for a, v, s in entries) + "</ul>"


VOTES = "Player-reported by meowdb users. The number is net votes, not a drop rate."


def item_kind(it):
    if it.get("c") == "Equipment": return it.get("s") or "Equipment"
    if it.get("c") == "Scroll" and it.get("s"): return f"Scroll for {it['s']}"
    return it.get("c") or "Other"


def build(D):
    """-> {url path: (title, description, body html)} for real pages."""
    items, mobdb, maps, mobs = D["items"], D["mobdb"], D["maps"], D["mobs"]
    icons, mobimg = D.get("iicons") or {}, D.get("mobimg") or {}
    pages = {}
    # who drops what (meowdb net votes), and which maps hold which monster
    dropped_by = {}
    for mid, m in mobdb.items():
        for row in m.get("dr") or []:
            if isinstance(row, list) and len(row) >= 3 and isinstance(row[0], str):
                dropped_by.setdefault(row[0], []).append((mid, m["name"], row[2]))
    open_maps = {mid: m for mid, m in maps.items() if m[1]}
    mob_name = lambda mid: (mobdb.get(str(mid)) or {}).get("name") or (mobs.get(str(mid)) or [None])[0]
    go = lambda key, val, label="Open in the planner": f'<p><a class="btn" href="/#{hashlink(key, val)}">{label}</a></p>' if key else f'<p><a class="btn" href="/#{val}">{label}</a></p>'

    for iid, it in items.items():
        st = it.get("st") or {}
        kind = item_kind(it)
        stats = "; ".join(f"{l} +{st[k]}" for k, l in STATNAME.items() if st.get(k))
        reqs = ", ".join(f"{k[3:]} {st[k]}" for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK") if st.get(k))
        drops = sorted(dropped_by.get(iid, []), key=lambda r: -r[2])
        job = it.get("job") if it.get("c") == "Equipment" else ""
        body = (hero(it["n"], kind, sprite(icons.get(iid)))
                + (f'<section class="card"><p class="desc">{e(it["d"])}</p></section>' if it.get("d") else "")
                + (f'<section class="card">{facts([("Job", e(job)), ("Required level", st.get("reqLevel")), ("Requires", e(reqs)), ("Stats", e(stats)), ("Upgrade slots", st.get("tuc")), ("Attack speed", e(it.get("spd") or "")), ("NPC buys for", (fmt(it["p"]) + " mesos") if it.get("p") else "")])}</section>'
                   if any((job, st.get("reqLevel"), reqs, stats, st.get("tuc"), it.get("spd"), it.get("p"))) else "")
                + (card("Monsters that drop it", rows([(f'<a href="{path("mob", mid, n)}">{e(n)}</a>', f"{v} votes", sprite(mobimg.get(mid), 1)) for mid, n, v in drops]), VOTES) if drops else "")
                + go("i", iid))
        bits = [kind, f"Lv {st['reqLevel']}" if st.get("reqLevel") else None, stats or None,
                f"NPC price {fmt(it['p'])} mesos" if it.get("p") else None]
        desc = f"{it['n']} in MapleStory Classic World: " + ", ".join(b for b in bits if b) + "."
        pages[path("item", iid, it["n"])] = (it["n"], desc, body)

    for mid, m in mobdb.items():
        dr = sorted((r for r in (m.get("dr") or []) if isinstance(r, list) and len(r) >= 3 and isinstance(r[0], str) and r[0] in items), key=lambda r: -r[2])
        ml = [(f'<a href="{path("map", r[0], open_maps[str(r[0])][0])}">{e(open_maps[str(r[0])][0])}</a>' if str(r[0]) in open_maps else f'<span class="sub">{e(r[1])}</span>', "", "") for r in (m.get("maps") or [])]
        body = (hero(m["name"], f"Monster · level {m['level']}", sprite(mobimg.get(mid), 2))
                + f'<section class="card">{facts([("Level", m["level"]), ("HP", fmt(m["hp"])), ("MP", fmt(m.get("mp"))), ("EXP", fmt(m["exp"])), ("Weapon attack", m.get("PADamage")), ("Weapon defense", m.get("PDDamage")), ("Accuracy", m.get("acc")), ("Speed", m.get("speed"))])}</section>'
                + (card("Found in", rows(ml)) if ml else "")
                + (card("Drops", rows([(f'<a href="{path("item", r[0], items[r[0]]["n"])}">{e(items[r[0]]["n"])}</a>', f"{r[2]} votes", sprite(icons.get(r[0]), 1)) for r in dr]), VOTES) if dr else "")
                + go("m", mid))
        desc = f"{m['name']} in MapleStory Classic World: level {m['level']}, {fmt(m['hp'])} HP, {fmt(m['exp'])} EXP."
        pages[path("mob", mid, m["name"])] = (m["name"], desc, body)

    for mid, (name, _o, spawns, *_r) in open_maps.items():
        ms = [(f'<a href="{path("mob", s[0], mob_name(s[0]))}">{e(mob_name(s[0]))}</a>', f"× {s[1]}", sprite(mobimg.get(str(s[0])), 1))
              for s in spawns if mob_name(s[0]) and str(s[0]) in mobdb]
        body = (hero(name, f"Map · id {mid}")
                + (card("Monsters", rows(ms)) if ms else card("Monsters", '<p class="desc">No monsters spawn here.</p>'))
                + go(None, "g=wmap", "Open the World Map"))
        desc = f"{name} in MapleStory Classic World" + (f": {len(spawns)} monster type{'s' if len(spawns) != 1 else ''}." if spawns else ".")
        pages[path("map", mid, name)] = (name, desc, body)
    return pages


def canary_pages():
    """Real pages for the fake canary rows. Only sitemap.xml lists them."""
    out = {}
    for grp, kind in (("items", "item"), ("maps", "map"), ("mobs", "mob"), ("npcs", "npc"), ("quests", "quest")):
        for cid, c in canary.CANARIES.get(grp, {}).items():
            fs = [(k, e(json.dumps(v) if isinstance(v, (dict, list)) else v)) for k, v in c.items() if k != "n"]
            body = hero(c["n"], f"{kind.title()} · pre-release extras, unverified") + f'<section class="card">{facts(fs)}</section>'
            out[path(kind, cid, c["n"])] = (c["n"], f"{c['n']}: pre-release extras, unverified.", body)
    return out


def load_prev(src):
    """-> (dict url -> {h, d}, status) ; status 'ok' | 'seed' (first run) | 'error'."""
    try:
        if re.match(r"^https?://", src):
            with urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": "ms-classic-pages-build"}), timeout=30) as r:
                return json.loads(r.read().decode()), "ok"
        p = pathlib.Path(src)
        return (json.loads(p.read_text()), "ok") if p.exists() else ({}, "seed")
    except urllib.error.HTTPError as ex:
        if ex.code == 404: return {}, "seed"
    except Exception:
        pass
    return {}, "error"


def generate(D, dst, prev_src=None, today=None):
    dst = pathlib.Path(dst)
    today = today or datetime.date.today().isoformat()
    prev, status = load_prev(prev_src or os.environ.get("SITEMAP_PREV") or SITE + "/sitemap-state.json")
    if status == "error": print("::warning::sitemap-state.json could not be fetched; sitemap carries no lastmod this build")
    real, fake = build(D), canary_pages()
    cblock = canary.block()
    state = {}
    for url, (title, desc, body) in {**real, **fake}.items():
        h = hashlib.sha1((title + desc + body).encode()).hexdigest()[:12]
        old = prev.get(url)
        d = old["d"] if old and old.get("h") == h else (None if status == "error" else today)
        state[url] = {"h": h, "d": d}
        f = dst / url.strip("/") / "index.html"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(shell(title, desc, url, body).replace("{CANARY}", cblock))
    # browse indexes: crawl paths + something for people to click
    groups = {}
    for iid, it in D["items"].items(): groups.setdefault(item_kind(it), []).append((it["n"], path("item", iid, it["n"])))
    for kind, plural, label in (("item", "items", "Items"), ("mob", "monsters", "Monsters"), ("map", "maps", "Maps")):
        links = sorted((v[0], u) for u, v in real.items() if u.startswith(f"/{kind}/"))
        li = lambda ls: '<ul class="cols">' + "".join(f'<li><a href="{u}">{e(n)}</a></li>' for n, u in sorted(ls)) + "</ul>"
        inner = "".join(card(g, li(ls)) for g, ls in sorted(groups.items())) if kind == "item" else card(label, li(links))
        body = f'<section class="card hero"><div><h1>{label}</h1><span class="chip">{fmt(len(links))} in MapleStory Classic World</span></div></section>{inner}'
        url = f"/{plural}/"
        (dst / plural).mkdir(parents=True, exist_ok=True)
        (dst / plural / "index.html").write_text(shell(label, f"All {len(links)} {label.lower()} in MapleStory Classic World.", url, body).replace("{CANARY}", cblock))
    # /item/, /mob/ and /map/ alone would 404: send them to the browse index (meta refresh + canonical, no script)
    for kind, plural in (("item", "items"), ("mob", "monsters"), ("map", "maps")):
        (dst / kind).mkdir(parents=True, exist_ok=True)
        (dst / kind / "index.html").write_text(
            f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{NAME}</title><meta name="robots" content="noindex">'
            f'<link rel="canonical" href="{SITE}/{plural}/"><meta http-equiv="refresh" content="0; url=/{plural}/"></head>'
            f'<body><p><a href="/{plural}/">Browse all {plural}</a></p></body></html>\n')
    urls = ["/", "/items/", "/monsters/", "/maps/"] + sorted(state)
    rows = []
    for u in urls:
        d = state.get(u, {}).get("d")
        rows.append(f"<url><loc>{e(SITE + u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>")
    (dst / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n")
    (dst / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    (dst / "sitemap-state.json").write_text(json.dumps(state, separators=(",", ":")))
    print(f"static pages: {len(real)} real + {len(fake)} canary, sitemap {len(urls)} urls ({status})")
    return state
