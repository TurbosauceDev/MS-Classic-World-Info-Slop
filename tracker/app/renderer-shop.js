// Shop prices (Danny, 2026-10-31: "let's build that overlay", from the MaplePrice teardown): a shortcut reads the merchant shop
// window in the game picture (core/shopread.js: rows, price digits twice, sold rows greyed; names fuzzy-matched to the game's
// item list), sets each ask against the site's market median (SitePrices.quote, the same file the Watchlist uses) and lists
// it in a pop-up. With sharing on, the rows it is sure of (a price both reads agree on, one item for the name) go to
// the server's /api/shop: item, quantity, price, sold. No seller, no character, no map. Screen pixels only.
let shopBusy = false, shopLast = null;
const shopSent = new Map();   // "id|qty|price|sold" -> time sent: the same shop read twice in 10 minutes is sent once
const shopNames = () => shopNames.v || (shopNames.v = Object.entries(G.items).map(([id, it]) => [id, it.n]));
// the overlay card's copy of the last read (overlay.js RENDER.shop): short keys, at most 12 rows; u = the price read is unsure
function shopSnap(){
  return shopLast ? {at: shopLast.at, rows: shopLast.rows.slice(0, 12).map(r => ({n: r.item ? r.item.name : (r.cands[0] ? r.cands[0].name : r.name || "?"), a: r.unit, m: r.median, p: r.pct, s: r.sold ? 1 : 0, u: r.sure ? 0 : 1}))} : null;
}
const shopStatus = s => { $("#status").textContent = s };

function shopRows(rows){
  return rows.map(r => {
    const m = r.name ? GrindShopRead.matchName(r.name, shopNames()) : {items: []}, one = m.items.length === 1 ? m.items[0] : null;
    const q = one && siteMk.P ? SP.quote(siteMk.P, one.id) : null;
    return {...r, item: one, cands: m.items, median: q && q.median > 0 ? q.median : null, low: !!(q && (q.flags & 1)),
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
    const pct = r.pct == null ? `<span class="note">—</span>` : `<b class="${r.pct <= -0.05 ? "pos" : r.pct >= 0.25 ? "neg" : ""}">${r.pct > 0 ? "+" : ""}${Math.round(r.pct * 100)}%</b>`;
    return `<tr${r.sold ? ` style="opacity:.55" title="Sold out"` : ""}><td>${name}${r.sold ? ` <span class="note">sold</span>` : ""}</td><td class="n">${ask}</td><td class="n">${r.median ? COIN + SP.fmtM(r.median) + (r.low ? `<div class="note">few sales</div>` : "") : `<span class="note">—</span>`}</td><td class="n">${pct}</td></tr>`;
  }).join("");
  box.innerHTML = `<table>${head}${body}</table>`;
  $("#shopNote").textContent = `Read ${new Date(s.at).toLocaleTimeString("en-GB")}. Market = the site's median for the item (meso.watch first, see the Watchlist). ` +
    (siteMk.P ? "" : "The site's prices have not arrived yet, so there is no market column. ") + (s.sent ? `${s.sent} price${s.sent > 1 ? "s" : ""} shared (item, quantity and price only).` : settings.share ? "" : "Turn on sharing in Settings to add these prices to the site's crowd data.");
}
async function shopScan(){
  if (shopBusy) return;
  if (timer == null || !video?.videoWidth) return shopStatus("Press Start first, then open a shop and press the shortcut.");
  shopBusy = true; shopStatus("Reading the shop...");
  try {
    let f = grabFrame(); f = f.k ? f : GrindReaders.native(f);
    const img = {w: f.w, h: f.h, d: f.d.slice(), k: f.k};   // the live buffer is reused by the next frame; the reads below take a few seconds
    const raw = await GrindShopRead.readShop(img, rawOcr);
    shopLast = {at: Date.now(), rows: shopRows(raw), sent: 0};
    shopLast.sent = await shopShare(shopLast.rows);
    shopRender(); try { ovSend?.(true) } catch {}
    shopStatus(raw.length ? `Read ${raw.length} shop rows.` : "No shop list found on screen.");
    if (!ovOpen){ $("#shopPop").scrollTop = 0; modalOpen($("#shopPop"), $("#shopClose")) }   // overlay on: the card shows it, the pop-up would cover the game window
  } catch (e){ shopStatus("Shop read failed: " + (e?.message || e)) }
  finally { shopBusy = false }
}
// crowd data: only rows read twice the same and matched to one item; quantity and price, no names
async function shopShare(rows){
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
  try { const ok = await host.shareShop({v: 1, rows: out.slice(0, 40)}); if (!ok) throw 0; return out.length } catch { for (const o of out) shopSent.delete([o.id, o.qty, o.price, o.sold].join("|")); return 0 }
}
$("#shopClose").onclick = () => modalClose($("#shopPop"));
$("#shopPop")._close = el => modalClose(el);
