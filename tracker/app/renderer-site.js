// Tracker window, site market cards (v0.2.83): the Watchlist and Market pulse modules and the
// price context the alerts engine's site-price kinds (priceAbove/priceBelow) evaluate against.
// Data comes from main.js (it fetches the site's market.json every 30 min and caches it on disk —
// the page's CSP keeps this renderer offline); maths live in core/prices.js (SitePrices, no DOM).
// Loaded after renderer-alerts.js (which reads window.sitePriceCtx on its 5 s tick) and before
// renderer-run.js.
const SP = SitePrices;
// one parsed snapshot {P, at, raw}; plus the site's cross-source prices payload (0.2.84)
let siteMk = {P: null, at: 0, raw: null}, sitePr = null;

// name <-> id over the tracker's own gamedata (G.items: {id: {n: name, ...}}); built once, lazily —
// a 2,258-entry scan on first use is nothing, and most boots never open the Watchlist
let NAME2ID = null, IDS = null;
function nameIndex(){
  if (NAME2ID) return NAME2ID;
  NAME2ID = {}; IDS = [];
  for (const [id, it] of Object.entries(G.items || {})){
    if (!it || !it.n) continue;
    IDS.push(id);
    (NAME2ID[it.n.toLowerCase()] = NAME2ID[it.n.toLowerCase()] || []).push(id);
  }
  return NAME2ID;
}
const nameOf = id => G.items[id]?.n || "";

// ---- data plumbing ---------------------------------------------------------------------------
function siteApply(j, at, pr){
  siteMk.raw = j; siteMk.at = at || Date.now();
  const p = SP.parse(j);
  siteMk.P = p.ok ? p : null;
  if (pr && pr.pw) sitePr = pr;
  if (!p.ok && j) console.warn("site market parse:", p.why);
  siteRender();
}
host.onSiteMarket((j, at, pr) => siteApply(j, at, pr));
host.siteMarket().then(x => { if (x) siteApply(x[0], x[1], x[2]); else host.siteMarketReady() });
host.siteMarketReady();   // main answers with the current copy if the invoke raced the boot
setInterval(siteRender, 60e3);   // keep the "updated X ago" honest between pulls

const siteAge = () => siteMk.at ? Date.now() - siteMk.at : 0;
const siteAgo = () => { const m = Math.round(siteAge() / 6e4); return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago` };

// what the alerts engine matches against: every priced item that has a name in the game data
window.sitePriceCtx = () => siteMk.P ? SP.priceCtx(siteMk.P, nameOf) : [];

// ---- the Watchlist card ----------------------------------------------------------------------
const watchIds = () => (Array.isArray(settings.siteWatch) ? settings.siteWatch : []).filter(x => G.items[x]);
const watchSave = () => host.settings({siteWatch: watchIds()}).then(x => { settings = x; siteRender() });

function watchAdd(){
  const q = $("#watchSearch").value.trim();
  if (!q) return;
  const idx = nameIndex();
  const ids = /^\d+$/.test(q) && G.items[q] ? [q]
    : idx[q.toLowerCase()] && idx[q.toLowerCase()].length === 1 ? idx[q.toLowerCase()] : null;
  if (!ids){ $("#watchNote").textContent = q + ": no single item by that name or id — pick one from the suggestions."; return }
  const cur = watchIds();
  if (cur.includes(ids[0])){ $("#watchNote").textContent = G.items[ids[0]].n + " is already on the watchlist."; return }
  $("#watchSearch").value = ""; $("#watchNote").textContent = "";
  host.settings({siteWatch: [...cur, ids[0]]}).then(x => { settings = x; siteRender() });
}
function watchDrop(id){
  host.settings({siteWatch: watchIds().filter(x => x !== id)}).then(x => { settings = x; siteRender() });
}

// the day's trend mark: a coloured direction arrow next to the median (the tracker's own inks,
// warn-green/red style: .up / .down are styled in index.html)
const trendMark = t => t > 0.02 ? ["up", "▲"] : t < -0.02 ? ["down", "▼"] : ["", "·"];
const mark = (cls, txt) => cls ? ` <b class="${cls}">${txt}</b>` : "";

function watchRender(){
  const rows = $("#watchRows"), empty = $("#watchEmpty"), note = $("#watchNote");
  if (!$("#watchNames").options.length){   // the datalist fills once, from every item (adding before the first pull is fine: the row then says "not priced today")
    nameIndex();
    $("#watchNames").innerHTML = IDS.map(id => `<option value="${esc(G.items[id].n)}">`).join("");
  }
  const ids = watchIds();
  empty.classList.toggle("hidden", !!ids.length);
  if (!ids.length){ rows.innerHTML = ""; note.textContent = ""; return }
  if (!siteMk.P){ note.textContent = "Waiting for the site's prices" + (siteMk.at ? ` (last copy ${siteAgo()} is unreadable)` : " — first pull in progress…"); return }
  rows.innerHTML = ids.map(id => {
    const q = SP.quote(siteMk.P, id);
    const n = esc(G.items[id].n);
    if (!q) return `<tr><td>${ico(id)}</td><td>${n}</td><td class="n"><span class="note">not priced today</span></td><td class="n"><button class="alt" data-wdrop="${id}" aria-label="Remove ${n}" title="Remove from the watchlist">×</button></td></tr>`;
    const [cls, arrow] = trendMark(q.trend);
    const pct = q.trend ? `${q.trend > 0 ? "+" : ""}${Math.round(q.trend * 100)}%` : "";
    return `<tr><td>${ico(id)}</td><td>${n}</td><td class="n">${COIN}${SP.fmtM(q.median)}${mark(cls, arrow + " " + pct)}` +
      `<div class="note">${q.sales.toLocaleString()} sales · ${q.listings ? `live from ${SP.fmtM(q.live)}` : "no live listings"}</div></td>` +
      `<td class="n"><button class="alt" data-wdrop="${id}" aria-label="Remove ${n}" title="Remove from the watchlist">×</button></td></tr>`;
  }).join("");
  note.textContent = `meso.watch medians via the site · updated ${siteAgo()}`;
}
$("#watchRows").addEventListener("click", e => { const b = e.target.closest("[data-wdrop]"); if (b) watchDrop(b.dataset.wdrop) });
$("#watchAdd").addEventListener("click", watchAdd);
$("#watchSearch").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); watchAdd() } });

// ---- the Market pulse card -------------------------------------------------------------------
function pulseRender(){
  const grid = $("#pulseGrid"), mv = $("#pulseMovers"), note = $("#pulseNote");
  if (!siteMk.P){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${siteMk.at ? "The last copy of the site's prices is unreadable." : "Waiting for the site's prices — first pull in progress…"}</div>`; mv.innerHTML = ""; note.textContent = ""; return }
  const P = siteMk.P, tot = P.tot || {};
  const top = tot.top && tot.top[1] ? (() => { const [id, price, qty, time] = tot.top; return `${nameOf(id) || "Item " + id} — ${COIN}${SP.fmtM(price)}${qty > 1 ? ` ×${qty}` : ""}` })() : null;
  grid.innerHTML = `<div><div class="k">Market sales (rolling)</div><div class="v">${(tot.sales || 0).toLocaleString()}</div></div>` +
    `<div><div class="k">Top sale</div><div class="v" style="font-size:14px">${top || "-"}</div></div>`;
  const mvs = SP.movers(P, 10);
  if (!mvs.length){ mv.innerHTML = `<div class="empty">No movers today — not enough sales on any item yet.</div>` }
  else {
    const up = mvs.filter(m => m.up).slice(0, 5), down = mvs.filter(m => !m.up).slice(0, 5);
    const list = arr => arr.map(m => `<li>${nameOf(m.id) || "Item " + m.id} <span class="sub">${COIN}${SP.fmtM(m.prev)} → ${SP.fmtM(m.now)}</span> <b class="${m.up ? "up" : "down"}">${m.up ? "+" : ""}${Math.round(m.pct * 100)}%</b></li>`).join("");
    mv.innerHTML = (up.length ? `<div class="k mk">Rising</div><ul class="plist">${list(up)}</ul>` : "") +
      (down.length ? `<div class="k mk">Falling</div><ul class="plist">${list(down)}</ul>` : "");
  }
  note.textContent = `meso.watch via the site · day over day, items with 20+ sales today · updated ${siteAgo()}`;
}

function siteRender(){ watchRender(); pulseRender(); if (siteMk.P && sitePr && modalIsOpen($("#cmpPop"))) cmpRender() }

// ---- Compare watched items (0.2.84): every source's price, side by side ------------------------
function cmpRender(){
  const rows = watchIds(), box = $("#cmpRows"), note = $("#cmpNote");
  if (!rows.length){ box.innerHTML = `<div class="empty">Nothing watched yet — add items on the Watchlist card first.</div>`; note.textContent = ""; return }
  const labels = SP.SRC_FIELDS.map(f => f[1]);
  const head = `<tr><th style="text-align:left">Item</th><th style="text-align:right">Site median</th>${labels.map(l => `<th>${esc(l)}</th>`).join("")}</tr>`;
  const body = rows.map(id => {
    const q = SP.quote(siteMk.P, id);
    const srcs = sitePr ? SP.sources(sitePr, id) : [];
    const spread = SP.spreadOf(srcs);
    const cells = SP.SRC_FIELDS.map(([k]) => {
      const s = srcs.find(x => x.key === k);
      if (!s) return `<td class="n"><span class="note">—</span></td>`;
      return `<td class="n">${COIN}${SP.fmtM(s.price)}<div class="note">${s.sales ? s.sales.toLocaleString() + " sales" : ""}${s.read ? (s.sales ? " · " : "") + s.read : ""}</div></td>`;
    }).join("");
    return `<tr><td>${ico(id)} ${esc(G.items[id].n)}${spread != null && spread >= 10 ? ` <b class="down" title="Highest price is ${Math.round(spread)}x the lowest across sources — usually thin data, not a bug">×${Math.round(spread)} spread</b>` : ""}</td>` +
      `<td class="n">${q ? COIN + SP.fmtM(q.median) : `<span class="note">—</span>`}</td>${cells}</tr>`;
  }).join("");
  box.innerHTML = `<table>${head}${body}</table>`;
  note.textContent = sitePr ? "What each source reports today, with its own sales count and read stamp. Sources read at different times; a big spread is usually thin data, not a bug." : "The cross-source prices file has not arrived yet — only the site median is shown. It follows the same 30-minute refresh.";
}
function cmpOpen(){
  cmpRender();
  $("#cmpPop").scrollTop = 0; modalOpen($("#cmpPop"), $("#cmpClose"));
}
$("#cmpPop")._close = el => modalClose(el, $("#watchCmp"));
$("#cmpClose").onclick = () => modalClose($("#cmpPop"), $("#watchCmp"));
$("#watchCmp").onclick = cmpOpen;
