#!/usr/bin/env python3
"""Call Anthropic API with a structured diff summary of mesowatch_prices.json;
get back a concise git commit message. Prints the message to stdout.

Used by .github/workflows/mesowatch-sync.yml. Refresh_mesowatch.sh already
ran and updated data/sources/mesowatch_prices.json in the working tree. We
diff against HEAD (the version on the default branch before this refresh),
build a structured summary (top movers, anomaly candidates), and ask Claude
to turn it into a commit message.

Why Claude here and not just a templated message: Claude reads the actual
move pattern and surfaces the right framing ("market cooling off", "single
whale-driven spike on item X", etc.) without us having to encode every
edge case. The diff data is what's deterministic; the framing is what's AI.

Env: ANTHROPIC_API_KEY (required). If absent, the script falls back to a
plain templated message so the workflow still commits something useful.

Exit codes: 0 on success (Claude or fallback), 1 on API error after fallback
attempted.
"""
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRICES = ROOT / "data" / "sources" / "mesowatch_prices.json"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
API_URL = "https://api.anthropic.com/v1/messages"


def build_diff_summary():
    """Return (summary_text, prev_read, new_read) or None if no changes."""
    # Get HEAD version of the file (committed on default branch before refresh)
    try:
        prev_raw = subprocess.check_output(
            ["git", "show", "HEAD:data/sources/mesowatch_prices.json"],
            cwd=ROOT, stderr=subprocess.DEVNULL,
        ).decode()
    except subprocess.CalledProcessError:
        return None  # file didn't exist before — fresh
    prev = json.loads(prev_raw)
    new = json.loads(PRICES.read_text())

    prev_items = prev.get("items", {})
    new_items = new.get("items", {})

    changes = []   # (id, old_price, new_price, pct, old_sold, new_sold)
    for iid, new_v in new_items.items():
        prev_v = prev_items.get(iid)
        if not prev_v or prev_v == new_v:
            continue
        old_price = prev_v[0]
        new_price = new_v[0]
        pct = ((new_price - old_price) / old_price * 100) if old_price else 0
        changes.append((iid, old_price, new_price, pct, prev_v[3], new_v[3]))

    # Also catch items that disappeared (in prev but not new)
    for iid, prev_v in prev_items.items():
        if iid not in new_items:
            changes.append((iid, prev_v[0], 0, -100.0, prev_v[3], 0))

    if not changes:
        return None

    changes.sort(key=lambda c: abs(c[3]), reverse=True)
    top10 = changes[:10]
    big_moves = [c for c in changes if abs(c[3]) > 10]
    anomalies = [c for c in changes if abs(c[3]) > 50]

    lines = [
        f"Total items changed: {len(changes)}",
        f"Items moved >10%: {len(big_moves)}",
        f"Items moved >50% (anomalies): {len(anomalies)}",
        "",
        "Top 10 changes (by absolute % move):",
    ]
    for iid, old, new, pct, old_sold, new_sold in top10:
        sign = "+" if pct >= 0 else ""
        lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)  sold {old_sold}->{new_sold}")
    if anomalies:
        lines.append("")
        lines.append("Anomaly candidates (>50% move):")
        for iid, old, new, pct, _, _ in anomalies[:10]:
            sign = "+" if pct >= 0 else ""
            lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")
    lines.append("")
    lines.append(f"Previous market read: {prev.get('read', 'unknown')}")
    lines.append(f"New market read:      {new.get('read', 'unknown')}")

    return "\n".join(lines), prev.get("read", "unknown"), new.get("read", "unknown")


def fallback_message(summary_data):
    """Plain templated commit message — used when API call fails or no key."""
    if summary_data is None:
        return "chore(mesowatch): refresh prices (no items changed)"
    summary, prev_read, new_read = summary_data
    # Extract just the headline counts from the summary
    total = "unknown"
    anomalies_count = "unknown"
    for line in summary.splitlines():
        if line.startswith("Total items changed:"):
            total = line.split(":")[1].strip()
        elif line.startswith("Items moved >50%"):
            anomalies_count = line.split(":")[1].strip()
    return (
        f"chore(mesowatch): refresh prices — {total} items changed, "
        f"{anomalies_count} anomalies\n\nMarket read: {prev_read} -> {new_read}"
    )


def ask_claude(summary):
    """Call Anthropic API; return the commit message text Claude wrote."""
    prompt = f"""You are writing a git commit message for an automated meso.watch pricing refresh on the MapleStory Classic World planner site.

Here is the structured diff summary:

{summary}

Write a git commit message in this exact format:
- Subject line (max 80 chars): "chore(mesowatch): refresh prices — <X> items changed, <Y> anomalies"
- Blank line
- Body (max 400 chars): one or two sentences summarizing the pattern. Mention market read date(s), name the top 2-3 movers by item ID + %, and list anomalies by item ID if any.

Rules:
- Plain text only. No markdown, no code blocks, no commentary.
- Output ONLY the commit message — nothing before or after.
- Item IDs are 7-digit numbers like 4010001 — keep them as-is, no renaming.
- If a single item dominates the change (e.g. >50% of the move), call that out specifically.
"""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None  # caller falls back

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL, data=body, method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode())
        return resp["content"][0]["text"].strip()
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, IndexError) as e:
        sys.stderr.write(f"[mesowatch_claude_review] API call failed: {e}\n")
        return None


def main():
    summary_data = build_diff_summary()
    if summary_data is None:
        print("chore(mesowatch): refresh prices (no items changed)")
        return 0
    summary, _, _ = summary_data
    msg = ask_claude(summary)
    if not msg:
        msg = fallback_message(summary_data)
        sys.stderr.write("[mesowatch_claude_review] using fallback message\n")
    print(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
