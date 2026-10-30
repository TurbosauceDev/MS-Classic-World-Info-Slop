// classicmarket.kr trade posts (D.cm, scripts/fetch_classicmarket_listings.py): sellers' asks and buyers' buy orders, each
// [askMin, askMedian, askN, bidMax, bidMedian, bidN]; stackables and clean exact-roll equips only. Used where meso.watch has no sales.
const CM = D.cm?.it || {};
const cmAgo = () => { const t = Date.parse((D.cm?.read || "").replace(" ", "T") + "Z"); if (isNaN(t)) return "";
  const m = Math.max(0, (Date.now() - t) / 6e4);
  return m < 60 ? Math.round(m) + " min ago" : m < 48 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
const cmPosts = n => `${fmt(n)} post${n === 1 ? "" : "s"}`;
// classicmarket.kr's own combined prices ("Layer B", D.cmp, scripts/fetch_classicmarket_market.py; owner's OK 2026-10-21, credit
// classicmarket.kr wherever shown): CMP[id] = [median, low, high, sold, seen, forSaleNow, day]
const CMP = D.cmp?.it || {};
// the price to use: meso.watch sale median -> classicmarket.kr combined median -> meowdb usual price -> classicmarket.kr ask
// median -> buy-order median -> (P5, Danny 2026-10-26) mesoarbitrage sale median (or cheapest ask) -> maplestory.watch
// typical (or lowest ask) -> mesoindex usual (or cheapest ask), each labelled with its kind; thin data stays rough (null: none).
function pwPrice(id){
  const p = PW[id], c = CM[id], m = MDB[id], k = CMP[id];
  // P16 (Danny 2026-10-27): a thin meso.watch median (low data, spike-held, or under 3 sales) no longer headlines; the
  // solid sale-based sources pool into a consensus median instead. meso.watch stays first whenever it is solid, and with
  // no consensus the old chain runs unchanged (a thin median still beats a 1-sale classicmarket row).
  if (p && p[0] > 0 && !(p[4] & 1) && !(p[4] & 4) && p[3] >= 3){
    const u = pwUsual(id);
    return u.moving ? {v: u.v, src: "meso.watch", n: p[3], unit: "sale", rough: !!(p[4] & 1), per: !!(p[4] & 2), wt: 1}
                    : {v: p[0], src: "meso.watch", n: p[3], unit: "sale", rough: !!(p[4] & 1), per: !!(p[4] & 2)};
  }
  const pool = [];
  if (k?.[0] > 0 && k[3] >= 5) pool.push(k[0]);
  if (MW[id]?.[0] > 0 && MW[id][1] >= 5) pool.push(MW[id][0]);
  if (MI[id]?.[0] > 0 && MI[id][3] >= 5) pool.push(MI[id][0]);
  if (pool.length >= 2){ const mid = median(pool), spread = Math.max(...pool) / Math.min(...pool);
    // n is what the tile prints as "N sales": count the sales behind the pooled markets, not the market count
    // (audit 2026-10-28: "consensus of 2 markets · 2 sales" when 41 sales actually fed the median)
    return {v: mid, src: `consensus of ${pool.length} markets`, n: (k?.[3] || 0) + (MW[id]?.[1] || 0) + (MI[id]?.[3] || 0), unit: "sale", rough: spread > 1.5, cons: 1} }
  if (p && p[0] > 0) return {v: p[0], src: "meso.watch", n: p[3], unit: "sale", rough: true, per: !!(p[4] & 2)};
  if (k?.[0] > 0) return {v: k[0], src: "classicmarket.kr market", n: k[3], unit: "sale", rough: k[3] < 5};
  if (m?.[0] > 0) return {v: m[0], src: "meowdb", n: m[1] + m[2], unit: "price", rough: m[2] < 5};   // rough: under 5 sales among its prices
  if (c?.[2]) return {v: c[1], src: "classicmarket.kr asks", n: c[2], unit: "post", rough: true};
  if (c?.[5]) return {v: c[4], src: "classicmarket.kr buy orders", n: c[5], unit: "post", rough: true};
  // P5 tail (audit 2026-10-26): 51 items had source prices but no headline because the chain stopped at the trade posts.
  // Each scan source gives its sale-based number when it has one, else its cheapest ask, always rough-labelled like the rows.
  const a = MA[id];
  if (a?.[0] > 0 && a[1]) return {v: a[0], src: "mesoarbitrage.com", n: a[1], unit: "sale", rough: a[1] < 5};
  if (a?.[2] > 0) return {v: a[2], src: "mesoarbitrage.com", n: a[3], unit: "listing", rough: true};
  const w = MW[id];
  if (w?.[0] > 0 && w[1]) return {v: w[0], src: "maplestory.watch", n: w[1], unit: "sale", rough: w[1] < 5};
  if (w?.[2] > 0) return {v: w[2], src: "maplestory.watch", n: w[3], unit: "listing", rough: true};
  const i = MI[id];
  if (i?.[0] > 0 && i[3]) return {v: i[0], src: "mesoindex.com", n: i[3], unit: "sale", rough: i[3] < 5 || i[7] === 0};
  if (i?.[5] > 0) return {v: i[5], src: "mesoindex.com", n: i[6], unit: "listing", rough: true};
  return null;
}
// short label for a table cell: "classicmarket ask ~650,000 (2 posts)"
const cmShort = id => { const c = CM[id]; if (!c) return "";
  return [c[2] ? `asks ~${fmt(c[1])} (${cmPosts(c[2])})` : "", c[5] ? `buy orders ~${fmt(c[4])} (${cmPosts(c[5])})` : ""].filter(Boolean).join(" · ") +
    ` <span class="tiny" title="classicmarket.kr trade posts, as of ${esc(D.cm.read)} UTC">classicmarket.kr</span>` };
// Items page "Prices": a row for the combined market price, then one each for trade-board asks and buy orders
PRICE_SRC.push(id => { const k = CMP[id]; return k?.[0] > 0 ? {src: "classicmarket.kr", kind: "market (combined)", v: k[0], n: `${fmt(k[3])} sold · ${fmt(k[4])} seen`,
    detail: [k[1] != null && k[2] != null ? `${fmt(k[1])}-${fmt(k[2])}` : "", k[5] ? `${fmt(k[5])} for sale now` : ""].filter(Boolean).join(" · "), few: k[3] < 5, when: k[6] || ""} : null },
  id => { const c = CM[id]; return c?.[2] ? {src: "classicmarket.kr", kind: "trade-board asks", v: c[1], detail: `from ${fmt(c[0])}`, n: cmPosts(c[2]), few: c[2] < 5, when: cmAgo()} : null },
  id => { const c = CM[id]; return c?.[5] ? {src: "classicmarket.kr", kind: "buy orders", v: c[4], detail: `up to ${fmt(c[3])}`, n: cmPosts(c[5]), few: c[5] < 5, when: cmAgo(), buy: true} : null });
