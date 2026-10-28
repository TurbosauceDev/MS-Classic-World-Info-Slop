// Probe v3: validate the no-browse strategy + headed fallback for the meowdb market wall.
// A) headed under xvfb: does a real display browser pass the browse wall (UA vs webdriver signal)?
// B) shell-headless mini end-to-end: catalog crawl -> map want -> per-item listings + summaries (statuses, sizes, sample rows).
// Run: xvfb-run -a node scripts/probe_meowdb.js
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
(async () => {
  // ----- A) headed mode under xvfb -----
  console.log("===== A) headed (xvfb) =====");
  try {
    const b = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
    const p = await b.newPage();
    await p.goto("https://meowdb.com/msclassic", { timeout: 60000 });
    await p.waitForTimeout(2000);
    console.log("ENV " + JSON.stringify(await p.evaluate(() => ({ ua: navigator.userAgent, wd: navigator.webdriver }))));
    const r1 = await p.evaluate(async () => {
      const r = await fetch("/msclassic/api/market-listings/browse?page=1");
      return { s: r.status, head: (await r.text()).slice(0, 80) };
    });
    console.log("browse(headed): " + JSON.stringify(r1));
    if (r1.s !== 200) {
      // is the trigger navigator.webdriver? mask it and retry
      const p2 = await b.newPage();
      await p2.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
      await p2.goto("https://meowdb.com/msclassic", { timeout: 60000 });
      await p2.waitForTimeout(2000);
      const r2 = await p2.evaluate(async () => {
        const r = await fetch("/msclassic/api/market-listings/browse?page=1");
        return { s: r.status, head: (await r.text()).slice(0, 80) };
      });
      console.log("browse(headed+wd-masked): " + JSON.stringify(r2));
    }
    await b.close();
  } catch (e) { console.log("A-FAIL " + e.message.split("\n")[0]); }

  // ----- B) no-browse mini end-to-end in the plain headless shell -----
  console.log("===== B) shell-headless no-browse =====");
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("https://meowdb.com/msclassic", { timeout: 60000 });
  const home = await p.evaluate(async () => {
    for (let i = 0; i < 3; i++){ const r = await fetch("/msclassic/api/free-market/home?locale=en"); if (r.ok) return r.json(); await new Promise(z => setTimeout(z, 1500)) }
    return null;
  });
  console.log("HOME " + JSON.stringify(home || { err: "home fail" }).slice(0, 700));

  const want = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data/data.json"))).pw?.it || {}).slice(0, 40);
  const t0 = Date.now();
  const mini = await p.evaluate(async ({ want }) => {
    const nap = () => new Promise(z => setTimeout(z, 250));
    const get = async u => { for (let i = 0; i < 3; i++){ const r = await fetch(u); if (r.ok) return r.json(); await new Promise(z => setTimeout(z, 1500 * (i + 1))) } return null };
    const cat = [];
    for (let i = 1; i < 400; i++){ const j = await get("/msclassic/api/items?page=" + i); if (!j) return { err: "catalog p" + i }; cat.push(...j.items); if (!j.hasMore) break; await nap() }
    const mdb = Object.fromEntries(cat.map(x => [x.iconKey, x.id]));
    const ids = want.map(g => mdb[g]).filter(Boolean);
    let okS = 0, failS = 0, priced = 0, okL = 0, failL = 0, listed = 0, wall = null, sample = null;
    for (const id of ids) {
      const s = await get(`/msclassic/api/item-market-summary?itemId=${id}&condition=clean`);
      if (s) { okS++; if (s.usual != null || s.cheapestSell != null) priced++; if (!sample && s.usual != null) sample = s; } else failS++;
      await nap();
      const l = await get("/msclassic/api/market-listings?itemId=" + id);
      if (l) { okL++; if ((l.listings || []).some(x => x.status === "active")) listed++; } else failL++;
      const raw = await fetch(`/msclassic/api/market-listings?itemId=${id}`).then(r => r.text()).catch(() => "");
      if (raw.includes("Headless browsers are blocked")) { wall = id; break; }
      await nap();
    }
    return { want: want.length, mapped: ids.length, okS, failS, priced, okL, failL, listed, wall, sample, secs: Math.round((Date.now() - t0) / 1000) };
  }, { want }).catch(e => ({ err: e.message.slice(0, 120) }));
  console.log("MINI " + JSON.stringify(mini).slice(0, 900));
  await b.close();
})().catch(e => { console.log("FATAL " + e.message); process.exit(1); });
