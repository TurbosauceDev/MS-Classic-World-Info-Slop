/* ---------------- crafting ---------------- */
(() => {
const C = D.craft, DISC = C.disc.map(d => d[0]);
// craft level -> [craft EXP to finish it, character level needed to reach it]. Not in the export's data files: from the OSMS
// Data Explorer crafting tab (tabs/crafting.js, CRAFT_LEVELS_COT2), read from the COT2 client. Gate = 5 x craft level.
const CRAFT_LV = [[50, null], [166, 10], [319, 15], [521, 20], [787, 25], [1138, 30], [1602, 35], [2214, 40], [3022, 45], [4089, 50]];
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

/* cheapest leveling: per craft level, the recipe with the lowest (fees + raw materials at NPC price) per craft EXP */
$("#crlvdisc").innerHTML = DISC.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
try { $("#crlvdisc").value = localStorage.getItem("craftlv") || "0" } catch(e) {}
function renderLeveling(){
  const di = +$("#crlvdisc").value; try { localStorage.setItem("craftlv", String(di)) } catch(e) {}
  let total = 0;
  $("#crlvrows").innerHTML = CRAFT_LV.map(([need, charLv], i) => {
    const L = i + 1;
    const opts = R.filter(r => r.d === di && r.lvl <= L && r.exp > 0).map(r => {
      const s = scratch(r), unpriced = [...s.need.keys()].filter(x => !D.items[x]?.p);
      const cost = s.mesos + [...s.need].reduce((a, [x, n]) => a + (D.items[x]?.p || 0) * n, 0);
      return {r, s, cost, per: cost / r.exp, unpriced};
    }).sort((a, b) => a.per - b.per);
    const b = opts[0]; if (!b) return `<tr><td class="num">${L}</td><td colspan="4" class="sub">No recipe at this level.</td></tr>`;
    const k = Math.ceil(need / b.r.exp); total += k * b.cost;
    return `<tr><td class="num">${L}<div class="sub">char ${charLv ?? "quest"}</div></td>
      <td><span class="ing">${itemIcon(b.r.id, 1, true)}<span><b>${esc(b.r.it.n)}</b>${b.r.n > 1 ? ` ×${b.r.n}` : ""}<div class="sub">${fmt(b.r.exp)} EXP · ${fmt(b.cost)} mesos each${b.unpriced.length ? ` · <span class="pill p-warn">${b.unpriced.length} unpriced</span>` : ""}</div></span></span></td>
      <td class="num">${fmt(k)}</td><td class="num">${fmt(k * b.cost)}</td>
      <td><div class="ings">${[...b.s.need].map(([x, n]) => itemIcon(x, n * k, true)).join("")}</div>${b.s.parts.length ? `<div class="sub">also craft ${b.s.parts.map(([p, m]) => `${fmt(m * k)}× ${esc(p.it.n)}`).join(", ")}</div>` : ""}</td></tr>`;
  }).join("");
  $("#crlvtot").textContent = `≈ ${fmt(total)} mesos to craft Lv 10`;
}
$("#crlvdisc").addEventListener("change", renderLeveling);
renderLeveling();

/* recipes */
const S = {d: -1, type: "", cls: "", max: 10, q: "", sort: "lvl", dir: 1};
try { Object.assign(S, JSON.parse(localStorage.getItem("craft") || "{}")) } catch(e) {}
$("#crdisc").innerHTML = ["All", ...DISC].map((n, i) => `<button role="radio" aria-checked="false" data-d="${i - 1}">${esc(n)}</button>`).join("");
$("#crtype").innerHTML = `<option value="">All</option>` + [...new Set(R.map(r => r.type))].sort().map(t => `<option>${esc(t)}</option>`).join("");
const KEY = {lvl: r => r.lvl, name: r => r.it.n, mesos: r => r.mesos, exp: r => r.exp, req: r => r.it.st?.reqLevel || 0};
function renderRecipes(){
  try { localStorage.setItem("craft", JSON.stringify(S)) } catch(e) {}
  document.querySelectorAll("#crdisc button").forEach(b => b.setAttribute("aria-checked", +b.dataset.d === S.d));
  $("#crtype").value = S.type; $("#crcls").value = S.cls; $("#crmax").value = S.max; $("#crsearch").value = S.q;
  const q = S.q.trim().toLowerCase();
  const rows = R.filter(r => (S.d < 0 || r.d === S.d) && (!S.type || r.type === S.type) && r.lvl <= S.max &&
      (!S.cls || (r.it.c === "Equipment" && forCls(r.it, S.cls))) &&
      (!q || r.it.n.toLowerCase().includes(q) || r.ing.some(([x]) => (D.items[x]?.n || "").toLowerCase().includes(q))))
    .sort((a, b) => { const x = KEY[S.sort](a), y = KEY[S.sort](b);
      return (x < y ? -1 : x > y ? 1 : 0) * S.dir || a.lvl - b.lvl || a.d - b.d || a.i - b.i });
  document.querySelectorAll("#crhead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#crcount").textContent = `${rows.length} recipes`;
  $("#crrows").innerHTML = rows.map(r => {
    const s = r.ing.some(([x]) => pick(x)) ? scratch(r) : null;
    return `<tr><td class="num">${r.lvl}</td>
      <td><span class="ing">${itemIcon(r.id, 1)}<span><b>${esc(r.it.n)}</b>${r.n > 1 ? ` ×${r.n}` : ""}<div class="sub">${esc(DISC[r.d])} · ${esc(r.type)}${eqLine(r.it) ? " · " + esc(eqLine(r.it)) : ""}</div></span></span></td>
      <td><div class="ings">${r.ing.map(ingChip).join("")}</div></td>
      <td class="num">${fmt(r.mesos)}</td><td class="num">${fmt(r.exp)}</td>
      <td>${s ? `<div class="ings">${[...s.need].map(([x, n]) => itemIcon(x, n, true)).join("")}</div>
        <div class="sub">${fmt(s.mesos)} mesos in all · also craft ${s.parts.map(([p, k]) => `${k}× ${esc(p.it.n)} (${esc(DISC[p.d])} Lv ${p.lvl})`).join(", ")}</div>` : `<span class="sub">same</span>`}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="sub">No recipes match.</td></tr>`;
}
document.querySelectorAll("#crdisc button").forEach(b => b.addEventListener("click", () => { S.d = +b.dataset.d; renderRecipes() }));
$("#crtype").addEventListener("change", e => { S.type = e.target.value; renderRecipes() });
$("#crcls").addEventListener("change", e => { S.cls = e.target.value; renderRecipes() });
$("#crmax").addEventListener("change", e => { S.max = Math.min(10, Math.max(1, +e.target.value || 10)); renderRecipes() });
$("#crsearch").addEventListener("input", e => { S.q = e.target.value; renderRecipes() });
document.querySelectorAll("#crhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (k === "exp" || k === "mesos" ? -1 : 1); S.sort = k; renderRecipes();
}));

/* raw materials: everything a recipe uses that no recipe makes */
const USE = {};
for (const r of R) for (const [x] of r.ing) if (!pick(x)) (USE[x] = USE[x] || new Set()).add(r);
$("#crmats").innerHTML = Object.entries(USE).sort((a, b) => b[1].size - a[1].size || D.items[a[0]].n.localeCompare(D.items[b[0]].n)).map(([id, rs]) => {
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
}).join("");
$("#crmats").addEventListener("click", e => { const b = e.target.closest(".crfind"); if (!b) return;
  Object.assign(S, {d: -1, type: "", cls: "", max: 10, q: b.dataset.q}); renderRecipes(); $("#crrecipes").scrollIntoView({behavior: "smooth"}) });
renderRecipes();
})();
