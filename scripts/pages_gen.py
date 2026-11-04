"""Static per-item / per-monster / per-map pages + sitemap for the Pages copy (python3 scripts/pages_site.py calls generate()).

Why: the planner is one hash-routed page, so search engines and link previews see only the shell. This writes a small real
HTML page per entry at the canonical address scripts/routes.py decides (/items/axe-pole-arm/, /skills/warrior/fighter/axe-mastery/ ...),
browse lists, "which one?" pages, 404.html + routes.json (the guess-the-address router), sitemap.xml, robots.txt and
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


from routes import Routes, slug, KINDS, CLASS_OF


def hashlink(key, val):
    """#i=<base64url(JSON)>: the planner's own share-link format (00-core.js HASH)."""
    return key + "=" + base64.urlsafe_b64encode(json.dumps(str(val)).encode()).decode().rstrip("=")


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
            f'<header class="top"><a class="brand" href="/">{NAME}</a><nav aria-label="Browse"><a href="/items/">Items</a><a href="/monsters/">Monsters</a><a href="/maps/">Maps</a><a href="/skills/">Skills</a><a href="/quests/">Quests</a><a href="/npcs/">NPCs</a></nav></header>\n'
            f'{body}\n<footer>Unofficial fan site for MapleStory Classic World, not affiliated with Nexon. '
            f'Game data from the OSMS export; drop reports from meowdb players.</footer></div>\n{{CANARY}}</body></html>\n')


BOTS = ("bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|twitter|"
        "linkedin|pinterest|quora|gpt|claude|anthropic|perplexity|ccbot|bytespider|petalbot|ahrefs|semrush|lighthouse|headless")


def redirect_script(target):
    """People get the real planner (same look as everything else, no second template to keep in sync); crawlers, link
    previews and no-JS readers keep this static page. location.replace keeps the Back button working."""
    return f'<script>(function(){{if(/{BOTS}/i.test(navigator.userAgent||""))return;location.replace({json.dumps(target)})}})()</script>'


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
    if it.get("c") == "Cash": return f"NX / Decoration {it.get('s')}" if it.get("s") else "NX / Decoration"
    if it.get("c") == "Equipment": return it.get("s") or "Equipment"
    if it.get("c") == "Scroll" and it.get("s"): return f"Scroll for {it['s']}"
    return it.get("c") or "Other"


def build(D, R):
    """-> {url path: (title, description, body html)} for real pages. R = routes.Routes(D) decides every address."""
    items, mobdb, maps, mobs = D["items"], D["mobdb"], D["maps"], D["mobs"]
    icons, mobimg = D.get("iicons") or {}, D.get("mobimg") or {}
    pages = {}
    P = R.canon
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
                + (card("Monsters that drop it", rows([(f'<a href="{P("mob", mid)}">{e(n)}</a>', f"{v} votes", sprite(mobimg.get(mid), 1)) for mid, n, v in drops]), VOTES) if drops else "")
                + go("i", iid))
        bits = [kind, f"Lv {st['reqLevel']}" if st.get("reqLevel") else None, stats or None,
                f"NPC price {fmt(it['p'])} mesos" if it.get("p") else None]
        desc = f"{it['n']} in MapleStory Classic World: " + ", ".join(b for b in bits if b) + "."
        pages[P("item", iid)] = (it["n"], desc, body)

    for mid, m in mobdb.items():
        dr = sorted((r for r in (m.get("dr") or []) if isinstance(r, list) and len(r) >= 3 and isinstance(r[0], str) and r[0] in items), key=lambda r: -r[2])
        ml = [(f'<a href="{P("map", r[0])}">{e(open_maps[str(r[0])][0])}</a>' if str(r[0]) in open_maps else f'<span class="sub">{e(r[1])}</span>', "", "") for r in (m.get("maps") or [])]
        body = (hero(m["name"], f"Monster · level {m['level']}", sprite(mobimg.get(mid), 2))
                + f'<section class="card">{facts([("Level", m["level"]), ("HP", fmt(m["hp"])), ("MP", fmt(m.get("mp"))), ("EXP", fmt(m["exp"])), ("Weapon attack", m.get("PADamage")), ("Weapon defense", m.get("PDDamage")), ("Accuracy", m.get("acc")), ("Speed", m.get("speed"))])}</section>'
                + (card("Found in", rows(ml)) if ml else "")
                + (card("Drops", rows([(f'<a href="{P("item", r[0])}">{e(items[r[0]]["n"])}</a>', f"{r[2]} votes", sprite(icons.get(r[0]), 1)) for r in dr]), VOTES) if dr else "")
                + go("m", mid))
        desc = f"{m['name']} in MapleStory Classic World: level {m['level']}, {fmt(m['hp'])} HP, {fmt(m['exp'])} EXP."
        pages[P("mob", mid)] = (m["name"], desc, body)

    for mid, (name, _o, spawns, *_r) in open_maps.items():
        ms = [(f'<a href="{P("mob", s[0])}">{e(mob_name(s[0]))}</a>', f"× {s[1]}", sprite(mobimg.get(str(s[0])), 1))
              for s in spawns if mob_name(s[0]) and str(s[0]) in mobdb]
        body = (hero(name, f"Map · id {mid}")
                + (card("Monsters", rows(ms)) if ms else card("Monsters", '<p class="desc">No monsters spawn here.</p>'))
                + go(None, "g=wmap", "Open the World Map"))
        desc = f"{name} in MapleStory Classic World" + (f": {len(spawns)} monster type{'s' if len(spawns) != 1 else ''}." if spawns else ".")
        pages[P("map", mid)] = (name, desc, body)

    for job, lst in D["skills"].items():
        for s in lst:
            st = s.get("st") or []
            req = ", ".join(f"{n} Lv {l}" for n, l in (s.get("req") or []))
            jl = f'<a href="{R.job_index(job)}">{e(job)}</a>'
            body = (hero(s["n"], f"{job} skill · max level {s['max']}")
                    + (f'<section class="card"><p class="desc">{e(s["d"])}</p></section>' if s.get("d") else "")
                    + f'<section class="card">{facts([("Job", jl), ("Max level", s["max"]), ("Needs first", e(req)), ("Level 1", e(st[0]) if st else ""), (f"Level {s['max']}", e(st[-1]) if len(st) > 1 else "")])}</section>'
                    + go("s", f"{job}|{s['id']}"))
            desc = f"{s['n']}, {job} skill in MapleStory Classic World: max level {s['max']}." + (f" {s['d']}" if s.get("d") else "")
            pages[P("skill", s["id"])] = (s["n"], desc, body)

    npc_quests = {}
    for i, q in enumerate(D["quests"]): npc_quests.setdefault(q["npc"], []).append((i, q))
    for i, q in enumerate(D["quests"]):
        info = q.get("info") or {}
        nid = D["npcid"].get(q["npc"])
        npc = f'<a href="{P("npc", nid)}">{e(q["npc"])}</a>' if nid and ("npc", str(nid)) in R.by_id else e(q["npc"])
        body = (hero(q["name"], f"Quest · level {q['lvl']}")
                + (f'<section class="card"><p class="desc">{e(info["d"]).replace(chr(10), "<br>")}</p></section>' if info.get("d") else "")
                + f'<section class="card">{facts([("Level", q["lvl"]), ("Starts with", npc), ("Region", e(q.get("region") or "")), ("EXP", fmt(q["exp"]) if q.get("exp") else ""), ("Mesos", fmt(q["mesos"]) if q.get("mesos") else ""), ("Requirement", e(q.get("req") or "")), ("Reward", e(q.get("reward") or "")), ("Next quest", e(info.get("next") or "")), ("Quest line", e(q.get("chain") or ""))])}</section>'
                + go("Q", f"q:{i}"))
        desc = f"{q['name']}, level {q['lvl']} quest from {q['npc']} in MapleStory Classic World" + (f", {fmt(q['exp'])} EXP." if q.get("exp") else ".")
        pages[P("quest", q["id"])] = (q["name"], desc, body)

    for e_ in R.ents:
        if e_["kind"] != "npc": continue
        nid, name = e_["id"], e_["name"]
        locs = [(P("map", l[0]), maps[str(l[0])][0]) for l in (D["npcs"].get(nid) or [name, []])[1] if str(l[0]) in open_maps]
        qs = npc_quests.get(name, [])
        body = (hero(name, "NPC")
                + (card("Found in", rows([(f'<a href="{u}">{e(n)}</a>', "", "") for u, n in dict(locs).items()])) if locs else "")
                + (card("Quests", rows([(f'<a href="{P("quest", q["id"])}">{e(q["name"])}</a>', f"Lv {q['lvl']}", "") for _i, q in qs])) if qs else "")
                + go(None, "g=wmap", "Open the World Map"))
        desc = f"{name}, NPC in MapleStory Classic World" + (f": gives {len(qs)} quest{'s' if len(qs) != 1 else ''}." if qs else ".")
        pages[e_["canon"]] = (name, desc, body)
    return pages


def canary_pages():
    """Real pages for the fake canary rows (same address style as real ones). Only sitemap.xml lists them."""
    out = {}
    for grp, kind in (("items", "item"), ("maps", "map"), ("mobs", "mob"), ("npcs", "npc"), ("quests", "quest")):
        for cid, c in canary.CANARIES.get(grp, {}).items():
            fs = [(k, e(json.dumps(v) if isinstance(v, (dict, list)) else v)) for k, v in c.items() if k != "n"]
            body = hero(c["n"], f"{kind.title()} · pre-release extras, unverified") + f'<section class="card">{facts(fs)}</section>'
            out[f"/{KINDS[kind]}/{slug(c['n'])}/"] = (c["n"], f"{c['n']}: pre-release extras, unverified.", body)
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


def link_list(ls):
    return '<ul class="cols">' + "".join(f'<li><a href="{u}">{e(n)}</a></li>' for n, u in sorted(ls)) + "</ul>"


def index_page(title, desc, url, chip, inner):
    return (title, desc, f'<section class="card hero"><div><h1>{e(title)}</h1><span class="chip">{e(chip)}</span></div></section>{inner}')


def indexes(D, R, real):
    """browse pages (crawl paths + something to click): kind lists, skills by class / job, and 'which one?' pages"""
    out = {}
    byk = {}
    for en in R.ents: byk.setdefault(en["kind"], []).append(en)
    pg = lambda en: en["canon"] in real
    groups = {}
    for iid, it in D["items"].items(): groups.setdefault(item_kind(it), []).append((it["n"], R.canon("item", iid)))
    for kind, label in (("item", "Items"), ("mob", "Monsters"), ("map", "Maps"), ("quest", "Quests"), ("npc", "NPCs")):
        ls = [(en["name"], en["canon"]) for en in byk[kind] if pg(en)]
        inner = "".join(card(g, link_list(l)) for g, l in sorted(groups.items())) if kind == "item" else card(label, link_list(ls))
        out[f"/{KINDS[kind]}/"] = index_page(label, f"All {len(ls)} {label.lower()} in MapleStory Classic World.", f"/{KINDS[kind]}/", f"{fmt(len(ls))} in MapleStory Classic World", inner)
    # skills: /skills/ -> class -> job
    sk = {}
    for en in byk["skill"]: sk.setdefault(en["parent"], []).append(en)
    by_job = {j: [x for x in byk["skill"] if x["parent"].startswith(CLASS_OF[j] + "/") and (x["parent"] == CLASS_OF[j] + "/" + ("" if slug(j) == CLASS_OF[j] else slug(j) + "/"))] for j in D["skills"]}
    classes = {}
    for j in D["skills"]: classes.setdefault(CLASS_OF[j], []).append(j)
    out["/skills/"] = index_page("Skills", "Every skill by class and job in MapleStory Classic World.", "/skills/", f"{len(byk['skill'])} skills",
        "".join(card(c.title(), link_list([(j, R.job_index(j)) for j in js])) for c, js in classes.items()))
    for c, js in classes.items():
        out[f"/skills/{c}/"] = index_page(f"{c.title()} skills", f"All {c.title()} skills in MapleStory Classic World, by job.", f"/skills/{c}/", f"{sum(len(by_job[j]) for j in js)} skills",
            "".join(card(j, link_list([(x["name"], x["canon"]) for x in by_job[j]])) for j in js))
        for j in js:
            if slug(j) != c:
                out[R.job_index(j)] = index_page(f"{j} skills", f"All {j} skills in MapleStory Classic World.", R.job_index(j), f"{len(by_job[j])} skills",
                    card(j, link_list([(x["name"], x["canon"]) for x in by_job[j]])))
    # shared names: one page that lists every entry with that name
    for url, es in R.disambig.items():
        name = es[0]["name"]
        lab = lambda en: en["name"] + (f" ({en['parent'].strip('/').replace('/', ' / ')})" if en["kind"] == "skill" else f" (id {en['id']})")
        out[url] = index_page(name, f"{len(es)} entries share the name {name}.", url, f"{len(es)} entries share this name", card("Which one?", link_list([(lab(x), x["canon"]) for x in es])))
    return out


def news_pages(D, updates=None):
    """-> ({url: (title, desc, body)}, [(src image path, dst rel path)]) for the newsfeed's article pages
    (Turbozo 2026-11-04: every article is its own shareable page, /news/<slug>/, wowhead-style). Journal posts
    bake the full body (posts.py's safe HTML, auto links included); changelog entries get a shorter card. People
    are redirected into the app's article view (/#a=<slug>) either way - the static page is for crawlers, link
    previews and no-JS readers. updates = the built changelog's entries from scripts/pages_site.py, mirroring the
    slugs 77-journal.js derives at runtime (log-<version-or-date>)."""
    import posts as _posts
    out, imgs = {}, []
    for p in _posts.load(D):
        ext = pathlib.Path(p["imgfile"]).suffix if p["imgfile"] else ""
        img = f'<img class="artimg" src="/news/img/{p["slug"]}{ext}" alt="">' if p["imgfile"] else ""
        body = (f'<section class="card hero"><div class="art"><span class="chip">{e(" \u00b7 ".join(p["tags"]))}</span>'
                f'<h1>{e(p["title"])}</h1><p class="note">by {e(p["author"])} \u00b7 {e(p["date"])}'
                f'{" \u00b7 \u2605 featured" if p["featured"] else ""}</p>{img}{p["html"]}'
                f'<p><a class="btn" href="/#a={p["slug"]}">Read this post in the app - comments included</a></p></div></section>')
        out[f"/news/{p['slug']}/"] = (p["title"], p["excerpt"], body)
        if p["imgfile"]:
            imgs.append((_posts.POSTS_DIR / p["imgfile"], f"news/img/{p['slug']}{ext}"))
    for u in (updates or []):
        body = (f'<section class="card hero"><div class="art"><span class="chip">Site Updates{e(" \u00b7 " + u["ver"]) if u.get("ver") else ""}</span>'
                f'<h1>{e(u["title"])}</h1><p class="note">by Glorg \u00b7 {e(u["date"])}</p>'
                f'<p class="desc">{e(u["desc"])}</p>'
                f'<p><a class="btn" href="/#a={u["slug"]}">Read this update in the app - comments included</a></p></div></section>')
        out[f"/news/{u['slug']}/"] = (u["title"], u["desc"], body)
    return out, imgs


def generate(D, dst, prev_src=None, today=None, news=None, heads=None):
    dst = pathlib.Path(dst)
    today = today or datetime.date.today().isoformat()
    prev, status = load_prev(prev_src or os.environ.get("SITEMAP_PREV") or SITE + "/sitemap-state.json")
    if status == "error": print("::warning::sitemap-state.json could not be fetched; sitemap carries no lastmod this build")
    R = Routes(D)
    real, fake = build(D, R), canary_pages()
    idx = indexes(D, R, real)
    news = news or {}
    heads = heads or {}
    clash = (set(real) & set(fake)) | (set(real) & set(idx)) | (set(fake) & set(idx)) \
        | ((set(news) & set(real)) | (set(news) & set(fake)) | (set(news) & set(idx)))
    assert not clash, f"two pages share an address: {sorted(clash)[:5]}"
    real = {**real, **news}
    cblock = canary.block()
    state = {}
    for url, (title, desc, body) in {**real, **fake}.items():
        h = hashlib.sha1((title + desc + body).encode()).hexdigest()[:12]
        old = prev.get(url)
        d = old["d"] if old and old.get("h") == h else (None if status == "error" else today)
        state[url] = {"h": h, "d": d}
        f = dst / url.strip("/") / "index.html"
        f.parent.mkdir(parents=True, exist_ok=True)
        m = re.search(r'class="btn" href="(/#[^"]*)"', body) if url in real else None
        f.write_text(shell(title, desc, url, body, heads.get(url, "") + (redirect_script(m.group(1)) if m else "")).replace("{CANARY}", cblock))
    for url, (title, desc, body) in idx.items():
        f = dst / url.strip("/") / "index.html"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(shell(title, desc, url, body, '<meta name="robots" content="noindex,follow">' if url in R.disambig else "").replace("{CANARY}", cblock))
    # 404.html: GitHub Pages serves it for every unknown address; the router sends guessed addresses to the canonical page
    (dst / "routes.json").write_text(json.dumps(R.table(), separators=(",", ":"), ensure_ascii=False))
    nf = ('<section class="card hero"><div><h1>No page at that address</h1><span class="chip">404</span></div></section>'
          '<section class="card" id="nf"><p class="desc">Try one of the lists above, or search the planner.</p>'
          '<p><a class="btn" href="/">Open the planner</a></p></section>')
    (dst / "404.html").write_text(shell("Page not found", "No page at this address.", "/", nf,
        '<meta name="robots" content="noindex"><script>' + (ROOT / "scripts/router404.js").read_text() + "</script>").replace("{CANARY}", cblock))
    kind_idx = [f"/{p}/" for p in KINDS.values()]
    urls = ["/"] + kind_idx + sorted(u for u in idx if u not in R.disambig and u not in kind_idx) + sorted(state)
    rows = []
    for u in urls:
        d = state.get(u, {}).get("d")
        rows.append(f"<url><loc>{e(SITE + u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>")
    (dst / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n")
    (dst / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    (dst / "sitemap-state.json").write_text(json.dumps(state, separators=(",", ":")))
    print(f"static pages: {len(real)} real + {len(fake)} canary + {len(idx)} lists, sitemap {len(urls)} urls ({status})")
    return state
