#!/usr/bin/env python3
"""Fallback fetch through a real (headless) Chromium for sites that answer their anti-bot challenge to
plain urllib (classicrank's runner 403s). Allowed since Danny lifted the 10-20
never-bypass rule (decisions.md 2026-10-28): public, keyless endpoints only, no logins, no solving services.
One Chromium stays warm for the whole process. get(url) returns parsed JSON: the first call per origin
navigates (clears any challenge), later same-origin calls switch to in-page fetch (~10x faster, cookies
apply). Callers keep their plain-urllib path primary and their old-data graceful degradation unchanged."""
import json
import pathlib
import shutil
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent


class BrowserSession:
    """Lazy persistent browser_get.js subprocess; line protocol in scripts/browser_get.js."""

    def __init__(self):
        self.proc = None
        self.warmed = set()   # origins whose challenge is cleared (same-origin calls use in-page fetch)

    def _start(self):
        node = shutil.which("node")
        if not node:
            raise RuntimeError("node not on PATH: browser fallback unavailable")
        cwd = str(ROOT)
        probe = subprocess.run([node, "-e", "require('playwright')"], cwd=cwd, capture_output=True)
        if probe.returncode != 0:
            tr = ROOT / "tracker"
            if (tr / "node_modules" / "playwright").exists():
                cwd = str(tr)
            else:
                raise RuntimeError("playwright not installed (npm i playwright && npx playwright install chromium)")
        self.proc = subprocess.Popen(
            [node, str(ROOT / "scripts" / "browser_get.js")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, cwd=cwd,
        )

    def _ask(self, line):
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()
        reply = self.proc.stdout.readline()
        if not reply:
            raise RuntimeError("browser_get.js died mid-session")
        return json.loads(reply)

    def auth(self, key):
        """Set a bearer value for in-page fetches (call before get(); no-op until the session starts)."""
        if self.proc is None:
            self._start()
        self._ask("auth " + key)

    def get(self, url):
        """Fetch url, return the parsed JSON body. Raises on challenge-not-cleared / dead pipe / bad JSON."""
        if self.proc is None:
            self._start()
        origin = "{0.scheme}://{0.netloc}".format(urllib.parse.urlsplit(url))
        if origin in self.warmed:
            r = self._ask("fetch " + url + " json")
            if not r.get("ok"):
                r = self._ask("goto " + url + " json")   # in-page path failed (re-armed wall): navigate once more
        else:
            r = self._ask("goto " + url + " json")
        if not r.get("ok"):
            raise RuntimeError("challenge not cleared via browser: " + (r.get("error") or "status %s" % r.get("status")))
        self.warmed.add(origin)
        return json.loads(r["body"])

    def close(self):
        if self.proc:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=10)
            except Exception:
                self.proc.kill()
            self.proc = None
