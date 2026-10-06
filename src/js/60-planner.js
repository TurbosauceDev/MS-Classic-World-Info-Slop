/* ---------------- path planner ---------------- */
let pathFrom; // (cls, branch, fam, level): fill the planner from the Character Builder and open it
(() => {
const XB = {Warrior:["Fighter","Page","Spearman"], Magician:["F/P Wizard","I/L Wizard","Cleric"], Bowman:["Hunter","Crossbowman"], Thief:["Assassin","Bandit"]};
const FIRST = {Warrior:"Warrior", Magician:"Magician", Bowman:"Archer", Thief:"Rogue"};
const JOBTOWN = {Warrior:"Perion", Magician:"Ellinia", Bowman:"Henesys", Thief:"Kerning City"};   // meowdb beginner guide
const ISLAND = id => +id < 10000000;   // Maple Island map ids
const XFAM = {Fighter:["Sword","Axe"], Page:["Sword","Blunt Weapon"], Spearman:["Spear","Polearm"], Hunter:["Bow"], Crossbowman:["Crossbow"], Assassin:["Claw"], Bandit:["Dagger"]};
const SKIP = ["El Nath","Orbis","Forgotten Hollow","Event","Crafting","Maple Island"], CLASSREG = ["Warrior","Magician","Bowman","Thief"];
const QUEST_SEC = 180, SAME_NPC_SEC = 60;   // walking + talking per quest (1 min if same NPC as the last one): estimates, said so on the page
const STICK = 0.9;       // keep the current map while it's within 10% of the best
const MAXL = 70;         // EXP table ends at 70

let X = {cls:"Warrior", branch:"Fighter", fam:"Sword", cur:10, goal:30, mode:"mix", pace:1.5, fast:false, island:true};
const BELOW = 5;          // quests more than 5 levels under your starting level count as done or skipped
try { const s = JSON.parse(localStorage.getItem("path") || "null"); if (s && s.cls) X = Object.assign(X, s) } catch(e) {}

const mcls = L => X.cls === "Magician" ? (L >= 30 ? X.branch : "Magician") : X.cls;   // class names "Where to train" uses
const BC = {};
function charAt(L){
  if (L < 10) return {dps: 20 * L, acc: accFor(mcls(L), L), est: true};
  const br = L >= 30 ? X.branch : FIRST[X.cls], k = [X.cls, br, X.fam, L].join("|");
  if (!BC[k]){ const b = buildAt(X.cls, br, X.fam, L); BC[k] = b.dps > 0 ? b : {dps: 20 * L, acc: b.acc, est: true} }
  return BC[k];
}
const WHERE = {};
const whereMob = id => WHERE[id] ?? (WHERE[id] = Object.values(D.maps).filter(m => m[1]).map(m => [m[0], (m[2].find(s => String(s[0]) === id) || [0, 0])[1]])
  .sort((a, b) => b[1] - a[1]).find(m => m[1] > 0)?.[0] || "");
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

function plan(mode = X.mode){
  const steps = [], cut = X.cur - BELOW, done = new Set(D.quests.filter(r => r.lvl < cut).map(r => r.id));
  const Q = pool().filter(r => timed(r) && r.lvl >= cut);
  let L = X.cur, exp = 0, t = 0, cur = null, qExp = 0, gExp = 0, j1 = X.cur >= 10, j2 = X.cur >= 30, npc = null;
  const needed = new Set(Q.flatMap(r => r.pre));   // quests another quest needs first
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
    steps.push({k:"job", L, txt:"Maple Island: do every quest here before you leave (one gives a chair you can't get later)."});
    for (let g = 0; g < 500 && L < X.goal; g++){
      const left = IQ.filter(r => !done.has(r.id)); if (!left.length) break;
      const r = left.find(r => Math.max(1, r.lvl) <= L && r.pre.every(id => done.has(id))), ch = charAt(L);
      if (r){
        const c = questCost(r, L, ch, npc) || {sec: QUEST_SEC, exp: r.exp, kills: []}; npc = r.npc;
        const drops = r.il.filter(i => D.mobs[i[2]]).map(([n, k, src]) => `${k} ${n} (${D.mobs[src][0]})`);
        done.add(r.id); const sec = c.sec * X.pace; t += sec; exp += c.exp; qExp += c.exp;
        steps.push({k:"quest", L, r, c, sec, t, vs:null, drops}); levelUp(); continue;
      }
      if (!grindOne(mapRates(mcls(L), L, ch.dps, ch.acc, Infinity).filter(m => ISLAND(m.id)))){ steps.push({k:"nomap", L}); break }
    }
    if (IQ.every(r => done.has(r.id))) steps.push({k:"job", L, txt:"Leave Maple Island: take Shanks' ship from Southperry to Lith Harbor. You can't come back."});
    cur = null;
  }
  for (let guard = 0; L < X.goal && guard < 3000; guard++){
    if (!j1 && L >= 10){ j1 = true; steps.push({k:"job", L, txt:`1st job advancement in ${JOBTOWN[X.cls]}: become a ${FIRST[X.cls]}`}) }
    if (!j2 && L >= 30){ j2 = true; steps.push({k:"job", L, txt:`2nd job advancement: become a ${X.branch}`}) }
    const ch = charAt(L);
    let rates = mapRates(mcls(L), L, ch.dps, ch.acc).filter(m => !ISLAND(m.id));
    if (!rates.length) rates = mapRates(mcls(L), L, ch.dps, ch.acc, Infinity).filter(m => !ISLAND(m.id));   // nothing near your level: best of the rest
    let best = rates[0];
    if (cur && best){ const c = rates.find(r => r.id === cur.id); if (c && c.rate >= STICK * best.rate) best = c }
    const G = best ? best.rate : 0;
    let pick = null;
    if (mode !== "grind") for (const r of Q){
      if (done.has(r.id) || Math.max(1, r.lvl) > L || !r.pre.every(id => done.has(id))) continue;
      if (!r.exp && !r.kl.length && !needed.has(r.id)) continue;   // no EXP and nothing depends on it
      const c = questCost(r, L, ch, npc); if (!c) continue;
      const rate = c.exp / c.sec;
      if (mode === "mix" && X.fast && rate < G) continue;
      // lowest level first (the order they unlock), then fastest
      if (!pick || (r.lvl - pick.r.lvl || pick.rate - rate) < 0) pick = {r, c, rate};
    }
    if (pick){
      done.add(pick.r.id); npc = pick.r.npc; const sec = pick.c.sec * X.pace; t += sec; exp += pick.c.exp; qExp += pick.c.exp;
      steps.push({k:"quest", L, r:pick.r, c:pick.c, sec, t, vs: G ? pick.rate / G : null});
      levelUp();
      continue;
    }
    if (mode === "quests"){ steps.push({k:"stop", L, exp}); break }
    if (!grindOne(rates)){ steps.push({k:"nomap", L}); break }
    npc = null;
  }
  return {steps, L, t, qExp, gExp, done};
}

const hm = s => s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} h`;
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
  $("#xfast").checked = X.fast; $("#xfastwrap").hidden = X.mode !== "mix";
  $("#xcur").value = X.cur; $("#xgoal").value = X.goal; $("#xpace").value = String(X.pace);
}

function render(){
  fill();
  try { localStorage.setItem("path", JSON.stringify(X)) } catch(e) {}
  const P = plan(), S = P.steps, G = X.mode === "grind" ? null : plan("grind");
  const maps = new Set(S.filter(s => s.k === "grind").map(s => s.map.id)).size, nq = S.filter(s => s.k === "quest").length;
  const stop = S.find(s => s.k === "stop" || s.k === "nomap");
  const tot = P.qExp + P.gExp;
  $("#xsum").innerHTML = [
    [stop ? `Stops at level ${stop.L}` : `About ${hm(P.t)} to level ${X.goal}`,
      stop ? (stop.k === "stop" ? `Quests that can be timed run out at level ${stop.L}${X.goal > stop.L ? `, ${X.goal - stop.L} short of your goal. Switch to "Quests + grinding" to finish.` : "."}` : `No training map fits level ${stop.L}.`)
           : `From level ${X.cur} at ${X.pace === 1 ? "perfect-play" : X.pace === 2 ? "relaxed" : "average"} pace. Estimate.`],
    [`${nq} quests · ${maps} training map${maps === 1 ? "" : "s"}`, tot ? `${Math.round(100 * P.qExp / tot)}% of the EXP from quests (including the kills they ask for), ${Math.round(100 * P.gExp / tot)}% from grinding.` : ""],
    ...(G && !stop && !G.steps.some(s => s.k === "nomap") && nq ? [[`Grinding only: ${hm(G.t)}`, P.t > G.t
      ? `The quests cost about ${hm(P.t - G.t)} more than pure grinding, in exchange for their item rewards. Tick "Only quests faster than grinding" to drop the slow ones.`
      : `The quests save about ${hm(G.t - P.t)} over pure grinding.`]] : [])
  ].map(([h, p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
  let n = 0;
  $("#xrows").innerHTML = S.map(s => {
    if (s.k === "job") return `<tr class="branch"><td></td><td class="num">${s.L}</td><td colspan="4">${esc(s.txt)}</td></tr>`;
    if (s.k === "stop") return `<tr><td></td><td class="num">${s.L}</td><td colspan="4" class="sub">No more quests to do at this level. Grind or switch to "Quests + grinding".</td></tr>`;
    if (s.k === "nomap") return `<tr><td></td><td class="num">${s.L}</td><td colspan="4" class="sub">No training map fits this level.</td></tr>`;
    n++;
    if (s.k === "quest") return `<tr><td class="num">${n}</td><td class="num">${s.L}</td>
      <td>Quest: ${qlink(s.r)}${s.vs != null ? ` <span class="pill ${s.vs >= 1 ? "p-good" : "p-warn"}" title="Quest EXP per hour compared with grinding at this level">${s.vs >= 1 ? "faster than grinding" : Math.round(s.vs * 100) + "% of grinding speed"}</span>` : ""}<div class="sub">+${fmt(s.c.exp)} EXP${s.c.kills.length ? " incl. kills" : ""}${s.drops?.length ? ` · plus drops: ${esc(s.drops.join(", "))} (not timed)` : ""}${s.r.req !== "talk / deliver only" ? " · " + esc(s.r.req) : " · talk / deliver"}</div></td>
      <td class="sub">${esc(s.r.npc || "")} · ${esc(s.r.region || "")}${s.c.kills.map(([m, c, w]) => w ? `<br>${esc(m)}: ${esc(w)}` : "").join("")}</td>
      <td class="num">${hm(s.sec)}</td><td class="num">${hm(s.t)}</td></tr>`;
    return `<tr><td class="num">${n}</td><td class="num">${s.from}→${s.to}</td>
      <td><b>Grind to level ${s.to}</b><div class="sub">~${fmt(s.rate * 3600 / X.pace)} EXP/hr${s.ch.weapon ? ` · ${esc(s.ch.weapon)}, ${esc(s.ch.skill || "")}` : s.ch.est ? " · damage guessed" : ""}</div></td>
      <td><span class="name">${esc(s.map.name)}</span><div class="sub">${esc(s.map.mobs)}</div></td>
      <td class="num">${hm(s.sec)}</td><td class="num">${hm(s.t)}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">You're already at your goal.</td></tr>`;
  const ex = pool().filter(r => !timed(r) && !P.done.has(r.id) && r.lvl <= X.goal && r.lvl >= Math.max(1, X.cur - 5)).sort((a, b) => a.lvl - b.lvl || b.exp - a.exp);
  $("#xextra").innerHTML = ex.map(r => `<tr><td class="num">${r.lvl}</td><td>${qlink(r)}<div class="sub">${esc(r.npc || "")} · ${esc(r.region || "")}</div></td>
    <td class="sub">${esc(r.req.replace(/ \(source n\/a\)/g, ""))}</td><td class="num">${fmt(r.exp)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">None in this level range.</td></tr>`;
}
let timer = null, shown = false;
const later = () => { clearTimeout(timer); timer = setTimeout(render, 150) };
$("#xcls").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; X.cls = b.dataset.v; X.branch = XB[X.cls][0]; X.fam = null; render() });
$("#xmode").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; X.mode = b.dataset.v; render() });
$("#xbranch").addEventListener("change", () => { X.branch = $("#xbranch").value; X.fam = null; render() });
$("#xfam").addEventListener("change", () => { X.fam = $("#xfam").value; render() });
$("#xisland").addEventListener("change", () => { X.island = $("#xisland").checked; render() });
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
