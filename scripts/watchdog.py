#!/usr/bin/env python3
"""Pipeline watchdog (.github/workflows/watchdog.yml, twice an hour): checks the meso.watch data from outside the poll and
keeps ONE GitHub issue ("[watchdog] ...") open while something is wrong, closed after 2 clean checks in a row.

Checks (problems(), pure, tested by tests/watchdog_test.py):
  - poll:     last successful "meso.watch poll" run over 2 h ago (cron entries skipped, or every run failing)
  - prices:   meso.watch's price list (mesowatch_prices.json "generated") over 3 h old
  - listings: no live listing newer than 6 h ("listed"), with the listing file's own time ("src_listed") so the issue
              says whether meso.watch stopped publishing them or our side dropped them
Needs GITHUB_TOKEN (issues: write, actions: read) and GITHUB_REPOSITORY. Run with --dry to print without touching issues.
"""
import json, os, pathlib, sys, urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
TITLE = "[watchdog] meso.watch data needs a look"
POLL_MAX, PRICES_MAX, LISTED_MAX = 120, 180, 360   # minutes

def t(s):
    """ISO or "YYYY-MM-DD HH:MM" (UTC) -> aware datetime, None if unreadable"""
    try:
        d = datetime.fromisoformat((s or "").strip().replace("Z", "+00:00").replace(" ", "T"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError: return None

def ago(now, d): return int((now - d).total_seconds() // 60)

def problems(now, last_poll_ok, pw):
    """[(key, text)]: last_poll_ok = ISO time of the newest successful poll run (or None), pw = mesowatch_prices.json"""
    out = []
    p = t(last_poll_ok)
    if p is None or ago(now, p) > POLL_MAX:
        out.append(("poll", f"No successful meso.watch poll for {ago(now, p) // 60} h {ago(now, p) % 60} min." if p else "No successful meso.watch poll found."))
    g = t(pw.get("generated"))
    if g is None or ago(now, g) > PRICES_MAX:
        out.append(("prices", f"meso.watch prices are from {pw.get('generated') or pw.get('read') or 'unknown'} ({ago(now, g) // 60} h old)." if g else "meso.watch prices have no generated time."))
    l, src = t(pw.get("listed")), t(pw.get("src_listed"))
    if l is None or ago(now, l) > LISTED_MAX:
        why = (f"meso.watch's newest listing file is from {pw['src_listed']} UTC, so they stopped publishing live listings (not our drop)."
               if src and ago(now, src) > LISTED_MAX else
               f"meso.watch's listing file is fresh ({pw.get('src_listed')} UTC) but nothing was kept: check scripts/fetch_mesowatch.py."
               if src else "No listing file time recorded.")
        out.append(("listings", f"No live listing newer than {LISTED_MAX // 60} h. {why}"))
    return out

def body(now, probs, clean=0):
    lines = [f"Checked {now:%Y-%m-%d %H:%M} UTC by `scripts/watchdog.py`.", ""]
    lines += [f"- **{k}**: {v}" for k, v in probs] if probs else ["All checks pass."]
    lines += ["", f"<!-- watchdog keys={','.join(k for k, _ in probs)} clean={clean} -->",
              "Closes itself after 2 clean checks in a row. Thresholds and checks: `scripts/watchdog.py`."]
    return "\n".join(lines)

def marker(text, name, default):
    import re
    m = re.search(rf"<!-- watchdog .*?{name}=([^ ]*)", text or "")
    return m.group(1) if m else default

def plan(issue, probs, now):
    """what to do with the open issue (or None): ("none"|"create"|"update"|"comment"|"close", body)"""
    keys = ",".join(k for k, _ in probs)
    if probs:
        if not issue: return "create", body(now, probs)
        # a comment (emails Danny) only when the set of problems changes; otherwise just refresh the body
        return ("comment" if marker(issue["body"], "keys", "") != keys else "update"), body(now, probs)
    if not issue: return "none", ""
    clean = int(marker(issue["body"], "clean", "0") or 0) + 1
    return ("close" if clean >= 2 else "update"), body(now, [], clean)

def api(method, path, data=None):
    req = urllib.request.Request("https://api.github.com" + path, method=method, data=json.dumps(data).encode() if data else None,
                                 headers={"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or "null")

def main():
    dry, repo, now = "--dry" in sys.argv, os.environ.get("GITHUB_REPOSITORY", "TurbosauceDev/MS-Classic-World-Info-Slop"), datetime.now(timezone.utc)
    pw = json.loads((ROOT / "data" / "sources" / "mesowatch_prices.json").read_text())
    runs = api("GET", f"/repos/{repo}/actions/workflows/mesowatch-poll.yml/runs?status=success&per_page=1")["workflow_runs"]
    probs = problems(now, runs[0]["updated_at"] if runs else None, pw)
    issue = next((i for i in api("GET", f"/repos/{repo}/issues?state=open&per_page=50") if i["title"] == TITLE and "pull_request" not in i), None)
    act, text = plan(issue, probs, now)
    print(act, *(f"{k}: {v}" for k, v in probs), sep="\n  ")
    if dry or act == "none": return
    if act == "create": api("POST", f"/repos/{repo}/issues", {"title": TITLE, "body": text})
    else:
        api("PATCH", f"/repos/{repo}/issues/{issue['number']}", {"body": text, **({"state": "closed"} if act == "close" else {})})
        if act == "comment": api("POST", f"/repos/{repo}/issues/{issue['number']}/comments", {"body": "Problems changed:\n" + "\n".join(f"- **{k}**: {v}" for k, v in probs)})

if __name__ == "__main__": main()
