// classicmarket.kr trade posts (D.cm, scripts/fetch_classicmarket_listings.py): sellers' asks and buyers' buy orders, each
// [askMin, askMedian, askN, bidMax, bidMedian, bidN]; stackables and clean exact-roll equips only. Used where meso.watch has no sales.
const CM = D.cm?.it || {};
const cmAgo = () => { const t = Date.parse((D.cm?.read || "").replace(" ", "T") + "Z"); if (isNaN(t)) return "";
  const m = Math.max(0, (Date.now() - t) / 6e4);
  return m < 60 ? Math.round(m) + " min ago" : m < 48 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
const cmPosts = n => `${fmt(n)} post${n === 1 ? "" : "s"}`;
// the price to use: meso.watch sale median -> classicmarket.kr ask median -> classicmarket.kr buy-order median (null: none)
function pwPrice(id){
  const p = PW[id], c = CM[id];
  if (p && p[0] > 0) return {v: p[0], src: "meso.watch", n: p[3], rough: !!(p[4] & 1), per: !!(p[4] & 2)};
  if (c?.[2]) return {v: c[1], src: "classicmarket.kr asks", n: c[2], rough: true};
  if (c?.[5]) return {v: c[4], src: "classicmarket.kr buy orders", n: c[5], rough: true};
  return null;
}
// short label for a table cell: "classicmarket ask ~650,000 (2 posts)"
const cmShort = id => { const c = CM[id]; if (!c) return "";
  return [c[2] ? `asks ~${fmt(c[1])} (${cmPosts(c[2])})` : "", c[5] ? `buy orders ~${fmt(c[4])} (${cmPosts(c[5])})` : ""].filter(Boolean).join(" · ") +
    ` <span class="tiny" title="classicmarket.kr trade posts, as of ${esc(D.cm.read)} UTC">classicmarket.kr</span>` };
// long form for detail boxes
function cmHtml(id){ const c = CM[id]; if (!c) return "";
  const a = c[2] ? `sellers ask from <b>${fmt(c[0])}</b> (median ${fmt(c[1])}, ${cmPosts(c[2])})` : "",
    b = c[5] ? `buy orders up to <b>${fmt(c[3])}</b> (median ${fmt(c[4])}, ${cmPosts(c[5])})` : "";
  return `classicmarket.kr: ${[a, b].filter(Boolean).join(" · ")} mesos each<br><span class="sub">Trade posts updated ${cmAgo()} (classicmarket.kr). Asking prices, not sales; few posts = rough.</span>` }
// Items page "Prices" box: a line after the live meso.watch listing
PRICE_SRC.splice(3, 0, id => CM[id] ? ["", cmHtml(id)] : null);
