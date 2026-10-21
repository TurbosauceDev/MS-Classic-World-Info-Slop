// Shop-scan sites (scripts/fetch_shopscans.py): players share their game window in the browser and these sites read the
// Free Market shops they open. Prices are per item; equips are any roll/scroll state (the sites don't split them).
// MA: mesoarbitrage.com {itemId: [soldMedian, soldN, askMin, listingsSeen, sold72Median, sold72N, lastSeenUnixMin]}, D.ma.read UTC.
// MW: maplestory.watch {itemId: [typical, unitsSold14d, lowest, listedNow, dayAgo, lastSeenUnixMin]}, D.mw.read UTC;
// MWLS: its open shops seen in the last day {itemId: [[priceEach, bundle, channel|null, fmRoom|null, seller, shopTitle, seenUnixMin]]}.
const MA = D.ma?.it || {}, MW = D.mw?.it || {}, MWLS = D.mw?.ls || {};
const ssAgo = min => agoMin(Date.now() / 6e4 - min);
const ssN = (n, w) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;
// typical now vs a day ago, as the ▲/▼ pill meso.watch rows use
const ssTrend = (v, ago) => { if (!v || !ago) return ""; const t = v / ago - 1; if (Math.abs(t) < 0.005) return "";
  return `<span class="${t > 0 ? "up" : "down"}" title="Typical price vs a day ago (maplestory.watch)">${t > 0 ? "▲" : "▼"}${Math.round(Math.abs(t) * 100)}%</span>` };
// Items page Prices box rows (contract: Item page prices thread, 2026-10-21)
PRICE_SRC.push(id => { const m = MA[id]; if (!m || !(m[0] || m[2])) return null;
  const sold = m[0] && m[1];
  return {src: "mesoarbitrage.com", kind: sold ? "median sale, shop scans" : "cheapest ask, shop scans", v: sold ? m[0] : m[2],
    n: sold ? ssN(m[1], "sale") : ssN(m[3], "listing"), few: !sold || m[1] < 5,
    detail: [m[2] && sold ? `asks from ${fmt(m[2])}` : "", m[5] ? `last 72 h: ${fmt(m[4])} (${ssN(m[5], "sale")})` : ""].filter(Boolean).join(" · "),
    when: m[6] ? "last seen " + ssAgo(m[6]) + " (shown 2 h late)" : ""} });
PRICE_SRC.push(id => { const w = MW[id]; if (!w || !(w[0] || w[2])) return null;
  const sold = w[1] > 0;
  return {src: "maplestory.watch", kind: sold ? "typical price, shop scans (14 days)" : "asked, none sold yet", v: w[0] || w[2],
    n: sold ? ssN(w[1], "sale") : ssN(w[3], "listing"), few: !sold || w[1] < 5,
    trend: ssTrend(w[0], w[4]),
    detail: [w[2] ? `lowest ${fmt(w[2])}` : "", w[3] ? `${fmt(w[3])} for sale now` : ""].filter(Boolean).join(" · "),
    when: w[5] ? "last seen " + ssAgo(w[5]) : ""} });
// Where-to-buy list: maplestory.watch shops seen in the last day (older ones have likely closed: shops stay up a day at most)
LIST_SRC.push(id => (MWLS[id] || []).filter(r => Date.now() / 6e4 - r[6] < 1440).map(r => ({
  v: r[0], qty: r[1], ch: r[2], room: r[3] ? "FM " + r[3] : "", spot: r[5] ? `“${r[5]}”` : "", who: r[4],
  ago: ssAgo(r[6]), t: r[6], src: "maplestory.watch"})));
