// meowdb Free Market (D.mdb, scripts/fetch_meowdb_market.js): MDB[id] = [usual, asks, sales, cheapestSell, bestBuy, forSale,
// median24h, n24h, median7d, n7d]; "usual" = meowdb's 14-day median of asks players saw in shops, "sold for" reports and
// finished meowdb trades. MDBL[id] = live listings players posted on meowdb: [buy, price each, qty, ch, FM room, spot, user,
// bumped (UTC minutes), direct trade, stats]; the fetch drops ones not bumped in 7 days.
const agoMin = m => { m = Math.max(0, m); return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 48 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
const mdbAgo = () => { const t = Date.parse((D.mdb?.read || "").replace(" ", "T") + "Z"); return isNaN(t) ? "" : agoMin((Date.now() - t) / 6e4) };
PRICE_SRC.splice(1, 0, id => { const m = MDB[id]; if (!m || m[0] == null) return null;
  return {src: "meowdb", kind: "player price checks", v: m[0], n: `${fmt(m[1])} ask${m[1] === 1 ? "" : "s"} + ${fmt(m[2])} sale${m[2] === 1 ? "" : "s"}`,
    detail: [m[7] >= 3 && m[6] != null ? `last 24 h ${fmt(m[6])} (${m[7]})` : "", m[3] ? `cheapest ask ${fmt(m[3])}` : ""].filter(Boolean).join(" · "),
    few: m[2] < 5, when: mdbAgo()} });
LIST_SRC.push(id => (MDBL[id] || []).map(r => ({v: r[1], qty: r[2], ch: r[3], room: r[4] ? "FM " + r[4] : "", spot: r[5], who: r[6],
  ago: agoMin(Date.now() / 6e4 - r[7]), t: r[7], src: "meowdb", buy: !!r[0], direct: !!r[8], note: r[9]})));

// Items page "Prices": 4 headline tiles, one row per market source, then every listing we know a place for, cheapest first
const PX_SHOW = 8;
const pxWhere = x => [x.ch ? "Ch " + x.ch : "", String(x.room || "").replace(/Free Market\s*<(\d+)>/i, "FM $1"), x.spot].filter(Boolean).map(esc).join(" · ")
  || (x.direct ? `<span class="sub">whisper / meet up</span>` : `<span class="sub">not given</span>`);
const pxEach = v => v < 10 && v % 1 ? v : fmt(v);
function priceBox(id){
  const it = D.items[id], best = pwPrice(id), rows = PRICE_SRC.map(f => f(id)).filter(Boolean), all = listingsOf(id);
  const sells = all.filter(x => !x.buy).sort((a, b) => a.v - b.v || (b.t || 0) - (a.t || 0)), buys = all.filter(x => x.buy).sort((a, b) => b.v - a.v);
  const shop = shopBest(id), cheap = sells[0], usual = best && !best.per ? best.v : null;
  const vs = v => { if (!usual) return ""; const r = v / usual; return r < 0.995 ? `<span class="up">${Math.round((1 - r) * 100)}% under usual</span>` : r > 1.005 ? `${Math.round((r - 1) * 100)}% over usual` : "about usual" };
  const unit = {"meso.watch": "sales", meowdb: "prices"}[best?.src] || "posts";
  const tile = (k, v, sub, tip) => `<div class="pxt"${tip ? ` title="${esc(tip)}"` : ""}><span class="pxk">${k}</span><b class="pxv">${v}</b><span class="pxs">${sub}</span></div>`;
  const tiles = `<div class="pxtiles">
    ${tile("Usual price", best ? fmt(best.v) + (best.per ? `<small> per set</small>` : "") : "–", best ? `${esc(best.src)} · ${fmt(best.n)} ${unit}${best.rough ? ` <span class="pill p-warn">rough</span>` : ""}` : "no player prices yet",
      best ? `The price the rest of the site uses: meso.watch sales first, then meowdb, then classicmarket.kr` : "")}
    ${tile("Cheapest listed", cheap ? pxEach(cheap.v) : "–", cheap ? `${pxWhere(cheap)}${vs(cheap.v) ? " · " + vs(cheap.v) : ""}` : "no live listing with a place")}
    ${tile("NPC shop", shop ? fmt(shop[3]) : "–", shop ? esc(shop[0]) + (shop[4] ? ` · ${shop[4]} price` : "") : "no shop sells it", shop ? `${shop[0]}, ${shop[2]} (meowdb shop list)` : "")}
    ${tile("NPC buys", it?.p ? fmt(it.p) : "–", it?.p ? "game files" : "can't be sold to NPCs")}</div>`;
  const src = rows.length ? `<div class="tblwrap"><table class="mini pxsrc"><thead><tr><th>Source</th><th class="num">Price</th><th>Based on</th><th>Range</th><th>Updated</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td><b>${esc(r.src)}</b> <span class="sub">${esc(r.kind)}</span></td><td class="num"><b>${fmt(r.v)}</b>${r.per ? ` <span class="sub">${r.per}</span>` : ""}${r.trend ? " " + r.trend : ""}</td>
      <td>${r.n}${r.few ? ` <span class="pill p-warn" title="Few data points: rough">few</span>` : ""}</td><td class="sub">${r.detail || ""}</td><td class="sub">${esc(r.when || "")}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="sub">No player prices from meso.watch, meowdb or classicmarket.kr yet.</p>`;
  const lrow = (x, i) => `<tr${i >= PX_SHOW ? ` class="pxx"` : ""}><td class="num"><b>${pxEach(x.v)}</b>${i === 0 && !x.buy ? ` <span class="pill p-good">cheapest</span>` : ""}</td><td class="num">${x.qty > 1 ? "×" + fmt(x.qty) : "1"}</td>
    <td>${pxWhere(x)}${x.note ? ` <span class="sub">${esc(x.note)}</span>` : ""}</td><td>${x.who ? esc(x.who) : `<span class="sub">–</span>`}</td><td class="sub">${esc(x.ago || "")}</td><td class="sub">${esc(x.src)}</td></tr>`;
  const ltab = (a, h, what) => `<h4 class="pxh">${h} <span class="sub">${a.length} ${what}</span></h4><div class="tblwrap"><table class="mini pxls"><thead><tr><th class="num">Each</th><th class="num">Qty</th><th>Where</th><th>Seller</th><th>Listed</th><th>Source</th></tr></thead>
    <tbody>${a.map(lrow).join("")}</tbody></table></div>${a.length > PX_SHOW ? `<button class="btn pxall" data-pxall>Show all ${a.length}</button>` : ""}`;
  const where = sells.length ? ltab(sells, "Where to buy", sells.length === 1 ? "listing" : "listings, cheapest first")
    : `<h4 class="pxh">Where to buy</h4><p class="sub">No live listing with a channel or FM room right now.</p>`;
  return `${tiles}${src}${where}${buys.length ? ltab(buys, "Buy orders", buys.length === 1 ? "player wants it" : "players want it, best offer first") : ""}
    <p class="sub pxfoot">Listings come from meso.watch (cheapest per item only, from streams, updated ${pwListedAgo() || "–"}) and meowdb (players post their own shops, updated ${mdbAgo() || "–"}; gone after 7 days without a bump). classicmarket.kr posts have no location. Shops open and close fast: if one is gone, try the next.</p>`;
}
