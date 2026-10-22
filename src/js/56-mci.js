/* ---------------- Market Comparison Index: every price site side by side, one row per item ---------------- */
(() => {
// One column per site, each that site's typical SALE price for the item (asks-only rows are left out; the Items page Prices box
// shows those). Same data the Prices box reads: PW (meso.watch), MW (maplestory.watch), MI (mesoindex), MA (mesoarbitrage),
// CMP (classicmarket.kr combined, credit required), MDB (meowdb usual = asks + sales). Each fn: id -> [price, sales] or null.
// maplestory.market (D.mm) adds a row here once its fetcher lands. Middle = median of sites, spread = max / min (ours, stated).
const SITES = [
  ["meso.watch", "meso.watch", D.pw?.read, id => { const p = PW[id]; return p?.[0] > 0 ? [p[0], p[3]] : null }],
  ["maplestory.watch", "mswatch", D.mw?.read, id => { const w = MW[id]; return w?.[0] > 0 && w[1] > 0 ? [w[0], w[1]] : null }],
  ["mesoindex.com", "mesoindex", D.mi?.read, id => { const m = MI[id]; return m?.[0] > 0 && m[3] ? [m[0], m[3]] : null }],
  ["mesoarbitrage.com", "mesoarb", D.ma?.read, id => { const m = MA[id]; return m?.[0] > 0 && m[1] ? [m[0], m[1]] : null }],
  ["classicmarket.kr", "classicmkt", D.cmp?.read, id => { const k = CMP[id]; return k?.[0] > 0 ? [k[0], k[3]] : null }],
  ["meowdb", "meowdb", D.mdb?.read, id => { const m = MDB[id]; return m?.[0] > 0 ? [m[0], m[2]] : null }]];
const DEF = {q: "", cat: "", min: "3", sort: "sold"}, SHOW = 150;
let S = {...DEF, ...savedState("mci", DEF), q: ""}, all = false, ROWS = null;
const save = () => { try { localStorage.setItem("mci", JSON.stringify({...S, q: ""})) } catch(e) {} };
// one row per item that has a sale price on 2+ sites
function build(){
  ROWS = [];
  for (const id of IDS){ const it = D.items[id]; if (!it) continue;
    const s = SITES.map(x => x[3](id)), vs = s.filter(Boolean).map(x => x[0]); if (vs.length < 2) continue;
    const mid = median(vs), lo = Math.min(...vs), hi = Math.max(...vs), eq = it.c === "Equipment";
    const ask = listingsOf(id).filter(x => !x.buy && Date.now() / 6e4 - (x.t || Date.now() / 6e4) < 1440).sort((a, b) => a.v - b.v)[0] || null;
    ROWS.push({id, it, s, k: vs.length, mid, lo, hi, spread: hi / lo, sold: s.reduce((a, x) => a + (x ? x[1] : 0), 0), ask,
      deal: ask && !eq ? ask.v / mid : 9}) }
}
const cell = (x, r) => !x ? `<td class="num sub">–</td>`
  : `<td class="num${r.lo < r.hi && x[0] === r.lo ? " lo" : ""}${r.lo < r.hi && x[0] === r.hi ? " hi" : ""}${x[1] < 5 ? " few" : ""}" title="${fmt(x[1])} sale${x[1] === 1 ? "" : "s"}">${fmt(x[0])}</td>`;
const askCell = r => { const a = r.ask; if (!a) return `<td class="num sub">none</td>`;
  return `<td class="num">${fmt(a.v)}${r.deal < 0.9 ? `<br><span class="pill p-good">${Math.round((1 - r.deal) * 100)}% under</span>` : ""}<span class="sub" title="${esc(a.ago || "")}">${esc(a.src)}</span></td>` };
const SORTS = {sold: (a, b) => b.sold - a.sold, spread: (a, b) => b.spread - a.spread, deal: (a, b) => a.deal - b.deal || b.sold - a.sold,
  mid: (a, b) => b.mid - a.mid, name: (a, b) => a.it.n.localeCompare(b.it.n)};
function render(){
  if (!ROWS) build();
  const q = S.q.trim().toLowerCase(), min = +S.min;
  const a = ROWS.filter(r => r.k >= min && (!S.cat || r.it.c === S.cat) && (!q || r.it.n.toLowerCase().includes(q))).sort(SORTS[S.sort] || SORTS.sold);
  $("#mcicnt").textContent = `${fmt(a.length)} item${a.length === 1 ? "" : "s"}`;
  $("#mcirows").innerHTML = a.length ? (all ? a : a.slice(0, SHOW)).map(r => `<tr><td><span class="ing">${itemIcon(r.id)}<span class="itname name" tabindex="0" data-item="${r.id}">${esc(r.it.n)}</span></span></td>${r.s.map(x => cell(x, r)).join("")}<td class="num mid">${fmt(r.mid)}</td><td class="num"><span class="pill ${r.spread >= 2 ? "p-warn" : "p-hot"}">×${r.spread.toFixed(1)}</span></td>${askCell(r)}</tr>`).join("")
    : `<tr><td colspan="${SITES.length + 4}" class="sub">No item matches. Try fewer sites or another type.</td></tr>`;
  $("#mcimore").innerHTML = !all && a.length > SHOW ? `Showing the first ${SHOW}. <button class="btn" id="mciall">Show all ${fmt(a.length)}</button>` : "";
}
const IDS = [...new Set([PW, MW, MI, MA, CMP, MDB].flatMap(o => Object.keys(o)))];
$("#mcisrc").innerHTML = SITES.map(([n, , read, f]) => `<div><b>${n}</b><span>${fmt(IDS.filter(f).length)} items with sales</span><span>updated ${esc(read || "?")}${read && read.length > 10 ? " UTC" : ""}</span></div>`).join("");
$("#mcihd").innerHTML = `<th>Item</th>${SITES.map(x => `<th class="num" title="${x[0]}">${x[1]}</th>`).join("")}<th class="num" title="Median of the sites shown">Middle</th><th class="num" title="Most expensive site ÷ cheapest site">Spread</th><th class="num">Cheapest live</th>`;
const sync = () => { $("#mciq").value = S.q; $("#mcicat").value = S.cat; $("#mcimin").value = S.min; $("#mcisort").value = S.sort };
for (const [k, el] of [["q", "#mciq"], ["cat", "#mcicat"], ["min", "#mcimin"], ["sort", "#mcisort"]])
  $(el).addEventListener(k === "q" ? "input" : "change", e => { S[k] = e.target.value; all = false; save(); render() });
$("#mcireset").addEventListener("click", () => { S = {...DEF}; all = false; sync(); save(); render() });
$("#mcimore").addEventListener("click", e => { if (e.target.id === "mciall"){ all = true; render() } });
sync();
$("#t-mci").addEventListener("click", render);
if (!$("#mci").hidden) render();
})();
