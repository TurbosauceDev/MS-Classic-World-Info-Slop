#!/usr/bin/env python3
"""Windia job census from classicrank.com's keyless API (classicrank.com/developer; trusted source, Danny 2026-10-20)
into data/sources/classicrank.json, and D["crank"] in data/data.json (build_data.py's "classicrank" step does the same).
Keyless = 30 requests/min and lists stop at row 1,000, so each job costs one or two list calls of 1 row: meta.total is the
player count, row 1 the top level, row 100 the level that job rank #100 needs. ~60 requests, paced 2.2 s apart.
Run: python3 scripts/fetch_classicrank.py && python3 scripts/build.py"""
import json, pathlib, time, urllib.parse, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://classicrank.com/api/v1/"
LEVELS = [10, 20, 30, 40, 50, 60, 70]

def get(path, **q):
    url = API + path + ("?" + urllib.parse.urlencode(q) if q else "")
    for _ in range(5):
        time.sleep(2.2)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "maplestory.scumlord.studio job census (daily)"})
            with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(int(e.headers.get("Retry-After") or 10))
    raise SystemExit("classicrank.com kept answering 429: " + url)

def row(**q):   # (total, level of that row or None)
    d = get("characters", limit=1, fields="level", **q)
    return d["meta"]["total"], (d["data"][0]["level"] if d["data"] else None)

def merge(D, j):
    """data.json gets the census as-is (small): D["crank"]"""
    D["crank"] = j

if __name__ == "__main__":
    stats = get("stats")["data"]
    jobs = []
    for jb in get("jobs")["data"]:
        n, top = row(job=jb["name"])
        r100 = row(job=jb["name"], page=100)[1] if n >= 100 else None
        jobs.append([jb["name"], jb["tier"], jb["family"], n, top, r100])
    levels = {str(L): row(min_level=L)[0] for L in LEVELS}
    j = {"source": "https://classicrank.com", "read": time.strftime("%Y-%m-%d", time.gmtime()), "world": stats.get("world"),
         "chars": stats["characters"], "top": stats["highest_level"], "scan": stats.get("last_scan"), "jobs": jobs, "levels": levels}
    dst = ROOT / "data" / "sources" / "classicrank.json"
    dst.write_text(json.dumps(j, separators=(",", ":")))
    print(f"{j['chars']} characters, {len(jobs)} jobs, Lv 30+: {levels['30']} -> {dst}")
    D = json.load(open(ROOT / "data" / "data.json")); merge(D, j)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
    print("data/data.json: crank updated")
