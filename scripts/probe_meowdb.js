// One-off probe: what exactly does the browse API return from a GH runner?
// Mirrors the real fetcher's env (playwright chromium, page-context fetch).
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on("response", r => { if (r.url().includes("/api/")) console.log("NET", r.status(), r.request().method(), r.url().slice(0, 100)); });
  const nav = await p.goto("https://meowdb.com/msclassic", { timeout: 60000 });
  console.log("GOTO status:", nav.status());
  await p.waitForTimeout(5000);
  console.log("TITLE:", await p.title());
  const probe = await p.evaluate(async () => {
    const out = {};
    const hit = async u => {
      try {
        const r = await fetch(u);
        const body = await r.text();
        return { status: r.status, ct: r.headers.get("content-type"), server: r.headers.get("server"), ray: (r.headers.get("cf-ray") || "").slice(0, 12), len: body.length, head: body.slice(0, 220) };
      } catch (e) { return { error: String(e) }; }
    };
    out.items1 = await hit("/msclassic/api/items?page=1");
    await new Promise(z => setTimeout(z, 1500));
    out.browse1 = await hit("/msclassic/api/market-listings/browse?page=1");
    await new Promise(z => setTimeout(z, 1500));
    out.browseBuy = await hit("/msclassic/api/market-listings/browse?side=buy&page=1");
    await new Promise(z => setTimeout(z, 1500));
    out.summary = await hit("/msclassic/api/item-market-summary?itemId=1002001&condition=clean");
    return out;
  });
  console.log("PROBE1 " + JSON.stringify(probe));
  // aggressive catalog crawl like the real fetcher, then browse again (rate-limit self-infliction test)
  const crawl = await p.evaluate(async () => {
    let pages = 0, last = 0;
    for (let i = 1; i < 400; i++) {
      const r = await fetch("/msclassic/api/items?page=" + i);
      last = r.status;
      if (!r.ok) return { pages, last };
      const j = await r.json();
      pages++;
      if (!j.hasMore) return { pages, last };
      await new Promise(z => setTimeout(z, 250));
    }
    return { pages, last };
  });
  console.log("CRAWL " + JSON.stringify(crawl));
  await p.waitForTimeout(3000);
  const probe2 = await p.evaluate(async () => {
    try { const r = await fetch("/msclassic/api/market-listings/browse?page=1"); const t = await r.text(); return { status: r.status, len: t.length, head: t.slice(0, 220) }; }
    catch (e) { return { error: String(e) }; }
  });
  console.log("PROBE2-after-crawl " + JSON.stringify(probe2));
  await p.waitForTimeout(30000);
  const probe3 = await p.evaluate(async () => {
    try { const r = await fetch("/msclassic/api/market-listings/browse?page=1"); const t = await r.text(); return { status: r.status, len: t.length, head: t.slice(0, 220) }; }
    catch (e) { return { error: String(e) }; }
  });
  console.log("PROBE3-after-30s " + JSON.stringify(probe3));
  await b.close();
})().catch(e => { console.log("FATAL " + e.message); process.exit(1); });
