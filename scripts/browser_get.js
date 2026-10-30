#!/usr/bin/env node
/* Session-mode browser fetch: reads one request per stdin line, writes one JSON line per request to stdout.
   Line protocol:
     goto <url>    navigate the page (first contact / challenge clearing / new origins)
     fetch <url>   in-page fetch() from the current origin (fast; cookies apply; JSON APIs)
   Reply line: {ok, status, body} — body is response text (JSON APIs come back as text).
   A goto that lands on a challenge page retries up to 3 times with a 6 s wait, then reports ok:false.
   Used by the Python pollers when a site answers its anti-bot challenge to plain urllib (classicrank runner 403s). Allowed since Danny lifted the 10-20 never-bypass rule (decisions.md
   2026-10-28): public keyless endpoints only, no logins, no solving services. Needs playwright chromium. */
const { chromium } = require("playwright");
const readline = require("readline");

const CHALLENGE = /just a moment|checking your browser|verify you are human|being verified|enable javascript and cookies|attention required/i;
const looksJson = (s) => /^[\s]*[[{"]/.test(s);
const origins = new Set();
let AUTH = "";   // optional bearer value, set with an "auth <value>" line; sent on in-page fetches

(async () => {
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  const page = await ctx.newPage();

  async function gotoFetch(url, wantJson) {
    let status = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await page.waitForTimeout(6000);   // give a challenge a beat to clear, then retry
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(700);
      status = resp ? resp.status() : 0;
      const ctype = (resp && resp.headers()["content-type"]) || "";
      const body = await page.locator("body").innerText({ timeout: 10000 });
      // wantJson: an API reply must BE json; a 200 html page here is the wall's verification splash
      const good = status === 200 && !CHALLENGE.test(body.slice(0, 500)) && (!wantJson || (!/text\/html/i.test(ctype) && looksJson(body)));
      if (good) {
        origins.add(new URL(url).origin);
        return { ok: true, status, body };
      }
    }
    return { ok: false, status, body: "", error: wantJson ? "no json reply (challenge held)" : "challenge not cleared" };
  }

  async function pageFetch(url, wantJson) {
    // in-page fetch: same browser context (cookies, TLS), no navigation; falls back to goto on a wall.
    // The evaluate is bounded (25 s): a site that accepts the connection and never answers (rate-limit tarpit)
    // must not block the line protocol forever — the shopscans poll hung 20 min exactly like that on 10-28.
    try {
      const r = await Promise.race([
        page.evaluate(async ({ u, auth }) => {
          const res = await fetch(u, { headers: { accept: "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}) } });
          return { status: res.status, text: await res.text() };
        }, { url, auth: AUTH }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("in-page fetch timed out after 25000 ms")), 25000)),
      ]);
      if (r.status === 200 && !CHALLENGE.test(r.text.slice(0, 500)) && (!wantJson || looksJson(r.text))) {
        return { ok: true, status: r.status, body: r.text };
      }
      origins.delete(new URL(url).origin);
      return await gotoFetch(url, wantJson);   // challenge re-armed or odd reply: re-establish with a real navigation
    } catch (e) {
      return { ok: false, status: 0, body: "", error: String((e && e.message) || e).split("\n")[0] };
    }
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    const tok = t.split(/\s+/);
    const mode = (tok[0] || "").toLowerCase();
    if (mode === "auth") { AUTH = tok.slice(1).join(" "); continue; }
    const url = tok[1] || "";
    const wantJson = (tok[2] || "").toLowerCase() === "json";
    let out;
    try {
      if (mode === "fetch" && url && origins.has(new URL(url).origin)) out = await pageFetch(url, wantJson);
      else out = await gotoFetch(url, wantJson);   // goto, fresh origin (warms it), or empty url (errors out)
    } catch (e) {
      out = { ok: false, status: 0, body: "", error: String((e && e.message) || e).split("\n")[0] };
    }
    process.stdout.write(JSON.stringify(out) + "\n");
  }
  await browser.close();
})().catch(e => { console.error("browser_get fatal: " + e.message); process.exit(1); });
