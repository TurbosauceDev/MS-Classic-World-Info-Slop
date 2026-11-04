// The GitHub Pages copy (scripts/pages_site.py): item icons + minimaps in a second file behind a stable assets.json
// pointer (a cached shell must find the current file after a deploy renames the hashed one), the per-poll market data in
// a third (audit P9, prices-<hash>.json behind a stable prices.json pointer, app boots through window.__PRICES), web app
// manifest, offline service worker (stale-while-revalidate for the shell). The artifact (dist/index.html) must stay one
// file with none of that. Run: node tests/pages.js (CI: tests.yml)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const ROOT = path.resolve(__dirname, ".."), OUT = fs.mkdtempSync(path.join(os.tmpdir(), "pages-"));
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };
const TYPES = {".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json"};

(async () => {
  console.log(execFileSync("python3", [path.join(ROOT, "scripts/pages_site.py"), OUT]).toString().trim());
  const files = fs.readdirSync(OUT), assets = files.find(f => /^assets-[0-9a-f]+\.json$/.test(f));
  const pfile = files.find(f => /^prices-[0-9a-f]+\.json$/.test(f)), pointer = JSON.parse(fs.readFileSync(path.join(OUT, "prices.json"), "utf8"));
  const apointer = JSON.parse(fs.readFileSync(path.join(OUT, "assets.json"), "utf8"));
  const dist = fs.statSync(path.join(ROOT, "dist/index.html")).size, first = fs.statSync(path.join(OUT, "index.html")).size;
  check(assets && first < dist * 0.6, `first load ${Math.round(first / 1024)} KB vs ${Math.round(dist / 1024)} KB in one file`);
  check(apointer.url === assets && apointer.keys.join() === "iicons,mmaps,skanim", `assets pointer names the hashed file and covers the lazy keys (${apointer.url})`);
  check(pfile && pointer.url === pfile && ["pw", "mw", "cmp", "mdb"].every(k => pointer.keys.includes(k)), `prices pointer names the hashed file and covers the market keys (${pointer.url})`);
  const shellData = JSON.parse(fs.readFileSync(path.join(OUT, "index.html"), "utf8").match(/<script type="application\/json" id="sitedata">([\s\S]*?)<\/script>/)[1]);
  check(!shellData.pw && shellData.lazy2 === "prices.json" && shellData.lazy?.url === "assets.json", "the pages shell carries no market data, only the pointers");
  const shellHtml = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
  check(/__PRICES = \([\s\S]*Promise\.resolve\(null\)\)\.catch\(\(\) => null\);/.test(shellHtml), "the boot chain ends .catch(() => null): a rejected prices fetch can't leave the app unbooted");
  const art = fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8");
  check(!/rel="manifest"/.test(art) && !/"lazy":/.test(art) && !/lazy2|__PRICES/.test(art), "the artifact build has no manifest and no split");
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.webmanifest"), "utf8"));
  check(man.display === "standalone" && man.icons.every(i => files.includes(i.src)), "manifest: standalone, its icons are deployed");

  let delay = 0, hits = [];
  const srv = http.createServer((q, r) => { let f = path.join(OUT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    hits.push(decodeURIComponent(q.url.split("?")[0]));
    const st = fs.existsSync(f) && fs.statSync(f);
    if (st && st.isDirectory()) f = path.join(f, "index.html");   // clean routes (pages_gen.py): /items/work-gloves/ is a directory index
    if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404, {"content-type": "text/html"}); return r.end(fs.readFileSync(path.join(OUT, "404.html"))) }   // GitHub Pages fidelity: unknown paths render 404.html (the router hops clean app paths back into the app)
    setTimeout(() => { r.writeHead(200, {"content-type": TYPES[path.extname(f)] || "application/octet-stream"}); r.end(fs.readFileSync(f)) }, /assets-/.test(f) ? delay : 0) });
  await new Promise(res => srv.listen(0, "127.0.0.1", res));
  const URL = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const page = async (ua) => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}, ...(ua ? {userAgent: ua} : {})}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); return {p, errs, ctx} };
  const open = (p, t) => p.evaluate(t => { const b = document.querySelector("#t-" + t); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, t);
  const icons = p => p.$$eval("#itrows tr", r => ({rows: r.length, img: r.filter(x => x.querySelector(".ibtn img")).length}));
  const booted = p => p.waitForFunction(() => window.__BOOTED === true, null, {timeout: 30000});

  // 1. a route drawn before the file lands said "No minimap in the game files" for the whole visit: the navigator redraws
  { delay = 8000; const {p, errs, ctx} = await page(); await p.goto(URL); await booted(p);
    await open(p, "navi"); await p.click('#navtowns button[data-id="10002000"]');   // FROM: Ellinia
    await p.fill("#navto", "Monkey Forest I"); await p.click("#navnocab");
    await p.waitForFunction(() => document.querySelectorAll("#navout .navsteps > li").length >= 2);
    const navEarly = await p.$eval("#navout .navsteps > li:first-child", li => ({ mm: !!li.querySelector("details img.mm"), none: li.textContent.includes("No minimap in the game files") }));
    await p.evaluate(() => window.ASSETS); await p.waitForTimeout(100);
    const navLate = await p.$$eval("#navout .navsteps > li", l => ({steps: l.length, mm: l.filter(x => x.querySelector("details img.mm")).length, none: l.filter(x => x.textContent.includes("No minimap in the game files")).length}));
    check(!errs.length && navEarly.none && !navEarly.mm && navLate.steps >= 2 && navLate.mm === navLate.steps && navLate.none === 0, `a route drawn before the minimaps came redraws with them (early: ${JSON.stringify(navEarly)}; after: ${JSON.stringify(navLate)})`);
    await ctx.close(); delay = 0 }

  // 2. icons arrive late (slow phone): what's drawn first gets them patched in; rows drawn later have them; Overview sprites never wait
  { delay = 4000; const {p, errs, ctx} = await page(); await p.goto(URL); await booted(p);
    const home = await p.$$eval("#overview img[data-ic]", l => l.length);
    await open(p, "items"); const early = await icons(p);
    await p.evaluate(() => window.ASSETS); await p.waitForTimeout(50); const late = await icons(p);
    check(!errs.length && home === 37 && early.img < early.rows && late.img === late.rows, `items list gets its icons when the file lands (Home sprites ${home}; before ${JSON.stringify(early)}, after ${JSON.stringify(late)})`);
    await p.click("#itrows .ibtn >> nth=0"); await p.waitForTimeout(100);
    check(await p.$$eval("#items .mtop img.sprite", l => l.length) === 1, "item page shows its sprite");
    await open(p, "quests"); await p.waitForTimeout(100);
    const q = await p.$$eval("#quests .ri", l => ({n: l.length, empty: l.filter(x => !x.querySelector("img") && x.querySelector("i")).length}));
    check(q.n > 0 && q.empty === 0, `quest reward icons all drawn (${JSON.stringify(q)})`);
    await open(p, "inv"); await p.setInputFiles("#ivfile", path.join(ROOT, "tracker/tests/frames-inv/use-12162.png"));
    await p.waitForFunction(() => document.querySelector("#ivbody").children.length > 0, null, {timeout: 60000});
    check(/Lemon/.test(await p.textContent("#ivbody")), "price check reads a Use tab on the split page");
    await ctx.close(); delay = 0 }

  // 3. an open item page from a share link redraws its sprite when the icons land
  { delay = 800; const {p, errs, ctx} = await page(); await p.goto(URL + "#i=" + Buffer.from('"2000000"').toString("base64").replace(/=+$/, "")); await booted(p);
    await p.evaluate(() => window.ASSETS); await p.waitForTimeout(50);
    check(!errs.length && await p.$$eval("#items .mtop img.sprite", l => l.length) === 1, "item page opened before the icons came gets its sprite"); await ctx.close(); delay = 0 }

  // 3b. a deploy can replace the hashed file while a cached shell reads it: the loader re-resolves the pointer once
  { const {p, errs, ctx} = await page(); let killed = 0;
    await p.route(/assets-[0-9a-f]+\.json$/, route => { if (killed++ === 0) route.abort(); else route.continue() });
    await p.goto(URL); await booted(p); await p.evaluate(() => window.ASSETS); await p.waitForTimeout(100);
    const mm = await p.evaluate(() => Object.keys(D.mmaps || {}).length);
    check(!errs.length && killed >= 2 && mm > 100, `a vanished assets file is retried through the pointer (${killed} fetches, ${mm} minimaps)`);
    await ctx.close() }

  // 3c. a prices fetch that rejects at the transport level (offline first visit, connection reset mid-boot) used to
  // reject __PRICES itself — and the whole app lives inside __PRICES.then, so nothing ever booted (round 2)
  { const {p, errs, ctx} = await page();
    await p.route(/prices(-[0-9a-f]+)?\.json$/, route => route.abort());
    await p.goto(URL); await booted(p);
    const items = await p.$$eval("#overview img[data-ic]", l => l.length);
    check(!errs.length && items > 0, `the app boots without prices when the fetch rejects (${items} overview sprites, no page errors)`);
    await ctx.close() }

  // 4. offline: once the service worker has the page, it opens with no network, icons and prices included
  { const {p, errs, ctx} = await page(); await p.goto(URL); await booted(p);
    check(await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length)) === 0, "no service worker on plain http (localhost here)");
    await p.evaluate(() => navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready));
    await p.reload(); await booted(p); await p.evaluate(() => window.ASSETS); await p.waitForTimeout(300);   // controlled now: page + icons + prices cached
    const pwCount = await p.evaluate(() => Object.keys(D.pw?.it || {}).length);
    await ctx.setOffline(true); await p.reload(); await booted(p); await p.evaluate(() => window.ASSETS); await open(p, "items"); await p.waitForTimeout(100);
    const r = await icons(p);
    check(!errs.length && r.rows > 0 && r.img === r.rows && pwCount > 500, `offline reload works, icons and prices included (${JSON.stringify(r)}, pw ${pwCount}; ${errs.join("; ")})`);
    await ctx.close() }

  // 5. a linked mention in a post (Turbozo 11-04): the click opens the entity's clean page, whose redirect hops into the
  //    planner; the browser's Back lands the reader back in the article at the same spot (75-history.js navx mirror)
  { const {p, errs, ctx} = await page("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
    await p.goto(URL); await booted(p);
    if (await p.$(".jbody a[data-ent]")){
      await p.evaluate(() => document.querySelector(".jbody a[data-ent]").scrollIntoView({block: "center"}));
      await p.waitForTimeout(500);   // the debounced {tab, y} mirror must land before the click
      const y = await p.evaluate(() => scrollY);
      await p.click(".jbody a[data-ent]"); await p.waitForLoadState("load"); await p.waitForTimeout(200);
      await p.waitForTimeout(1300);   // the entity page's redirect into the planner + boot
      const planner = await p.evaluate(() => ({hash: location.hash.slice(0, 3), app: !!document.querySelector("nav"), path: location.pathname}));
      const went = hits.find(h => /^\/(items|monsters|maps|skills|quests|npcs)\//.test(h));   // read at the server: the redirect can beat the probe
      await p.goBack(); await p.waitForTimeout(900);
      const back = await p.evaluate(() => ({home: !document.getElementById("home")?.hidden, y: scrollY}));
      check(!errs.length && went && planner.app && planner.path === "/" &&
        back.home && Math.abs(back.y - y) < 3,
        `a mention opens its clean page (${went}) and hops into the planner; Back returns to the article at the same spot (${back.y} vs ${y})`);
    } else check(!errs.length, "no linked mentions in the shipped posts: back-to-article scene skipped");
    await ctx.close() }

  // 6. every page owns its address (Turbozo 11-04): tab clicks rewrite the address bar to the page's clean path,
  //    an open article takes its /news/<slug> address, and Home resets to "/"
  { const {p, errs, ctx} = await page();
    await p.goto(URL); await booted(p);
    await open(p, "wmap"); await p.waitForTimeout(200);
    check(!errs.length && await p.evaluate(() => location.pathname) === "/world-map",
      `opening the World Map puts /world-map in the address bar (${await p.evaluate(() => location.pathname)})`);
    await open(p, "journal"); await p.waitForTimeout(120);
    await p.click("#jlist .jtitle"); await p.waitForTimeout(200);
    const art = await p.evaluate(() => location.pathname);
    check(!errs.length && /^\/news\/[a-z0-9-]+$/.test(art), `an open article takes its /news/<slug> address (${art})`);
    await p.click("#sbhome"); await p.waitForTimeout(200);
    check(await p.evaluate(() => location.pathname) === "/" && !(await p.isHidden("#home")), "Home resets the address bar to / (no more sticky deep links)");
    await p.goBack(); await p.waitForTimeout(250);
    check(await p.evaluate(() => location.pathname) === art, "Back from Home returns to the article's address");
    await ctx.close() }

  await b.close(); srv.close(); fs.rmSync(OUT, {recursive: true, force: true});
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
