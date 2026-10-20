#!/usr/bin/env python3
"""Build a templated git commit message from the diff of mesowatch_prices.json.

Used by .github/workflows/mesowatch-sync.yml. Refresh_mesowatch.sh already
ran and updated data/sources/mesowatch_prices.json in the working tree. We
diff against HEAD (the version on the default branch before this refresh),
compute a structured summary (top movers, anomaly candidates, live-listing
updates), and template a commit message — no LLM, no API key, no cost.

The prices file has two changing fields:
- items[iid] = [price, p25, p75, sold, flags, trend, sell_through]  (sale-side)
- now[iid]   = [price, qty, channel, map, seller]                   (live ask-side)

We detect both kinds of changes; the commit message reflects whichever moved.

If you later want AI-written commit messages, restore the Claude-call version
from git history (commit 2da935f0a955) and set ANTHROPIC_API_KEY.

Exit codes: 0 on success.
"""
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRICES = ROOT / "data" / "sources" / "mesowatch_prices.json"


def diff_items(prev_items, new_items):
    """Per-item sale price changes. Returns list of (id, old_price, new_price, pct)."""
    changes = []
    for iid, new_v in new_items.items():
        prev_v = prev_items.get(iid)
        if not prev_v or prev_v == new_v:
            continue
        old_price = prev_v[0]
        new_price = new_v[0]
        pct = ((new_price - old_price) / old_price * 100) if old_price else 0
        changes.append((iid, old_price, new_price, pct))
    # Items that disappeared
    for iid, prev_v in prev_items.items():
        if iid not in new_items:
            changes.append((iid, prev_v[0], 0, -100.0))
    return changes


def diff_now(prev_now, new_now):
    """Live listing (ask) changes. Returns list of (id, prev_price, new_price, is_new).
    is_new=True means the item had no listing before but has one now (or vice versa)."""
    changes = []
    for iid, new_v in new_now.items():
        prev_v = prev_now.get(iid)
        if prev_v == new_v:
            continue
        prev_price = prev_v[0] if prev_v else None
        new_price = new_v[0]
        changes.append((iid, prev_price, new_price, prev_v is None))
    for iid, prev_v in prev_now.items():
        if iid not in new_now:
            changes.append((iid, prev_v[0], None, False))
    return changes


def build_diff_summary():
    """Return dict with structured summary, or None if no changes at all."""
    try:
        prev_raw = subprocess.check_output(
            ["git", "show", "HEAD:data/sources/mesowatch_prices.json"],
            cwd=ROOT, stderr=subprocess.DEVNULL,
        ).decode()
    except subprocess.CalledProcessError:
        return None  # file didn't exist before
    prev = json.loads(prev_raw)
    new = json.loads(PRICES.read_text())

    item_changes = diff_items(prev.get("items", {}), new.get("items", {}))
    item_changes.sort(key=lambda c: abs(c[3]), reverse=True)

    now_changes = diff_now(prev.get("now", {}), new.get("now", {}))

    if not item_changes and not now_changes:
        return None

    return {
        "prev_read": prev.get("read", "unknown"),
        "new_read": new.get("read", "unknown"),
        "prev_listed": prev.get("listed", "unknown"),
        "new_listed": new.get("listed", "unknown"),
        "item_changes": item_changes,
        "now_changes": now_changes,
        "anomalies": [c for c in item_changes if abs(c[3]) > 50],
    }


def template_message(d):
    if d is None:
        return "chore(mesowatch): refresh prices (no changes detected)"

    lines = []

    # Subject line
    parts = []
    if d["item_changes"]:
        parts.append(f"{len(d['item_changes'])} items moved")
    if d["now_changes"]:
        parts.append(f"{len(d['now_changes'])} live listings changed")
    if d["anomalies"]:
        parts.append(f"{len(d['anomalies'])} anomalies")
    subject = "chore(mesowatch): refresh prices — " + ", ".join(parts)
    if len(subject) > 80:
        subject = subject[:77] + "..."
    lines.append(subject)

    # Body
    lines.append("")
    lines.append(f"Market read: {d['prev_read']} -> {d['new_read']}")
    if d["prev_listed"] != "unknown" or d["new_listed"] != "unknown":
        lines.append(f"Listings snapshot: {d['prev_listed']} -> {d['new_listed']}")

    if d["item_changes"]:
        lines.append("")
        lines.append("Top sale-price movers:")
        for iid, old, new, pct in d["item_changes"][:3]:
            sign = "+" if pct >= 0 else ""
            lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")

    if d["now_changes"]:
        lines.append("")
        lines.append(f"Live listing changes ({len(d['now_changes'])} items):")
        # Show first 3 items where the new price is meaningfully different
        shown = 0
        for iid, old, new, is_new in d["now_changes"]:
            if shown >= 3:
                break
            if is_new:
                lines.append(f"  - item {iid}: new listing at {new}")
            elif old is None:
                lines.append(f"  - item {iid}: listing removed")
            elif new is None:
                lines.append(f"  - item {iid}: listing removed (was {old})")
            else:
                pct = ((new - old) / old * 100) if old else 0
                sign = "+" if pct >= 0 else ""
                lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")
            shown += 1

    if d["anomalies"]:
        lines.append("")
        lines.append("Anomalies (>50% sale-price move):")
        for iid, old, new, pct in d["anomalies"][:5]:
            sign = "+" if pct >= 0 else ""
            lines.append(f"  - item {iid}: {old} -> {new} ({sign}{pct:.1f}%)")

    return "\n".join(lines)


def main():
    diff = build_diff_summary()
    msg = template_message(diff)
    print(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
