/* ---------------- FM Sniper: live Free Market listings under their usual player-shop price ---------------- */
(() => {
// One row per item meso.watch lists right now (PWNOW: the cheapest live listing per non-equip item, [price each, qty,
// channel, map, seller]) against its sale stats (PW: [median, p25, p75, sales seen, flags 1 = low data, trend, sell-through]),
// the NPC sell price (D.items .p, game files) and NPC shop prices (D.ishop / D.shopsell, meowdb). A deal = listed under the
// usual price, or under what an NPC pays (Danny 10-20). Grade cut-offs, Best deal, Best flip and "volatile" are ours and
// say so on the page. Tools (modes): Deals list, Shopping trip, Crafting flips, Sell yours, Watch list (targets, alerts),
// Movers, Deal lifetimes (D.pw.life, scripts/deal_life.py). The Pages copy re-reads market.json (scripts/pages_site.py),
// so new listings show up without a reload; the artifact and file:// only have the build's list.
if (!D.pw?.it) return;
const CATS = {scroll: "Scrolls", ore: "Ores, plates and gems", loot: "Monster loot", use: "Potions and food", travel: "Return scrolls", craft: "Crafting", other: "Other"};
const catOf = id => { const it = D.items[id], n = +id;
  if (it.c === "Scroll") return "scroll";
  if (n >= 4010000 && n < 4030000) return "ore";
  if (n >= 4000000 && n < 4001000) return "loot";
  if (it.c === "Consumable") return n >= 2030000 && n < 2031000 ? "travel" : / Kit$/.test(it.n) ? "craft" : "use";
  if ((n >= 4003000 && n < 4004000) || (n >= 4130000 && n < 4131000)) return "craft";
  return "other" };
// scrolls: "Success rate: 10%, STR +3" from the item description (OSMS export)
const scrollInfo = it => { const m = /Success rate:\s*(\d+)%[,\s]*([^\n]*)/.exec(it.d || ""); return m ? `${m[1]}% · ${m[2].trim()}` : "" };
const MODES = ["list", "trip", "craft", "sell", "watch", "move", "life"];
const VIEWS = ["deal", "over", "all"], SORTS = ["score", "flip", "pct", "gap", "stack", "npc", "price", "usual", "sales", "sell", "since", "name"];
const MINS = [0, 10, 20, 30, 50], SALES = [0, 5, 20, 100], FLAGS = ["rough", "vol", "npc", "need", "mine", "watch", "nw"];
const DEF = {m: "list", v: "deal", q: "", cat: "", sort: "score", basis: "med", max: 0, min: 0, sales: 0, rough: false, vol: false, npc: false, need: false, mine: false, watch: false, nw: false};
const clean = o => { const x = {...DEF}; if (!o || typeof o !== "object") return x;
  if (MODES.includes(o.m)) x.m = o.m; if (VIEWS.includes(o.v)) x.v = o.v; if (SORTS.includes(o.sort)) x.sort = o.sort; if (o.basis === "p25") x.basis = "p25";
  if (typeof o.cat === "string" && Object.hasOwn(CATS, o.cat)) x.cat = o.cat; if (typeof o.q === "string") x.q = o.q.slice(0, 60);
  const max = Math.floor(+o.max); if (isFinite(max) && max > 0 && max < 1e10) x.max = max;
  if (MINS.includes(+o.min)) x.min = +o.min; if (SALES.includes(+o.sales)) x.sales = +o.sales;
  for (const k of FLAGS) x[k] = o[k] === true;
  return x };
let S = {...DEF};
try { S = clean({...savedState("snipe", DEF), q: ""}) } catch(e) {}
if (HASH.f && typeof HASH.f === "object") S = clean(HASH.f);   // shared link
const ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch(e) {} };
const lget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d } catch(e) { return d } };
const save = () => ls("snipe", {...S, q: ""});
let WATCH = new Set(); { const w = lget("snipewatch", []); if (Array.isArray(w)) WATCH = new Set(w.map(String).filter(id => D.items[id])) }
const saveWatch = () => ls("snipewatch", [...WATCH]);
// per-item target prices, tool settings, alert switches, saved presets: per viewer, checked on load
const TGT = {}; { const t = lget("snipetarget", {}); if (t && typeof t === "object") for (const [id, v] of Object.entries(t)) if (D.items[id] && Number.isFinite(+v) && +v > 0 && +v < 1e10) TGT[id] = Math.floor(+v) }
const TDEF = {bud: 0, rank: "roi", rough: false, cdisc: "", csort: "profit", clive: true, crough: false, sell: "", recent: []};
const T = {...TDEF}; { const t = lget("snipetools", {}); if (t && typeof t === "object"){
  const b = Math.floor(+t.bud); if (isFinite(b) && b > 0 && b < 1e12) T.bud = b;
  if (["roi", "flip", "gap"].includes(t.rank)) T.rank = t.rank; if (["profit", "roi", "lvl"].includes(t.csort)) T.csort = t.csort;
  for (const k of ["rough", "crough"]) T[k] = t[k] === true; T.clive = t.clive !== false;
  if (typeof t.cdisc === "string") T.cdisc = t.cdisc.slice(0, 40); if (typeof t.sell === "string" && D.items[t.sell]) T.sell = t.sell;
  if (Array.isArray(t.recent)) T.recent = t.recent.map(String).filter(id => D.items[id]).slice(0, 8) } }
const saveT = () => ls("snipetools", T);
const AL = {badge: true, note: false, sound: false}; { const a = lget("snipealert", {}); if (a && typeof a === "object") for (const k of Object.keys(AL)) if (typeof a[k] === "boolean") AL[k] = a[k] }
const PRESETS = {
  scroll: ["Scroll hunter", {v: "deal", cat: "scroll", sales: 5, sort: "score"}],
  ore: ["Ore flipper", {v: "deal", cat: "ore", sort: "flip"}],
  cheap: ["Under 10k", {v: "deal", max: 10000, sort: "pct"}],
  steal: ["Steals only", {v: "deal", min: 50, rough: true, sort: "pct"}],
  npc: ["Vendor flips", {v: "deal", npc: true, sort: "npc"}],
  rise: ["Rising prices", {v: "over", sort: "pct"}]};
let MYPRE = {}; { const p = lget("snipepresets", {}); if (p && typeof p === "object") for (const [k, v] of Object.entries(p).slice(0, 20)) if (typeof k === "string" && k.length <= 30) MYPRE[k] = clean(v) }

// NPC prices: what an NPC pays (game files) and the cheapest NPC shop that sells it (meowdb shop list)
const npcPays = id => D.items[id]?.p || 0;
const shopMin = id => { const a = [...(D.ishop?.[id] || []).map(s => s[3]), D.shopsell?.[id]?.[2]].filter(v => v > 0); return a.length ? Math.min(...a) : 0 };
// Builder's weapon type, for "Scrolls for my weapon" (weapon scrolls name the type in their slot, e.g. "Claw")
const myWt = () => { const w = BLD?.S?.weapon; if (!w) return ""; for (const it of Object.values(D.items)) if (it.n === w && it.c === "Equipment") return it.wt || ""; return "" };
const LIFE = () => D.pw.life || {};
const tmin = s => { const t = Date.parse(String(s || "").replace(" ", "T") + "Z"); return isNaN(t) ? null : t / 6e4 };
const dur = m => m == null ? "?" : m < 1 ? "under a minute" : m < 90 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;

const keyOf = (id, n) => `${id}|${n[0]}|${n[4] ?? ""}`;
let ROWS = [];
function build(){
  const since = LIFE().since || {}, nowT = tmin(D.pw.listed);
  ROWS = Object.entries(PWNOW).filter(([id, n]) => D.items[id] && Array.isArray(n) && n[0] >= 1).map(([id, n]) => {
    const p = PW[id], ok = !!(p && p[0] > 0), base = !ok ? 0 : S.basis === "p25" ? p[1] || p[0] : p[0];
    const r = ok ? n[0] / base : null, sales = p ? p[3] : 0, rough = !!(p && p[4] & 1), q = n[1] || 1;
    const trust = ok ? Math.min(1, Math.log10(1 + sales) / 2) * (rough ? 0.5 : 1) : 0;   // 1 at 99+ sales seen
    const npc = npcPays(id), npcGain = npc > n[0] ? npc - n[0] : 0, sell = p && !rough ? p[6] ?? null : null, gap = ok ? base - n[0] : 0;
    const key = keyOf(id, n), sk = since[key], sinceM = sk ? tmin(sk) : null;
    return {id, it: D.items[id], n, p, r, base, sales, rough, trust, gap, stack: ok ? gap * q : 0, q, npc, npcGain, shop: shopMin(id),
      vol: !!(ok && !rough && (p[2] - p[1]) / p[0] > 0.6),
      score: r == null ? (npcGain ? Math.min(1, npcGain / n[0]) * 0.5 : -9) : (1 - r) * trust,
      flip: Math.max(r != null ? Math.max(0, gap) * (sell ?? 0) : 0, npcGain),   // a vendor sale always goes through
      key, cat: catOf(id), sell, trend: p && !rough ? p[5] ?? null : null,
      since: sk === "" ? -1 : sinceM != null && nowT != null ? Math.max(0, nowT - sinceM) : null};
  });
}
// [label, pill class, colour class, note]
const grade = x => x.r == null ? (x.npcGain ? ["Under NPC", "p-good", "g-deal", `vendor it: +${money(x.npcGain)} each`] : ["No sales yet", "", "g-even", "nothing to compare with"])
  : x.r > 3 ? ["Way over", "p-bad", "g-over", "typo or bait?"]
  : x.r >= 1.005 ? (x.trend > 0.005 ? ["Rising", "p-hot", "g-rise", `price trend +${Math.round(x.trend * 100)}%`] : ["Over value", "p-bad", "g-over", ""])
  : x.r > 0.995 ? ["At usual", "", "g-even", ""]
  : x.r <= 0.5 ? ["Steal", "p-good", "g-deal", ""] : x.r <= 0.7 ? ["Great", "p-good", "g-deal", ""] : x.r <= 0.85 ? ["Good", "p-good", "g-deal", ""] : ["Small", "p-hot", "g-deal", ""];
const pct = r => r == null ? "–" : r >= 10 ? "×" + fmt(Math.round(r)) : r < 0.01 ? "<1%" : Math.round(r * 100) + "%";
const money = v => v < 10 && v % 1 ? String(v) : fmt(Math.round(v));
const where = n => [n[2] ? "ch " + n[2] : "", n[3]].filter(Boolean).join(" · ");
const isDeal = x => (x.r != null && x.r < 0.995) || x.npcGain > 0;
const day = s => /^\d{4}-\d\d-\d\d$/.test(s || "") ? new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "UTC"}) : "?";
const nm = id => `<span class="itname" tabindex="0" data-item="${id}">${esc(D.items[id].n)}</span>`;
const hitOf = x => !!x && WATCH.has(x.id) && (TGT[x.id] ? x.n[0] <= TGT[x.id] : isDeal(x));

// new = a listing (item, price, seller) that wasn't in the list this browser last showed here
let SEEN = null; { const o = lget("snipeseen", null); if (o && Array.isArray(o.k)) SEEN = {l: String(o.l || ""), k: new Set(o.k.map(String)), n: new Set((o.n || []).map(String))} }
let NEW = new Set();
const markSeen = () => { const now = ROWS.map(x => x.key), listed = D.pw.listed || "";
  if (!SEEN) NEW = new Set(); else if (SEEN.l !== listed) NEW = new Set(now.filter(k => !SEEN.k.has(k))); else NEW = new Set(now.filter(k => SEEN.n.has(k)));
  SEEN = {l: listed, k: new Set(now), n: NEW}; ls("snipeseen", {l: listed, k: now, n: [...NEW]}) };

let NEED = {}, WT = "";
function pass(x){
  const q = S.q.trim().toLowerCase();
  if (q && !(x.it.n.toLowerCase().includes(q) || String(x.n[4] || "").toLowerCase().includes(q) || String(x.n[3] || "").toLowerCase().includes(q))) return false;
  if (S.cat && x.cat !== S.cat) return false;
  if (S.watch){ if (!WATCH.has(x.id)) return false } else if (S.v === "deal" ? !isDeal(x) : S.v === "over" ? !(x.r != null && x.r >= 1.005) : false) return false;
  if (S.max && x.n[0] > S.max) return false;
  if (S.min && !(x.r != null && (1 - x.r) * 100 >= S.min - 1e-9)) return false;
  if (S.sales && x.sales < S.sales) return false;
  if (S.rough && (x.rough || (x.r == null && !x.npcGain))) return false;
  if (S.vol && x.vol) return false;
  if (S.npc && !x.npcGain) return false;
  if (S.need && !NEED[x.id]) return false;
  if (S.mine && !(WT && x.it.c === "Scroll" && x.it.s === WT)) return false;
  if (S.nw && !NEW.has(x.key)) return false;
  return true;
}
const by = {score: (a, b) => b.score - a.score, flip: (a, b) => b.flip - a.flip, pct: (a, b) => (a.r ?? 1e9) - (b.r ?? 1e9), gap: (a, b) => b.gap - a.gap,
  stack: (a, b) => b.stack - a.stack, npc: (a, b) => b.npcGain - a.npcGain, price: (a, b) => a.n[0] - b.n[0], usual: (a, b) => (b.p?.[0] || 0) - (a.p?.[0] || 0),
  sales: (a, b) => b.sales - a.sales, sell: (a, b) => (b.sell ?? -1) - (a.sell ?? -1), since: (a, b) => (a.since ?? 1e9) - (b.since ?? 1e9), name: (a, b) => a.it.n.localeCompare(b.it.n)};
const sorted = list => list.sort((a, b) => by[S.sort](a, b) || a.it.n.localeCompare(b.it.n));

// where the listing sits against the usual price: the bar spans 0 to a bit past the dearest of p75, median and the listing
// (capped at twice the median; anything past that sits at the end), the shaded box is where half of sales landed
function strip(x, g){
  if (x.r == null) return `<span class="sub">no sales seen</span>`;
  const [m, lo, hi] = x.p, top = Math.max(hi, m, Math.min(x.n[0], m * 2)) * 1.1, at = v => Math.max(0, Math.min(100, v / top * 100));
  const t = `Listed ${money(x.n[0])} · usual ${fmt(m)} · half of sales ${fmt(lo)}-${fmt(hi)}`;
  return `<span class="snstrip" title="${t}" aria-label="${t}"><i class="snbox" style="left:${at(lo).toFixed(1)}%;width:${(at(hi) - at(lo)).toFixed(1)}%"></i><i class="snmed" style="left:${at(m).toFixed(1)}%"></i><i class="sndot ${g[2]}${x.n[0] > top ? " cut" : ""}" style="left:${at(x.n[0]).toFixed(1)}%"></i></span>`;
}
const star = id => `<button class="snico snstar" type="button" data-w="${id}" aria-pressed="${WATCH.has(id)}" title="${WATCH.has(id) ? "Stop watching" : "Watch this item"}" aria-label="Watch ${esc(D.items[id].n)}">${WATCH.has(id) ? "★" : "☆"}</button>`;
const copyBtn = x => `<button class="snico" type="button" data-cp="${x.id}" title="Copy item, price, channel and seller" aria-label="Copy where to buy ${esc(x.it.n)}">⧉</button>`;
const subOf = x => x.cat === "scroll" ? scrollInfo(x.it) || CATS.scroll : CATS[x.cat];
const nameCell = x => `<span class="ing">${itemIcon(x.id)}<span><span class="itname name" tabindex="0" data-item="${x.id}">${esc(x.it.n)}</span>${NEW.has(x.key) ? ` <span class="pill p-hot snnew">new</span>` : ""}<div class="sub">${esc(subOf(x))}</div>${NEED[x.id] ? `<div><span class="pill p-hot" title="Keep or sell: open quests still want this many (your Have counts)">you need ${fmt(NEED[x.id][0])}</span></div>` : ""}</span></span>`;
const sinceTxt = x => x.since == null ? "" : x.since < 0 ? "on the list before our records" : `on the list ${x.since < 1 ? "since the last check" : "about " + dur(x.since)}`;
function rowHtml(x, i){
  const g = grade(x), n = x.n, q = x.q, w = where(n), low = x.r != null && S.basis === "med" && x.r < 1 && n[0] < x.p[1];
  const gapc = x.r == null ? "" : x.gap >= 0 ? `<span class="up">${money(x.gap)} under</span>` : `<span class="down">${money(-x.gap)} over</span>`;
  const il = LIFE().it?.[x.id], lt = il ? `${fmt(il[0])} past deals on this item were gone within about ${dur(il[2])}` : "";
  const tags = [x.npcGain && x.r != null ? `<span class="pill p-good" title="An NPC pays ${fmt(x.npc)} each (game files)">under NPC price</span>` : "",
    x.shop && x.shop < n[0] ? `<span class="pill p-warn" title="Cheapest NPC shop price (meowdb shop list)">shop sells it for ${fmt(x.shop)}</span>` : "",
    x.r != null && x.r < 0.25 ? `<span class="pill p-warn" title="Under a quarter of the usual price: often a typo or the wrong item">check it</span>` : ""].filter(Boolean);
  return `<tr data-k="${esc(x.key)}" data-i="${i}"${WATCH.has(x.id) ? ` class="snw"` : ""}><td>${nameCell(x)}</td>
    <td><b class="mono snprice">${money(n[0])}</b>${q > 1 ? ` <span class="sub">×${fmt(q)} = ${money(n[0] * q)}</span>` : ""}${w ? `<div class="sub snwhere">${esc(w)}</div>` : ""}${n[4] ? `<div class="sub">by ${esc(n[4])}</div>` : ""}${sinceTxt(x) ? `<div class="sub snsince"${lt ? ` title="${lt}"` : ""}>${sinceTxt(x)}</div>` : ""}</td>
    <td class="num">${x.p && x.p[0] ? fmt(x.p[0]) + (pwTrend(x.id) ? ` <span class="sntr">${pwTrend(x.id)}</span>` : "") + `<div class="sub">${fmt(x.p[1])}-${fmt(x.p[2])}${x.vol ? ` <span class="pill p-warn" title="The middle half of sales spans over 60% of the usual price (our cut-off)">volatile</span>` : ""}</div>` : "–"}${x.p && x.p[0] && S.basis === "p25" ? `<div class="sub">low end ${fmt(x.base)}</div>` : ""}<div class="sub snsales">${x.p ? fmt(x.sales) : "0"} sale${x.sales === 1 ? "" : "s"}${x.rough ? ` <span class="pill p-warn" title="Fewer than 5 sales seen (meso.watch low data): rough">rough</span>` : ""}${x.sell != null ? `<span title="Share of units put up for sale that were bought (meso.watch)"> · ${Math.round(x.sell * 100)}% sell</span>` : ""}</div>${x.npc ? `<div class="sub">NPC pays ${fmt(x.npc)}</div>` : ""}</td>
    <td>${strip(x, g)}</td>
    <td class="num"><b class="snpct ${g[2]}">${pct(x.r)}</b><div class="sub">${gapc}</div>${q > 1 && x.r != null && x.gap > 0 ? `<div class="sub">stack ${money(x.stack)}</div>` : ""}</td>
    <td>${g[1] ? `<span class="pill ${g[1]}">${g[0]}</span>` : `<span class="sub">${g[0]}</span>`}${tags.map(t => `<div>${t}</div>`).join("")}${g[3] || low ? `<div class="sub"${g[0] === "Rising" ? ` title="meso.watch's trend for this item is up: demand may be pushing the usual price up, so this may not stay over value"` : ""}>${esc(g[3] || "below 3 in 4 sales")}</div>` : ""}</td>
    <td class="snact">${star(x.id)}${copyBtn(x)}</td></tr>`;
}
function top3(list){
  const el = $("#sntop"), best = S.v === "deal" && !S.watch ? list.filter(isDeal).slice().sort(by.score).slice(0, 3) : [];
  el.hidden = !best.length;
  el.innerHTML = best.map((x, i) => { const g = grade(x), w = where(x.n);
    return `<div class="sncard" style="--i:${i}"><div class="snch">${itemIcon(x.id)}<div><span class="itname name" tabindex="0" data-item="${x.id}">${esc(x.it.n)}</span><div class="sub">${esc(subOf(x))}</div></div><span class="pill ${g[1]}">${g[0]}</span></div>
      <div class="snbigrow"><b class="snbigpct ${g[2]}">${x.r == null ? "+" + money(x.npcGain) : pct(x.r)}</b><span>${x.r == null ? "each, sold to an NPC" : "of the usual price"}<br><b>${money(x.n[0])}</b> vs ${fmt(x.r == null ? x.npc : x.base)}${x.q > 1 ? ` · ×${fmt(x.q)}` : ""}</span></div>
      ${strip(x, g)}
      <div class="sub">${esc([w, x.n[4] ? "by " + x.n[4] : ""].filter(Boolean).join(" · "))}</div>
      <div class="sncfoot"><span class="sub">${fmt(x.sales)} sale${x.sales === 1 ? "" : "s"} seen${x.rough ? " · rough" : ""}</span><span>${star(x.id)}${copyBtn(x)}</span></div></div>` }).join("");
}
// market mood: the median solid listing against its usual price, and how all listings spread out (bars)
const BINS = [[0, 0.5, "≤50%"], [0.5, 0.75, "50-75%"], [0.75, 0.95, "75-95%"], [0.95, 1.05, "about usual"], [1.05, 1.25, "105-125%"], [1.25, 1.5, "125-150%"], [1.5, Infinity, "over 150%"]];
function mood(){
  const rs = ROWS.filter(x => x.r != null && !x.rough).map(x => x.r);
  if (!rs.length) return ["–", ""];
  const n = BINS.map(([a, b]) => rs.filter(r => r >= a && r < b).length), top = Math.max(...n);
  const bars = n.map((v, i) => `<rect x="${i * 13}" y="${22 - Math.round(v / top * 20)}" width="10" height="${Math.max(1, Math.round(v / top * 20))}" rx="2" class="${i < 3 ? "g-deal" : i === 3 ? "g-even" : "g-over"}"><title>${BINS[i][2]}: ${v} listing${v === 1 ? "" : "s"}</title></rect>`).join("");
  return [pct(median(rs)), `<svg class="snhist" viewBox="0 0 88 22" width="88" height="22" role="img" aria-label="How listings spread from cheap to dear">${bars}</svg>`];
}
function stats(){
  const deals = ROWS.filter(isDeal), solid = deals.filter(x => !x.rough && x.r != null), best = solid.slice().sort(by.pct)[0], gap = solid.slice().sort(by.gap)[0];
  const priced = ROWS.filter(x => x.r != null).length, live = LIVE ? ` · checks for new ones while open` : "", vend = ROWS.filter(x => x.npcGain).length;
  const tile = (h, v, s, cls = "") => `<div class="sntile${cls}"><div class="snth">${h}</div><div class="sntv">${v}</div><div class="sub">${s}</div></div>`;
  const ago = pwListedAgo(), mins = (Date.now() - Date.parse((D.pw.listed || "").replace(" ", "T") + "Z")) / 6e4, [md, hist] = mood();
  $("#snstats").innerHTML = tile("Listed now", fmt(ROWS.length), `${fmt(priced)} with sales to compare`)
    + tile("Under value", fmt(deals.length), `${fmt(solid.length)} with 5+ sales seen${vend ? ` · ${fmt(vend)} under NPC price` : ""}${NEW.size ? ` · <b>${fmt(NEW.size)} new</b>` : ""}`)
    + tile("Best find", best ? pct(best.r) : "–", best ? `${nm(best.id)} · ${fmt(best.sales)} sales` : "nothing solid under value")
    + tile("Biggest gap", gap ? money(gap.gap) : "–", gap ? `mesos under · ${nm(gap.id)} (${pct(gap.r)})` : "nothing solid under value")
    + tile("Market mood", md, `${hist}<span class="snmood">median listing vs usual</span>`)
    + tile("Listings updated", ago || "–", `meso.watch${live}`, mins < 40 ? " fresh" : mins > 180 ? " stale" : "");
  $("#sndate").textContent = day(D.pw.read);
}
function foot(){
  $("#snfoot").innerHTML = `Sale prices and listings from <a href="https://meso.watch/" target="_blank" rel="noopener">meso.watch</a> (sales up to ${day(D.pw.read)}, listings updated ${esc(pwListedAgo() || "?")}); NPC prices from the game files, NPC shops from meowdb.`
    + ` Deal labels, Best deal and Best flip are this site's own cut-offs. Listings close fast: check in game before you travel.`;
}

/* ---- Deals list ---- */
let shown = [], FOC = -1;
function drawList(){
  const list = ROWS.filter(pass); shown = sorted(list); FOC = -1;
  const deals = list.filter(isDeal).length;
  $("#sncount").textContent = `${fmt(shown.length)} listing${shown.length === 1 ? "" : "s"}${S.v !== "deal" && deals ? ` · ${fmt(deals)} under value` : ""}`;
  const empty = S.watch && !WATCH.size ? "No watched items yet: press ☆ on a row to watch it."
    : S.need && !Object.keys(NEED).length ? "Keep or sell says you don't need anything right now (type your Have counts there)."
    : S.mine && !WT ? "Pick a weapon in the Character Builder first." : "Nothing matches these filters right now. Listings change every half hour.";
  lazyRows($("#snrows"), shown.map(rowHtml), `<tr><td colspan="7" class="empty">${empty}</td></tr>`);
  top3(shown);
  const b = $("#snmine"); b.textContent = WT ? `Scrolls for my weapon (${WT})` : "Scrolls for my weapon"; b.title = WT ? "Weapon scrolls for the Character Builder's weapon type" : "Pick a weapon in the Character Builder first";
  $("#snpreset").innerHTML = `<option value="">Pick one…</option>${Object.entries(PRESETS).map(([k, [n]]) => `<option value="b:${k}">${esc(n)}</option>`).join("")}${Object.keys(MYPRE).length ? `<optgroup label="Saved">${Object.keys(MYPRE).map(k => `<option value="u:${esc(k)}">${esc(k)}</option>`).join("")}</optgroup>` : ""}`;
}

/* ---- Shopping trip: the best set of deals you can afford, grouped by channel ---- */
let TX = new Set(), TRIP = [];
function tripPlan(){
  const cands = ROWS.filter(isDeal).map(x => { const solid = x.r != null && (T.rough || !x.rough);
    const unit = Math.max(solid ? x.base : 0, x.npc), vend = x.npc >= unit && x.npcGain > 0, cost = x.n[0] * x.q, gain = (unit - x.n[0]) * x.q;
    return {x, cost, gain, unit, vend, flipv: gain * (vend ? 1 : x.sell ?? 0)} }).filter(c => c.gain > 0 && c.cost > 0);
  const key = T.rank === "flip" ? c => c.flipv : T.rank === "gap" ? c => c.gain : c => c.gain / c.cost;
  cands.sort((a, b) => key(b) - key(a) || b.gain - a.gain);
  let left = T.bud; const pick = [], skip = [];
  for (const c of cands){ if (TX.has(c.x.key)){ skip.push(c); continue } if (T.bud && c.cost <= left){ pick.push(c); left -= c.cost } }
  return {pick, skip, left, all: cands};
}
function drawTrip(){
  const el = $("#sntrip"); $("#sntbud").value = T.bud || ""; $("#sntrank").value = T.rank; $("#sntrough").setAttribute("aria-pressed", T.rough);
  const {pick, skip, left, all} = tripPlan(); TRIP = pick;
  if (!T.bud){ el.innerHTML = `<p class="empty">Type how many mesos you have. ${fmt(all.length)} listings are under value right now; the trip picks the best set you can afford and groups them by channel, so you change channel as few times as possible.</p>`; return }
  if (!pick.length){ el.innerHTML = `<p class="empty">Nothing under value fits in ${fmt(T.bud)} mesos right now.</p>`; return }
  const spend = pick.reduce((a, c) => a + c.cost, 0), worth = pick.reduce((a, c) => a + c.unit * c.x.q, 0);
  const groups = {}; for (const c of pick){ const k = c.x.n[2] ? "ch " + c.x.n[2] : "channel unknown"; (groups[k] ||= []).push(c) }
  const order = Object.entries(groups).sort((a, b) => b[1].reduce((s, c) => s + c.gain, 0) - a[1].reduce((s, c) => s + c.gain, 0));
  const tile = (h, v, s) => `<div class="sntile"><div class="snth">${h}</div><div class="sntv">${v}</div><div class="sub">${s}</div></div>`;
  el.innerHTML = `<div class="snstats">${tile("Spend", fmt(spend), `of ${fmt(T.bud)} · ${fmt(left)} left`)}${tile("Worth", fmt(worth), "at the usual price (or what an NPC pays)")}${tile("Profit if resold", "+" + fmt(worth - spend), `${pct(spend / worth)} of value · before any fees`)}${tile("Stops", fmt(order.length), `${fmt(pick.length)} listing${pick.length === 1 ? "" : "s"}`)}</div>`
    + order.map(([ch, cs], gi) => `<div class="card sntripg" style="--i:${gi}"><div class="cardhead"><h3>${esc(ch)}</h3><span class="sub">${esc([...new Set(cs.map(c => c.x.n[3]).filter(Boolean))].join(", "))} · spend ${fmt(cs.reduce((a, c) => a + c.cost, 0))} · <span class="up">+${fmt(cs.reduce((a, c) => a + c.gain, 0))}</span></span></div>
      <table class="mini sntriptbl"><tbody>${cs.map(c => `<tr><td>${itemIcon(c.x.id, c.x.q, true)} ${nm(c.x.id)}${c.x.n[4] ? ` <span class="sub">by ${esc(c.x.n[4])}</span>` : ""}</td><td class="num">${money(c.x.n[0])}${c.x.q > 1 ? ` ×${fmt(c.x.q)}` : ""}</td><td class="num sub">${c.vend ? "NPC pays" : "usual"} ${fmt(c.unit)}</td><td class="num up">+${fmt(c.gain)}</td><td class="snact"><button class="snico" type="button" data-tx="${esc(c.x.key)}" title="Leave this one out" aria-label="Leave out ${esc(c.x.it.n)}">✕</button></td></tr>`).join("")}</tbody></table></div>`).join("")
    + (skip.length ? `<p class="sub">Left out: ${skip.map(c => `<button class="linkbtn" type="button" data-tx="${esc(c.x.key)}">${esc(c.x.it.n)} ↺</button>`).join(" ")}</p>` : "")
    + `<p class="note">Each listing is bought whole, as listed. "Profit if resold" assumes you sell at the usual price (or vendor when an NPC pays more); it isn't a promise anyone buys.</p>`;
}

/* ---- Crafting flips: buy the ingredients (live listings first), craft, sell at the usual price ---- */
const DISC = D.craft.disc.map(d => d[0]);
function ingCost(id, need){
  const n = PWNOW[id], p = PW[id], alt = Math.min(shopMin(id) || Infinity, p && p[0] > 0 ? p[0] : Infinity);
  const parts = []; let left = need, cost = 0;
  if (n && n[0] >= 1 && n[0] < alt){ const k = Math.min(left, n[1] || 1); parts.push(["live", k, n[0], n]); cost += k * n[0]; left -= k }
  if (left > 0){ if (!isFinite(alt)) return null; parts.push([alt === shopMin(id) ? "shop" : "usual", left, alt]); cost += left * alt }
  return {cost, parts, rough: !!(p && p[4] & 1) && parts.some(x => x[0] === "usual")};
}
let CRAFT = [];
function craftList(){
  const out = [];
  for (const [d, type, lvl, id, n, , mesos, ing] of D.craft.rec){
    const it = D.items[id], p = PW[id]; if (!it || it.c === "Equipment" || !p || !(p[0] > 0)) continue;   // equips: value depends on rolls
    const ics = ing.map(([iid, k]) => ({iid, k, c: ingCost(iid, k)})); if (ics.some(x => !x.c)) continue;
    const cost = mesos + ics.reduce((a, x) => a + x.c.cost, 0), sells = p[0] * n, profit = sells - cost;
    if (profit <= 0) continue;
    out.push({d, lvl, id, n, mesos, ics, cost, sells, profit, roi: profit / cost, live: ics.some(x => x.c.parts.some(q => q[0] === "live")),
      rough: !!(p[4] & 1) || ics.some(x => x.c.rough), sell: p[4] & 1 ? null : p[6]});
  }
  return out;
}
function drawCraft(){
  $("#sncdisc").value = T.cdisc; $("#sncsort").value = T.csort; $("#snclive").setAttribute("aria-pressed", T.clive); $("#sncrough").setAttribute("aria-pressed", T.crough);
  CRAFT = craftList().filter(r => (!T.cdisc || DISC[r.d] === T.cdisc) && (!T.clive || r.live) && (!T.crough || !r.rough))
    .sort((a, b) => T.csort === "roi" ? b.roi - a.roi : T.csort === "lvl" ? a.lvl - b.lvl || b.profit - a.profit : b.profit - a.profit);
  $("#snccount").textContent = `${fmt(CRAFT.length)} profitable recipe${CRAFT.length === 1 ? "" : "s"}`;
  const src = q => q[0] === "live" ? `<span class="up">${money(q[2])} listed</span>${q[3][2] ? ` <span class="sub">ch ${q[3][2]}${q[3][4] ? ", " + esc(q[3][4]) : ""}</span>` : ""}` : `${fmt(q[2])} <span class="sub">${q[0] === "shop" ? "NPC shop" : "usual"}</span>`;
  lazyRows($("#sncrows"), CRAFT.map(r => `<tr><td><span class="ing">${itemIcon(r.id, r.n)}<span>${nm(r.id)}${r.n > 1 ? ` ×${r.n}` : ""}<div class="sub">${esc(DISC[r.d])} Lv ${r.lvl}${r.mesos ? ` · fee ${fmt(r.mesos)}` : ""}</div>${r.rough ? `<span class="pill p-warn" title="A price here comes from under 5 sales">rough</span>` : ""}</span></span></td>
    <td class="sub">${r.ics.map(x => `<div class="sning">${itemIcon(x.iid, x.k, true)} ${esc(D.items[x.iid].n)} ×${x.k}: ${x.c.parts.map(q => `${q[1] < x.k ? q[1] + " at " : ""}${src(q)}`).join(" + ")}</div>`).join("")}</td>
    <td class="num">${fmt(r.cost)}</td><td class="num">${fmt(r.sells)}${r.sell != null ? `<div class="sub">${Math.round(r.sell * 100)}% sell</div>` : ""}</td>
    <td class="num"><b class="up">+${fmt(r.profit)}</b><div class="sub">${Math.round(r.roi * 100)}% return</div></td></tr>`),
    `<tr><td colspan="5" class="empty">No recipe turns a profit with these filters right now.</td></tr>`);
  $("#snccap").textContent = CRAFT_CAP;
}

/* ---- Sell yours: what to list at ---- */
const SELLABLE = Object.keys(PW).filter(id => D.items[id] && D.items[id].c !== "Equipment").sort((a, b) => D.items[a].n.localeCompare(D.items[b].n));
const BYNAME = {}; for (const id of SELLABLE) BYNAME[D.items[id].n.toLowerCase()] ??= id;
$("#snslist").innerHTML = SELLABLE.map(id => `<option value="${esc(D.items[id].n)}">`).join("");
function drawSell(){
  $("#snsrecent").innerHTML = T.recent.map(id => `<button class="pill p-hot snchip" type="button" data-sid="${id}">${esc(D.items[id].n)}</button>`).join("");
  const id = T.sell, el = $("#snsell");
  if (!id){ el.innerHTML = `<p class="empty">Pick an item to see what to list it at: to be the cheapest right now, at the usual price, or for a quick sale.</p>`; return }
  const p = PW[id], n = PWNOW[id], npc = npcPays(id), it = D.items[id];
  const opts = [];
  if (n && n[0] > 1) opts.push(["Be the cheapest", n[0] - 1, `1 under the cheapest listing now (${money(n[0])}${n[4] ? " by " + esc(n[4]) : ""}): yours shows first`]);
  if (p) opts.push(["Quick sale", p[1], "the low end: 3 in 4 sales went for more"], ["Usual price", p[0], `the median of ${fmt(p[3])} sale${p[3] === 1 ? "" : "s"} seen`], ["Patient", p[2], "the high end: 1 in 4 sales went for more"]);
  if (npc) opts.push(["Sell to an NPC", npc, "no waiting (game files)"]);
  const advice = [];
  if (npc && opts.some(o => o[0] !== "Sell to an NPC") && npc >= Math.min(...opts.filter(o => o[0] !== "Sell to an NPC" && o[0] !== "Patient").map(o => o[1]))) advice.push("An NPC pays about as much as players do: vendoring may be the better deal.");
  if (p && !(p[4] & 1) && p[6] != null && p[6] < 0.1) advice.push(`Slow seller: only ${Math.round(p[6] * 100)}% of units put up for sale were bought. Price near the low end or expect to wait.`);
  if (n && p && n[0] < p[1]) advice.push(`Someone is listing well under the usual price (${money(n[0])}). Undercutting them means selling cheap; waiting until it sells may pay more.`);
  if (p && p[4] & 1) advice.push("Rough: fewer than 5 sales seen, so these prices are a guess.");
  if (p && pwTrend(id)) advice.push(`meso.watch trend: ${pwTrend(id)}`);
  el.innerHTML = `<div class="card snsellc"><div class="snch">${itemIcon(id)}<div>${nm(id)}<div class="sub">${esc(CATS[catOf(id)])}</div></div></div>
    <table class="mini snselltbl"><tbody>${opts.map(o => `<tr><td><b>${o[0]}</b></td><td class="num snprice">${money(o[1])}</td><td class="sub">${o[2]}</td></tr>`).join("")}</tbody></table>
    ${advice.length ? `<ul class="snadv">${advice.map(a => `<li>${a}</li>`).join("")}</ul>` : ""}
    <p class="sub">${p ? `meso.watch, sales up to ${day(D.pw.read)}.` : "No player sales seen for this item."} Listings updated ${esc(pwListedAgo() || "?")}.</p></div>`;
}
const pickSell = id => { if (!D.items[id]) return; T.sell = id; T.recent = [id, ...T.recent.filter(x => x !== id)].slice(0, 8); saveT(); drawSell() };

/* ---- Watch list: targets and alerts ---- */
function drawWatch(){
  const rows = [...WATCH].map(id => ({id, x: ROWS.find(r => r.id === id)})).sort((a, b) => +hitOf(b.x) - +hitOf(a.x) || D.items[a.id].n.localeCompare(D.items[b.id].n));
  $("#snwrows").innerHTML = rows.map(({id, x}) => { const p = PW[id], hit = hitOf(x);
    return `<tr${hit ? ` class="snhit"` : ""}><td><span class="ing">${itemIcon(id)}${nm(id)}</span></td>
      <td class="num"><input class="sntgt" type="number" min="0" step="100" inputmode="numeric" data-tg="${id}" value="${TGT[id] || ""}" placeholder="usual" aria-label="Target price for ${esc(D.items[id].n)}"></td>
      <td>${x ? `<b class="mono">${money(x.n[0])}</b>${x.q > 1 ? ` <span class="sub">×${fmt(x.q)}</span>` : ""} <span class="sub">${esc(where(x.n))}${x.n[4] ? " · " + esc(x.n[4]) : ""}</span>` : `<span class="sub">not listed right now</span>`}</td>
      <td class="num">${p && p[0] ? fmt(p[0]) : "–"}${x && x.r != null ? `<div class="sub">listed at ${pct(x.r)}</div>` : ""}</td>
      <td>${hit ? `<span class="pill p-good">hit</span>` : x ? `<span class="sub">above ${TGT[id] ? "target" : "usual"}</span>` : ""}</td>
      <td class="snact">${x ? copyBtn(x) : ""}<button class="snico" type="button" data-w="${id}" title="Stop watching" aria-label="Stop watching ${esc(D.items[id].n)}">✕</button></td></tr>` }).join("")
    || `<tr><td colspan="6" class="empty">Nothing watched yet: press ☆ on any deal (or on Sell yours) to add it here.</td></tr>`;
  $("#snabadge").checked = AL.badge; $("#snanote").checked = AL.note; $("#snasound").checked = AL.sound;
  const perm = typeof Notification === "undefined" ? "not supported in this browser" : Notification.permission === "denied" ? "blocked in browser settings" : "";
  $("#snalst").textContent = LIVE ? (perm && AL.note ? "Notifications: " + perm : "") : "Alerts work on the website copy (this copy can't fetch new lists)";
}
const hitsNow = () => ROWS.filter(hitOf).length;
const drawWcnt = () => { const n = hitsNow(); $("#snwcnt").textContent = n ? String(n) : ""; $("#snwcnt").hidden = !n; $("#snwcnt").title = n ? `${n} watched item${n > 1 ? "s" : ""} at or under target` : "" };

/* ---- Movers ---- */
function drawMove(){
  const L = Object.entries(PW).filter(([id, p]) => D.items[id] && !(p[4] & 1) && p[3] >= 5 && p[5] != null && Math.abs(p[5]) >= 0.005);
  const row = ([id, p]) => { const n = PWNOW[id], r = n && p[0] ? n[0] / p[0] : null;
    return `<div class="snmv"><span class="ing">${itemIcon(id, 1, true)}${nm(id)}</span><span class="${p[5] > 0 ? "up" : "down"} mono">${p[5] > 0 ? "▲" : "▼"}${Math.round(Math.abs(p[5]) * 100)}%</span><span class="sub mono">${fmt(p[0])}</span>${n ? `<span class="pill ${r != null && r < 0.995 ? "p-good" : "p-hot"}" title="Cheapest listing now">listed ${money(n[0])}${r != null ? ` · ${pct(r)}` : ""}</span>` : `<span></span>`}</div>` };
  $("#snup").innerHTML = L.filter(e => e[1][5] > 0).sort((a, b) => b[1][5] - a[1][5]).slice(0, 12).map(row).join("") || `<p class="empty">Nothing rising.</p>`;
  $("#sndown").innerHTML = L.filter(e => e[1][5] < 0).sort((a, b) => a[1][5] - b[1][5]).slice(0, 12).map(row).join("") || `<p class="empty">Nothing falling.</p>`;
}

/* ---- Deal lifetimes (scripts/deal_life.py, from every listing snapshot) ---- */
const GNAME = {steal: "Steal (≤50%)", great: "Great (≤70%)", good: "Good (≤85%)", small: "Small (<100%)", usual: "At usual", over: "Over value", rough: "Rough price", nosales: "No sales yet"};
function drawLife(){
  const L = LIFE(), el = $("#snlife");
  if (!L.g || (L.snaps || 0) < 3){ el.innerHTML = `<p class="empty">Not enough listing history yet (${fmt(L.snaps || 0)} snapshot${L.snaps === 1 ? "" : "s"}). It builds up with every meso.watch check.</p>`; return }
  const loc = s => { const t = Date.parse(String(s).replace(" ", "T") + "Z"); return isNaN(t) ? "?" : new Date(t).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) };
  const g = Object.entries(GNAME).filter(([k]) => L.g[k]);
  const lasted = (lo, hi) => lo == null ? "?" : lo < 1 ? `under ${dur(hi)}` : `${dur(lo)} to ${dur(hi)}`;
  const items = Object.entries(L.it || {}).filter(([id]) => D.items[id]).sort((a, b) => b[1][0] - a[1][0] || a[1][2] - b[1][2]).slice(0, 16);
  el.innerHTML = `<p class="note">From ${fmt(L.snaps)} listing snapshots, ${loc(L.from)} to ${loc(L.to)} (your time), usually ${dur(L.gap)} apart. A listing that's gone in the next snapshot was most likely bought (or the shop closed); one replaced by a cheaper listing was <b>undercut</b> and may still be for sale. Only the cheapest listing per item is tracked, so this is how long a deal stayed the cheapest, to the nearest snapshot. <b>Usually lasted</b> is the median of gone listings: "under 40 min" means it was gone by the next snapshot.</p>
    <div class="tblwrap"><table class="sntbl"><thead><tr><th>Deal when it showed up</th><th class="num">Listings</th><th class="num">Gone</th><th class="num">Undercut</th><th>Share gone</th><th class="num">Usually lasted</th></tr></thead>
    <tbody>${g.map(([k, label]) => { const [n, gone, lo, hi] = L.g[k]; return `<tr><td>${label}</td><td class="num">${fmt(n)}</td><td class="num">${fmt(gone)}</td><td class="num">${fmt(n - gone)}</td><td><span class="snbar"><i style="width:${Math.round(gone / n * 100)}%"></i></span> <span class="mono">${Math.round(gone / n * 100)}%</span></td><td class="num"><b>${lasted(lo, hi)}</b></td></tr>` }).join("")}</tbody></table></div>
    ${items.length ? `<div class="card snlifeit"><div class="cardhead"><h3>Items with the most deals seen</h3><span class="sub">under value when listed, then gone</span></div><div class="snlifegrid">${items.map(([id, [n, lo, hi]]) => `<div class="snmv"><span class="ing">${itemIcon(id, 1, true)}${nm(id)}</span><span class="sub">${fmt(n)} deals</span><span class="mono">${lasted(lo, hi)}</span></div>`).join("")}</div></div>` : ""}`;
}

/* ---- draw ---- */
function render(){
  build(); NEED = (KEEPNEED && KEEPNEED()) || {}; WT = myWt();
  document.querySelectorAll("#snmode [data-m]").forEach(b => b.setAttribute("aria-selected", b.dataset.m === S.m));
  for (const m of MODES) $("#snp-" + m).hidden = m !== S.m;
  ({list: drawList, trip: drawTrip, craft: drawCraft, sell: drawSell, watch: drawWatch, move: drawMove, life: drawLife})[S.m]();
  stats(); foot(); drawCtl(); drawWcnt();
}
function drawCtl(){
  document.querySelectorAll("#snview [data-v]").forEach(b => b.setAttribute("aria-checked", b.dataset.v === S.v));
  $("#snq").value = S.q; $("#sncat").value = S.cat; $("#snsort").value = S.sort; $("#snbasis").value = S.basis;
  $("#snmax").value = S.max || ""; $("#snmin").value = S.min; $("#snsales").value = S.sales;
  for (const [id, k] of [["snrough", "rough"], ["snvol", "vol"], ["snnpc", "npc"], ["snneed", "need"], ["snmine", "mine"], ["snwatch", "watch"], ["snnew", "nw"]]) $("#" + id).setAttribute("aria-pressed", S[k]);
  document.querySelectorAll("#snipe #snp-list thead [data-s]").forEach(th => th.setAttribute("aria-sort", th.dataset.s === S.sort ? (["pct", "price", "name", "since"].includes(S.sort) ? "ascending" : "descending") : "none"));
}
const set = (k, v) => { S[k] = v; save(); render() };
$("#sncat").innerHTML += Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#sncdisc").innerHTML += [...new Set(D.craft.rec.map(r => DISC[r[0]]))].sort().map(d => `<option>${esc(d)}</option>`).join("");
$("#snmode").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) set("m", b.dataset.m) });
$("#snq").addEventListener("input", e => set("q", e.target.value.slice(0, 60)));
$("#sncat").addEventListener("change", e => set("cat", e.target.value));
$("#snsort").addEventListener("change", e => set("sort", e.target.value));
$("#snbasis").addEventListener("change", e => set("basis", e.target.value === "p25" ? "p25" : "med"));
$("#snmax").addEventListener("input", e => { const v = Math.floor(+e.target.value); S.max = isFinite(v) && v > 0 && v < 1e10 ? v : 0; save(); render() });
$("#snmin").addEventListener("change", e => set("min", +e.target.value));
$("#snsales").addEventListener("change", e => set("sales", +e.target.value));
for (const [id, k] of [["snrough", "rough"], ["snvol", "vol"], ["snnpc", "npc"], ["snneed", "need"], ["snmine", "mine"], ["snwatch", "watch"], ["snnew", "nw"]]) $("#" + id).addEventListener("click", () => set(k, !S[k]));
$("#snreset").addEventListener("click", () => { S = {...DEF, v: S.v}; save(); render() });
$("#snshare").addEventListener("click", e => copyShare(e.target, shareUrl("f", {...S})));
$("#snview").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) set("v", b.dataset.v) });
$("#snp-list thead").addEventListener("click", e => { const th = e.target.closest("[data-s]"); if (th) set("sort", th.dataset.s) });
// presets: built-in ones fill over the defaults; saved ones are a whole saved filter set
$("#snpreset").addEventListener("change", e => { const v = e.target.value; if (!v) return;
  const p = v.startsWith("b:") ? PRESETS[v.slice(2)]?.[1] && {...DEF, ...PRESETS[v.slice(2)][1]} : MYPRE[v.slice(2)];
  if (p){ S = clean({...p, m: "list"}); save(); render() } });
$("#snsave").addEventListener("click", () => { $("#snsavebox").hidden = false; $("#snpname").focus() });
const savePreset = () => { const n = $("#snpname").value.trim().slice(0, 30); if (!n) return;
  MYPRE[n] = clean({...S, q: S.q}); ls("snipepresets", MYPRE); $("#snpname").value = ""; $("#snsavebox").hidden = true; render() };
$("#snsaveok").addEventListener("click", savePreset);
$("#snpname").addEventListener("keydown", e => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") $("#snsavebox").hidden = true });
// tools
$("#sntbud").addEventListener("input", e => { const v = Math.floor(+e.target.value); T.bud = isFinite(v) && v > 0 && v < 1e12 ? v : 0; saveT(); drawTrip() });
$("#sntrank").addEventListener("change", e => { T.rank = ["roi", "flip", "gap"].includes(e.target.value) ? e.target.value : "roi"; saveT(); drawTrip() });
$("#sntrough").addEventListener("click", () => { T.rough = !T.rough; saveT(); drawTrip() });
$("#sntrip").addEventListener("click", e => { const b = e.target.closest("[data-tx]"); if (!b) return; const k = b.dataset.tx; TX.has(k) ? TX.delete(k) : TX.add(k); drawTrip() });
$("#sntcopy").addEventListener("click", async e => { const b = e.target, groups = {};
  for (const c of TRIP) (groups[c.x.n[2] ? "ch " + c.x.n[2] : "channel unknown"] ||= []).push(c);
  const txt = Object.entries(groups).map(([ch, cs]) => ch + "\n" + cs.map(c => `  ${c.x.it.n} · ${money(c.x.n[0])}${c.x.q > 1 ? " ×" + c.x.q : ""}${c.x.n[4] ? " · " + c.x.n[4] : ""}`).join("\n")).join("\n");
  try { await navigator.clipboard.writeText(txt || "(empty)"); b.textContent = "List copied" } catch(err){ b.textContent = "Copy blocked here" }
  setTimeout(() => { b.textContent = "Copy the list" }, 2000) });
$("#sncdisc").addEventListener("change", e => { T.cdisc = e.target.value; saveT(); drawCraft() });
$("#sncsort").addEventListener("change", e => { T.csort = ["profit", "roi", "lvl"].includes(e.target.value) ? e.target.value : "profit"; saveT(); drawCraft() });
$("#snclive").addEventListener("click", () => { T.clive = !T.clive; saveT(); drawCraft() });
$("#sncrough").addEventListener("click", () => { T.crough = !T.crough; saveT(); drawCraft() });
$("#snsitem").addEventListener("input", e => { const id = BYNAME[e.target.value.trim().toLowerCase()]; if (id){ pickSell(id); e.target.value = "" } });
$("#snsrecent").addEventListener("click", e => { const b = e.target.closest("[data-sid]"); if (b) pickSell(b.dataset.sid) });
$("#snwrows").addEventListener("input", e => { const t = e.target.closest("[data-tg]"); if (!t) return; const v = Math.floor(+t.value);
  if (isFinite(v) && v > 0 && v < 1e10) TGT[t.dataset.tg] = v; else delete TGT[t.dataset.tg]; ls("snipetarget", TGT); drawWcnt() });
let wdraw = false;   // redrawing removes the focused target box, whose blur fires another change mid-redraw
$("#snwrows").addEventListener("change", () => { if (wdraw) return; wdraw = true; try { drawWatch() } finally { wdraw = false } });
for (const [id, k] of [["snabadge", "badge"], ["snanote", "note"], ["snasound", "sound"]]) $("#" + id).addEventListener("change", async e => {
  AL[k] = e.target.checked;
  if (k === "note" && AL.note && typeof Notification !== "undefined" && Notification.permission === "default") try { await Notification.requestPermission() } catch(err) {}
  ls("snipealert", AL); drawWatch() });
$("#snatest").addEventListener("click", () => alertHits([{it: {n: "Test item"}, n: [123], r: 0.5, id: ""}], true));
$("#snipe").addEventListener("click", async e => {
  const w = e.target.closest("[data-w]"), c = e.target.closest("[data-cp]");
  if (w){ const id = w.dataset.w; WATCH.has(id) ? WATCH.delete(id) : WATCH.add(id); saveWatch();
    document.querySelectorAll(`#snipe .snstar[data-w="${id}"]`).forEach(b => b.outerHTML = star(id));
    document.querySelectorAll("#snrows tr[data-k]").forEach(tr => tr.classList.toggle("snw", WATCH.has(tr.dataset.k.split("|")[0])));
    drawWcnt(); if (S.watch || S.m === "watch") render(); return }
  if (c) copyRow(c, ROWS.find(r => r.id === c.dataset.cp));
});
async function copyRow(btn, x){ if (!x) return;
  const txt = `${x.it.n} · ${money(x.n[0])} mesos${x.q > 1 ? ` ×${x.q}` : ""}${where(x.n) ? " · " + where(x.n) : ""}${x.n[4] ? " · " + x.n[4] : ""}`;
  try { await navigator.clipboard.writeText(txt); btn.textContent = "✓"; btn.classList.add("ok") } catch(err){ btn.title = txt; btn.textContent = "!" }
  setTimeout(() => { btn.textContent = "⧉"; btn.classList.remove("ok") }, 1500) }
// keys on the Deals list: j/k move, w watch, c copy, Enter opens the item page (never while typing)
document.addEventListener("keydown", e => {
  if ($("#snipe").hidden || S.m !== "list" || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, select, textarea, [contenteditable]")) return;
  const rows = [...document.querySelectorAll("#snrows tr[data-k]")]; if (!rows.length) return;
  if (e.key === "j" || e.key === "k"){ FOC = Math.max(0, Math.min(rows.length - 1, FOC + (e.key === "j" ? 1 : -1)));
    rows.forEach((r, i) => r.classList.toggle("snfoc", i === FOC)); rows[FOC].scrollIntoView({block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); e.preventDefault(); return }
  const tr = rows[FOC]; if (!tr) return; const x = shown[+tr.dataset.i];
  if (e.key === "w") tr.querySelector("[data-w]")?.click();
  else if (e.key === "c") copyRow(tr.querySelector("[data-cp]"), x);
  else if (e.key === "Enter") tr.querySelector(".itname")?.click();
  else return;
  e.preventDefault();
});

// toasts: a newer list arrived (and which watched items are now hits)
let toastT = 0;
function toast(html){ const el = $("#sntoast"); el.innerHTML = html; el.hidden = false; el.classList.remove("out");
  clearTimeout(toastT); toastT = setTimeout(() => { el.classList.add("out"); toastT = setTimeout(() => { el.hidden = true }, 250) }, 8000) }
$("#sntoast").addEventListener("click", () => { $("#sntoast").hidden = true });
// alerts (Watch list switches): tab title count while the tab is in the background, browser notification, a soft chime
const TITLE = document.title; let BADGE = 0;
const chime = () => { try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const a = new A();
  [[880, 0], [1320, 0.12]].forEach(([f, t]) => { const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.35);
    o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.4) });
  setTimeout(() => a.close?.(), 1200) } catch(e) {} };
function alertHits(hot, test = false){
  if (!hot.length) return;
  const body = hot.slice(0, 3).map(x => `${x.it.n} ${money(x.n[0])}${x.r != null ? ` (${pct(x.r)})` : ""}`).join(", ");
  if ((AL.badge || test) && document.hidden){ BADGE += hot.length; document.title = `(${BADGE}) ${TITLE}` }
  if ((AL.note || test) && typeof Notification !== "undefined" && Notification.permission === "granted") try { new Notification("FM Sniper: watched item listed", {body, tag: "snipe", icon: LIVE ? "icon-192.png" : undefined}) } catch(e) {}
  if (AL.sound || test) chime();
  if (test) toast(`<b>Test alert:</b> ${esc(body)}${typeof Notification !== "undefined" && Notification.permission !== "granted" ? "<br>Browser notifications are off for this site." : ""}`);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && BADGE){ BADGE = 0; document.title = TITLE } });
const alertsOn = () => LIVE && WATCH.size && (AL.badge || AL.note || AL.sound);

// live refresh (Pages copy only): market.json = this build's D.pw, rewritten on every deploy (meso.watch poll, every 30 min)
const LIVE = !!D.lazy && /^https?:$/.test(location.protocol);
let lastPoll = 0;   // the first open checks at once (a cached page may be older than the latest deploy)
const okNow = v => Array.isArray(v) && typeof v[0] === "number" && isFinite(v[0]) && v[0] >= 0;
const okIt = v => Array.isArray(v) && v.slice(0, 4).every(x => typeof x === "number" && isFinite(x));
const okLife = L => L && typeof L === "object" && typeof (L.snaps ?? 0) === "number" && (!L.g || typeof L.g === "object") && (!L.since || typeof L.since === "object");
function apply(j){
  const before = new Set(ROWS.map(x => x.key)), now = {}, it = {};
  for (const [id, v] of Object.entries(j.now)) if (D.items[id] && okNow(v)) now[id] = [v[0], Math.max(1, Math.floor(+v[1]) || 1), Number.isInteger(v[2]) ? v[2] : null, typeof v[3] === "string" ? v[3].slice(0, 80) : "", typeof v[4] === "string" ? v[4].slice(0, 40) : ""];
  if (j.it && typeof j.it === "object" && typeof j.read === "string" && j.read >= (D.pw.read || "")) for (const [id, v] of Object.entries(j.it)) if (D.items[id] && okIt(v)) it[id] = v;
  if (Object.keys(it).length){ for (const k of Object.keys(PW)) delete PW[k]; Object.assign(PW, it); D.pw.read = j.read }
  for (const k of Object.keys(PWNOW)) delete PWNOW[k]; Object.assign(PWNOW, now); D.pw.listed = j.listed;
  if (okLife(j.life)) D.pw.life = j.life;
  build();
  const fresh = ROWS.filter(x => !before.has(x.key));
  if (!$("#snipe").hidden && !document.hidden) markSeen(); else NEW = new Set(fresh.map(x => x.key));
  render(); document.dispatchEvent(new Event("pwupdate"));
  if (!fresh.length) return;
  const hot = fresh.filter(hitOf), deals = fresh.filter(isDeal).length;
  toast(`<b>New listings:</b> ${fmt(fresh.length)} changed, ${fmt(deals)} under value.`
    + (hot.length ? `<br>Watched: ${hot.slice(0, 3).map(x => `<b>${esc(x.it.n)}</b> ${money(x.n[0])}${x.r != null ? ` (${pct(x.r)})` : ""}`).join(", ")}` : ""));
  alertHits(hot);
}
async function poll(){
  if (!LIVE || (document.hidden && !alertsOn())) return; lastPoll = Date.now();
  try { const r = await fetch("market.json", {cache: "no-store"}); if (!r.ok) return; const j = await r.json();
    if (j && typeof j.listed === "string" && j.listed > (D.pw.listed || "") && j.now && typeof j.now === "object") apply(j) } catch(e) {}
}
const onShow = () => { markSeen(); render(); if (Date.now() - lastPoll > 6e4) poll() };
$("#t-snipe").addEventListener("click", onShow);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#snipe").hidden && Date.now() - lastPoll > 6e4) poll() });
// every minute: refresh the ages; check for a newer list every 3 min while the page shows, or anywhere when alerts are on
setInterval(() => { const on = !$("#snipe").hidden && !document.hidden;
  if ((on || alertsOn()) && Date.now() - lastPoll >= 18e4) poll(); if (on) stats() }, 6e4);
render(); if (!$("#snipe").hidden) onShow();
ASSETS.then(() => { if (!$("#snipe").hidden) render() });
})();
