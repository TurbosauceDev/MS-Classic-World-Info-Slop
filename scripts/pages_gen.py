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
import hashlib, html, json, os, re, unicodedata, urllib.request, urllib.error, base64, datetime, pathlib, sys

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


CSS = ("body{margin:0;background:#f6f5fa;color:#1b1a22;font:16px/1.6 system-ui,Segoe UI,sans-serif}"
       "main{max-width:760px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-left)) 48px}"
       "h1{font-size:1.7rem;line-height:1.2;margin:.2em 0}h2{font-size:1.1rem;margin:1.4em 0 .4em}"
       "a{color:#5b3fc4}nav a{margin-right:14px}.sub{color:#5b5868}.btn{display:inline-block;margin:10px 0;padding:8px 14px;"
       "border-radius:8px;background:#6b4fd8;color:#fff;text-decoration:none;font-weight:600}"
       "table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 10px;border-bottom:1px solid #dcd9e6}"
       "ul{padding-left:20px}footer{margin-top:32px;font-size:.85rem}"
       "@media(prefers-color-scheme:dark){body{background:#0f0f0f;color:#e8e8e8}a{color:#b49bff}.sub{color:#b3b3b3}"
       "td,th{border-color:#3f3f3f}.btn{background:#8a6df0;color:#0f0f0f}}")


def shell(title, desc, canon, body, extra_head=""):
    return (f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f'<title>{e(title)} · {NAME}</title><meta name="description" content="{e(desc)}">\n'
            f'<link rel="canonical" href="{e(SITE + canon)}"><meta property="og:title" content="{e(title)}">'
            f'<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{e(SITE + canon)}">\n'
            f'<style>{CSS}</style>{extra_head}</head><body><main>\n'
            f'<nav><a href="/">Planner</a><a href="/items/">Items</a><a href="/monsters/">Monsters</a><a href="/maps/">Maps</a></nav>\n'
            f'{body}\n<footer class="sub">Unofficial fan site for MapleStory Classic World, not affiliated with Nexon. '
            f'Game data from the OSMS export; drop reports from meowdb players.</footer></main>\n{{CANARY}}</body></html>\n')


def table(rows):
    return "<table>" + "".join(f"<tr><th>{e(k)}</th><td>{v}</td></tr>" for k, v in rows if v not in (None, "", [])) + "</table>"


def build(D):
    """-> {url path: (title, description, body html)} for real pages, plus browse indexes data."""
    items, mobdb, maps, mobs = D["items"], D["mobdb"], D["maps"], D["mobs"]
    pages = {}
    # who drops what (meowdb net votes), and which maps hold which monster
    dropped_by = {}
    for mid, m in mobdb.items():
        for row in m.get("dr") or []:
            if isinstance(row, list) and len(row) >= 3 and isinstance(row[0], str):
                dropped_by.setdefault(row[0], []).append((mid, m["name"], row[2]))
    open_maps = {mid: m for mid, m in maps.items() if m[1]}
    mob_name = lambda mid: (mobdb.get(str(mid)) or {}).get("name") or (mobs.get(str(mid)) or [None])[0]

    for iid, it in items.items():
        st = it.get("st") or {}
        kind = f"NX / Decoration {it.get('s')}" if it.get("c") == "Cash" else it.get("s") if it.get("c") == "Equipment" else f"Scroll for {it.get('s')}" if it.get("c") == "Scroll" and it.get("s") else it.get("c")
        stats = "; ".join(f"{l} +{st[k]}" for k, l in STATNAME.items() if st.get(k))
        reqs = ", ".join(f"{k[3:]} {st[k]}" for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK") if st.get(k))
        drops = sorted(dropped_by.get(iid, []), key=lambda r: -r[2])
        dl = "".join(f'<li><a href="{path("mob", mid, n)}">{e(n)}</a> <span class="sub">(net player votes {v})</span></li>' for mid, n, v in drops)
        body = (f'<h1>{e(it["n"])}</h1><p class="sub">{e(kind or "")} · item {e(iid)}</p>'
                + table([("Type", e(kind or "")), ("Job", e(it.get("job") or "")), ("Required level", st.get("reqLevel")),
                         ("Other requirements", e(reqs)), ("Stats", e(stats)), ("Upgrade slots", st.get("tuc")),
                         ("Attack speed", e(it.get("spd") or "")), ("NPC sells for (mesos)", fmt(it["p"]) if it.get("p") else "")])
                + (f'<p>{e(it["d"])}</p>' if it.get("d") else "")
                + (f'<h2>Monsters that drop it</h2><ul>{dl}</ul><p class="sub">Player-reported by meowdb users. These are votes, not drop rates.</p>' if dl else "")
                + f'<a class="btn" href="/#{hashlink("i", iid)}">Open in the planner</a>')
        bits = [kind, f"Lv {st['reqLevel']}" if st.get("reqLevel") else None, stats or None,
                f"NPC price {fmt(it['p'])} mesos" if it.get("p") else None]
        desc = f"{it['n']} in MapleStory Classic World: " + ", ".join(b for b in bits if b) + "."
        pages[path("item", iid, it["n"])] = (it["n"], desc, body)

    for mid, m in mobdb.items():
        dr = sorted((r for r in (m.get("dr") or []) if isinstance(r, list) and len(r) >= 3 and isinstance(r[0], str)), key=lambda r: -r[2])
        ml = "".join(f'<li><a href="{path("map", r[0], r[1])}">{e(r[1])}</a></li>' if str(r[0]) in open_maps else f"<li>{e(r[1])}</li>"
                     for r in (m.get("maps") or []))
        dl = "".join(f'<li><a href="{path("item", r[0], r[1])}">{e(r[1])}</a> <span class="sub">(net player votes {r[2]})</span></li>' for r in dr if r[0] in items)
        body = (f'<h1>{e(m["name"])}</h1><p class="sub">Monster · level {m["level"]}</p>'
                + table([("Level", m["level"]), ("HP", fmt(m["hp"])), ("MP", fmt(m.get("mp"))), ("EXP", fmt(m["exp"])),
                         ("Weapon attack", m.get("PADamage")), ("Weapon defense", m.get("PDDamage")), ("Accuracy", m.get("acc")),
                         ("Speed", m.get("speed"))])
                + (f"<h2>Found in</h2><ul>{ml}</ul>" if ml else "") + (f'<h2>Drops</h2><ul>{dl}</ul><p class="sub">Player-reported by meowdb users. These are votes, not drop rates.</p>' if dl else "")
                + f'<a class="btn" href="/#{hashlink("m", mid)}">Open in the planner</a>')
        desc = f"{m['name']} in MapleStory Classic World: level {m['level']}, {fmt(m['hp'])} HP, {fmt(m['exp'])} EXP."
        pages[path("mob", mid, m["name"])] = (m["name"], desc, body)

    for mid, (name, _o, spawns, *_r) in open_maps.items():
        ms = "".join(f'<li><a href="{path("mob", s[0], mob_name(s[0]))}">{e(mob_name(s[0]))}</a> <span class="sub">× {s[1]}</span></li>'
                     for s in spawns if mob_name(s[0]) and str(s[0]) in mobdb)
        body = (f'<h1>{e(name)}</h1><p class="sub">Map · id {e(mid)}</p>'
                + (f"<h2>Monsters</h2><ul>{ms}</ul>" if ms else "<p>No monsters spawn here.</p>")
                + f'<a class="btn" href="/#g=wmap">Open the World Map</a>')
        desc = f"{name} in MapleStory Classic World" + (f": {len(spawns)} monster type{'s' if len(spawns) != 1 else ''}." if spawns else ".")
        pages[path("map", mid, name)] = (name, desc, body)
    return pages


def canary_pages():
    """Real pages for the fake canary rows. Only sitemap.xml lists them."""
    out = {}
    for grp, kind in (("items", "item"), ("maps", "map"), ("mobs", "mob"), ("npcs", "npc"), ("quests", "quest")):
        for cid, c in canary.CANARIES.get(grp, {}).items():
            facts = [(k, e(json.dumps(v) if isinstance(v, (dict, list)) else v)) for k, v in c.items() if k != "n"]
            body = (f'<h1>{e(c["n"])}</h1><p class="sub">{kind.title()} · pre-release extras (unverified)</p>' + table(facts))
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
    for kind, plural, label in (("item", "items", "Items"), ("mob", "monsters", "Monsters"), ("map", "maps", "Maps")):
        links = sorted((v[0], u) for u, v in real.items() if u.startswith(f"/{kind}/"))
        body = f"<h1>{label}</h1><p class='sub'>{len(links)} entries in MapleStory Classic World.</p><ul>" + "".join(f'<li><a href="{u}">{e(n)}</a></li>' for n, u in links) + "</ul>"
        url = f"/{plural}/"
        (dst / plural).mkdir(parents=True, exist_ok=True)
        (dst / plural / "index.html").write_text(shell(label, f"All {len(links)} {label.lower()} in MapleStory Classic World.", url, body).replace("{CANARY}", cblock))
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
