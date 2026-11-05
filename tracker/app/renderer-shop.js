// Shop prices (Danny, 2026-10-31: "let's build that overlay", from the MaplePrice teardown): a shortcut reads the merchant shop
// window in the game picture (core/shopread.js: rows, price digits twice, sold rows greyed; names fuzzy-matched to the game's
// item list), sets each ask against the site's market median (SitePrices.quote, the same file the Watchlist uses) and lists
// it in a pop-up. With sharing on, the rows it is sure of (a price both reads agree on, one item for the name) go to
// the server's /api/shop. Turbozo 2026-11-01: shop uploads carry the shop's seller and title (the window's title bar is
// "<owner IGN> : <title>", core/shopread.js readTitle), the FM room parsed off the map name, the map id, and the channel
// when the tracker can read it (null for now) — anonymizing those was our mistake, his words.
// Shop watch (0.3.30, Turbozo approved): while tracking, a light watcher finds an open shop window on screen and re-reads
// it automatically as you browse; Settings > Window and sharing turns it off. Manual shortcut unchanged.
let shopBusy = false, shopLast = null;
const shopSent = new Map();   // "id|qty|price|sold" -> time sent: the same shop read twice in 10 minutes is sent once
const shopNames = () => shopNames.v || (shopNames.v = Object.entries(G.items).map(([id, it]) => [id, it.n]));
// the overlay card's copy of the last read (overlay.js RENDER.shop): short keys, at most 12 rows; u = the price read is unsure
function shopSnap(){
  if (!shopLast) return null;
  return {at: shopLast.at, sum: shopLast.sum || "", rows: shopLast.rows.slice(0, 12).map(r => ({n: r.item ? r.item.name : (r.cands[0] ? r.cands[0].name : r.name || "?"), a: r.unit, m: r.median, p: r.pct, s: r.sold ? 1 : 0, u: r.sure ? 0 : 1}))};
}
const shopStatus = s => { $("#status").textContent = s };

// verdict word for one ask vs the market median (the same cuts the colours use: green 5% under, red 25% over)
function shopVerdict(r){
  if (r.sold) return "sold out";
  if (r.pct == null) return "";
  return r.pct <= -0.25 ? "great deal" : r.pct <= -0.05 ? "under market" : r.pct < 0.25 ? "fair" : "well over market";
}
// the row's coaching line, MesoLens-style percentiles-as-sentences on our data (Turbozo P0-4 approved): the site's
// p25/median/p75 and sell-through (SitePrices.quote) rendered as "quick / usual / patient"
function shopRowAdvice(r){
  const q = r.q;
  if (r.sold) return "sold out — gone at " + (r.unit != null ? COIN + SP.fmtM(r.unit) : "?");
  if (!q || !(q.median > 0)) return "";
  const bits = [];
  if (q.p25 > 0 && q.p75 > 0 && q.p75 >= q.p25) bits.push(`quick ${COIN}${SP.fmtM(q.p25)} · usual ${COIN}${SP.fmtM(q.median)} · patient ${COIN}${SP.fmtM(q.p75)}`);
  if (q.sell >= 0.4) bits.push("sells fast");
  if (q.listings) bits.push(`${q.listings} listed now`);
  if (q.sales) bits.push(`${q.sales.toLocaleString()} sales seen`);
  return bits.join(" · ");
}
// one advice line for the whole card: shape of the read + the best deal in it (plain text: it lands in textContent)
function shopSummary(rows){
  const priced = rows.filter(r => !r.sold && r.unit != null), good = priced.filter(r => r.pct != null && r.pct <= -0.05).sort((a, b) => a.pct - b.pct);
  const over = priced.filter(r => r.pct != null && r.pct >= 0.25).length;
  const nm = r => r.item ? r.item.name : (r.cands[0] ? r.cands[0].name : r.name || "?");
  const fk = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m" : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n));
  let s = `${rows.length} row${rows.length === 1 ? "" : "s"} · ${priced.length} priced · ${good.length} under market · ${over} well over`;
  if (good.length){
    const b = good[0];
    s += ` · best: ${nm(b)} ${b.unit != null ? fk(b.unit) : "?"} (${Math.round(b.pct * 100)}% under, usual ${b.median ? fk(b.median) : "?"})`;
  }
  return s;
}
function shopRows(rows){
  return rows.map(r => {
    const m = r.name ? GrindShopRead.matchName(r.name, shopNames()) : {items: []}, one = m.items.length === 1 ? m.items[0] : null;
    const q = one && siteMk.P ? SP.quote(siteMk.P, one.id) : null;
    return {...r, item: one, cands: m.items, q, median: q && q.median > 0 ? q.median : null, low: !!(q && (q.flags & 1)),
      pct: q && q.median > 0 && r.unit ? r.unit / q.median - 1 : null};
  });
}
function shopRender(){
  const box = $("#shopRows"), s = shopLast;
  if (!s || !s.rows.length){ box.innerHTML = `<div class="empty">No shop list found. Open a shop window so its item list is on screen, then press the shortcut again.</div>`; $("#shopNote").textContent = ""; return }
  const head = `<tr><th style="text-align:left">Item</th><th style="text-align:right">Ask each</th><th style="text-align:right">Market</th><th style="text-align:right">vs market</th></tr>`;
  const body = s.rows.map(r => {
    const name = r.item ? `${ico(r.item.id)} ${esc(r.item.name)}` : r.cands.length ? `<span title="${esc(r.cands.map(c => c.name).join(" / "))}">${esc(r.cands[0].name)} <span class="note">or ${r.cands.length - 1} more</span></span>` : `<span class="note">${esc(r.name || "?")} (not recognized)</span>`;
    const ask = r.price == null ? `<span class="note">unreadable</span>` : `${COIN}${r.unit.toLocaleString(undefined, {maximumFractionDigits: 0})}${r.qty > 1 ? `<div class="note">${r.qty} for ${r.price.toLocaleString()}</div>` : ""}${r.sure ? "" : `<div class="note" title="The two reads of this price disagreed">unsure</div>`}`;
    const pct = r.pct == null ? `<span class="note">—</span>` : `<b class="${r.pct <= -0.05 ? "pos" : r.pct >= 0.25 ? "neg" : ""}">${r.pct > 0 ? "+" : ""}${Math.round(r.pct * 100)}%</b>${shopVerdict(r) ? `<div class="note">${shopVerdict(r)}</div>` : ""}`;
    const adv = shopRowAdvice(r);
    return `<tr${r.sold ? ` style="opacity:.55" title="Sold out"` : ""}><td>${name}${r.sold ? ` <span class="note">sold</span>` : ""}</td><td class="n">${ask}</td><td class="n">${r.median ? COIN + SP.fmtM(r.median) + (r.low ? `<div class="note">few sales</div>` : "") : `<span class="note">—</span>`}</td><td class="n">${pct}${adv ? `<div class="note">${adv}</div>` : ""}</td></tr>`;
  }).join("");
  box.innerHTML = `<table>${head}${body}</table>`;
  const who = s.seller || s.title ? ` Shop: ${s.title || ""}${s.seller ? ` — ${s.seller}` : ""}.` : "";
  $("#shopNote").textContent = `Read ${new Date(s.at).toLocaleTimeString("en-GB")}. Market = the site's median for the item (meso.watch first, see the Watchlist). ` +
    (siteMk.P ? "" : "The site's prices have not arrived yet, so there is no market column. ") + (s.sent ? `${s.sent} price${s.sent > 1 ? "s" : ""} shared.` : settings.share ? "" : "Turn on sharing in Settings to add these prices to the site's crowd data.");
  $("#shopSum").textContent = (s.sum || "") + who;
}
async function shopScan(auto){
  if (shopBusy) return;
  if (timer == null || !video?.videoWidth) return shopStatus("Press Start first, then open a shop and press the shortcut.");
  shopBusy = true; if (!auto) shopStatus("Reading the shop...");
  try {
    let f = grabFrame(); f = f.k ? f : GrindReaders.native(f);
    const img = {w: f.w, h: f.h, d: f.d.slice(), k: f.k};   // the live buffer is reused by the next frame; the reads below take a few seconds
    const raw = await GrindShopRead.readShop(img, rawOcr);
    shopLast = {at: Date.now(), rows: shopRows(raw), sent: 0, sum: ""};
    // the shop's own name plate: "<owner IGN> : <shop title>" — shared with the rows (Turbozo 2026-11-01)
    try { const ti = await GrindShopRead.readTitle(img, rawOcr); if (ti){ shopLast.seller = ti.seller; shopLast.title = ti.title } } catch {}
    shopLast.sum = shopSummary(shopLast.rows);
    shopLast.sent = await shopShare(shopLast.rows, shopLast);
    shopRender(); try { ovSend?.(true) } catch {}
    if (auto) shopWatchAt = Date.now();
    else {
      shopStatus(raw.length ? `Read ${raw.length} shop rows.` : "No shop list found on screen.");
      if (!ovOpen){ $("#shopPop").scrollTop = 0; modalOpen($("#shopPop"), $("#shopClose")) }   // overlay on: the card shows it, the pop-up would cover the game window
    }
    if (auto && !shopWatchNoted){ shopWatchNoted = true; note("Shop watch: shops are read automatically while you browse. Settings > Window and sharing turns it off.", "run") }
  } catch (e){ if (!auto) shopStatus("Shop read failed: " + (e?.message || e)) }
  finally { shopBusy = false }
}
// crowd data: only rows read twice the same and matched to one item. Turbozo 2026-11-01: the upload names the shop —
// seller + title from the window's title bar, FM room parsed off the map name, the map id, channel when we can read it.
async function shopShare(rows, ctx){
  if (!settings.share) return 0;
  const now = Date.now(); for (const [k, t] of shopSent) if (now - t > 600e3) shopSent.delete(k);
  const out = [];
  for (const r of rows){
    if (!r.sure || !r.item || r.price == null) continue;
    const k = [r.item.id, r.qty, r.price, +r.sold].join("|");
    if (shopSent.has(k)) continue;
    out.push({id: +r.item.id, qty: r.qty, price: r.price, sold: r.sold ? 1 : 0}); shopSent.set(k, now);
  }
  if (!out.length) return 0;
  const room = /free\s*market\s*<\s*(\d+)\s*>/i.exec(mapNowInfo?.name || "") ? +RegExp.$1 : null;
  const body = {v: 2, seller: ctx?.seller || null, title: ctx?.title || null, ch: null, room, map: mapNowInfo?.id != null ? String(mapNowInfo.id) : null, rows: out.slice(0, 40)};
  try { const ok = await host.shareShop(body); if (!ok) throw 0; return out.length } catch { for (const o of out) shopSent.delete([o.id, o.qty, o.price, o.sold].join("|")); return 0 }
}
$("#shopClose").onclick = () => modalClose($("#shopPop"));
$("#shopPop")._close = el => modalClose(el);
// ---- Shop watch (0.3.30, Turbozo: "start work on the auto shop watch portion, but enable a way to turn it on or off") ----
// Every 4 s while tracking: a cheap geometry scan (no OCR) looks for the shop window's row separators. A new list, or
// 90 s on the same one, triggers a full read into the card; the 10-minute share dedupe keeps uploads calm.
let shopWatchAt = 0, shopWatchSig = null, shopWatchNoted = false;
const shopSig = rows => rows.length ? rows[0].top + "|" + rows.length + "|" + rows[0].x0 + ":" + rows[0].x1 : "";
async function shopWatchTick(){
  if (settings.shopWatch === false || shopBusy || timer == null || !video?.videoWidth) return;
  try {
    let f = grabFrame(); f = f.k ? f : GrindReaders.native(f);
    const sig = shopSig(GrindShopRead.findRows(f, f.k ? 1 : 2));
    if (!sig){ shopWatchSig = null; return }
    const now = Date.now();
    if (now - shopWatchAt < 8e3) return;                      // just read: let the dust settle
    if (sig === shopWatchSig && now - shopWatchAt < 90e3) return;   // same list, read recently
    shopWatchSig = sig;
    await shopScan(true);
  } catch {}
}
setInterval(() => { shopWatchTick().catch(() => {}) }, 4000);
