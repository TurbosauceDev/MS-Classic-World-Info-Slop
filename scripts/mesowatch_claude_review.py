#!/usr/bin/env python3
"""Build a templated git commit message from the diff of mesowatch_prices.json.

Used by .github/workflows/mesowatch-sync.yml. Refresh_mesowatch.sh already
ran and updated data/sources/mesowatch_prices.json in the working tree. We
diff against HEAD (the version on the default branch before this refresh),
compute a structured summary (top movers, anomaly candidates), and template
a commit message — no LLM, no API key, no cost.

If you later want AI-written commit messages, the previous version of this
script (in git history) called the Anthropic API with the diff summary.
Restore that file and set ANTHROPIC_API_KEY as a repo Actions secret to
re-enable it.

Exit codes: 0 on success.
"""
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRICES = ROOT / "data" / "sources" / "mesowatch_prices.json"


def build_diff_summary():
    """Return (summary_text, prev_read, new_read, top_movers, anomalies) or None if no changes."""
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
    top_movers = changes[:5]
    anomalies = [c for c in changes if abs(c[3]) > 50]

    lines = [
        f"Total items changed: {len(changes)}",
        f"Items moved >10%: {sum(1 for c in changes if abs(c[3]) > 10)}",
        f"Items moved >50% (anomalies): {len(anomalies)}",
        "",
        "Top 5 changes (by absolute % move):",
    ]
    for iid, old, new, pct, old_sold, new_sold in top_movers:
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

    return {
        "summary": "\n".join(lines),
        "prev_read": prev.get("read", "unknown"),
        "new_read": new.get("read", "unknown"),
        "total_changed": len(changes),
        "anomalies_count": len(anomalies),
        "top_movers": top_movers,
        "anomalies": anomalies,
    }


def template_message(d):
    """Build a commit message string from the diff summary dict."""
    if d is None:
        return "chore(mesowatch): refresh prices (no items changed)"

    subject = (
        f"chore(mesowatch): refresh prices — "
        f"{d['total_changed']} items changed, {d['anomalies_count']} anomalies"
    )
    # Subject line should be reasonable length
    if len(subject) > 80:
        subject = subject[:77] + "..."

    body_lines = [f"Market read: {d['prev_read']} -> {d['new_read']}"]
    if d["top_movers"]:
        body_lines.append("")
        body_lines.append("Top movers:")
        for iid, old, new, pct, _, _ in d["top_movers"][:3]:
            sign = "+" if pct >= 0 else ""
            body_lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")
    if d["anomalies"]:
        body_lines.append("")
        body_lines.append(f"Anomalies (>50% move):")
        for iid, old, new, pct, _, _ in d["anomalies"][:5]:
            sign = "+" if pct >= 0 else ""
            body_lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")

    return subject + "\n\n" + "\n".join(body_lines)


def main():
    diff = build_diff_summary()
    msg = template_message(diff)
    print(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
