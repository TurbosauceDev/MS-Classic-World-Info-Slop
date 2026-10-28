// Probe v2: which launch mode clears meowdb's "Headless browsers are blocked here" wall?
// Modes: (1) default headless shell [baseline, expect 403], (2) channel 'chromium' new headless, (3) headed under xvfb.
// Also checks whether the wall covers item-market-summary / market-listings / drops / mesos-reports / npc-shops,
// and prints UA + navigator.webdriver per mode. Run: xvfb-run -a node scripts/probe_meowdb.js
const { chromium } = require("playwright");
const MODES = [
  ["shell-headless", {}],
  ["new-headless", { channel: "chromium" }],
  ["headed", { headless: false, args: ["--no-sandbox"] }],
];
(async () => {
  for (const [name, opts] of MODES) {
    console.log(`\n===== MODE ${name} (${JSON.stringify(opts)}) =====`);
    let b;
    try { b = await chromium.launch(opts); } catch (e) { console.log(`LAUNCH-FAIL ${name}: ${e.message.split("\n")[0]}`); continue; }
    try {
      const p = await b.newPage();
      const nav = await p.goto("https://meowdb.com/msclassic", { timeout: 60000 });
      await p.waitForTimeout(3000);
      console.log(`goto=${nav.status()} title=${await p.title()}`);
      const env = await p.evaluate(() => ({ ua: navigator.userAgent, wd: navigator.webdriver, langs: navigator.languages.length }));
      console.log("ENV " + JSON.stringify(env));
      const probe = await p.evaluate(async () => {
        const out = {};
        const hit = async (tag, u) => {
          try { const r = await fetch(u); const t = await r.text(); out[tag] = { s: r.status, len: t.length, head: t.slice(0, 120) }; }
          catch (e) { out[tag] = { err: String(e).slice(0, 80) }; }
          await new Promise(z => setTimeout(z, 800));
        };
        const cat = await fetch("/msclassic/api/items?page=1").then(r => r.json()).catch(() => null);
        const firstId = cat && cat.items && cat.items[0] ? cat.items[0].id : 1;
        await hit("catalog", "/msclassic/api/items?page=1");
        await hit("browse", "/msclassic/api/market-listings/browse?page=1");
        await hit("browseBuy", "/msclassic/api/market-listings/browse?side=buy&page=1");
        await hit("summary", `/msclassic/api/item-market-summary?itemId=${firstId}&condition=clean`);
        await hit("listings", `/msclassic/api/market-listings?itemId=${firstId}`);
        await hit("drops", "/msclassic/api/drops?monsterId=130101");
        await hit("mesos", "/msclassic/api/mesos-reports?monsterId=130101");
        await hit("shopsPage", "/msclassic/npc-shops");
        return out;
      });
      for (const [k, v] of Object.entries(probe)) console.log(`  ${k}: ${JSON.stringify(v)}`);
    } catch (e) { console.log(`MODE-FAIL ${name}: ${e.message.split("\n")[0]}`); }
    finally { await b.close(); }
  }
})().catch(e => { console.log("FATAL " + e.message); process.exit(1); });
