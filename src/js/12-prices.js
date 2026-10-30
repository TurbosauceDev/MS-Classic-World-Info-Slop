// meowdb Free Market (D.mdb, scripts/fetch_meowdb_market.js): MDB[id] = [usual, asks, sales, cheapestSell, bestBuy, forSale,
// median24h, n24h, median7d, n7d]; "usual" = meowdb's 14-day median of asks players saw in shops, "sold for" reports and
// finished meowdb trades. MDBL[id] = live listings players posted on meowdb: [buy, price each, qty, ch, FM room, spot, user,
// bumped (UTC minutes), direct trade, stats]; the fetch drops ones not bumped in 7 days.
// "Updated" column: a bare date reads as today / yesterday / N days ago like the rest, full date on hover
const whenTxt = w => { const m = /^(\d{4}-\d\d-\d\d)/.exec(w || ""); if (!m || w.length > 10) return esc(w || "");
  const d = Math.floor((Date.now() - Date.parse(m[1] + "T00:00:00Z")) / 864e5);
  return `<span title="${m[1]}">${d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"}</span>` };
const agoMin = m => { m = Math.max(0, m); return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 48 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
const mdbAgo = () => { const t = Date.parse((D.mdb?.read || "").replace(" ", "T") + "Z"); return isNaN(t) ? "" : agoMin((Date.now() - t) / 6e4) };
PRICE_SRC.splice(1, 0, id => { const m = MDB[id]; if (!m || m[0] == null) return null;
  return {src: "meowdb", kind: "player price checks", v: m[0], n: `${fmt(m[1])} ask${m[1] === 1 ? "" : "s"} + ${fmt(m[2])} sale${m[2] === 1 ? "" : "s"}`,
    detail: [m[7] >= 3 && m[6] != null ? `last 24 h ${fmt(m[6])} (${m[7]})` : "", m[3] ? `cheapest ask ${fmt(m[3])}` : ""].filter(Boolean).join(" · "),
    few: m[2] < 5, when: mdbAgo()} });
LIST_SRC.push(id => (MDBL[id] || []).map(r => ({v: r[1], qty: r[2], ch: r[3], room: r[4] ? "FM " + r[4] : "", spot: r[5], who: r[6],
  ago: agoMin(Date.now() / 6e4 - r[7]), t: r[7], src: "meowdb", buy: !!r[0], direct: !!r[8], note: r[9]})));

// Items page "Prices": 4 headline tiles, one row per market source, then every listing we know a place for, freshest shops first
const PX_SHOW = 8;
// listing up 3+ days (x.since = first seen unix min): likely overpriced or a dead shop
const PX_STALE_MIN = 3 * 1440, pxStale = x => x.since && Date.now() / 6e4 - x.since >= PX_STALE_MIN
  ? ` <span class="pill p-warn" title="First seen ${Math.floor((Date.now() / 6e4 - x.since) / 1440)} days ago: it hasn't sold, so it may be overpriced or the shop is gone">stale</span>` : "";
// Danny 2026-10-28: a listing's age says how likely the shop still stands - people leave shops up while they sleep or
// work (~8-12 h): <=8 h fresh, <=12 h low-confidence, older hidden behind "Show older" while anything fresher exists.
// x.t = listed/bumped/last-seen unix min (per source), x.since = meso.watch first-seen, neither = snapshot-fresh.
const PX_FRESH_MIN = 8 * 60, PX_LOW_MIN = 12 * 60;
const pxAge = x => x.t != null ? Date.now() / 6e4 - x.t : x.since != null ? Date.now() / 6e4 - x.since : null;
const pxTier = x => { const m = pxAge(x); return m == null || m <= PX_FRESH_MIN ? 2 : m <= PX_LOW_MIN ? 1 : 0 };
const pxAgePill = (x, buy) => { const m = pxAge(x); if (m == null || m <= PX_FRESH_MIN) return "";
  const h = Math.round(m / 60);
  return m <= PX_LOW_MIN
    ? ` <span class="pill p-warn" title="${buy ? `Posted ${h} h ago: buyers usually move on within hours, so this offer may be stale` : `Listed ${h} h ago: shops usually stay up 8-12 h (sleep, work), so this one may have closed`}">low-confidence</span>`
    : ` <span class="pill p-hot" title="${buy ? `Posted ${h} h ago: this buy offer is very likely stale` : `Listed ${h} h ago: a shop this old is very likely closed - treat the price as a hint, not a live quote`}">may be closed</span>` };
const pxWhere = x => [x.ch ? "Ch " + x.ch : "", String(x.room || "").replace(/Free Market\s*<(\d+)>/i, "FM $1"), x.spot].filter(Boolean).map(esc).join(" · ")
  || (x.direct ? `<span class="sub">whisper / meet up</span>` : `<span class="sub">not given</span>`);
const pxEach = v => v < 10 && v % 1 ? v : fmt(v);
// P3 (Danny 2026-10-26): a source row whose data file is past its poll cadence gets a quiet stale pill, like the listing pill.
// Same thresholds as the MCI Source-health panel: meso.watch has a full-ISO generated (6 polls/h -> 180 min), the rest only
// expose a date-only read (3 h polls -> 2 days, since "today" parses as 0-24 h old).
const pxSrcTs = r => r.src === "meso.watch" ? D.pw?.generated
  : r.src === "classicmarket.kr" ? (r.kind === "market (combined)" ? D.cmp?.read : D.cm?.read)
  : {meowdb: D.mdb?.read, "mesoarbitrage.com": D.ma?.read, "maplestory.watch": D.mw?.read, "mesoindex.com": D.mi?.read}[r.src];
const pxSrcStale = r => { const t = Date.parse(String(pxSrcTs(r) || "").replace(" ", "T") + "Z"); if (isNaN(t)) return "";
  const min = Math.max(0, (Date.now() - t) / 6e4), max = r.src === "meso.watch" ? 180 : 2880;
  if (min <= max) return "";
  const txt = min < 2880 ? Math.round(min / 60) + " h" : Math.round(min / 1440) + " d";
  return ` <span class="pill p-warn" title="This source's data is ${txt} old, past its update cadence: the poll may be failing silently. The watchdog files an issue when a source freezes; compare with the other rows before trusting this one.">stale ${txt}</span>`; };
function priceBox(id){
  const it = D.items[id], best = pwPrice(id), rows = PRICE_SRC.map(f => f(id)).filter(Boolean), all = listingsOf(id);
  const sells = all.filter(x => !x.buy).sort((a, b) => pxTier(b) - pxTier(a) || a.v - b.v || (pxAge(a) ?? 1e15) - (pxAge(b) ?? 1e15)),
    buys = all.filter(x => x.buy).sort((a, b) => pxTier(b) - pxTier(a) || b.v - a.v);
  const shop = shopBest(id), cheap = sells[0], usual = best && !best.per ? best.v : null;
  const vs = v => { if (!usual) return ""; const r = v / usual; return r < 0.995 ? `<span class="up">${Math.round((1 - r) * 100)}% under usual</span>` : r > 1.005 ? `${Math.round((r - 1) * 100)}% over usual` : "about usual" };
  // P4 (Danny 2026-10-26): context under the headline: the range across solid sources (>= 5 data points, not buy orders)
  // plus an agreement pill, so a headline that sits alone on the tile carries what the rows below it say.
  const solid = rows.filter(r => r.v > 0 && !r.buy && !r.few).map(r => r.v);
  const lo = Math.min(...solid), hi = Math.max(...solid), spread = hi / lo;
  const agree = spread <= 1.25 ? ` <span class="pill p-good" title="All ${solid.length} solid sources sit within 25% of each other">sources within 25%</span>`
    : spread > 2 ? ` <span class="pill p-warn" title="The solid sources disagree (ask-vs-sold windows or thin data): compare the rows below before trusting one number">sources ${Math.round(spread)}x apart</span>` : "";
  const pxCtx = solid.length >= 2 ? `${solid.length} solid sources · ${fmt(lo)}-${fmt(hi)}${agree}` : "";
  const unit = best?.src?.startsWith("consensus") ? "sales" : {"meso.watch": "sales", "classicmarket.kr market": "sold", "meowdb": "prices",
    "mesoarbitrage.com": "sales", "maplestory.watch": "sales", "mesoindex.com": "sales",
    "mesoarbitrage.com listing": "listings", "maplestory.watch listing": "listings", "mesoindex.com listing": "listings"}[best?.src + (best?.unit === "listing" ? " listing" : "")] || "posts";
  // P13/P14 (Danny 2026-10-27): a meso.watch headline carries its trust context - the p25-p75 band when the median is
  // thin or wide, and a "price moving" flag when the daily medians disagree (P15's weighted value says so itself).
  const band = pwBand(id), moving = pwMoving(id);
  const trust = best && best.src === "meso.watch"
    ? [band ? `likely ${fmt(band[0])}-${fmt(band[1])}` : "", moving ? ` <span class="pill p-hot" title="The last two daily medians disagree by more than 25%: the price is in flux, check the sparkline">price moving</span>` : ""].filter(Boolean).join(" · ")
    : "";
  const tile = (k, v, sub, tip, sub2) => `<div class="pxt"${tip ? ` title="${esc(tip)}"` : ""}><span class="pxk">${k}</span><b class="pxv">${v}</b><span class="pxs">${sub}</span>${sub2 ? `<span class="pxs">${sub2}</span>` : ""}</div>`;
  const tiles = `<div class="pxtiles">
    ${tile("Usual price", best ? fmt(best.v) + (best.per ? `<small> per set</small>` : "") : "–", best ? `${esc(best.src)} · ${fmt(best.n)} ${unit}${best.wt ? ` · 3-day weighted` : ""}${best.rough ? ` <span class="pill p-warn">rough</span>` : ""}` : "no player prices yet",
      best ? `The price the rest of the site uses: solid meso.watch sales first, then a consensus median of the solid markets for thin items, then classicmarket.kr market, meowdb, the classicmarket.kr posts and the shop-scan sources (mesoarbitrage, maplestory.watch, mesoindex)` : "", [pxCtx, trust].filter(Boolean).join(" · "))}
    ${tile("Cheapest listed", cheap ? pxEach(cheap.v) : "–", cheap ? `${pxWhere(cheap)}${vs(cheap.v) ? " · " + vs(cheap.v) : ""}${pxTier(cheap) < 2 ? ` · ${cheap.ago || "older listing"}${pxTier(cheap) === 0 ? " · may be closed" : ""}` : ""}` : "no live listing with a place")}
    ${tile("NPC shop", shop ? fmt(shop[3]) : "–", shop ? esc(shop[0]) + (shop[4] ? ` · ${shop[4]} price` : "") : "no shop sells it", shop ? `${shop[0]}, ${shop[2]} (meowdb shop list)` : "")}
    ${tile("NPC buys", it?.p ? fmt(it.p) : "–", it?.p ? "game files" : "can't be sold to NPCs")}</div>`;
  const src = rows.length ? `<div class="tblwrap"><table class="mini pxsrc"><thead><tr><th>Source</th><th class="num">Price</th><th>Based on</th><th>Range</th><th>Updated</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td><b>${esc(r.src)}</b> <span class="sub">${esc(r.kind)}</span></td><td class="num"><b>${fmt(r.v)}</b>${r.per ? ` <span class="sub">${r.per}</span>` : ""}${r.trend ? " " + r.trend : ""}${r.spark ? " " + r.spark : ""}</td>
      <td>${r.n}${r.few ? ` <span class="pill p-warn" title="Few data points: rough">few</span>` : ""}</td><td class="sub">${r.detail || ""}</td><td class="sub">${whenTxt(r.when)}${pxSrcStale(r)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="sub">No player prices from any market source yet.</p>`;
  const lrow = (x, i, af) => `<tr${i >= PX_SHOW || (pxTier(x) === 0 && af) ? ` class="pxx"` : ""}><td class="num"><b>${pxEach(x.v)}</b>${i === 0 && !x.buy ? ` <span class="pill p-good">cheapest</span>` : ""}</td><td class="num">${x.qty > 1 ? "×" + fmt(x.qty) : "1"}</td>
    <td>${pxWhere(x)}${x.note ? ` <span class="sub">${esc(x.note)}</span>` : ""}</td><td>${x.who ? esc(x.who) : `<span class="sub">–</span>`}</td><td class="sub">${esc(x.ago || "")}${pxAgePill(x, !!x.buy)}${pxStale(x)}</td><td class="sub">${esc(x.src)}</td></tr>`;
  const ltab = (a, h, what) => { const af = a.some(x => pxTier(x) > 0), hid = a.filter((x, i) => i >= PX_SHOW || (pxTier(x) === 0 && af)).length;
    return `<h4 class="pxh">${h} <span class="sub">${a.length} ${what}</span></h4><div class="tblwrap"><table class="mini pxls"><thead><tr><th class="num">Each</th><th class="num">Qty</th><th>Where</th><th>Seller</th><th>Listed</th><th>Source</th></tr></thead>
    <tbody>${a.map((x, i) => lrow(x, i, af)).join("")}</tbody></table></div>${hid ? `<button class="btn pxall" data-pxall>${af && a.some(x => pxTier(x) === 0) ? `Show ${hid} older listing${hid === 1 ? "" : "s"} — shops may have closed` : `Show all ${a.length}`}</button>` : ""}` };
  const allOld = sells.length > 0 && sells.every(x => pxTier(x) === 0);
  const where = (allOld ? `<p class="sub pxold"><b>All ${sells.length} listing${sells.length === 1 ? " is" : "s are"} 12 h+ old</b> — shops that old have almost always closed, so read these as price hints, not live quotes.</p>` : "")
    + (sells.length ? ltab(sells, "Where to buy", sells.length === 1 ? "listing" : "listings, freshest shops first")
    : `<h4 class="pxh">Where to buy</h4><p class="sub">No live listing with a channel or FM room right now.</p>`);
  const h = PWH[id], chart = h ? `<div class="pxchart">${pwSpark(id, 1)}<span class="sub">meso.watch median sale price, ${h[0][0]} to ${h[h.length - 1][0]}: ${fmt(Math.min(...h.map(x => x[1])))}-${fmt(Math.max(...h.map(x => x[1])))} · ${fmt(h.reduce((a, x) => a + x[2], 0))} sold</span></div>` : "";
  return `${tiles}${chart}${src}${where}${buys.length ? ltab(buys, "Buy orders", buys.length === 1 ? "player wants it" : "players want it, freshest offers first") : ""}
    <p class="sub pxfoot">Listings come from meso.watch (cheapest per item only, from streams, updated ${pwListedAgo() || "–"}), meowdb (players post their own shops, updated ${mdbAgo() || "–"}; gone after 7 days without a bump), and maplestory.watch + mesoindex.com shop scans (seen in the last day). classicmarket.kr posts have no location. Shops open and close fast - people leave them up while they sleep or work, about 8-12 h: listings up to 8 h old come first, 8-12 h ones carry a low-confidence tag, and anything older hides behind Show older unless it is all there is. If a shop is gone, try the next.</p>`;
}
