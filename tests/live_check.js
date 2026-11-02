// Post-deploy check against the live site (the full smoke.js can't run there: it reads app globals like BLD, and the Pages copy
// wraps the app script in a promise callback). Run: node tests/live_check.js [url]. Waits for data-ready, opens Settings,
// visits every tab, checks Copy link gives a clean address and that no page error fired.
const { chromium } = require("playwright");
(async () => {
  const url = process.argv[2] || "https://maplestory.scumlord.studio/";
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1300, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] }), p = await c.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 30000 });
  const stamp = await p.evaluate(() => (/Site version[^\n]*/.exec(document.body.innerText) || [""])[0]);
  console.log(stamp);
  await p.click("#thopen"); await p.click('#navmode [data-nv="rows"]'); await p.click('#navmode [data-nv="side"]'); await p.click("#thclose");
  const tabs = await p.$$eval("[data-tab]", l => [...new Set(l.map(x => x.dataset.tab))]);
  for (const t of tabs) { await p.evaluate(t => { const el = document.querySelector(`[data-tab="${t}"]`); el && el.click() }, t); await p.waitForTimeout(150) }
  console.log(`visited ${tabs.length} tabs`);
  await p.goto(url + "#i=IjIwNDA1MDYi"); await p.reload(); await p.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await p.click("#itshare"); const link = await p.evaluate(() => navigator.clipboard.readText());
  if (!/^https:\/\/maplestory\.scumlord\.studio\/items\/[a-z0-9-]+\/$/.test(link)) errs.push("Copy link is not a clean address: " + link);
  else console.log("copy link:", link);
  await b.close();
  if (errs.length) { console.error("FAILED", errs); process.exit(1) }
  console.log("live check passed");
})();
