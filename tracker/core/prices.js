/* core/prices.js — site market data (v0.2.83). Parses the site's per-poll prices file
   (market.json on maplestory.scumlord.studio, built by scripts/build_data.py step_prices) into
   per-item quotes, computes the day's movers from the 7-day history, and lists what the
   watchlist and Market pulse cards render. Pure maths, no DOM, no Electron, no fetch:
   core.test.js runs it in Node; the fetch lives in main.js (CSP keeps the renderer offline).

   Shapes (scripts/build_data.py step_prices):
     it:   {itemId: [median, p25, p75, sales, flags(1 low data, 2 per set, 4 held), trend, sell-through]}
     hist: {itemId: [[date, median, sold], ...]}   last 7 days, oldest first
     asks: {itemId: [[price each, qty, channel, map, seller, seenMin], ...]}  live listings, cheapest first
     tot:  {sales, top: [itemId, price, qty, time] | null}
   A broken or half-written file must never crash a grind session: parse() answers {ok:false, why}
   and the caller keeps showing the previous data. */
(function (root){
  const num = v => (typeof v === "number" && Number.isFinite(v)) ? v : 0;

  // parse: one entry point, one validation pass. Returns
  //   {ok, read, listed, it, asks, tot:{sales, top}, why?}
  function parse(j){
    if (!j || typeof j !== "object") return {ok: false, why: "not an object"};
    const it = j.it, asks = j.asks;
    if (!it || typeof it !== "object" || !Object.keys(it).length) return {ok: false, why: "no items"};
    for (const [k, v] of Object.entries(it)){
      if (!Array.isArray(v) || typeof num(v[0]) !== "number" || v[0] < 0) return {ok: false, why: "bad row " + k};
    }
    if (asks != null && typeof asks !== "object") return {ok: false, why: "bad asks"};
    const tot = j.tot && typeof j.tot === "object" ? {sales: num(j.tot.sales), top: Array.isArray(j.tot.top) ? j.tot.top : null} : {sales: 0, top: null};
    return {ok: true, read: j.read || "", listed: j.listed || "", it, asks: asks || {}, hist: j.hist && typeof j.hist === "object" ? j.hist : {}, tot};
  }

  // quote: everything the UI shows about one item, or null when the site has no row for it.
  function quote(P, id){
    const row = P.it && P.it[id];
    if (!row) return null;
    const live = P.asks && P.asks[id];
    return {id, median: num(row[0]), p25: num(row[1]), p75: num(row[2]), sales: num(row[3]),
      flags: num(row[4]), trend: typeof row[5] === "number" ? row[5] : 0,
      live: Array.isArray(live) && live.length ? num(live[0][0]) : null,
      listings: Array.isArray(live) ? live.length : 0};
  }

  // movers: today vs yesterday from the history (needs 2 days and a yesterday that is not 0).
  // minSales keeps one-off junk out of the board; ties and flat days are skipped.
  function movers(P, n = 8, minSales = 20){
    const out = [];
    for (const [id, h] of Object.entries(P.hist || {})){
      if (!Array.isArray(h) || h.length < 2) continue;
      const last = h[h.length - 1], prev = h[h.length - 2];
      const nowM = num(last[1]), prevM = num(prev[1]);
      if (!(nowM > 0) || !(prevM > 0) || nowM === prevM) continue;
      const today = P.it && P.it[id];
      if (!today || num(today[3]) < minSales) continue;
      out.push({id, prev: prevM, now: nowM, sales: num(today[3]), up: nowM > prevM,
        pct: (nowM - prevM) / prevM});
    }
    out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return out.slice(0, Math.max(0, n));
  }

  // watch rows for a list of ids, dropping ids the site does not price (the row says so in the UI).
  function watchRows(P, ids){
    return (Array.isArray(ids) ? ids : []).map(id => quote(P, id)).filter(Boolean);
  }

  // price alerts (core/alerts.js kinds priceAbove/priceBelow): the context rows the engine
  // matches against — every priced item the tracker knows a name for, cheapest first is not needed here.
  function priceCtx(P, nameOf){
    const rows = [];
    for (const id of Object.keys(P.it)){
      const name = nameOf ? nameOf(id) : null;
      if (name) rows.push({id, name, median: num(P.it[id][0])});
    }
    return rows;
  }

  // compact meso format for cards and toasts: 900 / 12.3k / 1.2m
  const strip0 = s => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  function fmtM(n){
    n = num(n);
    if (n >= 1e6) return strip0((n / 1e6).toFixed(n >= 1e7 ? 1 : 2)) + "m";
    if (n >= 1e4) return strip0((n / 1e3).toFixed(1)) + "k";
    return String(Math.round(n));
  }

  const api = {parse, quote, movers, watchRows, priceCtx, fmtM};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SitePrices = api;
})(typeof window !== "undefined" ? window : globalThis);
