/* quests: launch content only (Orbis, El Nath and Forgotten Hollow aren't open at launch) */
const QLAUNCH = D.quests.filter(r => !["El Nath","Orbis","Forgotten Hollow"].includes(r.region));
function renderQuests(){
  const lo = +$("#qmin").value || 0, hi = +$("#qmax").value || 100, s = $("#qsearch").value.trim().toLowerCase();
  let q = QLAUNCH.filter(r => r.lvl >= lo && r.lvl <= hi);
  if (s) q = q.filter(r => (r.name + r.npc + r.req + r.reward).toLowerCase().includes(s));
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
  $("#qrows").innerHTML = q.map(r => `<tr>
    <td class="num">${r.lvl}</td>
    <td><span class="name qname" tabindex="0" data-src="q" data-i="${D.quests.indexOf(r)}">${esc(r.name)}</span> ${vPill(r.id)}${VALUE[r.id] ? `<div class="vwhy"><b>${esc(VALUE[r.id][1])}</b>${VALUE[r.id][3] ? ` · ${esc(VALUE[r.id][3])} only` : ""} · ${esc(VALUE[r.id][2])} <span class="sub">(${vSrc(VALUE[r.id])})</span></div>` : ""}<div class="sub">${esc(r.npc || "")} · ${esc(r.region || "")}${r.rep ? ` · <span class="pill p-warn">${r.rep}</span>` : ""}${r.region === "El Nath" || r.region === "Orbis" ? ` · <span class="pill p-bad">not in launch</span>` : r.region === "Forgotten Hollow" ? ` · <span class="pill p-warn">opens later</span>` : ""}</div></td>
    <td>${r.chain ? `<button class="chainbtn" data-chain="${esc(r.chain)}" title="Show the ${esc(r.chain)} questline">Yes</button><div class="sub">${r.cpos} of ${r.cn}</div>` : `<span class="sub">No</span>`}</td>
    <td class="sub">${esc(r.req)}</td>
    <td class="num">${fmt(r.exp)}</td>
    <td class="num">${r.pct_level ?? "–"}${r.pct_level != null ? "%" : ""}</td>
    <td class="num">${r.mult ? `<span class="pill ${r.mult >= 2 ? "p-hot" : "p-good"}">${r.mult.toFixed(1)}×</span>` : "–"}</td>
    <td class="sub">${r.eq_kills ? `${fmt(r.eq_kills)} ${esc(r.eq_mob)}` : "–"}</td>
    <td>${rewardCell(r)}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">No quests match. Widen the level range, clear the search or turn off "Equipment rewards only".</td></tr>`;
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
function mapTip(id){
  const m = D.maps[id]; if (!m) return "";
  const mm = D.mmaps[id], mobs = m[2].filter(([mid]) => D.mobs[mid]).sort((a, b) => b[1] - a[1])
    .map(([mid, n]) => `<li>${esc(D.mobs[mid][0])} <span>Lv ${D.mobs[mid][1]} · ×${n}</span></li>`).join("");
  // exits: one number per destination, left to right; hidden passages dashed
  const P = (D.portals[id] || []).slice().sort((a, b) => a[0] - b[0]), num = {}, dests = [];
  for (const p of P) if (!(p[2] in num)){ num[p[2]] = dests.length + 1; dests.push(p[2]) }
  const [w0, h0] = D.mmdim[id] || [0, 0], k = w0 ? Math.min(372 / w0, 330 / h0, 3) : 1, w = Math.round(w0 * k), h = Math.round(h0 * k);
  const marks = P.map(([x, y, d, hid]) => `<span class="pt${hid ? " hid" : ""}" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%">${num[d]}</span>`).join("");
  const exits = dests.map(d => { const all = P.filter(p => p[2] === d), hid = all.every(p => p[3]), later = D.maps[d] && !D.maps[d][1];
    return `<li><b class="ptn${hid ? " hid" : ""}">${num[d]}</b>${esc(D.mapnames[d] || D.maps[d]?.[0] || "map " + d)}${hid ? " <span>hidden</span>" : ""}${later ? " <span>not at launch</span>" : ""}</li>` }).join("");
  return `<div class="qt-h"><b>${esc(m[0])}</b></div>
    ${mm ? `<div class="mmwrap"${w ? ` style="width:${w}px;height:${h}px"` : ""}><img class="mm" src="data:image/${D.mmapType};base64,${mm}" alt="Minimap of ${esc(m[0])}"${w ? ` width="${w}" height="${h}"` : ""}>${marks}</div>` : `<p>No minimap in the game files.</p>`}
    ${exits ? `<h5>Exits</h5><ul class="mexits">${exits}</ul>` : ""}
    ${mobs ? `<h5>Monsters (spawn points)</h5><ul class="mmobs">${mobs}</ul>` : ""}`;
}
function showQtip(el){
  if (el.dataset.item){ qtip.innerHTML = itemTip(el); qtip.className = "itemtip" }
  else if (el.dataset.map){ qtip.innerHTML = mapTip(el.dataset.map); qtip.className = "maptip" }
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
document.addEventListener("mouseover", e => { const el = e.target.closest && e.target.closest(".qname, .ri, .mname"); if (el) showQtip(el) });
document.addEventListener("mouseout", e => { if (e.target.closest && e.target.closest(".qname, .ri, .mname")) hideQtip() });
document.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest(".qname, .ri, .mname"); if (el) showQtip(el) });
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

