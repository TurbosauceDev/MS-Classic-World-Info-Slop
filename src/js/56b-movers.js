/* ---------------- Movers: biggest day-over-day price changes, one row per item and market ---------------- */
// Danny approved audit proposal P8 (2026-10-27). Every row compares a market against ITS OWN yesterday value, from
// fields already stored by the nightly pipeline (audit: "fields already stored"): PWH (meso.watch 7-day daily medians,
// D.pw.hist), CMP[6] (classicmarket.kr combined publishes its day-ago median next to the current one) and MW[4]
// (maplestory.watch stores a day-ago typical next to its 14-day one). No site is compared against another site.
(() => {
const DEF = {q: "", dir: "", cat: "", min: "3", sort: "move"}, SHOW = 150;
let S = {...DEF, ...savedState("movers", DEF), q: ""}, all = false, ROWS = null;
const save = () => { try { localStorage.setItem("movers", JSON.stringify({...S, q: ""})) } catch(e) {} };
// one source = [key, label, read date, rows->row] where row = {prev, now, sold} or null; meso.watch skips low-data items.
// (classicmarket.kr's stored 7th field is the row's DATE, not a day-ago price, so it has no yesterday number to compare.)
const SRCS = [
  ["pw", "meso.watch", D.pw?.read, id => { const h = PWH[id]; if (!h || h.length < 2 || !PW[id] || (PW[id][4] & 1)) return null;
    const [p0, n0] = [h[h.length - 2], h[h.length - 1]]; return n0[1] > 0 && p0[1] > 0 ? {prev: p0[1], now: n0[1], sold: n0[2], day: n0[0]} : null }],
  ["mw", "maplestory.watch", D.mw?.read, id => { const w = MW[id]; return w?.[0] > 0 && w[4] > 0 ? {prev: w[4], now: w[0], sold: w[1]} : null }]];
function build(){
  ROWS = [];
  for (const id of new Set([...Object.keys(PWH), ...Object.keys(MW)])){ const it = D.items[id]; if (!it) continue;
    for (const [k, label, read, f] of SRCS){ const r = f(id); if (!r) continue;
      const chg = (r.now - r.prev) / r.prev; if (!isFinite(chg) || Math.abs(chg) < 0.01) continue;
      ROWS.push({id, it, k, label, read, ...r, chg}) } }
}
const pct = c => (c > 0 ? "▲" : "▼") + Math.round(Math.abs(c) * 100) + "%";
const srcCell = r => `<td class="src"><b>${esc(r.label)}</b><span>${esc(r.read || "?")}${r.day ? ` · ${esc(r.day)}` : ""}</span></td>`;
function render(){
  if (!ROWS) build();
  const q = S.q.trim().toLowerCase(), min = +S.min;
  const a = ROWS.filter(r => (!S.dir || (S.dir === "rise" ? r.chg > 0 : r.chg < 0)) && (!S.cat || r.it.c === S.cat)
      && (!q || r.it.n.toLowerCase().includes(q)) && r.sold >= min)
    .sort({move: (x, y) => Math.abs(y.chg) - Math.abs(x.chg) || y.sold - x.sold,
      up: (x, y) => y.chg - x.chg, down: (x, y) => x.chg - y.chg,
      sold: (x, y) => y.sold - x.sold, name: (x, y) => x.it.n.localeCompare(y.it.n)}[S.sort] || ((x, y) => Math.abs(y.chg) - Math.abs(x.chg)));
  $("#mvcnt").textContent = `${fmt(a.length)} move${a.length === 1 ? "" : "s"}`;
  $("#mvhd").innerHTML = `<th>Item</th><th>Market</th><th class="num" title="The market's own yesterday price">Day ago</th><th class="num">Now</th><th class="num">Change</th><th class="num" title="meso.watch: that day's sold · classicmarket.kr: their sold count · maplestory.watch: units sold in 14 days">Sales</th><th class="num">7-day</th>`;
  $("#mvrows").innerHTML = a.length ? (all ? a : a.slice(0, SHOW)).map(r => `<tr><td><span class="ing">${itemIcon(r.id)}<span class="itname name" tabindex="0" data-item="${r.id}">${esc(r.it.n)}</span></span></td>${srcCell(r)}<td class="num day">${fmt(r.prev)}</td><td class="num">${fmt(r.now)}</td><td class="num chg ${r.chg > 0 ? "up" : "down"}">${pct(r.chg)}</td><td class="num${r.sold < 5 ? " sub" : ""}">${fmt(r.sold)}</td><td class="num">${r.k === "pw" ? pwSpark(r.id) || "–" : "–"}</td></tr>`).join("")
    : `<tr><td colspan="7" class="sub">No move matches. Widen the sales filter or clear the search.</td></tr>`;
  $("#mvread").innerHTML = SRCS.map(([, label, read]) => read ? `<span><b>${esc(label)}</b> updated ${esc(read)} UTC</span>` : "").join("");
  $("#mvmore").innerHTML = !all && a.length > SHOW ? `Showing the first ${SHOW}. <button class="btn" id="mvall">Show all ${fmt(a.length)}</button>` : "";
}
const sync = () => { $("#mvq").value = S.q; $("#mvdir").value = S.dir; $("#mvcat").value = S.cat; $("#mvmin").value = S.min; $("#mvsort").value = S.sort };
for (const [k, el] of [["q", "#mvq"], ["dir", "#mvdir"], ["cat", "#mvcat"], ["min", "#mvmin"], ["sort", "#mvsort"]])
  $(el).addEventListener(k === "q" ? "input" : "change", e => { S[k] = e.target.value; all = false; save(); render() });
$("#mvreset").addEventListener("click", () => { S = {...DEF}; all = false; sync(); save(); render() });
$("#mvmore").addEventListener("click", e => { if (e.target.id === "mvall"){ all = true; render() } });
sync();
$("#t-movers").addEventListener("click", render);
if (!$("#movers").hidden) render();
})();
