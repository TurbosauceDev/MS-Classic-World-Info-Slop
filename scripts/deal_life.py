#!/usr/bin/env python3
"""FM Sniper deal lifetimes (Danny 2026-10-20) from the git history of data/sources/mesowatch_prices.json.

Every meso.watch poll commit is one snapshot of the cheapest live listing per item ("now": {item: [price, qty, ch, map,
seller]}, as of "listed"). A listing = (item, price, seller). Across snapshots it either
  - is still there in the newest one (open: we know roughly when it first showed up),
  - was replaced by a cheaper listing of the same item (undercut: it may still be for sale, just not the cheapest), or
  - vanished with nothing cheaper in its place (gone: most likely bought, or the shop closed).
For gone ones the lifetime is bracketed by the snapshots: at least (last seen - first seen), at most (next snapshot -
first seen). Polls are every ~30 min but GitHub skips some, so brackets are coarse; runs whose closing gap is over 3 h
or that were already there in the oldest snapshot are left out. Only the cheapest listing per item is in the data, so
this measures "how long a deal stayed the cheapest", which the page says.

Used by build_data.py prices (D.pw.life); needs git history (the meso.watch poll checks out with fetch-depth 0). With a
shallow clone it just finds fewer snapshots. Run alone to print a summary: python3 scripts/deal_life.py
"""
import json, pathlib, statistics, subprocess, sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = "data/sources/mesowatch_prices.json"
MAX_GAP = 180   # minutes: a run that ends across a longer gap between snapshots says too little
GRADES = ((0.5, "steal"), (0.7, "great"), (0.85, "good"), (0.995, "small"), (1.005, "usual"), (float("inf"), "over"))

def minutes(s):
    try: return int(datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() // 60)
    except (TypeError, ValueError): return None

def snapshots(root=ROOT, days=14, cap=1500):
    """[(minute, snapshot dict)] oldest first, one per distinct "listed" time; includes the working-tree file."""
    out = {}
    try:
        revs = subprocess.run(["git", "-C", str(root), "log", f"--since={days}.days", "--format=%H", "--", SRC],
                              capture_output=True, text=True, timeout=60).stdout.split()[:cap]
        if revs:
            p = subprocess.run(["git", "-C", str(root), "cat-file", "--batch"], input="".join(f"{h}:{SRC}\n" for h in revs).encode(),
                               capture_output=True, timeout=120).stdout
            i = 0
            while i < len(p):   # "<sha> blob <size>\n<content>\n" per object, "<x> missing\n" for none
                nl = p.index(b"\n", i); head = p[i:nl].split()
                if len(head) < 3: i = nl + 1; continue
                n = int(head[2]); body = p[nl + 1:nl + 1 + n]; i = nl + 2 + n
                try: j = json.loads(body)
                except ValueError: continue
                t = minutes(j.get("listed"))
                if t is not None and isinstance(j.get("now"), dict): out.setdefault(t, j)
    except (OSError, subprocess.SubprocessError, ValueError, TypeError): pass
    try:
        j = json.load(open(pathlib.Path(root) / SRC)); t = minutes(j.get("listed"))
        if t is not None and isinstance(j.get("now"), dict): out[t] = j
    except (OSError, ValueError): pass
    return sorted(out.items())

def grade(r, rough):
    if r is None: return "nosales"
    if rough: return "rough"
    return next(g for cut, g in GRADES if r <= cut)

def life(root=ROOT):
    snaps = snapshots(root)
    if len(snaps) < 2: return {"snaps": len(snaps)}
    keyed = []   # per snapshot: {key: (item, price, ratio vs that snapshot's median, rough)}
    for _, j in snaps:
        it, ks = j.get("items") or {}, {}
        for iid, n in j["now"].items():
            if not isinstance(n, list) or not n or not isinstance(n[0], (int, float)) or n[0] < 1: continue
            p = it.get(iid); med = p[0] if p and p[0] else 0
            ks[f"{iid}|{n[0]}|{n[4] if len(n) > 4 else ''}"] = (iid, n[0], n[0] / med if med else None, bool(p and p[4] & 1))
        keyed.append(ks)
    T = [t for t, _ in snaps]; last = len(snaps) - 1
    runs = {}   # key -> [first index, last index] of its current run
    closed = []   # (grade, item, lo, hi, gone?)
    since = {}
    for i, ks in enumerate(keyed):
        for k in ks: runs.setdefault(k, [i, i])[1] = i
        for k in [k for k, (a, b) in runs.items() if b < i]:   # dropped out at snapshot i
            a, b = runs.pop(k); iid, price, r, rough = keyed[a][k]
            if a == 0 or T[i] - T[b] > MAX_GAP: continue
            cheaper = any(v[0] == iid and v[1] < price for v in ks.values())
            closed.append((grade(r, rough), iid, T[b] - T[a], T[i] - T[a], not cheaper))
    for k, (a, b) in runs.items():
        if b == last: since[k] = None if a == 0 else T[a]   # None: there before our oldest snapshot
    med = lambda xs: int(statistics.median(xs)) if xs else None
    g = {}
    for name in [x[1] for x in GRADES] + ["rough", "nosales"]:
        rows = [c for c in closed if c[0] == name]
        gone = [c for c in rows if c[4]]
        if rows: g[name] = [len(rows), len(gone), med([c[2] for c in gone]), med([c[3] for c in gone])]
    per = {}
    for c in closed:
        if c[4] and c[0] in ("steal", "great", "good", "small"): per.setdefault(c[1], []).append(c)
    items = {iid: [len(cs), med([c[2] for c in cs]), med([c[3] for c in cs])] for iid, cs in per.items() if len(cs) >= 2}
    fmt = lambda t: datetime.fromtimestamp(t * 60, timezone.utc).strftime("%Y-%m-%d %H:%M")
    gaps = [b - a for a, b in zip(T, T[1:])]
    return {"snaps": len(snaps), "from": fmt(T[0]), "to": fmt(T[-1]), "gap": med(gaps), "g": g, "it": items,
            "since": {k: (fmt(t) if t is not None else "") for k, t in since.items()}}

if __name__ == "__main__":
    L = life(pathlib.Path(sys.argv[1]) if sys.argv[1:] else ROOT)
    print(json.dumps({k: v for k, v in L.items() if k != "since"}, indent=1))
    print(f"{len(L.get('since', {}))} open listings with a first-seen time")
