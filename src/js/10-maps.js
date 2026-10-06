/* client formulas */
function hitProb(acc, avoid, diff){
  const base = acc * 100 / ((Math.max(0, diff) * 2 + 51) * 5);
  if (base <= 0) return 0;
  if (avoid <= 0) return 1;
  const spread = 0.15 + 0.2 / (1 + Math.exp((base - avoid) / 12));
  return Math.max(0, Math.min(1, (1 + spread - avoid / base) / (2 * spread)));
}
const lvlPen = d => d <= 0 ? 1 : d < 10 ? 1 / (d * d * 0.005 + 1) : 1 / (d * 0.05 + 1);
const MAGIC = new Set(["Magician","I/L Wizard","F/P Wizard","Cleric"]);
const ELEMS = {"I/L Wizard":["Ice","Lightning"],"F/P Wizard":["Fire","Poison"],"Cleric":["Holy"]};
const EMULT = {Weak:1.25, Strong:0.75, Immune:0};
function classAcc(cls, L){
  const prim = 5*L + 20 - L - 8, sec = L;
  if (cls === "Warrior") return (sec*1.2 + L*2 + 2.4)/2.5 + 10 + (L >= 15 ? 20 : 0);
  if (cls === "Bowman")  return (prim*1.2 + L*2 + 2.4)/4.8 + 20;
  if (cls === "Thief")   return (sec*1.2 + L*2 + prim*0.6)/4 + 15 + (L >= 15 ? 15 : 0);
  return (prim*1.2 + L*2 + sec*0.6)/5.1 + 20;
}

let ACC_FROM_BUILDER = null; // set by "Use this in Where to train"; cleared when class or level is changed here
const accFor = (cls, L) => classAcc(MAGIC.has(cls) ? "Magician" : cls, L);
// seconds to kill one monster (HP / damage after hit chance, defense, level penalty, element) + 1 s walking and aiming
function mobKill(m, cls, L, dps, acc){
  const [nm, lv, hp, ex, eva, pdd, mdd, el] = m, magic = MAGIC.has(cls), els = ELEMS[cls] || [];
  const diff = lv - L, hit = hitProb(acc, eva, diff);
  let em = 1; if (els.length){ em = Math.max(...els.map(e => EMULT[el[e]] ?? 1)); if (em === 0) em = 1 }
  const eff = hp / (hit * lvlPen(diff) * em * 100 / ((magic ? mdd : pdd) + 100));
  return {hit, sec: eff / dps + 1};
}
// how many monsters one cast of an area attack hits on a map (estimate from spawn points): from each spawn point, count
// the others on the same platform (within 60 px up/down) inside the attack's reach, facing the busier side; 75% of
// spawns are alive solo; capped at the skill's target count. reach = [front, back] px.
const AOE = {};
function aoeHits(mid, targets, reach){
  if (!targets || targets <= 1 || !reach) return 1;
  const key = `${mid}|${targets}|${reach}`; if (AOE[key]) return AOE[key];
  const P = D.mpos[mid] || []; if (P.length < 2) return AOE[key] = 1;
  let sum = 0;
  P.forEach(([x, y], i) => {
    let r = 0, l = 0, rb = 0, lb = 0;
    P.forEach(([x2, y2], j) => { if (i === j || Math.abs(y2 - y) > 60) return; const dx = x2 - x;
      if (dx >= 0 && dx <= reach[0]) r++; if (dx <= 0 && -dx <= reach[0]) l++;
      if (dx < 0 && -dx <= reach[1]) rb++; if (dx > 0 && dx <= reach[1]) lb++; });
    sum += Math.min(targets, 1 + 0.75 * Math.max(r + rb, l + lb));
  });
  return AOE[key] = sum / P.length;
}
// every open map that fits, best EXP/s first. Shared by "Where to train" and the Path Planner.
// aoe = {t: targets, r: reach} spreads each cast over the monsters it reaches on that map.
function mapRates(cls, L, dps, acc, floor = 12, aoe = null){
  const rows = [];
  for (const [mid, [name, open, spawns]] of Object.entries(D.maps)){
    if (!open) continue;
    let exp = 0, time = 0, n = 0, lvSum = 0, hitSum = 0, ok = true, names = new Set();
    const hits = aoe ? aoeHits(mid, aoe.t, aoe.r) : 1;
    for (const [id, c] of spawns){
      const m = D.mobs[id]; if (!m) continue;
      const k = mobKill(m, cls, L, dps, acc);
      if (k.hit < 0.05){ ok = false; break }
      exp += m[3] * c; time += k.sec * c / hits; n += c; lvSum += m[1] * c; hitSum += k.hit * c; names.add(m[0]);
    }
    if (!ok || !n) continue;
    const avg = lvSum / n; if (avg < L - floor) continue;
    const rate = Math.min(exp / time, exp * 0.75 / 7.56);
    rows.push({id: mid, name, open, mobs:[...names].join(", "), n, avg, hit: hitSum / n, rate, cyc: exp, hits});   // kills/s of a mob = count × rate / cyc
  }
  return rows.sort((a,b) => b.rate - a.rate);
}
// each class's area attack at a level ([job, skill]); Thieves and 1st job Magicians have no damaging one
// (Double Shot isn't one: its 2 arrows split between targets, so total damage stays the same)
const AOE_SKILL = {Warrior: () => ["Warrior", "Slash Blast"], Bowman: L => L >= 30 ? ["Hunter", "Arrow Bomb: Bow"] : null,
  "I/L Wizard": () => ["I/L Wizard", "Thunder Bolt"], "F/P Wizard": () => ["F/P Wizard", "Poison Breath"], Cleric: () => ["Cleric", "Holy Arrow"]};
function classAoe(cls, L){
  const f = AOE_SKILL[cls], js = f && L >= 10 && f(L); if (!js) return null;
  const [job, name] = js, s = (D.skills[job] || []).find(x => x.n === name); if (!s || !s.rg) return null;
  return {t: Array.isArray(s.mob) ? Math.max(...s.mob) : s.mob, r: s.rg, n: name};
}
let AOE_FROM_BUILDER = null;   // the builder's own attack {t, r, n}; cleared with ACC_FROM_BUILDER
function rankMaps(){
  let cls = $("#cls").value, L = +$("#lvl").value || 25, dps = +$("#dps").value || 20*L;
  const acc = ACC_FROM_BUILDER ?? accFor(cls, L);
  const aoe = $("#aoe").value ? (AOE_FROM_BUILDER || classAoe(cls, L)) : null, area = aoe && aoe.t > 1 ? aoe : null;
  const rows = mapRates(cls, L, dps, acc, 12, area);
  const top = rows.slice(0, 15), best = top[0]?.rate || 1, need = D.exp[L];
  $("#maprows").innerHTML = top.length ? top.map((r,i) => `<tr>
    <td class="num">${i+1}</td>
    <td>${mapLink(r.id, r.name)}${r.open ? "" : ' <span class="pill p-warn">opens later</span>'}${area ? `<div class="sub">hits ~${r.hits.toFixed(1)} per cast</div>` : ""}</td>
    <td class="sub">${mobList(r.mobs)}</td>
    <td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td>
    <td class="num">${r.hit < .9 ? `<span class="pill p-warn">${Math.round(r.hit*100)}%</span>` : Math.round(r.hit*100) + "%"}</td>
    <td><span class="bar"><i style="width:${Math.round(100*r.rate/best)}%"></i></span><span class="mono">${Math.round(100*r.rate/best)}</span></td>
    <td class="num">${fmt(r.rate*3600)}</td>
    <td class="num">${need ? (need/(r.rate*3600)).toFixed(1) : "–"}</td></tr>`).join("")
    : `<tr><td colspan="9" class="empty">No map fits this level and class. Try a different level.</td></tr>`;
  $("#mapnote").innerHTML = (ACC_FROM_BUILDER != null ? `Accuracy <b>${Math.round(acc)}</b> from your Character Builder setup.`
    : `Assumed accuracy at level ${L}: <b>${Math.round(acc)}</b> (all AP in your main stat, secondary stat equal to your level, no accuracy gear${cls==="Warrior"&&L>=15?", Precise Strikes maxed":cls==="Thief"&&L>=15?", Nimble Body maxed":""}).`)
    + (need ? ` Level ${L}→${L+1} needs <b>${fmt(need)}</b> EXP.` : ` The EXP table we have stops at level 70, so hours per level are blank above it.`)
    + (area ? ` Attack: <b>${esc(area.n)}</b>, up to ${area.t} monsters within ${area.r[0]}${area.r[1] ? ` / ${area.r[1]}` : ""} px; hits per cast are estimated from each map's spawn points.`
      : $("#aoe").value ? ` ${esc(cls)} has no area attack at level ${L}, so this is single target.` : ` Single target.`)
    + ` EXP/hr is a model estimate, solo.`;
}
["#cls","#lvl"].forEach(s => $(s).addEventListener("input", () => { ACC_FROM_BUILDER = null; AOE_FROM_BUILDER = null; rankMaps() }));
$("#aoe").addEventListener("change", rankMaps);
$("#dps").addEventListener("input", rankMaps);
$("#lvl").addEventListener("change", () => { $("#dps").value = Math.max(50, 20 * (+$("#lvl").value || 25)); rankMaps() });
$("#dps").value = 20 * +$("#lvl").value;
rankMaps();

