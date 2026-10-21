/* ---------------- crafting ---------------- */
(() => {
const C = D.craft, DISC = C.disc.map(d => d[0]);
// craft level -> [craft EXP to finish it, character level needed to reach it]. Not in the export's data files: from the OSMS
// Data Explorer formulas page (Tables & Progression, CRAFT_LEVELS), read from the launch client. Gate = 5 x craft level, cap Lv 8.
const CRAFT_LV = [[50, null], [166, 10], [319, 15], [521, 20], [787, 25], [1138, 30], [1602, 35], [2214, 40]];
const R = C.rec.map(([d, type, lvl, id, n, exp, mesos, ing], i) => ({i, d, type, lvl, id, n, exp, mesos, ing, it: D.items[id] || {n: "?"}}));
const BYOUT = {};
for (const r of R) (BYOUT[r.id] = BYOUT[r.id] || []).push(r);
// recipe used when a part has to be made: lowest craft level, then the biggest batch (skips the 10 -> 5 arrow swaps)
const pick = id => BYOUT[id] && BYOUT[id].slice().sort((a, b) => a.lvl - b.lvl || b.n - a.n)[0];
const RANK = {};
const rank = (id, seen = new Set()) => {
  if (id in RANK) return RANK[id];
  const r = pick(id); if (!r || seen.has(id)) return 0;
  seen.add(id); return RANK[id] = 1 + Math.max(0, ...r.ing.map(([x]) => rank(x, seen)));
};
// everything a recipe takes from scratch: raw materials, total mesos, and the parts you craft on the way
function scratch(r){
  const need = new Map(r.ing.map(([x, n]) => [x, n])), parts = [];
  let mesos = r.mesos;
  for (;;){
    const ids = [...need.keys()].filter(x => pick(x));
    if (!ids.length) break;
    const id = ids.sort((a, b) => rank(b) - rank(a))[0], p = pick(id), k = Math.ceil(need.get(id) / p.n);
    need.delete(id); mesos += k * p.mesos; parts.push([p, k]);
    for (const [x, n] of p.ing) need.set(x, (need.get(x) || 0) + n * k);
  }
  return {need, mesos, parts};
}
// quest rewards (launch quests + citizenship) per item id
const QREW = {};
for (const [src, list] of [["q", QLAUNCH], ["cit", D.citq]]) for (const r of list) for (const g of r.ri || []) for (const [id] of g.it)
  (QREW[id] = QREW[id] || []).push([src, r]);
const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;
const QBYID = Object.fromEntries(D.quests.map(r => [r.id, r]));
const npcAt = name => { const l = (D.npcs[D.npcid[name]] || [])[1] || []; return l.length ? mapLink(l[0][0], D.mapnames[l[0][0]] || D.maps[l[0][0]]?.[0] || "") : "" };
const madeBy = id => { const p = pick(id); return p ? `${DISC[p.d]} Lv ${p.lvl}` : "" };
const ingChip = ([id, n]) => `<span class="ing">${itemIcon(id, 1, true)}<span>${n > 1 ? n + "× " : ""}${esc(D.items[id]?.n || id)}${madeBy(id) ? ` <span class="sub">(${madeBy(id)})</span>` : ""}</span></span>`;
// Plan (58-craftplan.js) owns your craft levels, inventory and the price helpers; set up after this file, so read it lazily
const CP = () => window.CPLAN, lvOf = d => CP()?.S.lv[d] || 0;
const recBtn = r => `<button class="linkbtn crname" type="button" data-r="${r.i}">${esc(r.it.n)}</button>`;
const plus = v => `<b class="${v > 0 ? "up" : "down"}">${v > 0 ? "+" : ""}${fmt(Math.round(v))}</b>`;
const roughPill = id => CP().rough(id) ? ` <span class="pill p-warn" title="${esc(CP().roughWhy(id))}">rough</span>` : "";
const priceSrc = id => { const f = pwPrice(id); return f && !f.per && f.v >= (D.items[id]?.p || 0) ? f.src : "NPC price" };
// an ingredient's cost: what it would sell for; a crafted part with no price costs its own fee + ingredients (per item made)
let ICOST = {}, ECON = {};
function icost(id, seen = new Set()){
  if (id in ICOST) return ICOST[id];
  const w = CP().worth(id); if (w > 0) return ICOST[id] = w;
  const p = pick(id); if (!p || seen.has(id)) return ICOST[id] = 0;
  seen.add(id); return ICOST[id] = (p.mesos + p.ing.reduce((a, [x, n]) => a + icost(x, seen) * n, 0)) / p.n;
}
// per craft: sell = result's worth × batch, mats = ingredient costs, profit = sell - fee - mats (null: the result has no price)
const econ = r => ECON[r.i] ||= (() => { const sell = CP().worth(r.id) * r.n, mats = r.ing.reduce((a, [x, n]) => a + icost(x) * n, 0);
  return {sell, mats, profit: sell ? sell - r.mesos - mats : null, free: r.ing.filter(([x]) => !icost(x)).map(([x]) => x)} })();
const TOK = {Warrior: "Warrior", Magician: "Mage", Bowman: "Bowman", Thief: "Thief"};
const forCls = (it, cls) => !cls || it.job === "All" || String(it.job || "").split("/").includes(TOK[cls]);
const eqLine = it => it.c !== "Equipment" ? "" : [it.st?.reqLevel ? `Lv ${it.st.reqLevel}` : "", it.job && it.job !== "All" ? it.job : "any class", it.wt || it.s].filter(Boolean).join(" · ");

/* masters + profession quests */
function questLine(id, what){
  const r = QBYID[id]; if (!r) return "";
  const parts = [...(r.pre || []).filter(p => QBYID[p] && QBYID[p].npc !== r.npc).map(p => `finish ${qn(["q", QBYID[p]])}`),
    ...(r.kl || []).map(([m, n]) => `kill ${n} ${mobLink(m)}`),
    ...(r.il || []).map(([name, n]) => { const id = Object.keys(D.items).find(k => D.items[k].n === name);
      return `${n} ${id ? itemIcon(id, 1, true) : ""}${esc(name)}${id && madeBy(id) ? ` <span class="sub">(${madeBy(id)})</span>` : ""}` })];
  const req = (r.info?.req || []).find(x => / Lv\. \d+ or higher$/.test(x));
  return `<li><b>Lv ${r.lvl}</b> ${qn(["q", r])}${r.rep ? ` <span class="pill p-warn">${r.rep}</span>` : ""}
    <div class="sub">${what}${req ? ` · needs ${esc(req.replace(/\. (\d+) or higher/, " $1"))}` : ""} · ${parts.join(", ") || "talk"} · ${fmt(r.exp)} EXP</div>
    ${(r.ri || []).length ? `<div class="sub">Reward: ${rewardIcons(r)} ${r.ri.flatMap(g => g.it.map(([x]) => esc(D.items[x]?.n || ""))).join(", ")}</div>` : ""}</li>`;
}
$("#crmasters").innerHTML = C.disc.map(([name, , npc, app, wk, own], di) => {
  const rs = R.filter(r => r.d === di), types = {};
  for (const r of rs) types[r.type] = (types[r.type] || 0) + 1;
  const kinds = [...new Set(rs.filter(r => r.type === "Equipment").map(r => r.it.wt || r.it.s))];
  return `<div class="fact"><h3>${esc(name)} <span class="sub">· ${rs.length} recipes</span></h3>
    <p>Master: ${npcLink(npc)}${npcAt(npc) ? ` in ${npcAt(npc)}` : ""}. Makes ${Object.entries(types).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ")}${kinds.length ? ` (${kinds.map(esc).join(", ")})` : ""}.</p>
    <ul class="crq">${questLine(app, "learn it (craft Lv 1)")}${questLine(wk, "weekly help")}${questLine(own, "craft Lv 5 test")}</ul></div>`;
}).join("");

/* craft levels */
let tot = 0;
const cum = CRAFT_LV.map(([e]) => { const t = tot; tot += e; return t });
$("#crlevels").innerHTML = `<thead><tr><th></th>${CRAFT_LV.map((_, i) => `<th class="num">Lv ${i + 1}</th>`).join("")}</tr></thead><tbody>
  <tr><th>Character level</th>${CRAFT_LV.map(([, c]) => `<td class="num">${c ?? "quest"}</td>`).join("")}</tr>
  <tr><th>Craft EXP in this level</th>${CRAFT_LV.map(([e]) => `<td class="num">${fmt(e)}</td>`).join("")}</tr>
  <tr><th>Total craft EXP to reach</th>${cum.map(t => `<td class="num">${fmt(t)}</td>`).join("")}</tr>
  <tr><th>New recipes</th>${CRAFT_LV.map((_, i) => `<td class="num">${R.filter(r => r.lvl === i + 1).length}</td>`).join("")}</tr></tbody>`;
// phones get the same numbers turned on their side, one row per craft level (8 columns don't fit at 390px)
$("#crlevelsp").innerHTML = `<thead><tr><th class="num">Lv</th><th class="num">Char. lv</th><th class="num">EXP in level</th><th class="num">Total to reach</th><th class="num">New recipes</th></tr></thead><tbody>
  ${CRAFT_LV.map(([e, c], i) => `<tr><td class="num">${i + 1}</td><td class="num">${c ?? "quest"}</td><td class="num">${fmt(e)}</td><td class="num">${fmt(cum[i])}</td><td class="num">${R.filter(r => r.lvl === i + 1).length}</td></tr>`).join("")}</tbody>`;

/* cheapest leveling: per craft level from yours, the recipe with the lowest (fees + raw materials) per craft EXP. Raw materials
   at what an NPC pays (game files) or what they'd sell for (Plan's worth: usual price or NPC, whichever is more) */
$("#crlvdisc").innerHTML = DISC.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
try { $("#crlvdisc").value = localStorage.getItem("craftlv") || "0"; if ($("#crlvdisc").selectedIndex < 0) $("#crlvdisc").value = "0" } catch(e) {}
try { $("#crlvval").value = localStorage.getItem("craftlvv") === "mkt" ? "mkt" : "npc" } catch(e) {}
function renderLeveling(){
  const di = +$("#crlvdisc").value, mkt = $("#crlvval").value === "mkt", price = x => mkt ? CP().worth(x) : D.items[x]?.p || 0;
  try { localStorage.setItem("craftlv", String(di)); localStorage.setItem("craftlvv", mkt ? "mkt" : "npc") } catch(e) {}
  const from = Math.max(1, lvOf(di));
  let total = 0;
  $("#crlvrows").innerHTML = CRAFT_LV.map(([need, charLv], i) => {
    const L = i + 1; if (L < from) return "";
    const opts = R.filter(r => r.d === di && r.lvl <= L && r.exp > 0).map(r => {
      const s = scratch(r), unpriced = [...s.need.keys()].filter(x => !price(x));
      const cost = s.mesos + [...s.need].reduce((a, [x, n]) => a + price(x) * n, 0);
      return {r, s, cost, per: cost / r.exp, unpriced};
    }).sort((a, b) => a.per - b.per);
    const b = opts[0]; if (!b) return `<tr><td class="num">${L}</td><td colspan="4" class="sub">No recipe at this level.</td></tr>`;
    const k = Math.ceil(need / b.r.exp); total += k * b.cost;
    return `<tr><td class="num">${L}<div class="sub">char ${charLv ?? "quest"}</div></td>
      <td><span class="ing">${itemIcon(b.r.id, 1, true)}<span>${recBtn(b.r)}${b.r.n > 1 ? ` ×${b.r.n}` : ""}<div class="sub">${fmt(b.r.exp)} EXP · ${fmt(Math.round(b.cost))} mesos each${b.unpriced.length ? ` · <span class="pill p-warn">${b.unpriced.length} unpriced</span>` : ""}</div></span></span></td>
      <td class="num">${fmt(k)}</td><td class="num">${fmt(Math.round(k * b.cost))}</td>
      <td><div class="ings">${[...b.s.need].map(([x, n]) => itemIcon(x, n * k, true)).join("")}</div>${b.s.parts.length ? `<div class="sub">also craft ${b.s.parts.map(([p, m]) => `${fmt(m * k)}× ${esc(p.it.n)}`).join(", ")}</div>` : ""}</td></tr>`;
  }).join("");
  $("#crlvtot").textContent = `≈ ${fmt(Math.round(total))} mesos to finish craft Lv ${CRAFT_CAP} (the cap)${from > 1 ? ` from Lv ${from}` : ""}`;
}
$("#crlvdisc").addEventListener("change", renderLeveling);
$("#crlvval").addEventListener("change", renderLeveling);

/* recipes */
const S = {d: -1, type: "", cls: "", max: CRAFT_CAP, q: "", sort: "lvl", dir: 1, mine: false, prof: false};
try { Object.assign(S, savedState("craft", S)) } catch(e) {}
$("#crdisc").innerHTML = ["All", ...DISC].map((n, i) => `<button role="radio" aria-checked="false" data-d="${i - 1}">${esc(n)}</button>`).join("");
$("#crtype").innerHTML = `<option value="">All</option>` + [...new Set(R.map(r => r.type))].sort().map(t => `<option>${esc(t)}</option>`).join("");
const KEY = {lvl: r => r.lvl, name: r => r.it.n, mesos: r => r.mesos, exp: r => r.exp, req: r => r.it.st?.reqLevel || 0,
  sell: r => econ(r).sell || -1, profit: r => econ(r).profit ?? -1e15};
function renderRecipes(){
  try { localStorage.setItem("craft", JSON.stringify(S)) } catch(e) {}
  ICOST = {}; ECON = {};
  document.querySelectorAll("#crdisc button").forEach(b => b.setAttribute("aria-checked", +b.dataset.d === S.d));
  $("#crtype").value = S.type; $("#crcls").value = S.cls; $("#crmax").value = S.max; $("#crsearch").value = S.q; $("#crmine").checked = !!S.mine; $("#crprof").checked = !!S.prof;
  const q = S.q.trim().toLowerCase(), inv = CP().inventory(), have = [...inv.values()].some(n => n > 0);
  const rows = R.filter(r => (S.d < 0 || r.d === S.d) && (!S.type || r.type === S.type) && r.lvl <= S.max && (!S.mine || lvOf(r.d) >= r.lvl) &&
      (!S.cls || (r.it.c === "Equipment" && forCls(r.it, S.cls))) && (!S.prof || econ(r).profit > 0) &&
      (!q || r.it.n.toLowerCase().includes(q) || r.ing.some(([x]) => (D.items[x]?.n || "").toLowerCase().includes(q))))
    .sort((a, b) => { const x = KEY[S.sort](a), y = KEY[S.sort](b);
      return (x < y ? -1 : x > y ? 1 : 0) * S.dir || a.lvl - b.lvl || a.d - b.d || a.i - b.i });
  document.querySelectorAll("#crhead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#crcount").textContent = `${rows.length} recipe${rows.length === 1 ? "" : "s"}`;
  lazyRows($("#crrows"), rows.map(r => {
    const e = econ(r), T = have && lvOf(r.d) >= r.lvl ? CP().maxTimes(CP().RECS[r.i], inv) : 0;
    return `<tr><td class="num">${r.lvl}</td>
      <td><span class="ing">${itemIcon(r.id, 1)}<span>${recBtn(r)}${r.n > 1 ? ` ×${r.n}` : ""}<div class="sub">${esc(DISC[r.d])} · ${esc(r.type)}${eqLine(r.it) ? " · " + esc(eqLine(r.it)) : ""}</div>${T ? `<span class="pill p-good" title="From your Plan inventory, parts made on the way">you can make ${fmt(T)}</span>` : ""}</span></span></td>
      <td><div class="ings">${r.ing.map(ingChip).join("")}</div></td>
      <td class="num">${fmt(r.mesos)}</td><td class="num">${fmt(r.exp)}</td>
      <td class="num">${e.sell ? fmt(e.sell) + roughPill(r.id) : `<span class="sub">–</span>`}</td>
      <td class="num">${e.profit != null ? plus(e.profit) : `<span class="sub">–</span>`}${e.free.length ? `<div class="sub" title="${esc(e.free.map(x => D.items[x]?.n || x).join(", "))}">${e.free.length} unpriced</div>` : ""}</td></tr>`;
  }), `<tr><td colspan="7" class="sub">No recipes match.</td></tr>`);
}
document.querySelectorAll("#crdisc button").forEach(b => b.addEventListener("click", () => { S.d = +b.dataset.d; renderRecipes() }));
$("#crtype").addEventListener("change", e => { S.type = e.target.value; renderRecipes() });
$("#crcls").addEventListener("change", e => { S.cls = e.target.value; renderRecipes() });
$("#crmax").addEventListener("change", e => { S.max = Math.min(CRAFT_CAP, Math.max(1, +e.target.value || CRAFT_CAP)); renderRecipes() });
$("#crsearch").addEventListener("input", e => { S.q = e.target.value; renderRecipes() });
$("#crmine").addEventListener("change", e => { S.mine = e.target.checked; renderRecipes() });
$("#crprof").addEventListener("change", e => { S.prof = e.target.checked; renderRecipes() });
document.querySelectorAll("#crhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (["exp", "mesos", "sell", "profit"].includes(k) ? -1 : 1); S.sort = k; renderRecipes();
}));

/* raw materials: everything a recipe uses that no recipe makes */
const USE = {};
for (const r of R) for (const [x] of r.ing) if (!pick(x)) (USE[x] = USE[x] || new Set()).add(r);
const renderMats = () => { $("#crmats").innerHTML = Object.entries(USE).sort((a, b) => b[1].size - a[1].size || D.items[a[0]].n.localeCompare(D.items[b[0]].n)).map(([id, rs]) => {
  const s = C.src[id] || {}, it = D.items[id], qs = QREW[id] || [], where = [];
  for (const [npc, mid, map, price] of s.shop || []) where.push(`Shop: ${npcLink(npc)} (${mid ? mapLink(mid, map) : esc(map)}), ${fmt(price)} mesos`);
  if (qs.length) where.push(`Quest reward: ${qs.slice(0, 3).map(qn).join(", ")}${qs.length > 3 ? ` +${qs.length - 3} more` : ""}`);
  const rep = Object.fromEntries(D.drops?.[id] || []);
  for (const m of s.mob || []) where.push(`Monster: ${D.mobs[m] ? mobLink(m) : esc(m)} <span class="sub">(${rep[m] ? `${rep[m]} player${rep[m] === 1 ? "" : "s"} confirm on meowdb` : (s.meow || []).includes(m) ? "meowdb grind guide" : s.why === "name" ? "named after it" : "named in the item description"}${D.latermobs.includes(m) ? ", not at launch" : ""})</span>`);
  for (const [m, v] of D.drops?.[id] || []) if (!(s.mob || []).includes(m)) where.push(`Monster: ${mobLink(m)} <span class="sub">(${v} player${v === 1 ? "" : "s"} confirm on meowdb${D.latermobs.includes(m) ? ", not at launch" : ""})</span>`);
  const discs = [...new Set([...rs].map(r => DISC[r.d]))];
  return `<tr><td><span class="ing">${itemIcon(id, 1)}<span><button class="crfind" data-q="${esc(it.n)}">${esc(it.n)}</button><div class="sub">${esc(it.c === "Equipment" ? eqLine(it) : it.s || it.c || "")}</div></span></span></td>
    <td class="num">${rs.size}</td><td class="sub">${discs.map(esc).join(", ")}</td>
    <td class="sub">${where.join("<br>") || `<span class="na">not in the game files (no drop tables)</span>`}</td><td class="num">${fmt(it.p)}</td></tr>`;
}).join("") };
$("#crmats").addEventListener("click", e => { const b = e.target.closest(".crfind"); if (!b) return;
  Object.assign(S, {d: -1, type: "", cls: "", max: CRAFT_CAP, q: b.dataset.q, mine: false, prof: false}); mode("rec"); renderRecipes(); $("#crmode").scrollIntoView({behavior: "smooth"}) });

/* recipe pop-up: parts, prices, profit, farming, what it's used in (inset modal like Settings) */
const USEDIN = {};
for (const r of R) for (const [x] of r.ing) (USEDIN[x] = USEDIN[x] || []).push(r);
const pop = $("#crpop");
let popFrom = null;
const tile = (k, v, sub) => `<div class="pxt"><span class="pxk">${k}</span><b class="pxv">${v}</b><span class="pxs">${sub}</span></div>`;
function openRec(i){
  const r = R[i]; if (!r) return;
  ICOST = {}; ECON = {};
  const cp = CP(), e = econ(r), s = scratch(r), inv = cp.inventory(), mine = lvOf(r.d), T = mine >= r.lvl ? cp.maxTimes(cp.RECS[r.i], inv) : 0;
  const gate = CRAFT_LV[r.lvl - 1]?.[1];
  $("#crpoph").innerHTML = `<span class="ing">${itemIcon(r.id, r.n)}<span>${esc(r.it.n)}${r.n > 1 ? ` <span class="sub">×${r.n}</span>` : ""}</span></span>`;
  const ingRow = ([x, n]) => { const b = cp.buyEach(x), c = icost(x), h = inv.get(x) || 0;
    return `<tr><td><span class="ing">${itemIcon(x, 1, true)}<span>${esc(D.items[x]?.n || x)}${madeBy(x) ? `<div class="sub">${pick(x) ? `<button class="linkbtn" data-r="${pick(x).i}">${madeBy(x)}</button>` : ""}</div>` : ""}</span></span></td>
      <td class="num">${fmt(n)}</td><td class="num">${h ? `<b class="${h >= n ? "up" : ""}">${fmt(h)}</b>` : `<span class="sub">0</span>`}</td>
      <td class="num">${c ? fmt(Math.round(c)) + roughPill(x) : `<span class="sub">no price</span>`}${!cp.worth(x) && c ? `<div class="sub">from scratch</div>` : ""}</td>
      <td class="num">${isFinite(b) ? `${fmt(b)}<div class="sub">${cp.buyHow(x)}</div>` : `<span class="sub">–</span>`}</td></tr>` };
  const farm = [...s.need.keys()].map(x => [x, cp.farm(x)]).filter(([, f]) => f.length);
  const used = (USEDIN[r.id] || []).slice().sort((a, b) => a.lvl - b.lvl || a.d - b.d);
  $("#crpopb").innerHTML = `<p class="sub crpsub">${esc(DISC[r.d])} Lv ${r.lvl}${gate ? ` (character Lv ${gate})` : ""} · ${esc(r.type)}${eqLine(r.it) ? " · " + esc(eqLine(r.it)) : ""} ·
      ${mine >= r.lvl ? `<span class="pill p-good">your level allows it</span>` : mine ? `<span class="pill p-warn">you're ${esc(DISC[r.d])} Lv ${mine}</span>` : `<span class="pill">set your ${esc(DISC[r.d])} level on the Crafting page</span>`}${T ? ` <span class="pill p-good">you can make ${fmt(T)}</span>` : ""}</p>
    <div class="setcard crpx"><div class="pxtiles">
      ${tile("Sells for", e.sell ? fmt(e.sell) : "–", e.sell ? `${r.n > 1 ? `${r.n} × ${fmt(cp.worth(r.id))} · ` : ""}${esc(priceSrc(r.id))}${roughPill(r.id)}` : "no sales seen, no NPC price")}
      ${tile("Fee", fmt(r.mesos), "game files")}
      ${tile("Ingredients", fmt(Math.round(e.mats)), e.free.length ? `<span class="pill p-warn">${e.free.length} unpriced</span> counted as free` : "what they'd sell for")}
      ${tile("Profit", e.profit != null ? plus(e.profit) : "–", e.profit != null ? "per craft · an estimate" : "the result has no price")}
      ${tile("Craft EXP", fmt(r.exp), r.exp ? `${fmt(Math.ceil((CRAFT_LV[r.lvl - 1]?.[0] || 0) / r.exp))} crafts fill Lv ${r.lvl}` : "")}
    </div></div>
    <div class="setcard"><h3>Ingredients <span class="sub">per craft</span></h3>
      <div class="tblwrap"><table class="mini"><thead><tr><th>Item</th><th class="num">Need</th><th class="num">You have</th><th class="num">Worth each</th><th class="num">Cheapest buy</th></tr></thead><tbody>${r.ing.map(ingRow).join("")}</tbody></table></div></div>
    ${s.parts.length ? `<div class="setcard"><h3>From scratch</h3><div class="ings">${[...s.need].map(([x, n]) => `<span class="ing">${itemIcon(x, n, true)}<span>${n > 1 ? fmt(n) + "× " : ""}${esc(D.items[x]?.n || x)}</span></span>`).join("")}</div>
      <p class="sub">Craft first: ${s.parts.map(([p, k]) => `<button class="linkbtn" data-r="${p.i}">${fmt(k * p.n)}× ${esc(p.it.n)}</button> (${esc(DISC[p.d])} Lv ${p.lvl})`).join(", ")} · ${fmt(s.mesos)} mesos in fees in all.</p></div>` : ""}
    ${farm.length ? `<div class="setcard"><h3>Where to farm the raw materials <span class="pill p-warn">estimates</span></h3>
      <div class="tblwrap"><table class="mini"><thead><tr><th>Material</th><th>Map</th><th>Monster</th><th class="num">Per hour</th></tr></thead><tbody>${farm.flatMap(([x, f]) => f.map((m, k) => `<tr>${k ? "" : `<td rowspan="${f.length}"><span class="ing">${itemIcon(x, 1, true)}<span>${esc(D.items[x]?.n || x)}</span></span></td>`}
        <td>${mapLink(m.map, m.name)}</td><td class="sub">${m.who.map(w => esc(D.mobs[w]?.[0] || "")).join(", ")}</td><td class="num">~${fmt(Math.max(1, Math.round(m.hr)))}${m.real ? ` <span class="pill p-good" title="Drop count from grind tracker players' shared runs">players' drops</span>` : ""}</td></tr>`)).join("")}</tbody></table></div>
      <p class="sub">As a ${esc(cp.S.cls)} Lv ${fmt(cp.S.L)} (Plan tab), killing alone, 5% per kill unless players shared 100+ kills.</p></div>` : ""}
    ${used.length ? `<div class="setcard"><h3>Used in <span class="sub">${used.length} recipe${used.length === 1 ? "" : "s"}</span></h3><div class="ings">${used.map(u => `<span class="ing">${itemIcon(u.id, 1, true)}<button class="linkbtn" data-r="${u.i}">${esc(u.it.n)}</button> <span class="sub">${esc(DISC[u.d])} Lv ${u.lvl}</span></span>`).join("")}</div></div>` : ""}
    <details class="setcard crpx crall"><summary><h3>Every price for ${esc(r.it.n)}</h3></summary>${priceBox(r.id)}</details>`;
  if (pop.hidden){ popFrom = document.activeElement; pop.hidden = false }
  pop.querySelector(".setbox").scrollTop = 0; $("#crpopx").focus({preventScroll: true});
}
const shut = () => { if (pop.hidden) return; pop.hidden = true; if (popFrom?.isConnected) popFrom.focus({preventScroll: true}) };
$("#crpopx").addEventListener("click", shut);
pop.addEventListener("click", e => { if (e.target === pop) return shut();
  const m = e.target.closest("[data-pxall]"); if (m){ m.previousElementSibling.classList.add("open"); m.remove(); return }
  const b = e.target.closest("button[data-r]"); if (b) openRec(+b.dataset.r);
  else if (e.target.closest("a")) shut() });   // map / item links leave the page
document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) shut() });
$("#craft").addEventListener("click", e => { const b = e.target.closest("button[data-r]"); if (b){ e.preventDefault(); openRec(+b.dataset.r) } });

/* tabs: Plan / Recipes / Level up / Reference; tables are built on first open (the recipe and material tables are ~15k elements) */
const MODES = ["plan", "rec", "lvl", "ref"], DIRTY = new Set(MODES);
let M = (() => { try { return localStorage.getItem("crtab") } catch(e) { return null } })();
function mode(m){
  if (!MODES.includes(m)) m = CP().S.lv.some(v => v > 0) ? "plan" : "rec";
  M = m; try { localStorage.setItem("crtab", m) } catch(e) {}
  document.querySelectorAll("#crmode [data-m]").forEach(b => { b.setAttribute("aria-selected", b.dataset.m === m); b.tabIndex = b.dataset.m === m ? 0 : -1 });
  for (const x of MODES) $("#crp-" + x).hidden = x !== m;
  show();
}
function show(){
  if ($("#craft").hidden || !DIRTY.has(M)) return;
  DIRTY.delete(M);
  if (M === "plan") CP().draw(); else if (M === "rec") renderRecipes(); else if (M === "lvl") renderLeveling(); else renderMats();
}
$("#crmode").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) mode(b.dataset.m) });
$("#crmode").addEventListener("keydown", e => { const d = {ArrowRight: 1, ArrowLeft: -1}[e.key]; if (!d) return;
  e.preventDefault(); mode(MODES[(MODES.indexOf(M) + d + MODES.length) % MODES.length]); $(`#crmode [data-m="${M}"]`).focus() });
// craft levels or inventory changed: redraw what's open, the rest on its next open (Reference doesn't use them)
const stale = () => { for (const x of ["plan", "rec", "lvl"]) DIRTY.add(x); show() };
document.addEventListener("craftlv", stale);
document.addEventListener("invupdate", stale);
$("#t-craft").addEventListener("click", () => setTimeout(show));
setTimeout(() => mode(M));   // after 58-craftplan.js has set up CPLAN
window.CRAFT = {mode, openRec, econ: r => (ICOST = {}, ECON = {}, econ(r)), R};   // tests
})();
