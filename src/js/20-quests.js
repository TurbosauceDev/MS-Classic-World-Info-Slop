/* quests: launch content only (Orbis, El Nath and Forgotten Hollow aren't open at launch) */
const QLAUNCH = D.quests.filter(r => !["El Nath","Orbis","Forgotten Hollow"].includes(r.region));
// requirement text with monster hover cards: "kill 30 Octopus; 20 Octopus Leg (Octopus); 1 Pure Water (source n/a)"
function reqHTML(r, hideNA = false){
  if (!r.req || r.req === "talk / deliver only") return esc(r.req || "");
  const src = Object.fromEntries((r.il || []).map(([n, , s]) => [n, s]));
  return r.req.split("; ").map(p => {
    let m = p.match(/^kill (\d+) (.+)$/);
    if (m) return `kill ${m[1]} ${mobLink(m[2])}`;
    m = p.match(/^(\d+) (.+?)( \(source n\/a\))?$/);
    if (m){ const s = src[m[2]]; return `${m[1]} ${esc(m[2])}${s && D.mobs[s] ? ` <span class="from">(${mobLink(s)})</span>` : m[3] && !hideNA ? `<span class="na"> (source n/a)</span>` : ""}` }
    return esc(p);
  }).join("; ");
}
function renderQuests(){
  const lo = +$("#qmin").value || 0, hi = +$("#qmax").value || 100, s = $("#qsearch").value.trim().toLowerCase();
  let q = QLAUNCH.filter(r => r.lvl >= lo && r.lvl <= hi);
  if (s) q = q.filter(r => (r.name + r.npc + r.req + r.reward + (r.ln || "")).toLowerCase().includes(s));   // ln: questline name, as the quest log shows it
  if ($("#qeq").getAttribute("aria-pressed") === "true") q = q.filter(r => r.info && r.info.eq);
  if ($("#qval").getAttribute("aria-pressed") === "true") q = q.filter(r => VALUE[r.id]);
  // questline filter overrides the other filters and shows the chain in order
  if (QCHAIN) q = QLAUNCH.filter(r => r.chain === QCHAIN);
  $("#qchainbar").hidden = !QCHAIN;
  if (QCHAIN) $("#qchainbar").innerHTML = `Questline: <b>${esc(QCHAIN)}</b> · ${q.length} quests, in order <button class="btn" id="qchainclear">Show all quests</button>`;
  const {k, dir} = QCHAIN ? {k:"cpos", dir:1} : QSORT;
  const val = {lvl: r => r.lvl, name: r => r.name.toLowerCase(), exp: r => r.exp, pct: r => r.pct_level, mult: r => r.mult, kills: r => r.eq_kills, reward: r => (r.reward && r.reward.trim()) ? 1 : 0, chain: r => r.chain ? 1 : 0, cpos: r => r.cpos}[k];
  q.sort((a,b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return (x == null) - (y == null) || b.exp - a.exp; // blanks always last
    const c = typeof x === "string" ? x.localeCompare(y) : x - y;
    return c * dir || b.exp - a.exp;
  });
  document.querySelectorAll("#qhead th[data-k]").forEach(th => {
    const on = th.dataset.k === k;
    th.setAttribute("aria-sort", on ? (dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (dir > 0 ? "▲" : "▼") : "";
  });
  $("#qcount").textContent = `${q.length} of ${QLAUNCH.length} quests`;
  lazyRows($("#qrows"), q.map(r => `<tr>
    <td class="num">${r.lvl}</td>
    <td><span class="name qname" tabindex="0" data-src="q" data-i="${D.quests.indexOf(r)}">${esc(r.name)}</span> ${vPill(r.id)}${VALUE[r.id] ? `<div class="vwhy"><b>${esc(VALUE[r.id][1])}</b>${VALUE[r.id][3] ? ` · ${esc(VALUE[r.id][3])} only` : ""} · ${esc(VALUE[r.id][2])} <span class="sub">(${vSrc(VALUE[r.id])})</span></div>` : ""}<div class="sub">${npcLink(r.npc)} · ${esc(r.region || "")}${r.rep ? ` · <span class="pill p-warn">${r.rep}</span>` : ""}${r.region === "El Nath" || r.region === "Orbis" ? ` · <span class="pill p-bad">not in launch</span>` : r.region === "Forgotten Hollow" ? ` · <span class="pill p-warn">opens later</span>` : ""}</div></td>
    <td>${r.chain ? `<button class="chainbtn" data-chain="${esc(r.chain)}" title="Show the ${esc(r.chain)} questline">${esc(r.chain)}</button><div class="sub">${r.cpos} of ${r.cn}</div>` : `<span class="sub">No</span>`}</td>
    <td class="sub">${reqHTML(r)}${stackCell(r)}</td>
    <td class="num">${fmt(r.exp)}</td>
    <td class="num">${r.pct_level ?? "–"}${r.pct_level != null ? "%" : ""}</td>
    <td class="num">${r.mult ? `<span class="pill ${r.mult >= 2 ? "p-hot" : "p-good"}">${r.mult.toFixed(1)}×</span>` : "–"}</td>
    <td class="sub">${r.eq_kills ? `${fmt(r.eq_kills)} ${mobLink(r.eq_mob)}` : "–"}</td>
    <td>${rewardCell(r)}${marketCell(r)}</td></tr>`), `<tr><td colspan="9" class="empty">No quests match. Widen the level range, clear the search or turn off "Equipment rewards only".</td></tr>`);
}
/* quest detail tooltip: one floating box so the scrolling table can't clip it */
const qtip = document.createElement("div");
qtip.id = "qtip"; qtip.setAttribute("role", "tooltip"); qtip.hidden = true;
document.body.appendChild(qtip);
function questTip(r){
  const i = r.info || {}, li = a => a.map(x => `<li>${esc(x)}</li>`).join("");
  const rewards = [r.exp ? fmt(r.exp) + " EXP" + (r.pct_level != null ? ` (${r.pct_level}% of level ${r.lvl})` : "") : "",
    i.mesos ? fmt(i.mesos) + " mesos" : "", i.contrib ? `${i.contrib} citizenship contribution` : ""].filter(Boolean);
  return `<div class="qt-h"><b>${esc(r.name)}</b><span>Lv ${r.lvl} · ${esc(r.npc || "?")} · ${esc(r.region || "")}${i.rep ? " · " + i.rep : ""}</span></div>
    ${i.d ? `<p>${esc(i.d).replace(/\n/g, "<br>")}</p>` : ""}
    ${i.req && i.req.length ? `<h5>Needs</h5><ul>${li(i.req)}</ul>` : ""}
    ${i.start && i.start.length ? `<h5>You're given</h5><ul>${li(i.start)}</ul>` : ""}
    <h5>Rewards</h5><ul>${li(rewards)}${li(i.items || [])}</ul>
    ${VALUE[r.id] ? `<h5>Why players do it · ${VTIER[VALUE[r.id][0]][0]}</h5><p>${esc(VALUE[r.id][2])} <span style="opacity:.7">(${VALUE[r.id][4].map(k => esc(VSRC[k][0])).join("; ")})</span></p>` : ""}
    ${i.prev || i.next ? `<h5>Quest chain${i.chain ? ": " + esc(i.chain) : ""}</h5><ul>${i.prev ? `<li>After: ${esc(i.prev)}</li>` : ""}${i.next ? `<li>Leads to: ${esc(i.next)}</li>` : ""}</ul>` : ""}`;
}
/* market value: turn-in items vs rewards at player prices (pwPrice: meso.watch sales, then classicmarket.kr posts),
   next to the NPC-sell floor (mesos + what the reward items sell to NPCs). 403xxxx quest items can't be traded, so they don't count. */
const QONLY = id => +id >= 4031000 && +id < 4033000;
const mktP = id => { const f = pwPrice(id); return f && !f.per && f.v > 0 ? f : null };
function questMarket(r){
  const seen = new Map(), price = id => { if (!seen.has(id)) seen.set(id, mktP(id)); return seen.get(id) };
  let cost = 0, ctot = 0, cok = 0;
  for (const [, n, , id] of r.il || []){ if (!id || QONLY(id)) continue; ctot++; const f = price(id); if (f){ cok++; cost += f.v * n } }
  // reward groups: get = all, pick 1 = the best, random = expected value; class-only groups: the best class
  let rtot = 0, rok = 0, rew = 0, npc = r.mesos || 0, bestJob = {}, bestNpc = {};
  for (const g of r.ri || []){
    const it = g.it.filter(([id]) => !QONLY(id));
    const val = (f, [id, n, ch]) => f(id) * n * (ch != null ? ch / 100 : 1);
    const sum = f => { const v = it.map(x => val(f, x));
      return g.k === "pick" ? Math.max(0, ...v) : g.k === "rand" && !it.some(x => x[2] != null) ? v.reduce((a, b) => a + b, 0) / (v.length || 1) : v.reduce((a, b) => a + b, 0) };
    for (const [id] of it){ rtot++; if (price(id)) rok++ }
    const m = sum(id => price(id)?.v || 0), p = sum(id => D.items[id]?.p || 0);
    if (g.job && g.job !== "Any Class"){ bestJob[g.k] = Math.max(bestJob[g.k] || 0, m); bestNpc[g.k] = Math.max(bestNpc[g.k] || 0, p) }
    else { rew += m; npc += p }
  }
  for (const k in bestJob){ rew += bestJob[k]; npc += bestNpc[k] }
  const src = {};
  for (const f of seen.values()) if (f){ const s = src[f.src] = src[f.src] || {items: 0, n: 0}; s.items++; s.n += f.n || 0 }
  return {cost, ctot, cok, rew: rew + (r.mesos || 0), rtot, rok, npc, src, all: cok === ctot && rok === rtot,
    rough: [...seen.values()].some(f => f && f.rough)};
}
// one compact block under a quest's rewards: market turn-in vs reward, net when everything is priced, else "x/y priced"
function marketCell(r){
  const m = questMarket(r), tot = m.ctot + m.rtot, ok = m.cok + m.rok;
  if (!tot || !ok) return "";
  const net = m.rew - m.cost, srcs = Object.entries(m.src).map(([s, v]) => `${s} (${fmt(v.n)} ${s === "meso.watch" ? "sales" : "posts"})`).join(", ");
  const tip = `Player prices: ${srcs}${m.rough ? ". Few sales or asking prices only: rough" : ""}. Reward = quest mesos + items (pick 1: the best, random: expected value).`;
  const badge = !m.all ? `<span class="pill p-warn">${ok}/${tot} priced</span>`
    : m.ctot ? `<span class="pill ${net >= 0 ? "p-good" : "p-bad"}" title="${net >= 0 ? "Doing the quest beats selling the items" : "Selling the turn-in items pays more than the reward"}">net ${net >= 0 ? "+" : "−"}${fmt(Math.abs(Math.round(net)))}</span>` : "";
  // one number first (net, or the reward's value), the parts on a quieter line, sources on hover (audit 10-21)
  const lead = m.all && m.ctot ? badge : `<b class="qmv">~${fmt(Math.round(m.rew))}</b> reward value ${badge}`;
  return `<div class="qmkt" title="${esc(tip)}">${lead}
    <div class="sub">${m.ctot ? `turn-in ~${fmt(Math.round(m.cost))} · reward ~${fmt(Math.round(m.rew))} · ` : ""}NPC floor ${fmt(Math.round(m.npc))}${m.rough ? " · rough" : ""}</div></div>`;
}
/* "Stack with": other quests within 10 levels that need the same monster (a kill, or a monster that drops a turn-in item) */
const qMobs = r => new Set([...(r.kl || []).map(([m]) => String(m)),
  ...(r.il || []).flatMap(([, , s, id]) => [s, ...(D.drops[id] || []).map(([m]) => m)]).filter(Boolean).map(String)]);
const QSTACK_POOL = () => [...QLAUNCH.filter(r => r.region !== "Event").map(r => ["q", r]), ...D.citq.map(r => ["cit", r])];
let QSM = null;
function stackWith(r){
  if (!QSM) QSM = QSTACK_POOL().map(([src, q]) => [src, q, qMobs(q)]);
  const mine = qMobs(r); if (!mine.size) return [];
  const seen = new Set([r.name]), out = [];
  for (const [src, q, ms] of QSM){
    if (q === r || seen.has(q.name) || Math.abs(q.lvl - r.lvl) > 10 || ![...ms].some(m => mine.has(m))) continue;
    seen.add(q.name); out.push([src, q]);
  }
  return out.sort((a, b) => a[1].lvl - b[1].lvl);
}
const qref = (src, q) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(q)}">${esc(q.name)}</span>`;
function stackCell(r){
  const s = stackWith(r); if (!s.length) return "";
  // a "stacks with N" chip that opens the list, so the row stays a few lines tall (second audit #12)
  return `<details class="qstack sub"><summary title="Other quests within 10 levels that need the same monster">stacks with ${s.length}</summary>${s.map(([src, q]) => `${qref(src, q)} <span class="tiny">Lv ${q.lvl}</span>`).join(", ")}</details>`;
}
/* item rewards: icons with in-game style tooltips */
function rewardCell(r){
  if (!r.ri || !r.ri.length) return `<span class="sub">–</span>`;
  return r.ri.map(g => {
    const lab = g.k === "pick" ? "Pick 1" : g.k === "rand" ? "Random 1" : "";
    const job = g.job && g.job !== "Any Class" ? g.job : "";
    return `<div class="rgrp">${lab || job ? `<span class="rlab">${esc([lab, job].filter(Boolean).join(" · "))}</span>` : ""}${g.it.map(([id, n, ch]) =>
      `<span class="ri" tabindex="0" data-item="${id}" data-n="${n}"${ch != null ? ` data-ch="${ch}"` : ""}${job ? ` data-job="${esc(job)}"` : ""}>${D.iicons[id] ? `<img src="data:image/png;base64,${D.iicons[id]}" alt="${esc(D.items[id]?.n || "")}">` : `<i></i>`}${n > 1 ? `<b>${n}</b>` : ""}</span>`).join("")}</div>`;
  }).join("");
}
// one item icon with the item tooltip; small = inline size for plan rows
const itemIcon = (id, n = 1, small = false, extra = "") => D.items[id] ? `<span class="ri${small ? " sm" : ""}" tabindex="0" data-item="${id}" data-n="${n}"${extra}>${D.iicons[id] ? `<img src="data:image/png;base64,${D.iicons[id]}" alt="${esc(D.items[id].n)}">` : "<i></i>"}${n > 1 ? `<b>${n}</b>` : ""}</span>` : "";
// every reward item of a quest as small inline icons
const rewardIcons = r => (r.ri || []).flatMap(g => g.it.map(([id, n, ch]) => itemIcon(id, n, true, (ch != null ? ` data-ch="${ch}"` : "") + (g.job && g.job !== "Any Class" ? ` data-job="${esc(g.job)}"` : "")))).join("");
const STATNAME = {incSTR:"STR",incDEX:"DEX",incINT:"INT",incLUK:"LUK",incMHP:"MaxHP",incMMP:"MaxMP",incPAD:"Weapon Attack",incMAD:"Magic Attack",
  incPDD:"Weapon Defense",incMDD:"Magic Defense",incACC:"Accuracy",incEVA:"Avoidability",incSpeed:"Speed",incJump:"Jump",incCRD:"Critical Damage %",incCR:"Critical Rate %"};
const SPEC = {hp:"Restores {} HP",mp:"Restores {} MP",hpR:"Restores {}% HP",mpR:"Restores {}% MP",pad:"Weapon Attack +{}",mad:"Magic Attack +{}",acc:"Accuracy +{}",eva:"Avoidability +{}",speed:"Speed +{}"};
function itemTip(el){
  const id = el.dataset.item, it = D.items[id]; if (!it) return "";
  const st = it.st || {}, n = +el.dataset.n || 1;
  const req = [["reqLevel","LEV"],["reqSTR","STR"],["reqDEX","DEX"],["reqINT","INT"],["reqLUK","LUK"]].filter(([k]) => st[k] != null)
    .map(([k, l]) => `<span>REQ ${l}: ${st[k]}</span>`).join("");
  const isEq = it.c === "Equipment";
  const lines = [];
  if (isEq){
    lines.push(`Category: ${esc(it.wt || it.s)}`);
    if (it.spd) lines.push(`Attack Speed: ${esc(it.spd)}`);
    for (const [k, l] of Object.entries(STATNAME)) if (st[k]) lines.push(`${l}: +${st[k]}`);
    if (st.tuc != null) lines.push(`Number of upgrades available: ${st.tuc}`);
  }
  if (it.sp) for (const [k, v] of Object.entries(it.sp)) if (SPEC[k]) lines.push(SPEC[k].replace("{}", v));
  if (it.sp && it.sp.time) lines.push(`Lasts ${Math.round(it.sp.time / 60000)} min`);
  const odds = [el.dataset.job ? `${esc(el.dataset.job)} reward` : "", el.dataset.ch ? `${el.dataset.ch}% chance` : ""].filter(Boolean).join(" · ");
  return `<div class="it-h">${esc(it.n)}${n > 1 ? ` <span>x${n}</span>` : ""}</div>
    <div class="it-body">${D.iicons[id] ? `<img class="it-ico" src="data:image/png;base64,${D.iicons[id]}" alt="">` : ""}
      <div>${req ? `<div class="it-req">${req}</div>` : ""}${isEq && it.job ? `<div class="it-job">Job: ${esc(it.job)}</div>` : ""}
      ${!isEq ? `<div class="it-cat">${esc(it.c === "Scroll" ? "Scroll for " + it.s : (it.s && it.s !== it.c ? it.s : it.c || "Item"))}</div>` : ""}</div></div>
    ${lines.length ? `<div class="it-stats">${lines.join("<br>")}</div>` : ""}
    ${it.d ? `<div class="it-desc">${esc(it.d).replace(/\n/g, "<br>")}</div>` : ""}
    ${odds || it.p ? `<div class="it-foot">${odds}${odds && it.p ? " · " : ""}${it.p ? `Sells for ${fmt(it.p)} mesos` : ""}</div>` : ""}`;
}
// minimap with numbered exits; `star` = [x, y] marks an NPC; `hi` = a destination map id whose exit is highlighted;
// returns [minimap html, exits list html]
function minimap(id, star, hi){
  const mm = D.mmaps[id], name = D.maps[id]?.[0] || D.mapnames[id] || "";
  const P = (D.portals[id] || []).slice().sort((a, b) => a[0] - b[0]), num = {}, dests = [];
  for (const p of P) if (!(p[2] in num)){ num[p[2]] = dests.length + 1; dests.push(p[2]) }
  const [w0, h0] = D.mmdim[id] || [0, 0], k = w0 ? Math.min(372 / w0, 330 / h0, 3) : 1, w = Math.round(w0 * k), h = Math.round(h0 * k);
  const pos = (x, y) => `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
  const marks = P.map(([x, y, d, hid]) => `<span class="pt${hid ? " hid" : ""}${String(d) === String(hi) ? " on" : ""}" style="${pos(x, y)}">${num[d]}</span>`).join("")
    + (star ? `<span class="npcstar" style="${pos(star[0], star[1])}">★</span>` : "");
  const exits = dests.map(d => { const all = P.filter(p => p[2] === d), hid = all.every(p => p[3]), later = D.maps[d] && !D.maps[d][1];
    return `<li${String(d) === String(hi) ? ' class="on"' : ""}><b class="ptn${hid ? " hid" : ""}">${num[d]}</b>${D.mapnames[d] || D.maps[d] ? mapLink(d, D.mapnames[d] || D.maps[d][0]) : "map " + d}${hid ? " <span>hidden</span>" : ""}${later ? " <span>not at launch</span>" : ""}</li>` }).join("");
  return [mm ? `<div class="mmwrap"${w ? ` style="width:${w}px;height:${h}px"` : ""}><img class="mm" src="data:image/${D.mmapType};base64,${mm}" alt="Minimap of ${esc(name)}"${w ? ` width="${w}" height="${h}"` : ""}>${marks}</div>` : `<p>No minimap in the game files.</p>`,
    exits ? `<h5>Exits</h5><ul class="mexits">${exits}</ul>` : ""];
}
function mapTip(id){
  const m = D.maps[id] || [D.mapnames[id] || "", 1, []];
  const mobs = m[2].filter(([mid]) => D.mobs[mid]).sort((a, b) => b[1] - a[1])
    .map(([mid, n]) => `<li>${esc(D.mobs[mid][0])} <span>Lv ${D.mobs[mid][1]} · ×${n}</span></li>`).join("");
  const [mm, exits] = minimap(id);
  return `<div class="qt-h"><b>${esc(m[0])}</b></div>${mm}${exits}${mobs ? `<h5>Monsters (spawn points)</h5><ul class="mmobs">${mobs}</ul>` : ""}`;
}
function npcTip(id){
  const [name, locs] = D.npcs[id] || ["", []], img = D.npcimg[id], here = locs[0];
  const [mm] = here ? minimap(here[0], here[1] != null ? [here[1], here[2]] : null) : [""];
  const mapName = l => D.maps[l[0]]?.[0] || D.mapnames[l[0]] || "map " + l[0];
  return `<div class="spritehead">${img ? `<img class="sprite" src="data:image/png;base64,${img}" alt="">` : ""}<div class="qt-h"><b>${esc(name)}</b>
      <span>${here ? `Stands in ${esc(mapName(here))}${locs.length > 1 ? ` and ${locs.slice(1).map(l => esc(mapName(l))).join(", ")}` : ""}` : "Not on a launch map (Orbis, El Nath, Forgotten Hollow or an event)"}</span></div></div>
    ${here ? mm + (here[1] != null ? `<p class="sub">★ is where ${esc(name)} stands.</p>` : "") : ""}`;
}
function mobTip(id){
  const b = D.mobdb[id], m = D.mobs[id] || b && [b.name, +b.level, +b.hp, +b.exp, b.eva || 0, b.PDDamage || 0, b.MDDamage || 0, b.elements, b.undead]; if (!m) return "";
  const [name, lv, hp, ex, eva, pdd, mdd, el, undead] = m, img = D.mobimg[id];
  const els = Object.entries(el || {}).map(([e, v]) => `<span class="pill ${v === "Weak" ? "p-good" : v === "Immune" ? "p-bad" : "p-warn"}">${esc(v === "Weak" ? "weak to " : v === "Immune" ? "immune to " : "resists ")}${esc(e)}</span>`).join(" ");
  const where = Object.entries(D.maps).filter(([, mp]) => mp[1]).map(([mid, mp]) => [mp[0], (mp[2].find(s => String(s[0]) === id) || [0, 0])[1]])
    .filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<div class="spritehead">${img ? `<img class="sprite" src="data:image/png;base64,${img}" alt="">` : ""}<div class="qt-h"><b>${esc(name)}</b><span>Level ${lv}${undead ? " · undead" : ""}${D.latermobs.includes(id) ? " · not at launch" : ""}</span></div></div>
    <dl class="mstats">${row("HP", fmt(hp))}${row("EXP", fmt(ex))}${row("Avoid", eva)}${row("W.DEF", pdd)}${row("M.DEF", mdd)}</dl>
    ${els ? `<p class="mels">${els}</p>` : ""}
    ${where.length ? `<h5>Most spawns</h5><ul class="mmobs">${where.map(([n, c]) => `<li>${esc(n)} <span>×${c}</span></li>`).join("")}</ul>` : ""}`;
}
function showQtip(el){
  if (el.dataset.item){ qtip.innerHTML = itemTip(el); qtip.className = "itemtip" }
  else if (el.dataset.map){ qtip.innerHTML = mapTip(el.dataset.map); qtip.className = "maptip" }
  else if (el.dataset.npc){ qtip.innerHTML = npcTip(el.dataset.npc); qtip.className = "maptip" }
  else if (el.dataset.mob){ qtip.innerHTML = mobTip(el.dataset.mob); qtip.className = "maptip" }
  else { const r = (el.dataset.src === "cit" ? D.citq : D.quests)[+el.dataset.i]; if (!r) return; qtip.innerHTML = questTip(r); qtip.className = "" }
  qtip.hidden = false;
  placeQtip(el);
  const img = qtip.querySelector("img.mm");   // minimap size is only known once it has decoded
  if (img && !img.complete) img.addEventListener("load", () => { if (!qtip.hidden) placeQtip(el) }, {once: true});
}
function placeQtip(el){
  const a = el.getBoundingClientRect(), w = qtip.offsetWidth, h = qtip.offsetHeight, vw = innerWidth, vh = innerHeight;
  let x = Math.min(Math.max(8, a.left), vw - w - 8);
  let y = a.bottom + 8;
  if (y + h > vh - 8) y = Math.max(8, a.top - h - 8);
  qtip.style.left = x + "px"; qtip.style.top = y + "px";
}
const hideQtip = () => { qtip.hidden = true };
document.addEventListener("mouseover", e => { const el = e.target.closest && e.target.closest(".qname, .ri, .itname, .mname, .nname, .mobname"); if (el) showQtip(el) });
document.addEventListener("mouseout", e => { if (e.target.closest && e.target.closest(".qname, .ri, .itname, .mname, .nname, .mobname")) hideQtip() });
document.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest(".qname, .ri, .itname, .mname, .nname, .mobname"); if (el) showQtip(el) });
document.addEventListener("focusout", hideQtip);
document.querySelectorAll(".tblwrap").forEach(w => w.addEventListener("scroll", hideQtip, {passive:true}));
addEventListener("scroll", hideQtip, {passive:true});
addEventListener("keydown", e => { if (e.key === "Escape") hideQtip() });

let QSORT = {k:"mult", dir:-1}, QCHAIN = null;
$("#qrows").addEventListener("click", e => { const b = e.target.closest(".chainbtn"); if (!b) return; QCHAIN = b.dataset.chain; hideQtip(); renderQuests(); $("#qchainbar").scrollIntoView({block:"nearest"}) });
$("#qchainbar").addEventListener("click", e => { if (e.target.id === "qchainclear"){ QCHAIN = null; renderQuests() } });
try { const q = JSON.parse(localStorage.getItem("qsort") || "null"); if (q && q.k) QSORT = q } catch(e) {}
document.querySelectorAll("#qhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k;
  // first click: level and name go up, numbers go biggest-first; clicking again flips it
  QCHAIN = null;
  QSORT = QSORT.k === k ? {k, dir: -QSORT.dir} : {k, dir: (k === "lvl" || k === "name" || k === "kills") ? 1 : -1};
  try { localStorage.setItem("qsort", JSON.stringify(QSORT)) } catch(e) {}
  renderQuests();
}));
["#qmin","#qmax","#qsearch"].forEach(s => $(s).addEventListener("input", () => { QCHAIN = null; renderQuests() }));
$("#qval").addEventListener("click", () => {
  const on = $("#qval").getAttribute("aria-pressed") !== "true"; QCHAIN = null;
  $("#qval").setAttribute("aria-pressed", on);
  try { localStorage.setItem("qval", on ? "1" : "") } catch(e) {}
  renderQuests();
});
try { if (localStorage.getItem("qval")) $("#qval").setAttribute("aria-pressed", "true") } catch(e) {}
$("#qeq").addEventListener("click", () => {
  const on = $("#qeq").getAttribute("aria-pressed") !== "true"; QCHAIN = null;
  $("#qeq").setAttribute("aria-pressed", on);
  try { localStorage.setItem("qeq", on ? "1" : "") } catch(e) {}
  renderQuests();
});
try { if (localStorage.getItem("qeq")) $("#qeq").setAttribute("aria-pressed", "true") } catch(e) {}
renderQuests();


// "Fewer columns" (default on narrow screens): hides Chain, % of level, Bonus and Equals in the quest table
(() => { const b = $("#qcompact"), table = $("#qrows").closest("table");
  let on = innerWidth < 700; try { const v = localStorage.getItem("qcompact"); if (v !== null) on = v === "1" } catch(e) {}
  const set = v => { on = v; b.setAttribute("aria-pressed", on); table.classList.toggle("qcompact", on); try { localStorage.setItem("qcompact", on ? "1" : "0") } catch(e) {} };
  b.addEventListener("click", () => set(!on)); set(on) })();

/* ---------------- quest pages (Danny 10-25): click any quest name on the site for the quest's own page ----------------
   Same shape as the monster and item pages: the list folds away and the quest fills the section with its story, what
   it takes to accept it, what it asks for, the rewards (with the community verdict and their worth at player prices),
   the questline in order, the NPC who gives it and the quests it stacks with. Hover cards keep working everywhere. */
let QOPEN = null;   // {src: "q" | "cit", i} while a quest page is open, null on the list
const QLISTS = {q: D.quests, cit: D.citq};
const QSRC = {};   // quest id and name -> [src, record], for the prerequisite and previous/next links
for (const [src, list] of Object.entries(QLISTS)) for (const q of list){
  if (!(q.id in QSRC)) QSRC[q.id] = [src, q];
  if (!(q.name in QSRC)) QSRC[q.name] = [src, q];
}
const qlinkOf = key => { const f = QSRC[key]; return f ? qref(f[0], f[1]) : esc(key) };
function questPage(r, src){
  const i = r.info || {}, npcId = D.npcid[r.npc], sprite = npcId ? D.npcimg[npcId] : null;
  const st = (k, v, t) => v == null || v === "" ? "" : `<div${t ? ` title="${esc(t)}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`;
  const lis = a => (a || []).map(x => `<li>${esc(x)}</li>`).join("");
  const avail = r.region === "El Nath" || r.region === "Orbis" ? `<span class="pill p-bad">not in launch</span>`
    : r.region === "Forgotten Hollow" ? `<span class="pill p-warn">opens later</span>` : "";
  const mesos = i.mesos || r.mesos, contrib = i.contrib || r.contrib;
  const mates = (src === "cit" ? D.citq : QLAUNCH).filter(x => x.chain === r.chain).sort((a, b) => (a.cpos ?? a.lvl) - (b.cpos ?? b.lvl));
  const stacks = stackWith(r), asks = reqHTML(r);
  const pre = (r.pre || []).filter(p => QSRC[p]);
  const val = VALUE[r.id];
  return `<div class="mpage">
    <div class="mpbar"><button class="btn" id="qback">${src === "cit" ? "← Close" : "← All quests"}</button><button class="btn" id="qdshare">Copy link</button></div>
    <div class="mhead"><div class="mtop">${sprite ? `<img class="sprite" src="data:image/png;base64,${sprite}" alt="">` : ""}<div>
      <h2>${esc(r.name)}</h2>
      <p class="sub">Lv ${r.lvl} · from ${npcLink(r.npc) || "?"} · ${esc(r.region || "")}${r.chain ? ` · ${esc(r.chain)} questline` : ""}${r.rep ? ` · <span class="pill p-warn">${esc(r.rep)}</span>` : ""}</p>
      ${avail || val ? `<p class="mflags">${avail ? avail + " " : ""}${val ? vPill(r.id) : ""}</p>` : ""}</div></div></div>
    ${i.d ? `<p class="idesc">${esc(i.d).replace(/\n/g, "<br>")}</p>` : ""}
    <h3 class="msec">At a glance</h3>
    <dl class="stats mgrid">${st("EXP", r.exp ? fmt(r.exp) + (r.pct_level != null ? ` (${r.pct_level}% of level ${r.lvl})` : "") : null)}
      ${st("Mesos", mesos ? fmt(mesos) : null)}${st("Contribution", contrib ? fmt(contrib) : null, "Citizenship contribution for turning it in")}
      ${st("Bonus", r.mult ? r.mult.toFixed(1) + "× the EXP of the kills it asks for" : null)}
      ${st("Equals", r.eq_kills ? `${fmt(r.eq_kills)} ${mobLink(r.eq_mob)} kills` : null, "The quest's EXP counted as kills of its target monster: fewer kills than this and the quest beats grinding")}
      ${st("Quest ID", String(r.id))}</dl>
    <div class="mcols">
      <div><h4>To accept</h4>${(i.req || []).length || pre.length
        ? `${(i.req || []).length ? `<ul class="mlist">${lis(i.req)}</ul>` : ""}${pre.length ? `<p class="sub">Comes after:</p><ul class="mlist">${pre.map(p => `<li>${qlinkOf(p)}</li>`).join("")}</ul>` : ""}`
        : `<p class="sub">Nothing beyond reaching ${npcLink(r.npc) || "the NPC"} and being around level ${r.lvl}.</p>`}</div>
      <div><h4>What it asks</h4>${asks ? `<p>${asks}</p>` : `<p class="sub">Nothing to hunt or gather: talk, deliver, come back.</p>`}</div>
      ${i.start && i.start.length ? `<div><h4>You're given</h4><ul class="mlist">${lis(i.start)}</ul></div>` : ""}
    </div>
    <h3 class="msec">Rewards</h3>
    <div class="mcols">
      <div>${(r.ri || []).length ? rewardCell(r) : `<p class="sub">No item rewards.</p>`}
        ${(i.items || []).length ? `<p class="sub">Also: ${esc(i.items.join("; "))}</p>` : ""}</div>
      <div>${marketCell(r)}${val ? `<h4>Why players do it · ${VTIER[val[0]][0]}</h4><p>${esc(val[2])} <span class="sub">(${val[4].map(k => esc(VSRC[k][0])).join("; ")})</span></p>` : ""}</div>
    </div>
    ${r.chain ? `<h3 class="msec">Questline: ${esc(r.chain)}</h3><ul class="mlist">${mates.map(q =>
      `<li>${q === r ? `<b>${esc(q.name)}</b> <span class="pill p-hot">this page</span>` : qref(src, q)} <span class="sub">Lv ${q.lvl} · ${fmt(q.exp)} EXP${q.cpos ? ` · ${q.cpos} of ${q.cn}` : ""}</span></li>`).join("")}</ul>
      ${i.prev ? `<p class="sub">Comes after: ${qlinkOf(i.prev)}.</p>` : ""}${i.next ? `<p class="sub">Leads to: ${qlinkOf(i.next)}.</p>` : ""}` : ""}
    <div class="mcols">
      <div><h4>Who gives it</h4>${npcId && (D.npcs[npcId] || D.npcimg[npcId]) ? npcTip(npcId) : `<p class="sub">${esc(r.npc || "The giver")} is not in the launch files.</p>`}</div>
      ${stacks.length ? `<div><h4>Stacks with</h4><ul class="mlist">${stacks.map(([s, q]) => `<li>${qref(s, q)} <span class="sub">Lv ${q.lvl}</span></li>`).join("")}</ul><p class="sub">Other quests within 10 levels that need the same monster, so the kills can share a trip.</p></div>` : ""}
    </div>
  </div>`;
}
function showQuests(){
  const r = QOPEN && (QLISTS[QOPEN.src] || QLISTS.q)[QOPEN.i];
  $("#qlist").hidden = !!r; $("#qpage").hidden = !r;
  if (!r) renderQuests(); else $("#qpage").innerHTML = questPage(r, QOPEN.src);
}
function openQuest(src, i, scroll = true){
  const list = QLISTS[src] || QLISTS.q, r = list[i];
  if (!r){ QOPEN = null; showQuests(); if (scroll) $("#quests").scrollIntoView({block: "start"}); return }
  const same = QOPEN && QOPEN.src === src && QOPEN.i === i && !$("#qpage").hidden;
  QOPEN = {src, i}; showQuests();
  if (scroll) (same ? $("#qpage") : $("#quests")).scrollIntoView({block: "start"});
}
$("#qpage").addEventListener("click", e => {
  if (e.target.id === "qback"){ QOPEN = null; showQuests(); return }
  if (e.target.id === "qdshare" && QOPEN) return copyShare(e.target, shareUrl("Q", QOPEN.src + ":" + QOPEN.i));
});
// a quest name anywhere on the site (the table, item and monster pages, the planner, the quest log, citizenship)
// opens its page here
document.addEventListener("click", e => { const el = e.target.closest && e.target.closest(".qname"); if (!el) return;
  const src = QLISTS[el.dataset.src] ? el.dataset.src : "q";
  if (!QLISTS[src][+el.dataset.i]) return;
  hideQtip(); $("#t-quests").click(); openQuest(src, +el.dataset.i) });
if (HASH.Q){ const m = /^([qc]):(\d+)$/.exec(String(HASH.Q)); if (m && QLISTS[m[1]][+m[2]]){ QOPEN = {src: m[1], i: +m[2]}; setTimeout(showQuests) } }
navReg("quests", () => QOPEN ? `d:${QOPEN.src}:${QOPEN.i}` : (QCHAIN || ""), v => {
  if (typeof v === "string" && v.slice(0, 2) === "d:"){ const p = v.split(":"); openQuest(p[1], +p[2], false) }
  else { QOPEN = null; QCHAIN = v || null; showQuests() }
});
