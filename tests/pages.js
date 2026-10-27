// The GitHub Pages copy (scripts/pages_site.py): item icons + minimaps in a second file, web app manifest, offline service
// worker. The artifact (dist/index.html) must stay one file with neither. Run: node tests/pages.js (CI: tests.yml)
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
  const dist = fs.statSync(path.join(ROOT, "dist/index.html")).size, first = fs.statSync(path.join(OUT, "index.html")).size;
  check(assets && first < dist * 0.6, `first load ${Math.round(first / 1024)} KB vs ${Math.round(dist / 1024)} KB in one file`);
  const art = fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8");
  check(!/rel="manifest"/.test(art) && !/"lazy":/.test(art), "the artifact build has no manifest and no split");
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.webmanifest"), "utf8"));
  check(man.display === "standalone" && man.icons.every(i => files.includes(i.src)), "manifest: standalone, its icons are deployed");

  let delay = 0;
  const srv = http.createServer((q, r) => { const f = path.join(OUT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    if (!f.startsWith(OUT) || !fs.existsSync(f)) { r.writeHead(404); return r.end() }
    setTimeout(() => { r.writeHead(200, {"content-type": TYPES[path.extname(f)] || "application/octet-stream"}); r.end(fs.readFileSync(f)) }, /assets-/.test(f) ? delay : 0) });
  await new Promise(res => srv.listen(0, "127.0.0.1", res));
  const URL = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const page = async () => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); return {p, errs, ctx} };
  const open = (p, t) => p.evaluate(t => { const b = document.querySelector("#t-" + t); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, t);
  const icons = p => p.$$eval("#itrows tr", r => ({rows: r.length, img: r.filter(x => x.querySelector(".ibtn img")).length}));

  // 1. icons arrive late (slow phone): what's drawn first gets them patched in; rows drawn later have them; Home sprites never wait
  { delay = 1500; const {p, errs, ctx} = await page(); await p.goto(URL);
    const home = await p.$$eval("#home img[data-ic]", l => l.length);
    await open(p, "items"); const early = await icons(p);
    await p.evaluate(() => ASSETS); await p.waitForTimeout(50); const late = await icons(p);
    check(!errs.length && home === 34 && early.img < early.rows && late.img === late.rows, `items list gets its icons when the file lands (Home sprites ${home}; before ${JSON.stringify(early)}, after ${JSON.stringify(late)})`);
    await p.click("#itrows .ibtn >> nth=0"); await p.waitForTimeout(100);
    check(await p.$$eval("#items .mtop img.sprite", l => l.length) === 1, "item page shows its sprite");
    await open(p, "quests"); await p.waitForTimeout(100);
    const q = await p.$$eval("#quests .ri", l => ({n: l.length, empty: l.filter(x => !x.querySelector("img") && x.querySelector("i")).length}));
    check(q.n > 0 && q.empty === 0, `quest reward icons all drawn (${JSON.stringify(q)})`);
    await open(p, "inv"); await p.setInputFiles("#ivfile", path.join(ROOT, "tracker/tests/frames-inv/use-12162.png"));
    await p.waitForFunction(() => document.querySelector("#ivbody").children.length > 0, null, {timeout: 60000});
    check(/Lemon/.test(await p.textContent("#ivbody")), "price check reads a Use tab on the split page");
    await ctx.close(); delay = 0 }

  // 2. an open item page from a share link redraws its sprite when the icons land
  { delay = 800; const {p, errs, ctx} = await page(); await p.goto(URL + "#i=" + Buffer.from('"2000000"').toString("base64").replace(/=+$/, ""));
    await p.evaluate(() => ASSETS); await p.waitForTimeout(50);
    check(!errs.length && await p.$$eval("#items .mtop img.sprite", l => l.length) === 1, "item page opened before the icons came gets its sprite"); await ctx.close(); delay = 0 }

  // 3. offline: once the service worker has the page, it opens with no network, icons and all
  { const {p, errs, ctx} = await page(); await p.goto(URL);
    check(await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length)) === 0, "no service worker on plain http (localhost here)");
    await p.evaluate(() => navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready));
    await p.reload(); await p.evaluate(() => ASSETS); await p.waitForTimeout(300);   // controlled now: page + icons file cached
    await ctx.setOffline(true); await p.reload(); await p.evaluate(() => ASSETS); await open(p, "items"); await p.waitForTimeout(100);
    const r = await icons(p);
    check(!errs.length && r.rows > 0 && r.img === r.rows, `offline reload works, icons included (${JSON.stringify(r)}; ${errs.join("; ")})`);
    await ctx.close() }

  await b.close(); srv.close(); fs.rmSync(OUT, {recursive: true, force: true});
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
