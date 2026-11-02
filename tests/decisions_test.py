#!/usr/bin/env python3
"""Lint docs/ai/decisions.md so contradicting calls can't sit side by side unmarked.

Run: python3 tests/decisions_test.py   (CI: docs.yml)

Rules (Danny 2026-11-02, contradiction check):
  1. Every bullet directly under a `## ` section starts with its date: `- YYYY-MM-DD`.
     Exempt: `### ` subsections (embedded specs) and the Open decisions section.
  2. "Open decisions" is the LAST `## ` section and holds no dated decision lines
     (a made call moves up into a topic section, per the transcription rule at the top).
  3. `[superseded YYYY-MM-DD]` on an old line (optionally `[superseded YYYY-MM-DD: why]`):
     the date is on or after the line's own date and some line carries that date.
  4. `[supersedes YYYY-MM-DD]` on a new line: at least one line dated YYYY-MM-DD carries
     `[superseded <new line's date>...]`. Tags come in pairs so either side leads to the other.
Warnings (not failures): a line that says supersede/revoke in prose but has
neither tag. Read it: if it overrides an older call, add the tag pair.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "docs", "ai", "decisions.md")
DATE = re.compile(r"^- (\d{4}-\d{2}-\d{2})\b")
OLD_TAG = re.compile(r"\[superseded (\d{4}-\d{2}-\d{2})(?::[^\]]*)?\]")
NEW_TAG = re.compile(r"\[supersedes (\d{4}-\d{2}-\d{2})\]")
PROSE = re.compile(r"supersed|revok", re.I)


def lint(text):
    """Return (errors, warnings) for decisions.md text."""
    errs, warns = [], []
    lines = text.splitlines()
    section, sub, sections = None, False, []
    rows = []  # (lineno, date, text)
    for n, line in enumerate(lines, 1):
        if line.startswith("## "):
            section, sub = line[3:].strip(), False
            sections.append((n, section))
            continue
        if line.startswith("### "):
            sub = True
            continue
        if not line.startswith("- ") or section is None:
            continue
        m = DATE.match(line)
        is_open = section.lower().startswith("open decisions")
        if is_open:
            if m:
                errs.append(f"line {n}: dated decision under '{section}'; move it to a topic section")
            continue
        if sub:
            continue
        if not m:
            errs.append(f"line {n}: decision line must start with '- YYYY-MM-DD': {line[:70]}")
            continue
        rows.append((n, m.group(1), line))

    opens = [i for i, (_, s) in enumerate(sections) if s.lower().startswith("open decisions")]
    if opens and opens[-1] != len(sections) - 1:
        errs.append(f"'Open decisions' must be the last ## section (sections after it: "
                    f"{', '.join(s for _, s in sections[opens[-1] + 1:])})")

    dates = {d for _, d, _ in rows}
    for n, d, line in rows:
        for t in OLD_TAG.findall(line):
            if t < d:
                errs.append(f"line {n}: [superseded {t}] is older than the line itself ({d})")
            elif t not in dates:
                errs.append(f"line {n}: [superseded {t}] but no decision line is dated {t}")
        for t in NEW_TAG.findall(line):
            if not any(od == t and any(x == d for x in OLD_TAG.findall(ol)) for _, od, ol in rows):
                errs.append(f"line {n}: [supersedes {t}] but no {t} line carries [superseded {d}]")
        if PROSE.search(OLD_TAG.sub("", NEW_TAG.sub("", line))) and not (OLD_TAG.search(line) or NEW_TAG.search(line)):
            warns.append(f"line {n}: says supersede/revoke without a tag: {line[:80]}")
    return errs, warns


def selftest():
    good = ("## Site\n- 2026-10-01 Old call. [superseded 2026-10-05: why]\n"
            "- 2026-10-05 New call. [supersedes 2026-10-01]\n## Open decisions (pending Danny)\n- **ask**\n")
    assert lint(good) == ([], []), lint(good)
    cases = {
        "undated": "## Site\n- no date here\n",
        "dated under open": "## Open decisions\n- 2026-10-01 made call\n",
        "open not last": "## Open decisions\n- **x**\n## Site\n- 2026-10-01 a\n",
        "tag older than line": "## Site\n- 2026-10-05 a [superseded 2026-10-01]\n- 2026-10-01 b\n",
        "tag to missing date": "## Site\n- 2026-10-01 a [superseded 2026-10-09]\n",
        "unpaired supersedes": "## Site\n- 2026-10-01 a\n- 2026-10-05 b [supersedes 2026-10-01]\n",
    }
    for name, t in cases.items():
        assert lint(t)[0], f"selftest '{name}' should fail"
    assert lint("## Site\n- 2026-10-01 this supersedes the old one\n")[1], "prose warning missing"


if __name__ == "__main__":
    selftest()
    errs, warns = lint(open(PATH, encoding="utf-8").read())
    for w in warns:
        print("warn:", w)
    for e in errs:
        print("FAILED:", e)
    if errs:
        print(f"{len(errs)} problem(s) in docs/ai/decisions.md")
        sys.exit(1)
    print(f"decisions test passed ({len(warns)} warning(s))")
