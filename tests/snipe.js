// FM Sniper (src/js/56-snipe.js): deal maths, views, filters, sorts, watch list, new badges, share links, live refresh.
// Runs on the Pages copy (scripts/pages_site.py) with a fixture market.json, so the numbers don't move with the meso.watch
// poll's commits; the page swaps the fixture in like a newer deploy. Run: node tests/snipe.js (CI: tests.yml)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const ROOT = path.resolve(__dirname, ".."), OUT = fs.mkdtempSync(path.join(os.tmpdir(), "snipe-"));
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };
const TYPES = {".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json"};

// it: [median, p25, p75, sales, flags (1 = low data), trend, sell-through]; now: [price each, qty, channel, map, seller]
const FIX = {read: "2099-01-01", listed: "2099-01-01 00:00",
  it: {"4020100": [1000, 900, 1200, 600, 0, 0.1, 0.2], "4020000": [400, 350, 500, 1800, 0, -0.04, 0.23], "2043702": [110000, 110000, 110000, 1, 1, null, 0.09],
    "2002009": [9000, 7832, 10000, 25, 0, 0.8, 0.169], "4000002": [8, 5, 20, 22, 0, -0.433, 0.052], "4000019": [20, 18, 22, 300, 0, -0.05, 0.08],
    "4000013": [22, 20, 31, 262, 0, 0.128, 0.056], "2000000": [45, 40, 45, 316, 0, 0.125, 0.33], "2061000": [0, 0, 0, 957, 0, -0.167, 0.169]},
  now: {"4020100": [450, 1, 18, "Kerning City Construction Site", "Seller1"], "4020000": [300, 3, 5, "Free Market <3>", "Seller2"],
    "2043702": [75000, 1, 20, "", "Rough1"], "2002009": [12000, 1, 19, "", "Up1"], "4000002": [29999, 1, 20, "", "Bait1"],
    "4000019": [23, 1, 2, "", "Over1"], "4000013": [4, 1, 1, "", "Typo"], "2000000": [45, 1, 3, "", "Even1"],
    "2061000": [0.4, 1000, 18, "", "Arrows"], "4000005": [30, 1, 4, "", "NoSales"], "4000016": [10, 5, 6, "", "Vendor1"], "9999999": [1, 1, 1, "", "Unknown item"]},
  // deal lifetimes (scripts/deal_life.py): g: {grade: [listings, gone, median min lo, hi]}, it: {id: [deals, lo, hi]}, since: {item|price|seller: first seen}
  life: {snaps: 6, from: "2098-12-31 21:30", to: "2099-01-01 00:00", gap: 30, g: {steal: [4, 3, 0, 30], over: [10, 5, 30, 60]},
    it: {"4020100": [3, 0, 30]}, since: {"4020100|450|Seller1": "2098-12-31 22:00", "4020000|300|Seller2": ""}}};

(async () => {
  execFileSync("python3", [path.join(ROOT, "scripts/pages_site.py"), OUT]);
  { const m = JSON.parse(fs.readFileSync(path.join(OUT, "market.json"), "utf8"));   // listed is "" when meso.watch has only stale listings
    check(m.it && typeof m.listed === "string" && m.now && typeof m.now === "object", "pages_site.py writes market.json (D.pw)") }
  let market = JSON.stringify(FIX), hits = 0;
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/market.json"){ hits++; r.writeHead(200, {"content-type": "application/json"}); return r.end(market) }
    const f = path.join(OUT, u.replace(/^\/$/, "/index.html"));
    if (!f.startsWith(OUT) || !fs.existsSync(f)){ r.writeHead(404); return r.end() }
    r.writeHead(200, {"content-type": TYPES[path.extname(f)] || "application/octet-stream"}); r.end(fs.readFileSync(f)) });
  await new Promise(res => srv.listen(0, "127.0.0.1", res));
  const URL = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1400, height: 900}}), p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 200)));
  const open = () => p.evaluate(() => { const b = document.querySelector("#t-snipe"), c = document.querySelector("#c-town"); if (c.offsetParent) c.click(); b.click() });
  const names = () => p.$$eval("#snrows tr .itname", l => l.map(x => x.textContent));
  const row = n => p.$$eval("#snrows tr", (l, n) => (l.find(r => r.querySelector(".itname")?.textContent === n) || {}).textContent || "", n);
  const view = async v => { await p.click(`#snview [data-v="${v}"]`); await p.waitForTimeout(30) };

  await p.goto(URL); await open();
  await p.waitForFunction(() => !document.querySelector("#sntoast").hidden, null, {timeout: 10000});
  check(hits === 1 && /New listings/.test(await p.textContent("#sntoast")), "first open fetches market.json, a newer list shows a toast");
  check(/11 live listings/.test(await p.textContent("#pwstate")), "footer meso.watch line counts the new list (unknown item ids dropped)");

  // Deals view, Best deal sort: how far under x trust (sales seen, halved when rough)
  check(JSON.stringify(await names()) === JSON.stringify(["Green Mushroom Cap", "Garnet", "Blue Mushroom Cap", "Garnet Ore", "Wand Magic Attack Scroll: Greater"]),
    `deals = listings under the usual price, best first (${await names()})`);
  const garnet = await row("Garnet");
  check(/450/.test(garnet) && /45%/.test(garnet) && /550 under/.test(garnet) && /Steal/.test(garnet) && /cheaper than|below 3 in 4/.test(garnet), `Garnet: 45% of value, 550 under, Steal (${garnet.replace(/\s+/g, " ")})`);
  const ore = await row("Garnet Ore");
  check(/×3 = 900/.test(ore) && /stack 300/.test(ore) && /Good/.test(ore), "a stack shows its total and the whole stack's gap");
  check(/check it/.test(await row("Green Mushroom Cap")), "under 25% of value is flagged to check");
  check(/rough/.test(await row("Wand Magic Attack Scroll: Greater")), "low-data price is marked rough");
  check(/2 sale|1 sale/.test(await row("Wand Magic Attack Scroll: Greater")), "sales seen shown");
  { const t = await p.$$eval("#sntop .sncard .itname", l => l.map(x => x.textContent)); check(t.join() === "Green Mushroom Cap,Garnet,Blue Mushroom Cap", `top 3 cards (${t})`) }
  { const s = await p.textContent("#snstats"); check(/Listed now\s*10/.test(s) && /Under value\s*5/.test(s) && /2 under NPC price/.test(s), `stat tiles count the list (${s.replace(/\s+/g, " ").slice(0, 120)})`) }

  // sorts
  await p.selectOption("#snsort", "pct"); check((await names()).join() === "Green Mushroom Cap,Garnet,Wand Magic Attack Scroll: Greater,Garnet Ore,Blue Mushroom Cap", `sort: lowest % of value, no-sales last (${await names()})`);
  await p.selectOption("#snsort", "gap"); check((await names())[0] === "Wand Magic Attack Scroll: Greater", "sort: most mesos under");
  await p.selectOption("#snsort", "stack"); check((await names())[0] === "Wand Magic Attack Scroll: Greater" && (await names())[1] === "Garnet", "sort: biggest stack gap");
  await p.click('#snipe thead [data-s="price"]'); check((await names())[0] === "Green Mushroom Cap" && await p.inputValue("#snsort") === "price", "header click sorts (cheapest)");
  await p.selectOption("#snsort", "score");

  // filters
  await p.click("#snrough"); check(!(await names()).includes("Wand Magic Attack Scroll: Greater") && (await names()).length === 4, "Hide rough prices");
  await p.click("#snrough");
  await p.fill("#snmax", "500"); check((await names()).sort().join() === "Blue Mushroom Cap,Garnet,Garnet Ore,Green Mushroom Cap", "Max price each");
  await p.fill("#snmax", "");
  await p.selectOption("#snmin", "50"); check((await names()).sort().join() === "Garnet,Green Mushroom Cap", "At least 50% under");
  await p.selectOption("#snmin", "0");
  await p.selectOption("#snsales", "100"); check((await names()).sort().join() === "Garnet,Garnet Ore,Green Mushroom Cap", "Sales seen 100+");
  await p.selectOption("#snsales", "0");
  await p.selectOption("#sncat", "scroll"); check((await names()).join() === "Wand Magic Attack Scroll: Greater" && /10%|Success|Magic/.test(await row("Wand Magic Attack Scroll: Greater")), "Type: scrolls");
  await p.selectOption("#sncat", "");
  await p.fill("#snq", "seller2"); check((await names()).join() === "Garnet Ore", "search matches the seller");
  await p.fill("#snq", "");
  await p.selectOption("#snbasis", "p25"); check(/50%/.test(await row("Garnet")) && /low end 900/.test(await row("Garnet")), "Compare with the low end (25th percentile)");
  await p.selectOption("#snbasis", "med");

  // round 2: NPC price, flip, presets, lifetimes on rows, keys
  check(/Under NPC/.test(await row("Blue Mushroom Cap")) && /vendor it: \+9 each/.test(await row("Blue Mushroom Cap")) && /under NPC price/.test(await row("Green Mushroom Cap")), "listings under what an NPC pays: graded (no sales) or tagged");
  await p.click("#snnpc"); check((await names()).sort().join() === "Blue Mushroom Cap,Green Mushroom Cap", `Under NPC price filter (${await names()})`); await p.click("#snnpc");
  await p.selectOption("#snsort", "flip"); check((await names()).join() === "Garnet,Garnet Ore,Green Mushroom Cap,Blue Mushroom Cap,Wand Magic Attack Scroll: Greater", `Best flip = gap x sell-through or the NPC gain; rough = 0 (${await names()})`);
  await p.selectOption("#snsort", "score");
  check(/on the list about 2 h/.test(await row("Garnet")) && /before our records/.test(await row("Garnet Ore")), "on the list since, from deal lifetimes");
  await p.selectOption("#snpreset", "b:npc"); check(await p.getAttribute("#snnpc", "aria-pressed") === "true", "preset sets its filters");
  await p.click("#snreset"); check(await p.getAttribute("#snnpc", "aria-pressed") === "false" && (await names()).length === 5, "reset clears a preset");
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press("j"); await p.keyboard.press("j");
  check(await p.$eval("#snrows tr.snfoc .itname", e => e.textContent).catch(() => "") === "Garnet", "j moves the focused row");
  await p.keyboard.press("w"); check(await p.getAttribute('#snrows [data-w="4020100"]', "aria-pressed") === "true", "w watches the focused row");

  // tools
  const mode = async m => { await p.click(`#snmode [data-m="${m}"]`); await p.waitForTimeout(40) };
  await mode("trip"); await p.fill("#sntbud", "2000"); await p.waitForTimeout(40);
  { const t = await p.textContent("#sntrip"); check(/Garnet/.test(t) && /ch 18/.test(t) && !/Wand Magic/.test(t), `shopping trip fits the budget, grouped by channel (${t.replace(/\s+/g, " ").slice(0, 140)})`) }
  await mode("craft");
  { const r = await p.$$eval("#sncrows tr", l => l.map(x => x.textContent.replace(/\s+/g, " "))), g = r.find(x => /^Garnet(?! Ore)/.test(x.trim())) || "";
    check(/Garnet Ore ×1/.test(g) && /\+500/.test(g), `crafting flip: 1 ore at 300 + 200 fee -> Garnet at 1,000 = +500 (${g})`) }
  await mode("sell"); await p.fill("#snsitem", "Garnet");
  { const t = await p.textContent("#snsell"); check(/449/.test(t) && /1,000/.test(t) && /200/.test(t), "sell yours: be the cheapest 449, usual 1,000, NPC 200") }
  await mode("watch");
  await p.fill('[data-tg="4020100"]', "500"); await p.dispatchEvent('[data-tg="4020100"]', "change"); await p.waitForTimeout(40);
  check(await p.$eval('[data-tg="4020100"]', e => !!e.closest("tr.snhit")) && await p.textContent("#snwcnt") === "1", "watch target hit (450 <= 500), counted on the tab");
  await p.fill('[data-tg="4020100"]', "100"); await p.dispatchEvent('[data-tg="4020100"]', "change"); await mode("watch");
  check(!(await p.$eval('[data-tg="4020100"]', e => !!e.closest("tr.snhit"))) && await p.textContent("#snwcnt") === "", "target under the listing: no hit");
  await p.fill('[data-tg="4020100"]', ""); await p.dispatchEvent('[data-tg="4020100"]', "change");
  { const t0 = await p.title();
    await p.evaluate(() => Object.defineProperty(document, "hidden", {configurable: true, get: () => true})); await p.click("#snatest");
    const t1 = await p.title(), tt = await p.textContent("#sntoast");
    await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")) });
    check(t1 === "(1) " + t0 && /Test alert/.test(tt) && await p.title() === t0, `alert test: tab title badge while hidden, cleared on return (${t1})`) }
  await mode("move"); check(/Tailoring Kit/.test(await p.textContent("#snup")) && /Blue Snail Shell/.test(await p.textContent("#sndown")), "movers: rising and falling by trend");
  await mode("life"); { const t = await p.textContent("#snlife"); check(/Steal/.test(t) && /75%/.test(t) && /under 30 min/.test(t) && /Garnet/.test(t), "deal lifetimes: grade table and items") }
  await mode("list"); await p.click('#snrows [data-w="4020100"]');

  // Over value view: rising (trend up) vs over, way over; at-usual and no-sales rows only under Everything
  await view("over");
  check((await names()).sort().join() === "Blue Snail Shell,Horny Mushroom Cap,Tailoring Kit", `over value view (${await names()})`);
  check(/Rising/.test(await row("Tailoring Kit")) && /Way over/.test(await row("Blue Snail Shell")) && /Over value/.test(await row("Horny Mushroom Cap")), "rising / way over / over value labels");
  check(await p.$eval("#sntop", e => e.hidden), "top cards only in the Deals view");
  await view("all");
  const all = await names();
  check(all.length === 10 && !all.includes("Arrows for Crossbows") && /No sales yet/.test(await row("Tree Branch")) && /At usual/.test(await row("Red Potion")),
    `everything: 10 rows, arrows (under 1 meso) and unknown items left out (${all.length})`);
  check((await p.$$eval("#snrows .snnew", l => l.length)) === 10, "every listing in a newer list is new");
  await p.click("#snnew"); check((await names()).length === 10, "New only"); await p.click("#snnew");

  // watch list: star persists, Watched only ignores the view
  await p.click('#snrows [data-w="4020000"]');
  check(await p.getAttribute('#snrows [data-w="4020000"]', "aria-pressed") === "true", "star a row");
  await view("deal"); await p.click("#snwatch"); check((await names()).join() === "Garnet Ore", "Watched only");
  await p.click("#snwatch");
  await p.reload(); await open(); await p.waitForTimeout(400);
  check(await p.getAttribute('#snrows [data-w="4020000"]', "aria-pressed") === "true" && await p.getAttribute('#snview [data-v="deal"]', "aria-checked") === "true", "watch list and view survive a reload");
  await p.click('#snrows [data-w="4020000"]');

  // a newer list again (meso.watch poll deploy): the changed listing is the only new one; watched under-value one in the toast
  await p.click('#snrows [data-w="4020100"]');
  const F2 = JSON.parse(market); F2.listed = "2099-01-01 00:30"; F2.now["4020100"] = [400, 2, 7, "", "Seller9"]; market = JSON.stringify(F2);
  // the page checks at most once a minute: move its clock on, then reopen the page
  await p.evaluate(() => { document.querySelector("#sntoast").hidden = true; const n = Date.now; Date.now = () => n() + 5 * 60e3 });
  await p.click("#t-snipe"); await p.waitForFunction(() => !document.querySelector("#sntoast").hidden, null, {timeout: 10000});
  const toast = await p.textContent("#sntoast");
  check(/1 changed/.test(toast) && /Watched: Garnet 400/.test(toast), `second newer list: 1 changed, watched deal named (${toast})`);
  await view("all"); check(JSON.stringify(await p.$$eval("#snrows .snnew", l => l.map(x => x.closest("tr").querySelector(".itname").textContent))) === '["Garnet"]', "only the changed listing is new");
  await p.click('#snrows [data-w="4020100"]');

  // share link: view + sort come back; a hostile one is cleaned up
  const enc = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await p.goto(URL + "#f=" + enc({v: "over", sort: "pct", min: 0})); await p.reload(); await p.waitForTimeout(400);
  check(!(await p.isHidden("#snipe")) && await p.getAttribute('#snview [data-v="over"]', "aria-checked") === "true" && await p.inputValue("#snsort") === "pct", "#f= share link opens the page with its view and sort");
  await p.goto(URL + "#f=" + enc({v: "<img>", sort: "constructor", max: "1e400", min: 7, cat: "__proto__", q: 5, rough: "yes"})); await p.reload(); await p.waitForTimeout(400);
  check(await p.getAttribute('#snview [data-v="deal"]', "aria-checked") === "true" && await p.inputValue("#snsort") === "score" && await p.inputValue("#snmax") === "" && await p.inputValue("#sncat") === "", "bad share link values fall back to defaults");
  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.join("; ") : ""));

  // phone: no sideways page scroll, top cards swipe inside their row
  { const ph = await b.newPage({viewport: {width: 390, height: 800}}), e2 = []; ph.on("pageerror", e => e2.push(e.message));
    await ph.goto(URL); await ph.evaluate(() => { const b = document.querySelector("#t-snipe"); document.querySelector("#c-town").click(); b.click() });
    await ph.waitForTimeout(600);
    const w = await ph.evaluate(() => ({page: document.documentElement.scrollWidth, top: document.querySelector("#sntop").scrollWidth > document.querySelector("#sntop").clientWidth}));
    check(w.page <= 390 && w.top && !e2.length, `390px: no page overflow, cards swipe (${JSON.stringify(w)})`); await ph.close() }

  // file:// (the artifact) never fetches market.json; a listing missing from the last-seen list is marked new
  { const ap = await b.newPage(), e3 = []; ap.on("pageerror", e => e3.push(e.message)); let fetched = 0; ap.on("request", r => { if (/market\.json/.test(r.url())) fetched++ });
    const file = "file://" + path.join(ROOT, "dist/index.html");
    // the fixture's listings in place of the build's (which can be empty), like the live refresh would swap them
    await ap.addInitScript(fx => { const parse = JSON.parse; let done = false;
      JSON.parse = function(t, ...a){ const r = parse.call(this, t, ...a); if (!done && r && r.pw && r.pw.it){ done = true; Object.assign(r.pw, fx) } return r } }, {it: FIX.it, now: FIX.now, listed: FIX.listed});
    await ap.goto(file); await ap.evaluate(() => { const b = document.querySelector("#t-snipe"), c = document.querySelector("#c-town"); if (c.offsetParent) c.click(); b.click() });
    await ap.click('#snview [data-v="all"]');
    const keys = await ap.$$eval("#snrows tr[data-k]", l => l.map(r => r.dataset.k));
    await ap.evaluate(k => localStorage.setItem("snipeseen", JSON.stringify({l: "2000-01-01 00:00", k: k.slice(1)})), keys);
    await ap.reload(); await ap.waitForTimeout(300);
    const nw = await ap.$$eval("#snrows tr .snnew", l => l.map(x => x.closest("tr").dataset.k));
    check(fetched === 0 && keys.length > 0 && nw.length === 1 && nw[0] === keys[0] && !e3.length, `artifact: no market.json fetch; unseen listing marked new (${nw})`); await ap.close() }

  await b.close(); srv.close(); fs.rmSync(OUT, {recursive: true, force: true});
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
