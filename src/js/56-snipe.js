/* ---------------- FM Sniper: live Free Market listings under their usual player-shop price ---------------- */
(() => {
// One row per item meso.watch lists right now (PWNOW: the cheapest live listing per non-equip item, [price each, qty,
// channel, map, seller]) against its sale stats (PW: [median, p25, p75, sales seen, flags 1 = low data, trend, sell-through]).
// A deal = listed under the usual price (Danny 10-20). The grade cut-offs and the Best deal score are ours and say so on
// the page. The Pages copy re-reads market.json (scripts/pages_site.py) while the page is open, so new listings show up
// without a reload; the artifact and file:// only have the build's list.
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
const VIEWS = ["deal", "over", "all"], SORTS = ["score", "pct", "gap", "stack", "price", "usual", "sales", "sell", "name"];
const MINS = [0, 10, 20, 30, 50], SALES = [0, 5, 20, 100];
const DEF = {v: "deal", q: "", cat: "", sort: "score", basis: "med", max: 0, min: 0, sales: 0, rough: false, watch: false, nw: false};
let S = {...DEF};
const clean = o => { const x = {...DEF};
  if (VIEWS.includes(o.v)) x.v = o.v; if (SORTS.includes(o.sort)) x.sort = o.sort; if (o.basis === "p25") x.basis = "p25";
  if (typeof o.cat === "string" && o.cat in CATS) x.cat = o.cat; if (typeof o.q === "string") x.q = o.q.slice(0, 60);
  const max = Math.floor(+o.max); if (isFinite(max) && max > 0 && max < 1e10) x.max = max;
  if (MINS.includes(+o.min)) x.min = +o.min; if (SALES.includes(+o.sales)) x.sales = +o.sales;
  for (const k of ["rough", "watch", "nw"]) x[k] = o[k] === true;
  return x };
try { S = clean({...savedState("snipe", DEF), q: ""}) } catch(e) {}
if (HASH.f && typeof HASH.f === "object") S = clean(HASH.f);   // shared link
const ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch(e) {} };
const save = () => ls("snipe", {...S, q: ""});
let WATCH = new Set(); try { const w = JSON.parse(localStorage.getItem("snipewatch") || "[]"); if (Array.isArray(w)) WATCH = new Set(w.map(String).filter(id => D.items[id])) } catch(e) {}
const saveWatch = () => ls("snipewatch", [...WATCH]);

const keyOf = (id, n) => `${id}|${n[0]}|${n[4]}`;
let ROWS = [];
function build(){
  ROWS = Object.entries(PWNOW).filter(([id, n]) => D.items[id] && Array.isArray(n) && n[0] >= 1).map(([id, n]) => {
    const p = PW[id], ok = !!(p && p[0] > 0), base = !ok ? 0 : S.basis === "p25" ? p[1] || p[0] : p[0];
    const r = ok ? n[0] / base : null, sales = p ? p[3] : 0, rough = !!(p && p[4] & 1);
    const trust = ok ? Math.min(1, Math.log10(1 + sales) / 2) * (rough ? 0.5 : 1) : 0;   // 1 at 99+ sales seen
    return {id, it: D.items[id], n, p, r, base, sales, rough, trust, gap: ok ? base - n[0] : 0, stack: ok ? (base - n[0]) * (n[1] || 1) : 0,
      score: r == null ? -9 : (1 - r) * trust, key: keyOf(id, n), cat: catOf(id), sell: p && !rough ? p[6] ?? null : null, trend: p && !rough ? p[5] ?? null : null};
  });
}
// [label, pill class, colour class, note]
const grade = x => x.r == null ? ["No sales yet", "", "g-even", "nothing to compare with"]
  : x.r > 3 ? ["Way over", "p-bad", "g-over", "typo or bait?"]
  : x.r >= 1.005 ? (x.trend > 0.005 ? ["Rising", "p-hot", "g-rise", `price trend +${Math.round(x.trend * 100)}%`] : ["Over value", "p-bad", "g-over", ""])
  : x.r > 0.995 ? ["At usual", "", "g-even", ""]
  : x.r <= 0.5 ? ["Steal", "p-good", "g-deal", ""] : x.r <= 0.7 ? ["Great", "p-good", "g-deal", ""] : x.r <= 0.85 ? ["Good", "p-good", "g-deal", ""] : ["Small", "p-hot", "g-deal", ""];
const pct = r => r == null ? "–" : r >= 10 ? "×" + fmt(Math.round(r)) : r < 0.01 ? "<1%" : Math.round(r * 100) + "%";
const money = v => v < 10 && v % 1 ? String(v) : fmt(Math.round(v));
const where = n => [n[2] ? "ch " + n[2] : "", n[3]].filter(Boolean).join(" · ");
const isDeal = x => x.r != null && x.r < 0.995;
const day = s => /^\d{4}-\d\d-\d\d$/.test(s || "") ? new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "UTC"}) : "?";

// new = a listing (item, price, seller) that wasn't in the list this browser last showed here
let SEEN = null; try { const o = JSON.parse(localStorage.getItem("snipeseen") || "null"); if (o && Array.isArray(o.k)) SEEN = {l: String(o.l || ""), k: new Set(o.k.map(String)), n: new Set((o.n || []).map(String))} } catch(e) {}
let NEW = new Set();
const markSeen = () => { const now = ROWS.map(x => x.key), listed = D.pw.listed || "";
  if (!SEEN) NEW = new Set(); else if (SEEN.l !== listed) NEW = new Set(now.filter(k => !SEEN.k.has(k))); else NEW = new Set(now.filter(k => SEEN.n.has(k)));
  SEEN = {l: listed, k: new Set(now), n: NEW}; ls("snipeseen", {l: listed, k: now, n: [...NEW]}) };

function pass(x){
  const q = S.q.trim().toLowerCase();
  if (q && !(x.it.n.toLowerCase().includes(q) || String(x.n[4] || "").toLowerCase().includes(q) || String(x.n[3] || "").toLowerCase().includes(q))) return false;
  if (S.cat && x.cat !== S.cat) return false;
  if (S.watch){ if (!WATCH.has(x.id)) return false } else if (S.v === "deal" ? !isDeal(x) : S.v === "over" ? !(x.r != null && x.r >= 1.005) : false) return false;
  if (S.max && x.n[0] > S.max) return false;
  if (S.min && !(x.r != null && (1 - x.r) * 100 >= S.min - 1e-9)) return false;
  if (S.sales && x.sales < S.sales) return false;
  if (S.rough && (x.rough || x.r == null)) return false;
  if (S.nw && !NEW.has(x.key)) return false;
  return true;
}
const by = {score: (a, b) => b.score - a.score, pct: (a, b) => (a.r ?? 1e9) - (b.r ?? 1e9), gap: (a, b) => b.gap - a.gap, stack: (a, b) => b.stack - a.stack,
  price: (a, b) => a.n[0] - b.n[0], usual: (a, b) => (b.p?.[0] || 0) - (a.p?.[0] || 0), sales: (a, b) => b.sales - a.sales,
  sell: (a, b) => (b.sell ?? -1) - (a.sell ?? -1), name: (a, b) => a.it.n.localeCompare(b.it.n)};
const sorted = list => list.sort((a, b) => by[S.sort](a, b) || a.it.n.localeCompare(b.it.n));

// where the listing sits against the usual price: the bar spans 0 to a bit past the dearest of p75, median and the listing
// (capped at twice the median; anything past that sits at the end), the shaded box is where half of sales landed
function strip(x, g){
  if (x.r == null) return `<span class="sub">no sales seen</span>`;
  const [m, lo, hi] = x.p, top = Math.max(hi, m, Math.min(x.n[0], m * 2)) * 1.1, at = v => Math.max(0, Math.min(100, v / top * 100));
  const t = `Listed ${money(x.n[0])} · usual ${fmt(m)} · half of sales ${fmt(lo)}-${fmt(hi)}`;
  return `<span class="snstrip" title="${t}" aria-label="${t}"><i class="snbox" style="left:${at(lo).toFixed(1)}%;width:${(at(hi) - at(lo)).toFixed(1)}%"></i><i class="snmed" style="left:${at(m).toFixed(1)}%"></i><i class="sndot ${g[2]}${x.n[0] > top ? " cut" : ""}" style="left:${at(x.n[0]).toFixed(1)}%"></i></span>`;
}
const star = x => `<button class="snico snstar" type="button" data-w="${x.id}" aria-pressed="${WATCH.has(x.id)}" title="${WATCH.has(x.id) ? "Stop watching" : "Watch this item"}" aria-label="Watch ${esc(x.it.n)}">${WATCH.has(x.id) ? "★" : "☆"}</button>`;
const copyBtn = x => `<button class="snico" type="button" data-cp="${x.id}" title="Copy item, price, channel and seller" aria-label="Copy where to buy ${esc(x.it.n)}">⧉</button>`;
const nameCell = x => { const sub = x.cat === "scroll" ? scrollInfo(x.it) || CATS.scroll : CATS[x.cat];
  return `<span class="ing">${itemIcon(x.id)}<span><span class="itname name" tabindex="0" data-item="${x.id}">${esc(x.it.n)}</span>${NEW.has(x.key) ? ` <span class="pill p-hot snnew">new</span>` : ""}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</span></span>` };
function rowHtml(x){
  const g = grade(x), n = x.n, q = n[1] || 1, w = where(n), low = x.r != null && S.basis === "med" && x.r < 1 && n[0] < x.p[1];
  const gapc = x.r == null ? "" : x.gap >= 0 ? `<span class="up">${money(x.gap)} under</span>` : `<span class="down">${money(-x.gap)} over</span>`;
  return `<tr data-k="${esc(x.key)}"${WATCH.has(x.id) ? ` class="snw"` : ""}><td>${nameCell(x)}</td>
    <td><b class="mono snprice">${money(n[0])}</b>${q > 1 ? ` <span class="sub">×${fmt(q)} = ${money(n[0] * q)}</span>` : ""}${w ? `<div class="sub snwhere">${esc(w)}</div>` : ""}${n[4] ? `<div class="sub">by ${esc(n[4])}</div>` : ""}</td>
    <td class="num">${x.p && x.p[0] ? fmt(x.p[0]) + (pwTrend(x.id) ? ` <span class="sntr">${pwTrend(x.id)}</span>` : "") + `<div class="sub">${fmt(x.p[1])}-${fmt(x.p[2])}</div>` : "–"}${x.p && x.p[0] && S.basis === "p25" ? `<div class="sub">low end ${fmt(x.base)}</div>` : ""}<div class="sub snsales">${x.p ? fmt(x.sales) : "0"} sale${x.sales === 1 ? "" : "s"}${x.rough ? ` <span class="pill p-warn" title="Fewer than 5 sales seen (meso.watch low data): rough">rough</span>` : ""}${x.sell != null ? `<span title="Share of units put up for sale that were bought (meso.watch)"> · ${Math.round(x.sell * 100)}% sell</span>` : ""}</div></td>
    <td>${strip(x, g)}</td>
    <td class="num"><b class="snpct ${g[2]}">${pct(x.r)}</b><div class="sub">${gapc}</div>${q > 1 && x.r != null && x.gap > 0 ? `<div class="sub">stack ${money(x.stack)}</div>` : ""}</td>
    <td>${g[1] ? `<span class="pill ${g[1]}">${g[0]}</span>` : `<span class="sub">${g[0]}</span>`}${x.r != null && x.r < 0.25 ? `<div><span class="pill p-warn" title="Under a quarter of the usual price: often a typo or the wrong item">check it</span></div>` : ""}${g[3] || low ? `<div class="sub"${g[0] === "Rising" ? ` title="meso.watch's trend for this item is up: demand may be pushing the usual price up, so this may not stay over value"` : ""}>${esc(g[3] || "below 3 in 4 sales")}</div>` : ""}</td>
    <td class="snact">${star(x)}${copyBtn(x)}</td></tr>`;
}
function top3(list){
  const el = $("#sntop"), best = S.v === "deal" && !S.watch ? list.filter(isDeal).slice().sort(by.score).slice(0, 3) : [];
  el.hidden = !best.length;
  el.innerHTML = best.map((x, i) => { const g = grade(x), w = where(x.n);
    return `<div class="sncard" style="--i:${i}"><div class="snch">${itemIcon(x.id)}<div><span class="itname name" tabindex="0" data-item="${x.id}">${esc(x.it.n)}</span><div class="sub">${esc(x.cat === "scroll" ? scrollInfo(x.it) || CATS.scroll : CATS[x.cat])}</div></div><span class="pill ${g[1]}">${g[0]}</span></div>
      <div class="snbigrow"><b class="snbigpct ${g[2]}">${pct(x.r)}</b><span>of the usual price<br><b>${money(x.n[0])}</b> vs ${fmt(x.base)}${x.n[1] > 1 ? ` · ×${fmt(x.n[1])}` : ""}</span></div>
      ${strip(x, g)}
      <div class="sub">${esc([w, x.n[4] ? "by " + x.n[4] : ""].filter(Boolean).join(" · "))}</div>
      <div class="sncfoot"><span class="sub">${fmt(x.sales)} sale${x.sales === 1 ? "" : "s"} seen${x.rough ? " · rough" : ""}</span><span>${star(x)}${copyBtn(x)}</span></div></div>` }).join("");
}
function stats(){
  const deals = ROWS.filter(isDeal), solid = deals.filter(x => !x.rough), best = solid.slice().sort(by.pct)[0], gap = solid.slice().sort(by.gap)[0];
  const priced = ROWS.filter(x => x.r != null).length, live = LIVE ? ` · checks for new ones while open` : "";
  const tile = (h, v, s, cls = "") => `<div class="sntile${cls}"><div class="snth">${h}</div><div class="sntv">${v}</div><div class="sub">${s}</div></div>`;
  const nm = x => `<span class="itname" tabindex="0" data-item="${x.id}">${esc(x.it.n)}</span>`;
  const ago = pwListedAgo(), mins = (Date.now() - Date.parse((D.pw.listed || "").replace(" ", "T") + "Z")) / 6e4;
  $("#snstats").innerHTML = tile("Listed now", fmt(ROWS.length), `${fmt(priced)} with sales to compare`)
    + tile("Under value", fmt(deals.length), `${fmt(solid.length)} with 5+ sales seen${NEW.size ? ` · <b>${fmt(NEW.size)} new</b>` : ""}`)
    + tile("Best find", best ? pct(best.r) : "–", best ? `${nm(best)} · ${fmt(best.sales)} sales` : "nothing solid under value")
    + tile("Biggest gap", gap ? money(gap.gap) : "–", gap ? `mesos under · ${nm(gap)} (${pct(gap.r)})` : "nothing solid under value")
    + tile("Listings updated", ago || "–", `meso.watch${live}`, mins < 40 ? " fresh" : mins > 180 ? " stale" : "");
  $("#sndate").textContent = day(D.pw.read);
}
function foot(){
  const listed = new Set(ROWS.map(x => x.id)), off = [...WATCH].filter(id => !listed.has(id));
  $("#snfoot").innerHTML = `Sale prices and listings from <a href="https://meso.watch/" target="_blank" rel="noopener">meso.watch</a> (sales up to ${day(D.pw.read)}, listings updated ${esc(pwListedAgo() || "?")}).`
    + ` Deal labels and Best deal are this site's own cut-offs. Listings close fast: check in game before you travel.`
    + (WATCH.size ? `<br>Watching ${fmt(WATCH.size)} item${WATCH.size === 1 ? "" : "s"}${off.length ? `; not listed right now: ${off.slice(0, 8).map(id => `<span class="itname" tabindex="0" data-item="${id}">${esc(D.items[id].n)}</span>`).join(", ")}${off.length > 8 ? ` +${off.length - 8} more` : ""}` : ""}.` : "");
}
let shown = [];
function render(){
  build();
  const list = ROWS.filter(pass); shown = sorted(list);
  const deals = list.filter(isDeal).length;
  $("#sncount").textContent = `${fmt(shown.length)} listing${shown.length === 1 ? "" : "s"}${S.v !== "deal" && deals ? ` · ${fmt(deals)} under value` : ""}`;
  const empty = S.watch && !WATCH.size ? "No watched items yet: press ☆ on a row to watch it." : "Nothing matches these filters right now. Listings change every half hour.";
  lazyRows($("#snrows"), shown.map(rowHtml), `<tr><td colspan="7" class="empty">${empty}</td></tr>`);
  top3(shown); stats(); foot(); drawCtl();
}
function drawCtl(){
  document.querySelectorAll("#snview [data-v]").forEach(b => b.setAttribute("aria-checked", b.dataset.v === S.v));
  $("#snq").value = S.q; $("#sncat").value = S.cat; $("#snsort").value = S.sort; $("#snbasis").value = S.basis;
  $("#snmax").value = S.max || ""; $("#snmin").value = S.min; $("#snsales").value = S.sales;
  $("#snrough").setAttribute("aria-pressed", S.rough); $("#snwatch").setAttribute("aria-pressed", S.watch); $("#snnew").setAttribute("aria-pressed", S.nw);
  document.querySelectorAll("#snipe thead [data-s]").forEach(th => th.setAttribute("aria-sort", th.dataset.s === S.sort ? (["pct", "price", "name"].includes(S.sort) ? "ascending" : "descending") : "none"));
}
const set = (k, v) => { S[k] = v; save(); render() };
$("#sncat").innerHTML += Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#snq").addEventListener("input", e => set("q", e.target.value.slice(0, 60)));
$("#sncat").addEventListener("change", e => set("cat", e.target.value));
$("#snsort").addEventListener("change", e => set("sort", e.target.value));
$("#snbasis").addEventListener("change", e => set("basis", e.target.value === "p25" ? "p25" : "med"));
$("#snmax").addEventListener("input", e => { const v = Math.floor(+e.target.value); S.max = isFinite(v) && v > 0 && v < 1e10 ? v : 0; save(); render() });
$("#snmin").addEventListener("change", e => set("min", +e.target.value));
$("#snsales").addEventListener("change", e => set("sales", +e.target.value));
for (const [id, k] of [["snrough", "rough"], ["snwatch", "watch"], ["snnew", "nw"]]) $("#" + id).addEventListener("click", () => set(k, !S[k]));
$("#snreset").addEventListener("click", () => { S = {...DEF, v: S.v}; save(); render() });
$("#snshare").addEventListener("click", e => copyShare(e.target, shareUrl("f", {...S})));
$("#snview").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) set("v", b.dataset.v) });
$("#snipe thead").addEventListener("click", e => { const th = e.target.closest("[data-s]"); if (th) set("sort", th.dataset.s) });
$("#snipe").addEventListener("click", async e => {
  const w = e.target.closest("[data-w]"), c = e.target.closest("[data-cp]");
  if (w){ const id = w.dataset.w; WATCH.has(id) ? WATCH.delete(id) : WATCH.add(id); saveWatch();
    document.querySelectorAll(`#snipe [data-w="${id}"]`).forEach(b => b.outerHTML = star({id, it: D.items[id]}));
    document.querySelectorAll("#snrows tr").forEach(tr => tr.classList.toggle("snw", WATCH.has(tr.dataset.k.split("|")[0])));
    foot(); if (S.watch) render(); return }
  if (c){ const x = ROWS.find(r => r.id === c.dataset.cp); if (!x) return;
    const txt = `${x.it.n} · ${money(x.n[0])} mesos${x.n[1] > 1 ? ` ×${x.n[1]}` : ""}${where(x.n) ? " · " + where(x.n) : ""}${x.n[4] ? " · " + x.n[4] : ""}`;
    try { await navigator.clipboard.writeText(txt); c.textContent = "✓"; c.classList.add("ok") } catch(err){ c.title = txt; c.textContent = "!" }
    setTimeout(() => { c.textContent = "⧉"; c.classList.remove("ok") }, 1500) }
});

// toasts: a newer list arrived (and which watched items are now under value)
let toastT = 0;
function toast(html){ const el = $("#sntoast"); el.innerHTML = html; el.hidden = false; el.classList.remove("out");
  clearTimeout(toastT); toastT = setTimeout(() => { el.classList.add("out"); toastT = setTimeout(() => { el.hidden = true }, 250) }, 8000) }
$("#sntoast").addEventListener("click", () => { $("#sntoast").hidden = true });

// live refresh (Pages copy only): market.json = this build's D.pw, rewritten on every deploy (meso.watch poll, every 30 min)
const LIVE = !!D.lazy && /^https?:$/.test(location.protocol);
let lastPoll = 0;   // the first open checks at once (a cached page may be older than the latest deploy)
const okNow = v => Array.isArray(v) && typeof v[0] === "number" && isFinite(v[0]) && v[0] >= 0;
const okIt = v => Array.isArray(v) && v.slice(0, 4).every(x => typeof x === "number" && isFinite(x));
function apply(j){
  const before = new Set(ROWS.map(x => x.key)), now = {}, it = {};
  for (const [id, v] of Object.entries(j.now)) if (D.items[id] && okNow(v)) now[id] = [v[0], Math.max(1, Math.floor(+v[1]) || 1), Number.isInteger(v[2]) ? v[2] : null, typeof v[3] === "string" ? v[3].slice(0, 80) : "", typeof v[4] === "string" ? v[4].slice(0, 40) : ""];
  if (j.it && typeof j.it === "object" && typeof j.read === "string" && j.read >= (D.pw.read || "")) for (const [id, v] of Object.entries(j.it)) if (D.items[id] && okIt(v)) it[id] = v;
  if (Object.keys(it).length){ for (const k of Object.keys(PW)) delete PW[k]; Object.assign(PW, it); D.pw.read = j.read }
  for (const k of Object.keys(PWNOW)) delete PWNOW[k]; Object.assign(PWNOW, now); D.pw.listed = j.listed;
  build();
  const fresh = ROWS.filter(x => !before.has(x.key));
  if (!$("#snipe").hidden) markSeen(); else NEW = new Set();
  render(); document.dispatchEvent(new Event("pwupdate"));
  const hot = fresh.filter(x => WATCH.has(x.id) && isDeal(x)), deals = fresh.filter(isDeal).length;
  if (!fresh.length) return;
  toast(`<b>New listings:</b> ${fmt(fresh.length)} changed, ${fmt(deals)} under value.`
    + (hot.length ? `<br>Watched: ${hot.slice(0, 3).map(x => `<b>${esc(x.it.n)}</b> ${money(x.n[0])} (${pct(x.r)})`).join(", ")}` : ""));
}
async function poll(){
  if (!LIVE || document.hidden) return; lastPoll = Date.now();
  try { const r = await fetch("market.json", {cache: "no-store"}); if (!r.ok) return; const j = await r.json();
    if (j && typeof j.listed === "string" && j.listed > (D.pw.listed || "") && j.now && typeof j.now === "object") apply(j) } catch(e) {}
}
const onShow = () => { markSeen(); render(); if (Date.now() - lastPoll > 6e4) poll() };
$("#t-snipe").addEventListener("click", onShow);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#snipe").hidden && Date.now() - lastPoll > 6e4) poll() });
setInterval(() => { if ($("#snipe").hidden || document.hidden) return; if (Date.now() - lastPoll >= 18e4) poll(); stats() }, 6e4);
render(); if (!$("#snipe").hidden) onShow();
ASSETS.then(() => { if (!$("#snipe").hidden) render() });
})();
