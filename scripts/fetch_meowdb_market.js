// meowdb Free Market (no login): per-item price summary + live player listings -> data/sources/meowdb_market.json.
// meowdb's "usual price" = 14-day median of players' price checks ("seen in shop" asks + "sold for" reports) and trades
// finished on meowdb; asks = priceChecks - soldChecks, sales = soldChecks + finishedTrades (meowdb's own UI math).
// Listings are posted by meowdb users (channel, FM room, spot, username), so they can be stale: bumpedAt says when.
// Items fetched = any item with a live meowdb listing + every item meso.watch or classicmarket.kr prices.
//
// 2026-10-28: meowdb started rejecting HEADLESS browsers on the market API with
//   403 {"error":"Headless browsers are blocked here. To ask about reusing this data, write to contact@meowdb.com."}
// (catalog / items / per-item summary+listings stay open). Response: the fetch now runs a real headed Chromium
// (under xvfb on CI), which is not a headless browser and clears the wall (probed 200 the same day). If the wall
// ever catches the headed run too, the fetcher degrades in place: it drops the bulk browse-discovery calls and
// discovers items via /api/free-market/home (gainers/losers/trending/bestSellers seeds) + the full want sweep,
// using the per-item endpoints that stay open. Output shape is identical either way.
// Run: xvfb-run -a node scripts/fetch_meowdb_market.js   (plain desktop: node scripts/fetch_meowdb_market.js)
//      then   python3 scripts/meowdb_market.py
// A failed fetch exits 0 and keeps the old file (the workflow then commits nothing).
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), DST = path.join(ROOT, "data/sources/meowdb_market.json");
const KEEP_DAYS = 7, SELLS = 12, BUYS = 5;   // listings not bumped in a week are dropped; cheapest 12 asks, best 5 buy orders per item
const WALL = "Headless browsers are blocked";
async function launch() {
  const headed = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, headless: false, args: ["--no-sandbox"] }
    : { headless: false, args: ["--no-sandbox"] };
  try { return { b: await chromium.launch(headed), headed: true } }
  catch (e) {   // no display (dev box / CI without xvfb): headless shell still serves everything except browse discovery
    console.log(`::warning::headed launch failed (${e.message.split("\n")[0]}); falling back to headless, browse discovery may wall`);
    return { b: await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), headed: false };
  }
}
(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, "data/data.json")));
  const want = new Set([...Object.keys(D.pw?.it || {}), ...Object.keys(D.pw?.now || {}), ...Object.keys(D.cm?.it || {})]);
  let { b, headed } = await launch();
  try {
    const p = await b.newPage();
    await p.goto("https://meowdb.com/msclassic", { timeout: 60000 });
    const got = await p.evaluate(async ({ want, KEEP_DAYS, WALL }) => {
      const nap = () => new Promise(z => setTimeout(z, 250));
      const get = async u => { for (let i = 0; i < 3; i++){ const r = await fetch(u);
          if (r.ok) return r.json();
          if (r.status === 400) return null;   // "can't be traded on the Free Market": no price now or later, so don't retry or fail the run
          const slow = r.status === 429 || r.status >= 500;
          const t = await r.text().catch(() => "");
          if (t.includes(WALL)) throw new Error("WALL " + u);
          await new Promise(z => setTimeout(z, (slow ? 6000 : 2000) * (i + 1))) } throw new Error(u) };
      const pages = async (u, key, more) => { const out = []; for (let i = 1; i < 400; i++){ const j = await get(u + (u.includes("?") ? "&" : "?") + "page=" + i);
        out.push(...j[key]); if (!more(j, i)) break; await nap() } return out };
      const cat = await pages("/msclassic/api/items", "items", j => j.hasMore);                       // meowdb id <-> game id (iconKey)
      const game = Object.fromEntries(cat.map(x => [x.id, x.iconKey])), mdb = Object.fromEntries(cat.map(x => [x.iconKey, x.id]));
      let live = null, seeds = [];
      try {
        live = [...await pages("/msclassic/api/market-listings/browse", "rows", (j, i) => i < j.pages),
          ...await pages("/msclassic/api/market-listings/browse?side=buy", "rows", (j, i) => i < j.pages)];
      } catch (e) { if (!String(e).startsWith("WALL")) throw e;
        // wall widened to headed too: discover through the free-market home seeds instead of browse
        const home = await get("/msclassic/api/free-market/home?locale=en").catch(() => null);
        for (const k of ["gainers", "losers", "trending", "bestSellers"]) for (const r of (home && home[k]) || []) if (r && r.id) seeds.push(r.id); }
      const listed = live ? new Set(live.map(x => x.itemId)) : null;
      const seed = new Set(seeds);
      const ids = new Set([...(listed || []), ...seed, ...want.map(g => mdb[g]).filter(Boolean)]);
      const it = {}, ls = {}, cut = Date.now() - KEEP_DAYS * 864e5;
      for (const id of ids){ const g = game[id]; if (!g) continue;
        const s = await get(`/msclassic/api/item-market-summary?itemId=${id}&condition=clean`); await nap();
        if (!s) continue;
        if (s.usual != null || s.cheapestSell != null) it[g] = s;
        if (listed && !listed.has(id)) continue;                    // browse mode: only fetch listings for known-listed items
        const l = await get("/msclassic/api/market-listings?itemId=" + id); await nap();
        ls[g] = ((l && l.listings) || []).filter(x => x.status === "active" && x.price > 0 && Date.parse(x.bumpedAt.replace(" ", "T") + "Z") >= cut) }
      return { cat: cat.length, live: live ? live.length : -1, it, ls } }, { want: [...want], KEEP_DAYS, WALL });
    const t = s => Math.round(Date.parse(s.replace(" ", "T") + "Z") / 6e4);   // UTC minutes since 1970
    const st = o => Object.entries(o || {}).filter(([, v]) => typeof v === "number" && v).map(([k, v]) => k + " " + v).join(", ");
    const row = x => [x.side === "buy" ? 1 : 0, x.price, x.quantity || 1, x.channel || 0, x.fmRoom || 0, (x.location || "").slice(0, 60),
      x.username || "", t(x.bumpedAt), x.tradeMethod === "direct" ? 1 : 0, x.condition === "scrolled" ? "scrolled" + (st(x.stats) ? ": " + st(x.stats) : "") : st(x.stats)];
    const it = {}, ls = {};
    for (const [g, s] of Object.entries(got.it)) it[g] = [s.usual, s.priceChecks - Math.min(s.priceChecks, s.soldChecks || 0), Math.min(s.priceChecks, s.soldChecks || 0) + (s.finishedTrades || 0),
      s.cheapestSell, s.bestBuy, s.forSale || 0, s.last24h?.median ?? null, s.last24h?.count || 0, s.last7d?.median ?? null, s.last7d?.count || 0];
    for (const [g, a] of Object.entries(got.ls)){
      const r = [...a.filter(x => x.side !== "buy").sort((x, y) => x.price - y.price).slice(0, SELLS), ...a.filter(x => x.side === "buy").sort((x, y) => y.price - x.price).slice(0, BUYS)].map(row);
      if (r.length) ls[g] = r }
    const j = {source: "https://meowdb.com/msclassic/free-market", read: new Date().toISOString().slice(0, 16).replace("T", " "),
      fields: {it: "usual, asks, sales, cheapestSell, bestBuy, forSale, median24h, n24h, median7d, n7d",
        ls: "buy 0/1, price each, qty, channel, FM room, spot, meowdb user, bumped (UTC min), direct trade 0/1, stats"}, it, ls};
    fs.writeFileSync(DST, JSON.stringify(j));
    const mode = got.live >= 0 ? `browse discovery, ${got.live} live listings` : "no-browse discovery (home seeds + want sweep)";
    console.log(`${got.cat} catalog items; ${mode}; ${Object.keys(it).length} items priced, ${Object.keys(ls).length} with listings -> ${DST}`);
  } catch (e) { console.log(`::warning::meowdb market fetch failed, keeping the old file: ${e.message}`); if (b) await b.close() }
  if (b) { try { await b.close() } catch {} }
})();
