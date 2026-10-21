// mesoindex.com (scripts/fetch_mesoindex.py; approved + trusted, owner's OK 2026-10-20). Its prices come mostly from cozy.markets
// shop scans. MI: {itemId: [usual, p25, p75, salesBehindUsual, sales7d, cheapestAsk, asksSeen, conf 2/1/0, trendPct, lastSaleUnixMin]},
// D.mi.read UTC. MILS: its unsold shop slots seen in the last day
// {itemId: [[priceEach, qty, channel|null, fmRoom|null, shop, shopTitle, seenUnixMin, mapOutsideFM]]}.
const MI = D.mi?.it || {}, MILS = D.mi?.ls || {};
PRICE_SRC.push(id => { const m = MI[id]; if (!m || !(m[0] || m[5])) return null;
  const sold = m[0] && m[3];
  return {src: "mesoindex.com", kind: sold ? "usual price, shop scans" : "cheapest ask, none sold yet", v: sold ? m[0] : m[5],
    n: sold ? ssN(m[3], "sale") : ssN(m[6], "listing"), few: !sold || m[3] < 5 || m[7] === 0,
    detail: [sold && m[1] && m[2] ? `half sold for ${fmt(m[1])}-${fmt(m[2])}` : "", m[5] && sold ? `asks from ${fmt(m[5])}` : "",
      m[4] ? `${ssN(m[4], "sale")} in 7 days` : ""].filter(Boolean).join(" · "),
    when: m[9] ? "last sale " + ssAgo(m[9]) : (D.mi.read || "")} });
// Where-to-buy list: mesoindex shops seen in the last day (shops stay up a day at most)
LIST_SRC.push(id => (MILS[id] || []).filter(r => Date.now() / 6e4 - r[6] < 1440).map(r => ({
  v: r[0], qty: r[1], ch: r[2], room: r[3] ? "FM " + r[3] : "", spot: [r[7], r[5] ? `“${r[5]}”` : ""].filter(Boolean).join(" "), who: r[4],
  ago: ssAgo(r[6]), t: r[6], src: "mesoindex.com"})));
