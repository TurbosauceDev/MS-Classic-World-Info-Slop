#!/usr/bin/env python3
"""Push arbitrary files to a GitHub repo via the Git Data API (no clone).

Used by meso_watch_poll.sh to push the CSVs to data/mesowatch-sync, and
by one-off invocations to push handoff docs / decisions.md updates to the
default branch.

Usage:
  python3 gh_push_files.py --branch <branch> \\
      --message "<commit message>" \\
      --file <local_path>:<repo_path> [--file <local_path>:<repo_path> ...]

If the target branch doesn't exist, it's created from the default branch
(`main`) HEAD.

Requires /home/z/my-project/.secrets/gh-token (fine-grained PAT with
Contents:write on the target repo).
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "TurbosauceDev"
REPO = "MS-Classic-World-Info-Slop"
DEFAULT_BRANCH = "main"
TOKEN_FILE = os.environ.get("MESO_WATCH_GH_TOKEN_FILE",
               str(Path(os.environ.get("MESO_WATCH_ROOT", "/home/z/my-project")) / ".secrets" / "gh-token"))
API = "https://api.github.com"


def log(msg):
    print(f"[gh-push] {msg}", flush=True)


def req(method, path, body=None, expect=()):
    token = Path(TOKEN_FILE).read_text().strip()
    url = f"{API}/repos/{OWNER}/{REPO}/{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "meso-watch-poller/1.0",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as r:
            status = r.status
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode("utf-8")
        if status not in expect:
            log(f"HTTP {status} on {method} {path}: {raw[:500]}")
            raise
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
    return status, parsed


def get_branch_head(branch):
    """Return HEAD commit SHA of branch, or None if branch doesn't exist."""
    status, body = req("GET", f"git/ref/heads/{branch}", expect=(404,))
    if status == 200:
        return body["object"]["sha"]
    if status == 404:
        return None
    raise RuntimeError(f"unexpected status {status} fetching branch {branch}")


def create_branch_from(branch, base_sha):
    """Create a new ref under refs/heads/{branch} pointing to base_sha."""
    status, body = req("POST", "git/refs", {
        "ref": f"refs/heads/{branch}",
        "sha": base_sha,
    }, expect=(422,))
    if status == 201:
        return base_sha
    if status == 422:
        # Race — someone else just created it. Fetch its real HEAD.
        return get_branch_head(branch)
    raise RuntimeError(f"branch create failed: HTTP {status} body={body}")


def get_commit_tree(commit_sha):
    status, body = req("GET", f"git/commits/{commit_sha}")
    if status != 200:
        raise RuntimeError(f"could not get commit: HTTP {status}")
    return body["tree"]["sha"]


def create_blob(content_bytes):
    b64 = base64.b64encode(content_bytes).decode("ascii")
    status, body = req("POST", "git/blobs", {"content": b64, "encoding": "base64"})
    if status != 201:
        raise RuntimeError(f"blob create failed: HTTP {status}")
    return body["sha"]


def create_tree(base_tree_sha, items):
    status, body = req("POST", "git/trees", {
        "base_tree": base_tree_sha,
        "tree": items,
    })
    if status != 201:
        raise RuntimeError(f"tree create failed: HTTP {status}")
    return body["sha"]


def create_commit(parent_sha, tree_sha, message):
    status, body = req("POST", "git/commits", {
        "parents": [parent_sha],
        "tree": tree_sha,
        "message": message,
    })
    if status != 201:
        raise RuntimeError(f"commit create failed: HTTP {status}")
    return body["sha"]


def update_branch_ref(branch, commit_sha, force=False):
    # NOTE: PATCH requires `git/refs/...` (PLURAL). The singular `git/ref/...`
    # form returns 404 for PATCH even though it works for GET.
    status, body = req("PATCH", f"git/refs/heads/{branch}",
                       {"sha": commit_sha, "force": force}, expect=(422,))
    if status == 200:
        return body["object"]["sha"]
    if status == 422:
        # Race — someone else updated the branch since we fetched HEAD.
        # Caller should retry with the new HEAD.
        return None
    raise RuntimeError(f"ref update failed: HTTP {status} body={body}")


def file_size_label(n):
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/(1024*1024):.2f} MB"


def push_files(branch, files, message, max_retries=3):
    """files = list of (local_path, repo_path) tuples."""
    # Validate inputs
    for local, repo_path in files:
        if not Path(local).exists():
            log(f"ERROR: source file missing: {local}")
            sys.exit(1)

    # Resolve target branch HEAD (create from default if missing)
    head_sha = get_branch_head(branch)
    if head_sha is None:
        log(f"Branch '{branch}' does not exist — creating from {DEFAULT_BRANCH}")
        base_sha = get_branch_head(DEFAULT_BRANCH)
        if base_sha is None:
            raise RuntimeError(f"default branch {DEFAULT_BRANCH} not found")
        head_sha = create_branch_from(branch, base_sha)
        log(f"Created branch {branch} at {head_sha[:12]}")

    for attempt in range(1, max_retries + 1):
        log(f"Attempt {attempt}/{max_retries}. HEAD={head_sha[:12]}")
        base_tree_sha = get_commit_tree(head_sha)
        log(f"Base tree: {base_tree_sha[:12]}")

        tree_items = []
        summary_lines = []
        for local, repo_path in files:
            content = Path(local).read_bytes()
            blob_sha = create_blob(content)
            log(f"  blob for {repo_path}: {blob_sha[:12]} ({file_size_label(len(content))})")
            tree_items.append({
                "path": repo_path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha,
            })
            summary_lines.append(f"- {repo_path} ({file_size_label(len(content))})")

        new_tree_sha = create_tree(base_tree_sha, tree_items)
        log(f"New tree: {new_tree_sha[:12]}")

        new_commit_sha = create_commit(head_sha, new_tree_sha, message)
        log(f"New commit: {new_commit_sha[:12]}")

        new_head = update_branch_ref(branch, new_commit_sha, force=False)
        if new_head is None:
            log("Race detected (branch moved under us). Re-fetching HEAD and retrying...")
            head_sha = get_branch_head(branch)
            if head_sha is None:
                raise RuntimeError("branch vanished during push")
            continue
        log(f"Branch '{branch}' updated to {new_head[:12]}")
        log(f"View: https://github.com/{OWNER}/{REPO}/commit/{new_commit_sha}")
        return new_commit_sha

    raise RuntimeError(f"push failed after {max_retries} attempts (race kept happening)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", required=True, help="Target branch (created from default if missing)")
    parser.add_argument("--message", required=True, help="Commit message")
    parser.add_argument("--file", action="append", required=True, metavar="LOCAL:REPO",
                        help="File pair, e.g. /tmp/x.csv:data/path/x.csv")
    args = parser.parse_args()

    files = []
    for spec in args.file:
        if ":" not in spec:
            log(f"ERROR: --file '{spec}' must be LOCAL:REPO")
            sys.exit(1)
        local, repo_path = spec.split(":", 1)
        files.append((local, repo_path))

    push_files(args.branch, files, args.message)


if __name__ == "__main__":
    main()
