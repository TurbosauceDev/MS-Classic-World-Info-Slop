/* ---------------- path planner ---------------- */
let pathFrom; // (cls, branch, fam, level): fill the planner from the Character Builder and open it
(() => {
const XB = {Warrior:["Fighter","Page","Spearman"], Magician:["F/P Wizard","I/L Wizard","Cleric"], Bowman:["Hunter","Crossbowman"], Thief:["Assassin","Bandit"]};
const FIRST = {Warrior:"Warrior", Magician:"Magician", Bowman:"Archer", Thief:"Rogue"};
const JOBTOWN = {Warrior:"Perion", Magician:"Ellinia", Bowman:"Henesys", Thief:"Kerning City"};   // meowdb beginner guide
const INSTRUCTOR = {Warrior:"Dances with Balrog", Magician:"Grendel the Really Old", Bowman:"Athena Pierce", Thief:"Dark Lord"};
const SHIP_LV = 7;   // Shanks sails to Lith Harbor from level 7 for 300 mesos (meowdb)
const ISLAND = id => +id < 10000000;   // Maple Island map ids
const XFAM = {Fighter:["Sword","Axe"], Page:["Sword","Blunt Weapon"], Spearman:["Spear","Polearm"], Hunter:["Bow"], Crossbowman:["Crossbow"], Assassin:["Claw"], Bandit:["Dagger"]};
const SKIP = ["El Nath","Orbis","Forgotten Hollow","Event","Crafting","Maple Island"], CLASSREG = ["Warrior","Magician","Bowman","Thief"];
const QUEST_SEC = 180, SAME_NPC_SEC = 60;   // walking + talking per quest (1 min if same NPC as the last one): estimates, said so on the page
const STICK = 0.9;       // keep the current map while it's within 10% of the best
const MAXL = 70;         // EXP table ends at 70

let X = {cls:"Warrior", branch:"Fighter", fam:"Sword", cur:10, goal:30, mode:"mix", pace:1.5, fast:false, island:true, val:true};
const BELOW = 5;          // quests more than 5 levels under your starting level count as done or skipped
try { const s = JSON.parse(localStorage.getItem("path") || "null"); if (s && s.cls) X = Object.assign(X, s) } catch(e) {}

// class names "Where to train" uses; Beginners hit physically, like a Warrior
const mcls = L => L < 10 ? "Warrior" : X.cls === "Magician" ? (L >= 30 ? X.branch : "Magician") : X.cls;
const BC = {};
function charAt(L){
  const br = L >= 30 ? X.branch : FIRST[X.cls], k = [X.cls, br, X.fam, L].join("|");
  if (!BC[k]){ const b = buildAt(X.cls, br, X.fam, L); BC[k] = b.dps > 0 ? b : {dps: 20 * L, acc: b.acc, est: true} }
  return BC[k];
}
const WHERE = {};
// open map with the most of this monster: [mapId, name] or null
const whereMob = id => WHERE[id] !== undefined ? WHERE[id] : (WHERE[id] = Object.entries(D.maps).filter(([, m]) => m[1]).map(([mid, m]) => [mid, m[0], (m[2].find(s => String(s[0]) === id) || [0, 0])[1]])
  .sort((a, b) => b[2] - a[2]).find(m => m[2] > 0) || null);
const qIndex = new Map(D.quests.map((r, i) => [r, i]));
const pool = () => D.quests.filter(r => !SKIP.includes(r.region) && !r.rep && (!CLASSREG.includes(r.region) || r.region === X.cls));
const timed = r => !r.il.length && r.kl.every(([id]) => D.mobs[id] && !D.latermobs.includes(id));

function questCost(r, L, ch, lastNpc){
  let sec = r.npc && r.npc === lastNpc ? SAME_NPC_SEC : QUEST_SEC, exp = r.exp; const kills = [];
  for (const [id, n] of r.kl){
    const m = D.mobs[id]; if (!m) continue;   // tutorial-only monsters aren't in the export's monster list
    const k = mobKill(m, mcls(L), L, ch.dps, ch.acc);
    if (k.hit < 0.05) return null;
    sec += k.sec * n; exp += m[3] * n; kills.push([m[0], n, whereMob(id)]);
  }
  return {sec, exp, kills};
}

// what a quest pays: mesos + NPC sell value of its items (guaranteed: all; pick 1: the best; random: expected value)
const itemValue = r => (r.ri || []).reduce((a, g) => {
  const v = g.it.map(([id, n, ch]) => (D.items[id]?.p || 0) * n * (ch != null ? ch / 100 : 1));
  return a + (g.k === "get" ? v.reduce((x, y) => x + y, 0) : g.k === "pick" ? Math.max(0, ...v)
    : g.it.some(i => i[2] != null) ? v.reduce((x, y) => x + y, 0) : v.reduce((x, y) => x + y, 0) / (v.length || 1));
}, 0);
const hasReward = r => r.mesos > 0 || (r.ri || []).length > 0;
const vTier = r => VALUE[r.id]?.[0] || 9;
const vClassOK = r => !VALUE[r.id]?.[3] || VALUE[r.id][3] === X.cls;
const REWARD_MAP_FLOOR = 0.5;   // rewards mode: farm a map with the monsters your quests need if it's at least half the best EXP/hr (a judgment call)

function plan(mode = X.mode){
  const steps = [], cut = X.cur - BELOW, done = new Set(D.quests.filter(r => r.lvl < cut).map(r => r.id));
  const RW = mode === "rewards";
  let Q = pool().filter(r => (RW || timed(r)) && r.lvl >= cut);
  if (RW){   // every quest that pays something (minus "Skip" and other classes' picks), plus whatever they need first
    const want = Q.filter(r => hasReward(r) && vTier(r) !== 5 && vClassOK(r)), pre = new Set(want.flatMap(r => r.pre));
    Q = Q.filter(r => want.includes(r) || pre.has(r.id));
  }
  let L = X.cur, exp = 0, t = 0, cur = null, qExp = 0, gExp = 0, j1 = X.cur >= 10, j2 = X.cur >= 30, npc = null;
  const needed = new Set(Q.flatMap(r => r.pre));   // quests another quest needs first
  // community-picked valuable quests, shown as side tasks when their chain starts (their items can't be timed)
  const VL = !X.val || RW ? [] : Object.entries(VALUE).map(([id, v]) => { const r = D.quests.find(x => x.id === id); return r && {r, v, s: chainStart(r)} })
    .filter(o => o && !SKIP.includes(o.r.region) && (!o.v[3] || o.v[3] === X.cls) && o.r.lvl >= cut && !(mode !== "grind" && Q.includes(o.r)))
    .sort((a, b) => a.s.lvl - b.s.lvl || a.r.lvl - b.r.lvl);
  let vi = 0;
  const levelUp = () => { while (L < MAXL && exp >= D.exp[L]){ exp -= D.exp[L]; L++ } };
  const grindOne = rows => {   // grind to the next level on the best map (sticky), merging with the previous grind step
    let best = rows[0];
    if (cur && best){ const c = rows.find(r => r.id === cur.id); if (c && c.rate >= STICK * best.rate) best = c }
    if (!best) return false;
    const sec = (D.exp[L] - exp) / best.rate * X.pace; t += sec; gExp += D.exp[L] - exp; exp = 0;
    const last = steps[steps.length - 1];
    if (last && last.k === "grind" && last.map.id === best.id){ last.to = L + 1; last.sec += sec; last.t = t }
    else steps.push({k:"grind", from:L, to:L + 1, map:best, sec, t, rate:best.rate, ch:charAt(L)});
    cur = best; L++; return true;
  };
  // Maple Island comes first and is the same in every mode: every island quest, island maps in between, then the ship out
  if (X.cur < 10 && X.island){
    const IQ = D.quests.filter(r => r.region === "Maple Island").sort((a, b) => a.lvl - b.lvl || a.id - b.id);
    steps.push({k:"job", L, txt:"Maple Island: hand in every quest before you leave. Pio's quest gives The Green Relaxer chair, which you can't get anywhere else (his screws and boards come from boxes; if they're camped, Mina in Lith Harbor sells the Sky-blue Wooden Chair for 1,000 mesos). Switch to the Razor at level 5."});
    for (let g = 0; g < 500 && L < X.goal; g++){
      const left = IQ.filter(r => !done.has(r.id)); if (!left.length && L >= SHIP_LV) break;
      const r = left.find(r => Math.max(1, r.lvl) <= L && r.pre.every(id => done.has(id))), ch = charAt(L);
      if (r){
        const c = questCost(r, L, ch, npc) || {sec: QUEST_SEC, exp: r.exp, kills: []}; npc = r.npc;
        const drops = r.il.filter(i => D.mobs[i[2]]).map(([n, k, src]) => `${k} ${n} (${D.mobs[src][0]})`);
        done.add(r.id); const sec = c.sec * X.pace; t += sec; exp += c.exp; qExp += c.exp;
        steps.push({k:"quest", L, r, c, sec, t, vs:null, drops}); levelUp(); continue;
      }
      // a quest needs a higher level, or the ship needs level 7: grind on the island
      if (!grindOne(mapRates(mcls(L), L, ch.dps, ch.acc, Infinity).filter(m => ISLAND(m.id)))){ steps.push({k:"nomap", L}); break }
    }
    if (IQ.every(r => done.has(r.id)) && L >= SHIP_LV) steps.push({k:"job", L, txt:"Leave Maple Island: Shanks at the Southperry dock sails to Lith Harbor (level 7+, 300 mesos, which Mai's and Pio's quests cover). One way, you can't come back. Then do the Lith Harbor quests until 10."});
    cur = null;
  }
  for (let guard = 0; L < X.goal && guard < 3000; guard++){
    if (!j1 && L >= 10){ j1 = true; steps.push({k:"job", L, txt:`1st job: ride Phil's taxi from Lith Harbor to ${JOBTOWN[X.cls]} (90% off as a Beginner) and talk to ${INSTRUCTOR[X.cls]} to become a ${FIRST[X.cls]}.`}) }
    while (vi < VL.length && Math.max(1, VL[vi].s.lvl) <= L){ steps.push({k:"value", L, ...VL[vi], t}); vi++ }
    if (!j2 && L >= 30){ j2 = true; steps.push({k:"job", L, txt:`2nd job: back to ${INSTRUCTOR[X.cls]} in ${JOBTOWN[X.cls]} to become a ${X.branch}.`}) }
    const ch = charAt(L);
    let rates = mapRates(mcls(L), L, ch.dps, ch.acc).filter(m => !ISLAND(m.id));
    if (!rates.length) rates = mapRates(mcls(L), L, ch.dps, ch.acc, Infinity).filter(m => !ISLAND(m.id));   // nothing near your level: best of the rest
    let best = rates[0];
    if (cur && best){ const c = rates.find(r => r.id === cur.id); if (c && c.rate >= STICK * best.rate) best = c }
    const G = best ? best.rate : 0;
    let pick = null;
    if (mode !== "grind") for (const r of Q){
      if (done.has(r.id) || Math.max(1, r.lvl) > L || !r.pre.every(id => done.has(id))) continue;
      if (!r.exp && !r.kl.length && !needed.has(r.id) && !(RW && hasReward(r))) continue;   // no EXP, no reward, nothing needs it
      const c = questCost(r, L, ch, npc); if (!c) continue;
      const rate = c.exp / c.sec;
      if (mode === "mix" && X.fast && rate < G && !VALUE[r.id]) continue;
      if (RW){   // best-rated first, then lowest level, then most mesos + item value
        const val = r.mesos + itemValue(r);
        if (!pick || (vTier(r) - vTier(pick.r) || r.lvl - pick.r.lvl || pick.val - val) < 0) pick = {r, c, rate, val};
        continue;
      }
      // lowest level first (the order they unlock), then fastest
      if (!pick || (r.lvl - pick.r.lvl || pick.rate - rate) < 0) pick = {r, c, rate};
    }
    if (pick){
      done.add(pick.r.id); npc = pick.r.npc; const sec = pick.c.sec * X.pace; t += sec; exp += pick.c.exp; qExp += pick.c.exp;
      steps.push({k:"quest", L, r:pick.r, c:pick.c, sec, t, vs: G && !RW ? pick.rate / G : null, drops: pick.r.il.length > 0});
      levelUp();
      continue;
    }
    if (mode === "quests"){ steps.push({k:"stop", L, exp}); break }
    let rows = rates, farm = [];
    if (RW && rates.length){   // farm where the monsters for open or soon-open reward quests live
      const need = new Map();
      for (const r of Q) if (!done.has(r.id) && r.lvl <= L + 3) for (const [mid] of [...r.kl, ...r.il.filter(i => i[2]).map(i => [i[2]])]) if (D.mobs[mid]) need.set(String(mid), r);
      const fav = rates.filter(m => m.rate >= REWARD_MAP_FLOOR * rates[0].rate && D.maps[m.id][2].some(([mid]) => need.has(String(mid))));
      if (fav.length){ rows = fav; farm = need }
    }
    if (!grindOne(rows)){ steps.push({k:"nomap", L}); break }
    const gs = steps[steps.length - 1];
    if (farm.size) gs.farm = [...new Set(D.maps[gs.map.id][2].filter(([mid]) => farm.has(String(mid))).map(([mid]) => `${D.mobs[mid][0]} (${farm.get(String(mid)).name})`))];
    npc = null;
  }
  const mesos = steps.filter(s => s.k === "quest").reduce((a, s) => a + s.r.mesos, 0), items = steps.filter(s => s.k === "quest").reduce((a, s) => a + itemValue(s.r), 0);
  return {steps, L, t, qExp, gExp, done, mesos, items};
}

const hm = s => s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} h`;
const rvCell = r => { const iv = itemValue(r);
  return `<td class="num rv">${r.mesos ? `${fmt(r.mesos)} <span class="sub">mesos</span>` : ""}${iv ? `<div class="sub">items ≈ ${fmt(iv)}</div>` : ""}${!r.mesos && !iv ? "–" : ""}</td>` };
const qlink = r => `<span class="name qname" tabindex="0" data-src="q" data-i="${qIndex.get(r)}">${esc(r.name)}</span>`;

function fill(){
  document.querySelectorAll("#xcls button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === X.cls));
  document.querySelectorAll("#xmode button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === X.mode));
  if (!XB[X.cls].includes(X.branch)) X.branch = XB[X.cls][0];
  $("#xbranch").innerHTML = XB[X.cls].map(b => `<option${b === X.branch ? " selected" : ""}>${esc(b)}</option>`).join("");
  const fams = XFAM[X.branch] || [];
  if (fams.length && !fams.includes(X.fam)) X.fam = fams[0];
  if (!fams.length) X.fam = null;
  $("#xfamwrap").hidden = fams.length < 2;
  $("#xfam").innerHTML = fams.map(f => `<option${f === X.fam ? " selected" : ""}>${esc(f)}</option>`).join("");
  X.cur = Math.min(69, Math.max(1, Math.round(X.cur) || 1)); X.goal = Math.min(MAXL, Math.max(X.cur + 1, Math.round(X.goal) || X.cur + 1));
  $("#xisland").checked = X.island; $("#xislandwrap").hidden = X.cur >= 10;
  $("#xval").checked = X.val;
  $("#xfast").checked = X.fast; $("#xfastwrap").hidden = X.mode !== "mix"; $("#xvalwrap").hidden = X.mode === "rewards";
  $("#xcur").value = X.cur; $("#xgoal").value = X.goal; $("#xpace").value = String(X.pace);
}

function render(){
  fill();
  try { localStorage.setItem("path", JSON.stringify(X)) } catch(e) {}
  const P = plan(), S = P.steps, G = X.mode === "grind" ? null : plan("grind");
  const nv = S.filter(s => s.k === "value").length;
  const maps = new Set(S.filter(s => s.k === "grind").map(s => s.map.id)).size, nq = S.filter(s => s.k === "quest").length;
  const stop = S.find(s => s.k === "stop" || s.k === "nomap");
  const tot = P.qExp + P.gExp;
  $("#xsum").innerHTML = [
    [stop ? `Stops at level ${stop.L}` : `About ${hm(P.t)} to level ${X.goal}`,
      stop ? (stop.k === "stop" ? `Quests that can be timed run out at level ${stop.L}${X.goal > stop.L ? `, ${X.goal - stop.L} short of your goal. Switch to "Quests + grinding" to finish.` : "."}` : `No training map fits level ${stop.L}.`)
           : `From level ${X.cur} at ${X.pace === 1 ? "perfect-play" : X.pace === 2 ? "relaxed" : "average"} pace. Estimate.`],
    ...(X.mode === "rewards" ? [[`${fmt(P.mesos)} mesos + items worth ≈ ${fmt(P.items)} to NPCs`, `From ${nq} quests, ${S.filter(s => s.k === "quest" && vTier(s.r) === 1).length} of them rated Must do. NPC sell value is a floor: rated items (Sauna Robe, scrolls) sell for far more to players.`]] : []),
    [`${nq} quests · ${maps} training map${maps === 1 ? "" : "s"}${nv ? ` · ${nv} valuable side quests` : ""}`, tot ? `${Math.round(100 * P.qExp / tot)}% of the EXP from quests (including the kills they ask for), ${Math.round(100 * P.gExp / tot)}% from grinding.` : ""],
    ...(G && !stop && !G.steps.some(s => s.k === "nomap") && nq ? [[`Grinding only: ${hm(G.t)}`, P.t > G.t
      ? `The quests cost about ${hm(P.t - G.t)} more than pure grinding, in exchange for their item rewards. Tick "Only quests faster than grinding" to drop the slow ones.`
      : `The quests save about ${hm(G.t - P.t)} over pure grinding.`]] : [])
  ].map(([h, p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
  let n = 0;
  // tick-off boxes: a step's key survives replanning when it's the same quest / job advancement / map and levels
  const key = s => s.k === "quest" || s.k === "value" ? "q" + s.r.id : s.k === "grind" ? `g${s.map.id}:${s.from}-${s.to}` : `j${X.cls}:${s.L}`;
  const tr = (s, cls = "") => `<tr class="${cls}${DONE.has(key(s)) ? " done" : ""}" data-k="${key(s)}">`;
  const chk = (s, label) => `<label class="stepchk"><input type="checkbox"${DONE.has(key(s)) ? " checked" : ""} aria-label="Step ${label || ""} done">${label}</label>`;
  $("#xrows").innerHTML = S.map(s => {
    if (s.k === "job") return `${tr(s, "branch")}<td class="num">${chk(s, "")}</td><td class="num">${s.L}</td><td colspan="5">${esc(s.txt)}</td></tr>`;
    if (s.k === "stop") return `<tr><td></td><td class="num">${s.L}</td><td colspan="5" class="sub">No more quests to do at this level. Grind or switch to "Quests + grinding".</td></tr>`;
    if (s.k === "nomap") return `<tr><td></td><td class="num">${s.L}</td><td colspan="5" class="sub">No training map fits this level.</td></tr>`;
    n++;
    if (s.k === "value") return `${tr(s, "vrow")}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td>${vPill(s.r.id)} ${qlink(s.r)}<div class="vwhy"><b>${esc(s.v[1])}</b> · ${esc(s.v[2])}</div>
        <div class="ricons">${rewardIcons(VICON[s.r.id] ? D.quests.find(x => x.id === VICON[s.r.id]) : s.r)}</div>
        <div class="sub">${s.s !== s.r ? `Start with ${qlink(s.s)} (Lv ${s.s.lvl}), ${s.r.cn}-quest chain · ` : ""}needs ${esc(s.r.req.replace(/ \(source n\/a\)/g, ""))}</div></td>
      <td class="sub">${esc(s.s.npc || "")} · ${esc(s.s.region || "")}</td>${rvCell(s.r)}<td class="num sub">not timed</td><td class="num">${hm(s.t)}</td></tr>`;
    if (s.k === "quest") return `${tr(s)}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td>Quest: ${qlink(s.r)} ${vPill(s.r.id)}${s.vs != null ? ` <span class="pill ${s.vs >= 1 ? "p-good" : "p-warn"}" title="Quest EXP per hour compared with grinding at this level">${s.vs >= 1 ? "faster than grinding" : Math.round(s.vs * 100) + "% of grinding speed"}</span>` : ""}${s.r.ri?.length ? `<div class="ricons">${rewardIcons(s.r)}</div>` : ""}<div class="sub">+${fmt(s.c.exp)} EXP${s.c.kills.length ? " incl. kills" : ""}${s.drops?.length ? ` · plus drops: ${esc(s.drops.join(", "))} (not timed)` : ""}${s.r.req !== "talk / deliver only" ? " · " + esc(s.r.req) : " · talk / deliver"}</div></td>
      <td class="sub">${esc(s.r.npc || "")} · ${esc(s.r.region || "")}${s.c.kills.map(([m, c, w]) => w ? `<br>${esc(m)}: ${mapLink(w[0], w[1])}` : "").join("")}${s.drops ? s.r.il.filter(i => D.mobs[i[2]]).map(([n, k, src]) => { const w = whereMob(src); return `<br>${esc(n)}: ${esc(D.mobs[src][0])}${w ? " at " + mapLink(w[0], w[1]) : ""}` }).join("") : ""}</td>
      ${rvCell(s.r)}<td class="num">${hm(s.sec)}${s.drops ? `<div class="sub">+ drops</div>` : ""}</td><td class="num">${hm(s.t)}</td></tr>`;
    return `${tr(s)}<td class="num">${chk(s, n)}</td><td class="num">${s.from}→${s.to}</td>
      <td><b>Grind to level ${s.to}</b><div class="sub gear">${s.ch.wid ? itemIcon(s.ch.wid, 1, true) : ""}${s.ch.sid && D.icons[s.ch.sid] ? `<img class="sk" src="data:image/png;base64,${D.icons[s.ch.sid]}" alt="" title="${esc(s.ch.skill)}">` : ""}
        <span>~${fmt(s.rate * 3600 / X.pace)} EXP/hr${s.ch.weapon ? ` · ${esc(s.ch.weapon)}, ${esc(s.ch.skill || "")}` : ""}</span></div></td>
      <td>${mapLink(s.map.id, s.map.name)}<div class="sub">${esc(s.map.mobs)}</div>${s.farm?.length ? `<div class="sub farm">Farms for quests: ${esc(s.farm.join(", "))}</div>` : ""}</td><td class="num">–</td>
      <td class="num">${hm(s.sec)}</td><td class="num">${hm(s.t)}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">You're already at your goal.</td></tr>`;
  saveDone();
  const ex = pool().filter(r => !timed(r) && !P.done.has(r.id) && r.lvl <= X.goal && r.lvl >= Math.max(1, X.cur - 5)).sort((a, b) => a.lvl - b.lvl || b.exp - a.exp);
  $("#xextra").innerHTML = ex.map(r => `<tr><td class="num">${r.lvl}</td><td>${qlink(r)}<div class="sub">${esc(r.npc || "")} · ${esc(r.region || "")}</div></td>
    <td class="sub">${esc(r.req.replace(/ \(source n\/a\)/g, ""))}</td><td class="num">${fmt(r.exp)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">None in this level range.</td></tr>`;
}
let timer = null, shown = false;
const DONE = new Set();
try { JSON.parse(localStorage.getItem("pathdone") || "[]").forEach(k => DONE.add(k)) } catch(e) {}
const saveDone = () => { try { localStorage.setItem("pathdone", JSON.stringify([...DONE])) } catch(e) {}
  const all = [...document.querySelectorAll("#xrows tr[data-k]")], d = all.filter(r => r.classList.contains("done")).length;
  $("#xdonenote").innerHTML = d ? `${d} of ${all.length} steps ticked off. <button class="btn" id="xclear">Untick all</button>` : "Tick a step's box when you've done it.";
};
$("#xrows").addEventListener("change", e => {
  const b = e.target.closest(".stepchk input"); if (!b) return;
  const row = b.closest("tr"), k = row.dataset.k;
  if (b.checked) DONE.add(k); else DONE.delete(k);
  row.classList.toggle("done", b.checked); saveDone();
});
$("#xdonenote").addEventListener("click", e => { if (e.target.id !== "xclear") return; DONE.clear();
  document.querySelectorAll("#xrows tr.done").forEach(r => { r.classList.remove("done"); r.querySelector("input").checked = false }); saveDone() });
const later = () => { clearTimeout(timer); timer = setTimeout(render, 150) };
$("#xcls").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; X.cls = b.dataset.v; X.branch = XB[X.cls][0]; X.fam = null; render() });
$("#xmode").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; X.mode = b.dataset.v; render() });
$("#xbranch").addEventListener("change", () => { X.branch = $("#xbranch").value; X.fam = null; render() });
$("#xfam").addEventListener("change", () => { X.fam = $("#xfam").value; render() });
$("#xisland").addEventListener("change", () => { X.island = $("#xisland").checked; render() });
$("#xval").addEventListener("change", () => { X.val = $("#xval").checked; render() });
$("#xfast").addEventListener("change", () => { X.fast = $("#xfast").checked; render() });
$("#xpace").addEventListener("change", () => { X.pace = +$("#xpace").value; render() });
$("#xcur").addEventListener("input", () => { X.cur = +$("#xcur").value || 1; if (X.goal <= X.cur) X.goal = Math.min(MAXL, X.cur + 1); later() });
$("#xgoal").addEventListener("input", () => { X.goal = +$("#xgoal").value || X.cur + 1; later() });
pathFrom = (cls, branch, fam, lvl) => {
  X.cls = cls; X.cur = Math.min(69, lvl);
  X.branch = XB[cls].includes(branch) ? branch : XB[cls][0];
  X.fam = (XFAM[X.branch] || []).includes(fam) ? fam : null;
  X.goal = Math.min(MAXL, Math.max(X.goal, Math.ceil((X.cur + 1) / 10) * 10));
  if (X.goal <= X.cur) X.goal = Math.min(MAXL, X.cur + 1);
  shown = true;
  document.querySelector('[data-tab="path"]').click();
  render();
};
// render on first open of the tab (the auto-build per level takes a moment)
const show = () => { if (!shown && !$("#path").hidden){ shown = true; render() } };
document.querySelector('[data-tab="path"]').addEventListener("click", show);
show();
})();
