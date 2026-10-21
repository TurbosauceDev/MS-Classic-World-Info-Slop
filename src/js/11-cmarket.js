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
// median -> buy-order median (null: none). unit names what n counts.
function pwPrice(id){
  const p = PW[id], c = CM[id], m = MDB[id], k = CMP[id];
  if (p && p[0] > 0) return {v: p[0], src: "meso.watch", n: p[3], unit: "sale", rough: !!(p[4] & 1), per: !!(p[4] & 2)};
  if (k?.[0] > 0) return {v: k[0], src: "classicmarket.kr market", n: k[3], unit: "sale", rough: k[3] < 5};
  if (m?.[0] > 0) return {v: m[0], src: "meowdb", n: m[1] + m[2], unit: "player price", rough: m[2] < 5};   // rough: under 5 sales among its prices
  if (c?.[2]) return {v: c[1], src: "classicmarket.kr asks", n: c[2], unit: "post", rough: true};
  if (c?.[5]) return {v: c[4], src: "classicmarket.kr buy orders", n: c[5], unit: "post", rough: true};
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
