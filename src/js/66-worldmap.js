/* ---------------- world map ---------------- */
(() => {
// the client's own world maps (WorldMap.wz via maplestory.io, Classic World COT2 client) with a dot per map spot.
// Hovering a dot fills the side card: maps in that spot, monsters, EXP/hr at your class and level (same model as
// Where to train), NPCs, quests, cab and potion shop. Clicking a dot pins it; map names open the Map Navigator.
const KIND = {0: "Town", 1: "Field", 2: "Dungeon", 3: "Field"};
const mapName = id => D.maps[id]?.[0] || D.mapnames[id] || "";
const known = id => !!(D.maps[id] || D.mapnames[id]);
const NPCAT = {};   // mapId -> [npc names]
for (const [name, locs] of Object.values(D.npcs)) for (const [mid] of locs) (NPCAT[mid] = NPCAT[mid] || []).includes(name) || NPCAT[mid].push(name);
const QBY = {};     // npc name -> [[src, row]]
for (const [src, rows] of [["q", D.quests], ["cit", D.citq]]) for (const r of rows) (QBY[r.npc] = QBY[r.npc] || []).push([src, r]);
const POT = Object.fromEntries(D.potshops.map(([npc, mid]) => [String(mid), npc]));
const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;

let S = {isl: 1, cls: "Warrior", lv: 10, pin: null, mm: null};
try { Object.assign(S, JSON.parse(localStorage.getItem("wmap") || "{}")) } catch(e) {}
const save = () => { try { localStorage.setItem("wmap", JSON.stringify({isl: S.isl, cls: S.cls, lv: S.lv})) } catch(e) {} };
S.pin = null;

// EXP/hr per map for the chosen class and level: the Character Builder's default build, solo, single target (as on monster pages)
let R = {}, DEF = null, RL = "";
function rates(){
  const L = Math.max(1, Math.min(100, +S.lv || 10)), base = baseClass(S.cls);
  const JOB = {Warrior: ["Warrior", "Fighter"], Magician: ["Magician", "F/P Wizard"], Bowman: ["Archer", "Hunter"], Thief: ["Rogue", "Assassin"]};
  const branch = L >= 30 ? (MAGIC.has(S.cls) && S.cls !== "Magician" ? S.cls : JOB[base][1]) : JOB[base][0];
  const b = buildAt(base, branch, null, L), dps = b.dps > 0 ? b.dps : 20 * L;
  const mc = L < 10 ? "Warrior" : base === "Magician" ? (L >= 30 ? branch : "Magician") : base;
  R = Object.fromEntries(mapRates(mc, L, dps, b.acc, Infinity, null, 1).map(r => [r.id, r]));
  DEF = defaultDef(mc, L); RL = `level ${L} ${L >= 30 ? branch : S.cls}`;
}
const spotRate = sp => Math.max(0, ...sp[3].map(id => R[id] && D.maps[id]?.[1] ? R[id].rate : 0));
const mobRange = ids => { const lv = ids.flatMap(id => (D.maps[id]?.[2] || []).map(([m]) => D.mobs[m]?.[1]).filter(Boolean));
  return lv.length ? (Math.min(...lv) === Math.max(...lv) ? `Lv ${lv[0]}` : `Lv ${Math.min(...lv)}–${Math.max(...lv)}`) : "" };

function renderMap(){
  const W = D.wmap[S.isl], [, island, w, h, img, spots] = W;
  const best = Math.max(1, ...spots.map(spotRate));
  // top 3 spots for your level on this island
  const rank = spots.map((sp, i) => [i, spotRate(sp)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  $("#wmisl").querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", +b.dataset.i === S.isl));
  $("#wmmap").style.aspectRatio = `${w} / ${h}`;
  $("#wmmap").innerHTML = `<img src="data:image/webp;base64,${img}" alt="World map of ${esc(island)}" width="${w}" height="${h}">` + spots.map((sp, i) => {
    const [x, y, t, ids] = sp, open = ids.some(known), r = spotRate(sp), k = rank.indexOf(i);
    const heat = r ? Math.round(100 * r / best) : 0;
    return `<button type="button" class="wmdot k${t}${open ? "" : " off"}${S.pin === i ? " pin" : ""}" data-i="${i}" style="left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%${r ? `;--heat:${heat}%` : ""}"
      aria-label="${esc(mapName(ids.find(known)) || "Not open at launch")}">${k >= 0 ? `<b>${k + 1}</b>` : ""}</button>`;
  }).join("") + `<span id="wmlabel" hidden></span>`;
}

function card(i){
  const [, island, , , , spots] = D.wmap[S.isl], [, , t, ids] = spots[i], open = ids.filter(known);
  if (!open.length) return `<div class="qt-h"><b>Not open at launch</b><span>${esc(island)} · ${KIND[t]}</span></div>
    <p class="sub">The client marks ${ids.length} map${ids.length === 1 ? "" : "s"} here, but none of them are in the launch game files.</p>`;
  const main = open[0], fights = open.filter(id => D.maps[id]?.[2]?.length);
  // monsters across every map in the spot: total spawn points
  const mobs = {}; for (const id of fights) for (const [m, c] of D.maps[id][2]) if (D.mobs[m]) mobs[m] = (mobs[m] || 0) + c;
  const npcs = [...new Set(open.flatMap(id => NPCAT[id] || []))];
  const qs = npcs.flatMap(n => QBY[n] || []).sort((a, b) => a[1].lvl - b[1].lvl);
  const pots = open.filter(id => POT[id]), cab = open.some(id => D.cabs.includes(id));
  const mmId = open.includes(S.mm) ? S.mm : (fights[0] || main);
  // minimap with each monster's spawn points (export spawn data, D.mobdb[].sp), one color per monster
  const here = (D.maps[mmId]?.[2] || []).filter(([m]) => D.mobs[m]).sort((a, b) => D.mobs[a[0]][1] - D.mobs[b[0]][1]);
  const dots = here.map(([m], k) => (D.mobdb[m]?.sp?.[mmId] || []).map(([x, y]) => `<span class="mspot c${k % 8}" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%"></span>`).join("")).join("");
  let [mm, exits] = minimap(mmId);
  if (dots && mm.includes('class="mmwrap"')) mm = mm.replace(/<\/div>$/, dots + "</div>");
  const legend = here.length ? `<ul class="wmleg">${here.map(([m, c], k) => `<li><i class="mspot c${k % 8}"></i>${mobLink(m)} <span>Lv ${D.mobs[m][1]} · ×${c}</span></li>`).join("")}</ul>` : "";
  const rest = open.filter(id => !fights.includes(id));
  const rows = fights.map(id => { const r = R[id], mp = D.maps[id], dg = mp?.[2]?.length && DEF ? mapDanger(id, +S.lv || 10, DEF) : null;
    return `<tr class="wmrow${id === mmId ? " sel" : ""}" data-map="${id}"><td>${mapLink(id, mapName(id))}${mp && !mp[1] ? ' <span class="pill p-warn">not at launch</span>' : ""}<div class="sub">${mobRange([id])}</div></td>
      <td>${dg ? dangerPill({f: dg.f}) : ""}</td><td class="num">${r && mp?.[1] ? fmt(r.rate * 3600) : "–"}</td></tr>` }).join("");
  const mobRows = Object.entries(mobs).sort((a, b) => D.mobs[a[0]][1] - D.mobs[b[0]][1]).map(([m, c]) => { const x = D.mobs[m];
    return `<li>${mobLink(m)} <span>Lv ${x[1]} · ${fmt(x[2])} HP · ${fmt(x[3])} EXP · ×${c}</span></li>` }).join("");
  const svc = [cab ? "Cab" : "", ...pots.map(id => `Potions: ${npcLink(POT[id])} (${esc(mapName(id))})`)].filter(Boolean);
  return `<div class="qt-h"><b>${esc(mapName(main))}</b><span>${esc(island)} · ${KIND[t]}${mobRange(open) ? " · monsters " + mobRange(open) : ""}${open.length > 1 ? ` · ${open.length} maps` : ""}</span></div>
    <div class="wmact"><button type="button" class="btn" data-route="${main}">Route here</button>${svc.length ? `<span class="sub">${svc.join(" · ")}</span>` : ""}</div>
    ${rows ? `<div class="tblwrap"><table class="mini"><thead><tr><th>Map</th><th>Danger</th><th class="num">EXP/hr</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    ${rest.length ? `<h5>${fights.length ? "Other maps here" : "Maps here"}</h5><p class="wmnpcs">${rest.map(id => mapLink(id, mapName(id))).join(", ")}</p>` : ""}
    <h5>Minimap: ${esc(mapName(mmId))}</h5><div class="mfmap">${mm}${legend}${exits}</div>
    ${ids.length > open.length ? `<p class="tiny">+${ids.length - open.length} more map${ids.length - open.length === 1 ? "" : "s"} the client lists here that aren't in the launch files.</p>` : ""}
    ${mobRows ? `<h5>Monsters (spawn points)</h5><ul class="mmobs">${mobRows}</ul>` : ""}
    ${npcs.length ? `<h5>NPCs</h5><p class="wmnpcs">${npcs.map(npcLink).join(", ")}</p>` : ""}
    ${qs.length ? `<h5>Quests from NPCs here (${qs.length})</h5><ul class="mmobs">${qs.map(q => `<li>${qn(q)} <span>Lv ${q[1].lvl}${q[0] === "cit" ? " · Citizenship" : ""} · ${esc(q[1].npc)}</span></li>`).join("")}</ul>` : ""}
    `;
}
let shown = null;
function show(i){
  if (i == null){ $("#wmcard").innerHTML = `<p class="sub">Hover a dot (tap on a phone) to see that place.</p>`; shown = null; return }
  if (i !== shown) S.mm = null;
  shown = i; $("#wmcard").innerHTML = card(i);
  document.querySelectorAll(".wmdot").forEach(d => d.classList.toggle("on", +d.dataset.i === i));
}
function render(){
  rates(); renderMap(); show(S.pin);
  $("#wmnote").textContent = `Dot color and EXP/hr: estimate for a ${RL} with the Character Builder's default build, solo, single target (same model as Where to train). Numbers 1-3 = best EXP/hr on this island.`;
}

$("#wmisl").innerHTML = D.wmap.map((w, i) => `<button type="button" data-i="${i}" aria-checked="false">${esc(w[1])}</button>`).join("");
$("#wmcls").value = S.cls; $("#wmlv").value = S.lv;
$("#wmisl").addEventListener("click", e => { const b = e.target.closest("button"); if (b){ S.isl = +b.dataset.i; S.pin = null; save(); render() } });
$("#wmcls").addEventListener("change", e => { S.cls = e.target.value; save(); render() });
$("#wmlv").addEventListener("change", e => { S.lv = Math.max(1, Math.min(100, +e.target.value || 10)); save(); render() });
// find a map: switch island, pin its dot
const FIND = {};
D.wmap.forEach(([, , , , , spots], isl) => spots.forEach(([, , , ids], i) => ids.filter(known).forEach(id => { const n = mapName(id).trim();
  if (!(n.toLowerCase() in FIND)) FIND[n.toLowerCase()] = [isl, i, id, n] })));
$("#wmlist").innerHTML = Object.values(FIND).map(f => `<option value="${esc(f[3])}">`).join("");
$("#wmfind").addEventListener("change", e => { const f = FIND[e.target.value.trim().toLowerCase()]; if (!f) return;
  S.isl = f[0]; S.pin = f[1]; save(); render(); S.mm = f[2]; show(f[1]) });

const map = $("#wmmap"), label = () => $("#wmlabel");
map.addEventListener("mouseover", e => { const d = e.target.closest(".wmdot"); if (!d) return; const i = +d.dataset.i;
  if (i !== shown) show(i);
  const sp = D.wmap[S.isl][5][i], n = mapName(sp[3].find(known)) || "Not open at launch", l = label();
  l.textContent = n + (mobRange(sp[3]) ? " · " + mobRange(sp[3]) : ""); l.hidden = false;
  l.style.left = d.style.left; l.style.top = d.style.top; l.classList.toggle("left", parseFloat(d.style.left) > 60) });
map.addEventListener("mouseleave", () => { label().hidden = true; if (S.pin != null && shown !== S.pin) show(S.pin) });
map.addEventListener("focusin", e => { const d = e.target.closest(".wmdot"); if (d) show(+d.dataset.i) });
map.addEventListener("click", e => { const d = e.target.closest(".wmdot"); if (!d) return; const i = +d.dataset.i;
  S.pin = S.pin === i ? null : i; document.querySelectorAll(".wmdot").forEach(x => x.classList.toggle("pin", +x.dataset.i === S.pin)); show(i) });
$("#wmcard").addEventListener("click", e => {
  const r = e.target.closest("[data-route]");
  if (r){ const s = document.createElement("span"); s.className = "mname"; s.dataset.map = r.dataset.route; s.hidden = true; document.body.append(s); s.click(); s.remove(); return }
  const row = e.target.closest(".wmrow"); if (row && !e.target.closest(".mname")){ S.mm = row.dataset.map; show(shown) } });
render();
})();
