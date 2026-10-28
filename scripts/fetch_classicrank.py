#!/usr/bin/env python3
"""Windia job census from classicrank.com's keyless API (classicrank.com/developer; trusted source, Danny 2026-10-20)
into data/sources/classicrank.json, and D["crank"] in data/data.json (build_data.py's "classicrank" step does the same).
/api/v1/stats, /jobs and /characters stay keyless (30 requests/min); the first reply to a fresh client is a verification
splash (200 html / 403), so get() falls back to a real headless Chromium that clears it once and carries the cookie
(browser_fetch.py; allowed since Danny lifted the 10-20 never-bypass rule, decisions.md 2026-10-28).
SITE CHANGE 2026-10-28: the job / family / tier / min_level filters moved behind a key (docs: "Without a key only sort,
limit, page, fields, names and pretty work"). Without BCR_KEY we therefore refresh chars/top/scan from stats and leave
jobs=[] / levels={} (the "Who plays what" card hides itself on empty jobs); with BCR_KEY (a classicrank read key from
nxneko/Kitten) the full per-job census runs like before, key sent as Authorization: Bearer.
Run: python3 scripts/fetch_classicrank.py && python3 scripts/build.py   (FORCE_BROWSER=1 skips urllib for testing)"""
import json, os, pathlib, time, urllib.parse, urllib.request, urllib.error
from browser_fetch import BrowserSession

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://classicrank.com/api/v1/"
LEVELS = [10, 20, 30, 40, 50, 60, 70]
BROWSER = None
KEY = os.environ.get("BCR_KEY", "")


def auth_headers():
    return {"User-Agent": "maplestory.scumlord.studio job census (daily)", **({"Authorization": "Bearer " + KEY} if KEY else {})}


def browser_get(url):
    global BROWSER
    if BROWSER is None:
        BROWSER = BrowserSession()
    if KEY:
        BROWSER.auth(KEY)
    return BROWSER.get(url)


def get(path, **q):
    """urllib first; on a 403 wall or a 200-html splash fall back to the browser session."""
    url = API + path + ("?" + urllib.parse.urlencode(q) if q else "")
    if os.environ.get("FORCE_BROWSER"):
        time.sleep(2.2)
        return browser_get(url)
    for _ in range(5):
        time.sleep(2.2)
        try:
            req = urllib.request.Request(url, headers=auth_headers())
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 403:
                return browser_get(url)   # challenge wall (runner 403s): real-browser fallback
            if e.code != 429:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 10))
        except json.JSONDecodeError:
            return browser_get(url)       # 200 html = verification splash / SPA fallback
    raise SystemExit("classicrank.com kept answering 429: " + url)


def row(**q):
    """(total, level of row 1) for a filtered list, or None when the key gate blocks the filter."""
    try:
        d = get("characters", limit=1, fields="level", **q)
        return d["meta"]["total"], (d["data"][0]["level"] if d["data"] else None)
    except (RuntimeError, json.JSONDecodeError):
        return None


def merge(D, j):
    """data.json gets the census as-is (small): D["crank"]"""
    D["crank"] = j

if __name__ == "__main__":
    stats = get("stats")["data"]
    jobs, levels, keyed = [], {}, True
    if KEY:
        for jb in get("jobs")["data"]:
            n, top = row(job=jb["name"])
            if n is None:
                keyed = False
                break
            r100 = row(job=jb["name"], page=100)[1] if n >= 100 else None
            jobs.append([jb["name"], jb["tier"], jb["family"], n, top, r100])
        if keyed:
            for L in LEVELS:
                r = row(min_level=L)
                if r is None:
                    keyed = False
                    break
                levels[str(L)] = r[0]
    else:
        keyed = False
    if not keyed:
        print("::warning::classicrank job/min_level filters need a read key now (site change, docs 2026-10-28); "
              "refreshed chars/top/scan only. The 'Who plays what' card stays hidden until BCR_KEY is set.")
    j = {"source": "https://classicrank.com", "read": time.strftime("%Y-%m-%d", time.gmtime()), "world": stats.get("world"),
         "chars": stats["characters"], "top": stats["highest_level"], "scan": stats.get("last_scan"),
         "jobs": jobs, "levels": levels, **({} if keyed else {"key_required": True})}
    dst = ROOT / "data" / "sources" / "classicrank.json"
    dst.write_text(json.dumps(j, separators=(",", ":")))
    print(f"{j['chars']} characters, {len(jobs)} jobs, top Lv {j['top']} -> {dst}")
    D = json.load(open(ROOT / "data" / "data.json"))
    merge(D, j)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
    print("data/data.json: crank updated")
