// Shop-scan site (scripts/fetch_shopscans.py): players share their game window in the browser and it reads the
// Free Market shops they open. Prices are per item; equips are any roll/scroll state (the site doesn't split them).
// MA: mesoarbitrage.com {itemId: [soldMedian, soldN, askMin, listingsSeen, sold72Median, sold72N, lastSeenUnixMin]}, D.ma.read UTC.
const MA = D.ma?.it || {};
const ssAgo = min => agoMin(Date.now() / 6e4 - min);
const ssN = (n, w) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;
// Items page Prices box rows (contract: Item page prices thread, 2026-10-21)
PRICE_SRC.push(id => { const m = MA[id]; if (!m || !(m[0] || m[2])) return null;
  const sold = m[0] && m[1];
  return {src: "mesoarbitrage.com", kind: sold ? "median sale, shop scans" : "cheapest ask, shop scans", v: sold ? m[0] : m[2],
    n: sold ? ssN(m[1], "sale") : ssN(m[3], "listing"), few: !sold || m[1] < 5,
    detail: [m[2] && sold ? `asks from ${fmt(m[2])}` : "", m[5] ? `last 72 h: ${fmt(m[4])} (${ssN(m[5], "sale")})` : ""].filter(Boolean).join(" · "),
    when: m[6] ? "last seen " + ssAgo(m[6]) + " (shown 2 h late)" : ""} });
