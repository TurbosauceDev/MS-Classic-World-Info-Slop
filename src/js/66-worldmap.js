/* ---------------- world map ---------------- */
(() => {
// the client's own world maps (WorldMap.wz via maplestory.io, Classic World COT2 client) with a dot per map spot.
// Hovering a dot fills the side card: maps in that spot, monsters, EXP/hr at your class and level (same model as
// Where to train), NPCs, quests, cab and potion shop. Clicking a dot pins it. A map name anywhere on the page opens
// this tab with its card (openMapInfo); "Route here" opens the Map Navigator.
const KIND = {0: "Town", 1: "Field", 2: "Dungeon", 3: "Field"};
const mapName = id => D.maps[id]?.[0] || D.mapnames[id] || "";
const known = id => !!(D.maps[id] || D.mapnames[id]);
const NPCAT = {};   // mapId -> [npc names]
for (const [name, locs] of Object.values(D.npcs)) for (const [mid] of locs) (NPCAT[mid] = NPCAT[mid] || []).includes(name) || NPCAT[mid].push(name);
const QBY = {};     // npc name -> [[src, row]]
for (const [src, rows] of [["q", D.quests], ["cit", D.citq]]) for (const r of rows) (QBY[r.npc] = QBY[r.npc] || []).push([src, r]);
const POT = Object.fromEntries(D.potshops.map(([npc, mid]) => [String(mid), npc]));
const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;

let S = {isl: 1, cls: "Warrior", lv: 10, pin: null, mm: null, mob: null, sub: null, subPin: null, uv: false};
try { Object.assign(S, JSON.parse(localStorage.getItem("wmap") || "{}")) } catch(e) {}
const save = () => { try { localStorage.setItem("wmap", JSON.stringify({isl: S.isl, cls: S.cls, lv: S.lv, mob: S.mob, uv: S.uv})) } catch(e) {} };
S.pin = null; S.sub = null; S.subPin = null; if (!D.mobdb[S.mob]) S.mob = null;
// spawn count of the searched monster in each map (export spawn list: every launch map, incl. bosses, KPQ, job test)
const mobAt = id => S.mob ? (D.mobdb[S.mob].maps.filter(m => String(m[0]) === id).reduce((a, m) => a + (m[2] || 0), 0) || (D.mobdb[S.mob].maps.some(m => String(m[0]) === id) ? 1 : 0)) : 0;
const spotMob = sp => sp[3].reduce((a, id) => a + mobAt(id), 0);
// "Undervalued maps" (64-undervalued.js): green = a quieter pick, red ring = a map the guides call busy, rest dimmed. Ignores class and level.
const uvOn = () => S.uv && !S.mob;
const uvCls = ids => !uvOn() ? "" : ids.some(id => id in UV) ? " uv" : ids.some(id => UV_PACKED[id]) ? " pk" : " dim";
const uvSrc = k => [...k].map(c => UV_SRC[c][1] ? `<a href="${UV_SRC[c][1]}" target="_blank" rel="noopener">${esc(UV_SRC[c][0])}</a>` : esc(UV_SRC[c][0])).join(", ");
// reported drops of the monsters on these maps (meowdb player reports), dearest first by meso.watch median
const DROPBY = {}; for (const [it, ms] of Object.entries(D.drops || {})) if (D.items[it]) for (const [mob] of ms) (DROPBY[mob] ||= []).push(it);
const dearDrops = ids => [...new Set(ids.flatMap(id => (D.maps[id]?.[2] || []).flatMap(([m]) => DROPBY[m] || [])))].filter(pwSolid).sort((a, b) => pwSolid(b) - pwSolid(a)).slice(0, 5);
function uvBox(open){
  const picks = [...new Set(open.filter(id => id in UV).map(id => UV[id]))].map(i => UV_PICKS[i]), busy = open.filter(id => UV_PACKED[id]), dd = dearDrops(open);
  return `<div class="wmuv">${picks.map(([ids, a, b, inst, why, src]) => `<p><span class="pill p-good">quieter pick</span> <b>${ids.map(id => mapLink(id, mapName(id))).join(", ")}</b> · Lv ${a}–${b}, instead of ${esc(inst)}. ${esc(why)} <span class="tiny">Source: ${uvSrc(src)}</span></p>`).join("")}
    ${busy.map(id => `<p><span class="pill p-warn">expect a crowd</span> ${mapLink(id, mapName(id))}: ${esc(UV_PACKED[id])}.</p>`).join("")}
    ${!picks.length && !busy.length ? `<p class="sub">Not on the undervalued list, and no guide calls it busy.</p>` : ""}
    ${dd.length ? `<p class="sub">Dearest reported drops here: ${dd.map(it => `<span class="itname" tabindex="0" data-item="${it}">${esc(D.items[it].n)}</span> ~${fmt(pwSolid(it))}`).join(", ")} <span class="tiny">(player-shop median, meso.watch ${esc(D.pw.read)}; drop chances unknown)</span></p>` : ""}</div>`;
}

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

// dungeon spots (Sleepywood) open a sub-map: every map in the spot as a node, lines = walkable map exits (D.nav, from the
// launch portals), grey nodes = maps outside the spot it joins. Layout is a plain spring layout, not the game's geography.
const DRILL = sp => sp[2] === 2 && sp[3].filter(id => D.nav[id]).length >= 5;
const LAYOUT = {};
const areaName = sp => mapName(sp[3].find(id => D.cabs.includes(id)) || sp[3].find(known));
const openArea = (i, pin = null) => { S.sub = i; S.subPin = pin; S.pin = i; const l = $("#wmlabel"); if (l) l.hidden = true; save(); render(); $("#wmap").scrollIntoView({block: "start"}) };
const SW = 820, SH = 720;   // sub-map drawing size (px); labels ~5.6 px a letter at this size
function subGraph(isl, i){
  const key = isl + ":" + i; if (LAYOUT[key]) return LAYOUT[key];
  const ids = D.wmap[isl][5][i][3].filter(id => D.nav[id] || known(id)), inside = new Set(ids), out = new Set(), E = [], seen = new Set();
  for (const a of ids) for (const b of D.nav[a] || []){ if (!inside.has(b)) out.add(b);
    const k = a < b ? a + "-" + b : b + "-" + a; if (!seen.has(k)){ seen.add(k); E.push([a, b]) } }
  const all = [...ids, ...out], adj = {}; for (const id of all) adj[id] = [];
  for (const [a, b] of E){ adj[a].push(b); adj[b].push(a) }
  // the part joined to the town gets the spring layout; maps reached only through an NPC (jump quest steps) go in a row at the bottom
  const root = ids.find(id => D.cabs.includes(id)) || ids[0], main = new Set([root]), q = [root];
  while (q.length){ const u = q.shift(); for (const v of adj[u]) if (!main.has(v)){ main.add(v); q.push(v) } }
  const N = all.filter(id => main.has(id)), rest = all.filter(id => !main.has(id)).sort(), n = N.length, at = Object.fromEntries(N.map((id, j) => [id, j]));
  const P = N.map((_, j) => [Math.cos(2 * Math.PI * j / n), Math.sin(2 * Math.PI * j / n)]), K = 1.2 * Math.sqrt(4 / n);
  for (let it = 0, T = 0.3; it < 700; it++, T *= 0.993){   // Fruchterman-Reingold with a pull to the middle
    const F = N.map(() => [0, 0]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++){ const dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], d = Math.max(0.01, Math.hypot(dx, dy)), f = K * K / d;
      F[a][0] += dx / d * f; F[a][1] += dy / d * f; F[b][0] -= dx / d * f; F[b][1] -= dy / d * f }
    for (const [u, v] of E){ if (!(u in at) || !(v in at)) continue; const a = at[u], b = at[v], dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], d = Math.max(0.01, Math.hypot(dx, dy)), f = d * d / K;
      F[a][0] -= dx / d * f; F[a][1] -= dy / d * f; F[b][0] += dx / d * f; F[b][1] += dy / d * f }
    for (let a = 0; a < n; a++){ F[a][0] -= P[a][0] * 0.4; F[a][1] -= P[a][1] * 0.4;
      const m = Math.hypot(F[a][0], F[a][1]) || 1, s = Math.min(m, T); P[a][0] += F[a][0] / m * s; P[a][1] += F[a][1] / m * s }
  }
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), yb = rest.length ? 0.8 : 0.93;
  const pos = Object.fromEntries(N.map((id, j) => [id, [0.08 + 0.84 * (P[j][0] - x0) / (x1 - x0 || 1), 0.1 + (yb - 0.1) * (P[j][1] - y0) / (y1 - y0 || 1)]]));
  rest.forEach((id, j) => { pos[id] = [0.06 + 0.88 * (j + 0.5) / rest.length, 0.92] });
  // short labels in that row when they share a long prefix ("The Deep Forest of Patience <Step 1>" -> "<Step 1>")
  const lab = {}, rn = rest.map(mapName); let pre = rn.length > 1 ? rn[0] : "";
  for (const t of rn) while (!t.startsWith(pre)) pre = pre.slice(0, -1);
  pre = pre.length >= 8 ? pre.replace(/\S+\s*$/, "") : "";
  rest.forEach(id => { if (pre) lab[id] = mapName(id).slice(pre.length) });
  const label = id => lab[id] || mapName(id);
  // label sides: below, else above, right, left, whichever overlaps fewest labels and nodes placed so far
  const side = {}, boxes = [], dots = all.map(id => [pos[id][0] * SW - 7, pos[id][1] * SH - 7, 14, 14]);
  const hits = (r, list) => list.filter(o => r[0] < o[0] + o[2] && o[0] < r[0] + r[2] && r[1] < o[1] + o[3] && o[1] < r[1] + r[3]).length;
  for (const id of all.slice().sort((a, b) => (b === root) - (a === root) || pos[a][1] - pos[b][1])){
    const x = pos[id][0] * SW, y = pos[id][1] * SH, w = 5.6 * label(id).length + 4, h = 13;
    const opts = {b: [x - w / 2, y + 8, w, h], t: [x - w / 2, y - 8 - h, w, h], r: [x + 9, y - h / 2, w, h], l: [x - 9 - w, y - h / 2, w, h]};
    const pick = Object.entries(opts).map(([k, r]) => [k, r, 3 * hits(r, boxes) + hits(r, dots) + (r[0] < 0 || r[0] + r[2] > SW ? 5 : 0)]).sort((p, q) => p[2] - q[2])[0];
    side[id] = pick[0]; boxes.push(pick[1]);
  }
  return LAYOUT[key] = {ids, out: [...out], E, pos, side, lab, pre: pre.trim(), rest: rest.length};
}
function renderSub(){
  const [, island, , , , spots] = D.wmap[S.isl], w = SW, h = SH, sp = spots[S.sub], G = subGraph(S.isl, S.sub), name = mapName(sp[3].find(id => D.cabs.includes(id)) || G.ids[0]);
  const best = Math.max(1, ...G.ids.map(id => R[id] && D.maps[id]?.[1] ? R[id].rate : 0));
  const pct = v => (v * 100).toFixed(2) + "%";
  const lines = G.E.map(([a, b]) => `<line x1="${G.pos[a][0] * w}" y1="${G.pos[a][1] * h}" x2="${G.pos[b][0] * w}" y2="${G.pos[b][1] * h}"${G.ids.includes(a) && G.ids.includes(b) ? "" : ' class="ext"'}/>`).join("");
  const node = (id, ext) => { const [x, y] = G.pos[id], r = !ext && R[id] && D.maps[id]?.[1] ? R[id].rate : 0, hit = S.mob && mobAt(id), town = D.cabs.includes(id);
    return `<button type="button" class="wmdot wmnode${town ? " k0" : ""}${ext ? " ext" : ""}${S.subPin === id ? " pin" : ""}${S.mob ? (hit ? " hit" : " dim") : uvCls([id])}" data-map="${id}" style="left:${pct(x)};top:${pct(y)}${r ? `;--heat:${Math.round(100 * r / best)}%` : ""}"
      aria-label="${esc(mapName(id))}"><span class="s${G.side[id]}">${esc(G.lab[id] || mapName(id))}</span></button>` };
  $("#wmmap").style.aspectRatio = `${w} / ${h}`;
  $("#wmmap").classList.add("sub");
  $("#wmmap").innerHTML = `<svg class="wmsvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`
    + G.ids.map(id => node(id)).join("") + G.out.map(id => node(id, true)).join("")
    + `<button type="button" class="btn wmback">← ${esc(island)}</button><span class="wmsubt">${esc(name)} area · lines = map exits</span>${G.pre ? `<span class="wmstrip">${esc(G.pre)}: through an NPC only</span>` : ""}<span id="wmlabel" hidden></span>`;
}
function renderMap(){
  $("#wmmap").classList.remove("sub");
  document.querySelector(".wmgrid").classList.toggle("subon", S.sub != null);
  if (S.sub != null){ $("#wmareas").innerHTML = ""; return renderSub() }
  const W = D.wmap[S.isl], [, island, w, h, img, spots] = W;
  const best = Math.max(1, ...spots.map(spotRate));
  // top 3 spots for your level on this island
  const rank = spots.map((sp, i) => [i, spotRate(sp)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  $("#wmisl").querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", +b.dataset.i === S.isl));
  $("#wmmap").style.aspectRatio = `${w} / ${h}`;
  $("#wmmap").innerHTML = `<img src="data:image/webp;base64,${img}" alt="World map of ${esc(island)}" width="${w}" height="${h}">` + spots.map((sp, i) => {
    const [x, y, t, ids] = sp, open = ids.some(known), r = spotRate(sp), k = rank.indexOf(i);
    const heat = r ? Math.round(100 * r / best) : 0, hit = S.mob ? spotMob(sp) : 0;
    return `<button type="button" class="wmdot k${t}${open ? "" : " off"}${S.pin === i ? " pin" : ""}${S.mob ? (hit ? " hit" : " dim") : uvCls(ids)}" data-i="${i}" style="left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%${r ? `;--heat:${heat}%` : ""}"
      aria-label="${esc(mapName(ids.find(known)) || "Not open at launch")}">${S.mob || uvOn() ? "" : k >= 0 ? `<b>${k + 1}</b>` : ""}</button>`;
  }).join("") + spots.map((sp, i) => DRILL(sp) ? `<button type="button" class="wmdrill" data-drill="${i}" style="left:${(sp[0] * 100).toFixed(2)}%;top:${(sp[1] * 100).toFixed(2)}%">Open ${esc(areaName(sp))} map</button>` : "").join("")
    + `<span id="wmlabel" hidden></span>`;
  $("#wmareas").innerHTML = spots.map((sp, i) => DRILL(sp) ? `<button type="button" class="btn" data-drill="${i}">${esc(areaName(sp))} area map (${sp[3].filter(known).length} maps)</button>` : "").join("");
}

// `lone` = one map id: the same card for that map alone (spot i, if any, gives its island and kind)
function card(i, lone){
  const [, isl, , , , spots] = D.wmap[S.isl], sp = i != null ? spots[i] : null, t = sp ? sp[2] : null, ids = lone ? [lone] : sp[3], open = ids.filter(known);
  const island = sp ? isl : "Not marked on the world map";
  if (!open.length) return `<div class="qt-h"><b>Not open at launch</b><span>${esc(island)} · ${KIND[t]}</span></div>
    <p class="sub">The client marks ${ids.length} map${ids.length === 1 ? "" : "s"} here, but none of them are in the launch game files.</p>`;
  const main = open[0], fights = open.filter(id => D.maps[id]?.[2]?.length);
  // monsters across every map in the spot: total spawn points
  const mobs = {}; for (const id of fights) for (const [m, c] of D.maps[id][2]) if (D.mobs[m]) mobs[m] = (mobs[m] || 0) + c;
  const npcs = [...new Set(open.flatMap(id => NPCAT[id] || []))];
  const qs = npcs.flatMap(n => QBY[n] || []).sort((a, b) => a[1].lvl - b[1].lvl);
  const pots = open.filter(id => POT[id]), cab = open.some(id => D.cabs.includes(id));
  const mobBest = S.mob ? open.filter(mobAt).sort((a, b) => mobAt(b) - mobAt(a))[0] : null;
  const mmId = open.includes(S.mm) ? S.mm : (mobBest || fights[0] || main);
  // minimap with each monster's spawn points (export spawn data, D.mobdb[].sp), one color per monster
  const here = (D.maps[mmId]?.[2] || []).filter(([m]) => D.mobs[m]).sort((a, b) => D.mobs[a[0]][1] - D.mobs[b[0]][1]);
  const dots = here.map(([m], k) => (D.mobdb[m]?.sp?.[mmId] || []).map(([x, y]) => `<span class="mspot c${k % 8}" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%"></span>`).join("")).join("");
  let [mm, exits] = minimap(mmId);
  if (dots && mm.includes('class="mmwrap"')) mm = mm.replace(/<\/div>$/, dots + "</div>");
  const legend = here.length ? `<ul class="wmleg">${here.map(([m, c], k) => `<li${String(m) === S.mob ? ' class="me"' : ""}><i class="mspot c${k % 8}"></i>${mobLink(m)} <span>Lv ${D.mobs[m][1]} · ×${c}</span></li>`).join("")}</ul>` : "";
  const rest = open.filter(id => !fights.includes(id));
  const rows = fights.map(id => { const r = R[id], mp = D.maps[id], dg = mp?.[2]?.length && DEF ? mapDanger(id, +S.lv || 10, DEF) : null;
    return `<tr class="wmrow${id === mmId ? " sel" : ""}" data-map="${id}"><td>${mapLink(id, mapName(id))}${mp && !mp[1] ? ' <span class="pill p-warn">not at launch</span>' : ""}${uvOn() && id in UV ? ' <span class="pill p-good">quieter pick</span>' : uvOn() && UV_PACKED[id] ? ' <span class="pill p-warn">busy</span>' : ""}<div class="sub">${mobRange([id])}</div></td>
      <td>${dg ? dangerPill({f: dg.f}) : ""}</td><td class="num">${r && mp?.[1] ? fmt(r.rate * 3600) : "–"}</td></tr>` }).join("");
  const mobRows = Object.entries(mobs).sort((a, b) => D.mobs[a[0]][1] - D.mobs[b[0]][1]).map(([m, c]) => { const x = D.mobs[m];
    return `<li>${mobLink(m)} <span>Lv ${x[1]} · ${fmt(x[2])} HP · ${fmt(x[3])} EXP · ×${c}</span></li>` }).join("");
  const svc = [cab ? "Cab" : "", ...pots.map(id => `Potions: ${npcLink(POT[id])} (${esc(mapName(id))})`)].filter(Boolean);
  return `<div class="qt-h"><b>${esc(mapName(main))}</b><span>${esc(island)}${t != null ? " · " + KIND[t] : ""}${mobRange(open) ? " · monsters " + mobRange(open) : ""}${open.length > 1 ? ` · ${open.length} maps` : ""}</span></div>
    <div class="wmact">${sp && !lone && DRILL(sp) && S.sub == null ? `<button type="button" class="btn primary" style="margin:0" data-drill="${i}">Open ${esc(areaName(sp))} map</button>` : ""}<button type="button" class="btn" data-route="${main}">Route here</button>${svc.length ? `<span class="sub">${svc.join(" · ")}</span>` : ""}</div>
    ${uvOn() ? uvBox(open) : ""}
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
function showMap(id){   // one map of a sub-map (or a grey neighbour outside it)
  const f = SPOT[id], here = f && f[0] === S.isl ? f[1] : null; S.mm = null;
  $("#wmcard").innerHTML = card(here, id); shown = "m" + id;
  document.querySelectorAll(".wmnode").forEach(d => d.classList.toggle("on", d.dataset.map === id));
}
function show(i){
  if (i == null){ $("#wmcard").innerHTML = `<p class="sub">Click a dot to see that place.</p>`; shown = null; return }
  if (i !== shown) S.mm = null;
  shown = i; $("#wmcard").innerHTML = card(i);
  document.querySelectorAll(".wmdot").forEach(d => d.classList.toggle("on", +d.dataset.i === i));
}
function mobNote(){
  const o = S.mob && D.mobdb[S.mob]; $("#wmmobclr").hidden = !o;
  if (!o){ $("#wmmobnote").textContent = ""; return }
  const per = D.wmap.map(([, isl, , , , spots]) => [isl, spots.filter(sp => spotMob(sp)).length]);
  const maps = o.maps.length, here = per[S.isl][1], other = per.filter((x, i) => i !== S.isl && x[1]);
  $("#wmmobnote").innerHTML = `<b>${esc(o.name)}</b> (Lv ${o.level}) spawns on ${maps} map${maps === 1 ? "" : "s"}: ${here ? `${here} place${here === 1 ? "" : "s"} lit up on ${esc(per[S.isl][0])}` : `none on ${esc(per[S.isl][0])}`}${other.map(([n, c]) => `, ${c} on ${esc(n)}`).join("")}.`
    + (here ? "" : " Some of its maps (jump quests, KPQ, job test) have no dot on the world map.");
}
function uvList(){
  const b = $("#wmuv"); b.setAttribute("aria-pressed", uvOn()); b.classList.toggle("primary", uvOn());
  const el = $("#wmuvlist"); el.hidden = !uvOn(); if (!uvOn()) return el.innerHTML = "";
  el.innerHTML = `<h5>Possibly undervalued maps</h5><ul class="mmobs">${UV_PICKS.map(([ids, a, b, inst]) => `<li><span>Lv ${a}–${b}</span> ${ids.map(id => mapLink(id, mapName(id))).join(", ")} <span>instead of ${esc(inst)}</span></li>`).join("")}</ul>
    <p class="tiny">Picked 2026-10-10 from what guides call quieter, overflow or little-known spots, plus maps with the same monsters as a famous one (launch spawn data). Reddit couldn't be read and the official forums had no map threads, so this is not from in-game head counts. Click a map for why and sources.</p>`;
}
function render(){
  rates(); renderMap(); if (S.sub != null){ if (S.subPin) showMap(S.subPin); else show(S.sub) } else show(S.pin); mobNote();
  uvList();
  $("#wmnote").textContent = uvOn() ? "Undervalued maps: green = a quieter pick from the guides (or the same monsters as a famous map), red ring = a map the guides call busy. Doesn't use your class or level; a vibes list, not counted in-game." : `Dot color and EXP/hr: estimate for a ${RL} with the Character Builder's default build, solo, single target (same model as Where to train). Numbers 1-3 = best EXP/hr on this island.`;
}

$("#wmisl").innerHTML = D.wmap.map((w, i) => `<button type="button" data-i="${i}" aria-checked="false">${esc(w[1])}</button>`).join("");
$("#wmcls").value = S.cls; $("#wmlv").value = S.lv;
$("#wmareas").addEventListener("click", e => { const b = e.target.closest("[data-drill]"); if (b) openArea(+b.dataset.drill) });
$("#wmisl").addEventListener("click", e => { const b = e.target.closest("button"); if (b){ S.isl = +b.dataset.i; S.pin = null; S.sub = null; save(); render() } });
$("#wmcls").addEventListener("change", e => { S.cls = e.target.value; save(); render() });
$("#wmlv").addEventListener("change", e => { S.lv = Math.max(1, Math.min(100, +e.target.value || 10)); save(); render() });
// find a map: switch island, pin its dot
const FIND = {};
D.wmap.forEach(([, , , , , spots], isl) => spots.forEach(([, , , ids], i) => ids.filter(known).forEach(id => { const n = mapName(id).trim();
  if (!(n.toLowerCase() in FIND)) FIND[n.toLowerCase()] = [isl, i, id, n] })));
$("#wmlist").innerHTML = Object.values(FIND).map(f => `<option value="${esc(f[3])}">`).join("");
$("#wmfind").addEventListener("change", e => { const f = FIND[e.target.value.trim().toLowerCase()]; if (!f) return;
  S.isl = f[0]; S.pin = f[1]; if (DRILL(D.wmap[f[0]][5][f[1]])){ S.sub = f[1]; S.subPin = f[2]; save(); return render() }
  S.sub = null; save(); render(); S.mm = f[2]; show(f[1]) });

// find a monster: light up the dots where it spawns (switches island if it isn't on this one)
const MOBS = {}; for (const [id, o] of Object.entries(D.mobdb)) if (!(o.name.toLowerCase() in MOBS)) MOBS[o.name.toLowerCase()] = id;
$("#wmmoblist").innerHTML = Object.entries(D.mobdb).sort((a, b) => a[1].level - b[1].level).map(([, o]) => `<option value="${esc(o.name)}">Lv ${o.level}</option>`).join("");
$("#wmmob").value = S.mob ? D.mobdb[S.mob].name : "";
const setMob = id => { S.mob = id; if (id) S.uv = false; S.pin = null; S.mm = null; S.subPin = null;
  if (id){ const n = D.wmap.map(([, , , , , spots]) => spots.filter(sp => spotMob(sp)).length); if (!n[S.isl] && n.some(Boolean)){ S.isl = n.findIndex(Boolean); S.sub = null } }
  save(); render() };
$("#wmmob").addEventListener("change", e => { const v = e.target.value.trim().toLowerCase(); if (!v){ if (S.mob) setMob(null); return } if (MOBS[v] && MOBS[v] !== S.mob) setMob(MOBS[v]) });   // a repeat change (on blur) must not reset the selection
$("#wmmobclr").addEventListener("click", () => { $("#wmmob").value = ""; setMob(null) });
$("#wmuv").addEventListener("click", () => { S.uv = !uvOn(); if (S.uv && S.mob){ $("#wmmob").value = ""; S.mob = null } save(); render() });

const map = $("#wmmap"), label = () => $("#wmlabel");
// hovering only shows a name label; the card changes on a click (Danny: a stray mouse-over shouldn't replace what you're looking at)
map.addEventListener("mouseover", e => { const d = e.target.closest(".wmdot"), l = label(); if (!d || !l) return;
  let txt;
  if (d.dataset.map){ const id = d.dataset.map; txt = mapName(id) + (mobRange([id]) ? " · " + mobRange([id]) : "") + " · click for details" }
  else { const sp = D.wmap[S.isl][5][+d.dataset.i];
    txt = (mapName(sp[3].find(known)) || "Not open at launch") + (mobRange(sp[3]) ? " · " + mobRange(sp[3]) : "") + (DRILL(sp) ? " · click to open its map" : " · click for details") }
  l.textContent = txt; l.hidden = false;
  l.style.left = d.style.left; l.style.top = d.style.top; l.classList.toggle("left", parseFloat(d.style.left) > 60) });
map.addEventListener("mouseout", e => { if (e.target.closest(".wmdot") && label()) label().hidden = true });
map.addEventListener("click", e => {
  const dr = e.target.closest("[data-drill]"); if (dr) return openArea(+dr.dataset.drill);
  if (e.target.closest(".wmback")){ S.pin = S.sub; S.sub = null; S.subPin = null; return render() }
  const d = e.target.closest(".wmdot"); if (!d) return;
  if (d.dataset.map){ const id = d.dataset.map;
    if (d.classList.contains("ext")){ const f = SPOT[id]; S.sub = null; S.subPin = null; if (f){ S.isl = f[0]; S.pin = f[1] } render(); return f && show(f[1]) }
    S.subPin = id; document.querySelectorAll(".wmnode").forEach(x => x.classList.toggle("pin", x.dataset.map === S.subPin)); return showMap(id) }
  const i = +d.dataset.i;
  if (DRILL(D.wmap[S.isl][5][i])) return openArea(i);
  S.pin = i; document.querySelectorAll(".wmdot").forEach(x => x.classList.toggle("pin", +x.dataset.i === S.pin)); show(i) });
$("#wmcard").addEventListener("click", e => {
  const dr = e.target.closest("[data-drill]"); if (dr) return openArea(+dr.dataset.drill);
  const r = e.target.closest("[data-route]"); if (r) return navTo(r.dataset.route);
  const row = e.target.closest(".wmrow"); if (row && !e.target.closest(".mname")){ S.mm = row.dataset.map; if (typeof shown === "number") show(shown) } });
// a map name anywhere on the page opens a card for that map here, with its world map spot pinned (clicking the dot shows the whole spot)
const SPOT = {}; D.wmap.forEach(([, , , , , spots], isl) => spots.forEach(([, , , ids], i) => ids.forEach(id => { if (!(id in SPOT)) SPOT[id] = [isl, i] })));
const openMapInfo = id => { id = String(id); hideQtip(); $("#t-wmap").click(); const f = SPOT[id];
  if (f){ S.isl = f[0]; S.pin = f[1]; save() } else S.pin = null;
  if (f && DRILL(D.wmap[f[0]][5][f[1]])){ S.sub = f[1]; S.subPin = id; render() }
  else { S.sub = null; render(); shown = f ? f[1] : null; $("#wmcard").innerHTML = card(shown, id) }
  document.querySelectorAll(".wmdot").forEach(d => d.classList.toggle("on", +d.dataset.i === shown));
  (innerWidth < 900 ? $("#wmcard") : $("#wmap")).scrollIntoView({block: "start"}) };
document.addEventListener("click", e => { const el = e.target.closest && e.target.closest(".mname"); if (el) openMapInfo(el.dataset.map) });
render();
})();
