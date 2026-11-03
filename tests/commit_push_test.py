#!/usr/bin/env python3
"""Run: python3 tests/commit_push_test.py (CI: docs.yml). Plays a real push race against a local bare repo:
another poll lands on main after our clone, scripts/ci/commit_push.sh must reset onto it, restore our source file,
run the rebuild, and push, keeping BOTH changes. Also: no change -> exit 0 without a commit."""
import os, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = (ROOT / "scripts" / "ci" / "commit_push.sh").as_posix()
BASH = shutil.which("bash") or "bash"
ENV = {**os.environ, "COMMIT_PUSH_SLEEP": "0", "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_NOSYSTEM": "1"}

def run(*a, cwd=None, check=True):
    r = subprocess.run(a, cwd=cwd, env=ENV, capture_output=True, text=True)
    if check and r.returncode: raise SystemExit(f"FAILED: {' '.join(a)}\n{r.stdout}{r.stderr}")
    return r

def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    try:
        origin, ours, theirs = tmp / "origin.git", tmp / "ours", tmp / "theirs"
        run("git", "init", "-q", "--bare", "-b", "main", str(origin))
        run("git", "clone", "-q", str(origin), str(theirs))
        (theirs / "src.json").write_text("old\n"); (theirs / "other.json").write_text("a\n"); (theirs / "data.json").write_text("built:old,a\n")
        run("git", "add", ".", cwd=theirs); run("git", "commit", "-qm", "base", cwd=theirs); run("git", "push", "-q", "origin", "HEAD:main", cwd=theirs)
        run("git", "clone", "-q", str(origin), str(ours))
        # their poll lands first
        (theirs / "other.json").write_text("b\n"); (theirs / "data.json").write_text("built:old,b\n")
        run("git", "commit", "-qam", "their poll", cwd=theirs); run("git", "push", "-q", "origin", "HEAD:main", cwd=theirs)
        # our poll: new source + derived file built from the stale base
        (ours / "src.json").write_text("new\n"); (ours / "data.json").write_text("built:new,a\n")
        rebuild = "printf 'built:%s,%s\\n' \"$(cat src.json)\" \"$(cat other.json)\" > data.json"
        r = run(BASH, SCRIPT, "-n", "test bot", "-m", "our poll", "-s", "src.json", "-a", "data.json", "-r", rebuild, cwd=ours, check=False)
        ok = r.returncode == 0 and "attempt 2" in r.stdout
        run("git", "fetch", "-q", cwd=ours)
        got = {f: run("git", "show", f"origin/main:{f}", cwd=ours).stdout.strip() for f in ("src.json", "other.json", "data.json")}
        want = {"src.json": "new", "other.json": "b", "data.json": "built:new,b"}
        fails = []
        if not ok: fails.append(f"race push did not succeed on attempt 2: {r.stdout}{r.stderr}")
        if got != want: fails.append(f"main after race {got}, want {want}")
        n0 = run("git", "rev-list", "--count", "origin/main", cwd=ours).stdout.strip()
        r2 = run(BASH, SCRIPT, "-n", "test bot", "-m", "again", "-s", "src.json", cwd=ours, check=False)
        if r2.returncode or "no change" not in r2.stdout: fails.append(f"no-change run: {r2.returncode} {r2.stdout}{r2.stderr}")
        run("git", "fetch", "-q", cwd=ours)
        if run("git", "rev-list", "--count", "origin/main", cwd=ours).stdout.strip() != n0: fails.append("no-change run made a commit")
        r3 = run(BASH, SCRIPT, "-m", "x", cwd=ours, check=False)
        if r3.returncode != 2: fails.append("missing -n/-s should exit 2")
        for f in fails: print("FAILED:", f)
        if fails: sys.exit(1)
        print("commit_push test passed (race recovered on attempt 2, both polls kept; no-change is a no-op)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
