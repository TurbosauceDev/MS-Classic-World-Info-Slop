"""Skill/item/monster/map renames between two commits' data/data.json (no OSMS export needed): python3 scripts/name_diff.py <base> [head]

head defaults to the working tree. Prints a Markdown report (CI: osms-names.yml appends it to the job summary) and exits 1
when a name changed or a skill/item disappeared, so an OSMS_REF bump that renames things (Oct 19: "Arrow Bomb: Bow" ->
"Arrow Bomb") shows up red on day one. Fix the code that names them (golden.js lists the names the guides use), then
the next push is green.
"""
import json, pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent

def load(ref):
    if ref is None: return json.loads((ROOT / "data" / "data.json").read_text())
    return json.loads(subprocess.run(["git", "show", f"{ref}:data/data.json"], cwd=ROOT, capture_output=True, check=True).stdout)

def osms_ref(ref):
    t = (ROOT / "scripts" / "fetch_osms.sh").read_text() if ref is None else \
        subprocess.run(["git", "show", f"{ref}:scripts/fetch_osms.sh"], cwd=ROOT, capture_output=True, text=True).stdout
    for line in t.splitlines():
        if line.startswith("OSMS_REF="): return line.split(":-", 1)[-1].strip('}"')[:7]
    return "?"

def names(D):
    """kind -> {id: name}"""
    sk = {s["id"]: f'{s["n"]} ({job})' for job, lst in D.get("skills", {}).items() for s in lst}
    return {"skill": sk, "item": {i: o.get("n") for i, o in D.get("items", {}).items()},
            "monster": {i: m[0] for i, m in D.get("mobs", {}).items()}, "map": {i: m[0] for i, m in D.get("maps", {}).items() if m and m[0]}}

def diff(a, b):
    """{kind: (renamed [(id, old, new)], removed [(id, old)], added count)}"""
    out = {}
    for k in a:
        A, B = a[k], b.get(k, {})
        out[k] = ([(i, A[i], B[i]) for i in sorted(A) if i in B and A[i] != B[i]], [(i, A[i]) for i in sorted(A) if i not in B], sum(1 for i in B if i not in A))
    return out

def report(base, head):
    d = diff(names(load(base)), names(load(head)))
    ra, rb = osms_ref(base), osms_ref(head)
    lines = [f"## OSMS name check: {base[:9] if base else 'working tree'} -> {head[:9] if head else 'working tree'}",
             f"OSMS_REF {ra}" + (f" -> **{rb}**" if ra != rb else " (unchanged)"), ""]
    bad = 0
    for k, (ren, rem, add) in d.items():
        if not (ren or rem or add): continue
        lines.append(f"### {k}s: {len(ren)} renamed, {len(rem)} removed, {add} added")
        lines += [f"- `{i}` {o} -> **{n}**" for i, o, n in ren[:200]] + [f"- `{i}` {o} (removed)" for i, o in rem[:200]]
        if k in ("skill", "item"): bad += len(ren) + len(rem)
    if len(lines) == 3: lines.append("No skill, item, monster or map names changed.")
    return "\n".join(lines), bad

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    text, bad = report(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(text)
    sys.exit(1 if bad else 0)
