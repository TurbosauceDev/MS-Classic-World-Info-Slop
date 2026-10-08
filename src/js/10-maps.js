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

// Max HP / MP from level and job (meowdb HP/MP guide, COT2-measured): 50 HP / 5 MP at level 1, Beginner +16/+12 a level,
// then the class's per-level gain, +500 split by class at 1st job (10) and 2nd job (30). pct = Max HP/MP Increase.
const HPMP = {Warrior: [28, 12, 350, 150], Bowman: [22, 17, 250, 250], Thief: [22, 17, 250, 250], Magician: [16, 22, 150, 350]};
const baseClass = cls => MAGIC.has(cls) ? "Magician" : cls;
function hpmpAt(cls, L, hpPct = 0, mpPct = 0, second = L >= 30){
  const [h, m, ah, am] = HPMP[baseClass(cls)] || [16, 12, 0, 0], b = Math.min(L, 10) - 1, c = Math.max(0, L - 10), adv = (L >= 10) + (L >= 30 && second);
  return [Math.floor((50 + 16 * b + h * c + ah * adv) * (1 + hpPct / 100)), Math.floor((5 + 12 * b + m * c + am * adv) * (1 + mpPct / 100))];
}
// one monster touch as a share of your Max HP (meowdb damage formula): Raw = attack × 1.3 (midpoint of the 1.1-1.5 roll),
// taken = Raw × (1 − DEF / (DEF + 5 × (level + 40) + 1.2 × Raw)); `mult` / `mmult` = share of a physical / magic hit left on HP
// (Invincible cuts physical only; Magic Guard both). Monsters with a magic attack (maplestory.quest raw client: only
// Tauromacis and Taurospear at launch) also hit with Magic Attack against M.DEF; the worse of the two counts.
// Armor isn't counted (we don't model it), so real danger is lower. meowdb labels: <10% Safe, 10-24% Caution, 25-49% Danger, 50%+ Lethal.
const hitTaken = (atk, def, L) => { const raw = atk * 1.3; return Math.max(1, Math.trunc(raw * (1 - def / (def + 5 * (L + 40) + 1.2 * raw)))) };
function touchPct(mobId, L, d){
  const a = D.mobatk?.[mobId]; if (!a || !d.hp) return 0;
  const phys = hitTaken(a[0], d.wdef, L) * (d.mult ?? 1), mag = a[3] ? hitTaken(a[2], d.mdef || 0, L) * (d.mmult ?? d.mult ?? 1) : 0;
  return Math.max(phys, mag) / d.hp;
}
// chance a monster's attack lands on you (meowdb damage formula, incoming hits): A = mobACC×100/(5(G+51)),
// E = EVA/(1+EVA/80)/(1+G/40) with G = max(0, your level − its level); spread f = 0.15 + 0.2/(1+e^((A−E)/12));
// far out of reach it's 2-3%; then an 8% minimum-hit rescue. Shield Guard isn't counted (no armor).
function mobHits(mobId, L, eva){
  const a = D.mobatk?.[mobId], m = D.mobs[mobId]; if (!a || !m) return 1;
  const G = Math.max(0, L - m[1]), A = a[1] * 100 / (5 * (G + 51)), E = eva / (1 + eva / 80) / (1 + G / 40);
  const f = 0.15 + 0.2 / (1 + Math.exp((A - E) / 12));
  const cand = E > A * (1 + f) ? Math.min(0.03, Math.max(0.02, Math.exp((A - E) / 18) * 0.03)) : Math.max(0, Math.min(1, (1 + f - E / A) / (2 * f)));
  return cand + (1 - cand) * 0.08;
}
const DANGER = [[0.5, "Lethal", "p-bad"], [0.25, "Danger", "p-bad"], [0.1, "Caution", "p-warn"], [0, "Safe", "p-good"]];
const dangerPill = o => { const f = o.f ?? o, d = DANGER.find(x => f >= x[0]), h = o.hit != null ? ` · hits you ${Math.round(o.hit * 100)}%` : "";
  return `<span class="pill ${d[2]}" title="One hit from its hardest hitter takes about ${Math.round(f * 100)}% of your Max HP (no armor counted)${o.hit != null ? `; it lands about ${Math.round(o.hit * 100)}% of the time against your avoid` : ""}">${d[1]} ${Math.round(f * 100)}%${h}</span>` };
// a character's defensive numbers when only class and level are known (Where to train): no skills, no armor, AP as classAcc assumes
const defaultDef = (cls, L) => { const prim = 5 * L + 20 - L - 8, luk = cls === "Thief" ? prim : MAGIC.has(cls) ? L : 4, dex = cls === "Bowman" ? prim : cls === "Magician" || MAGIC.has(cls) ? 4 : L;
  return {hp: hpmpAt(cls, L)[0], wdef: Math.floor((cls === "Warrior" ? prim : cls === "Bowman" ? L : 4) / 4), mdef: Math.floor((MAGIC.has(cls) ? prim : 4) / 4), mult: 1, mmult: 1,
    avoid: Math.trunc(luk / 3) + Math.trunc(dex / 6) + 5} };
// the map's hardest hitter: {f: share of Max HP per hit, hit: chance it lands}
const mapDanger = (mid, L, def) => { let best = {f: 0, hit: null};
  for (const [id] of D.maps[mid]?.[2] || []){ const f = touchPct(String(id), L, def); if (f > best.f) best = {f, hit: def.avoid != null ? mobHits(String(id), L, def.avoid) : null} }
  return best };
// portals from each map to the nearest NPC selling HP/MP potions (meowdb shop list), walking only: [portals, npc, shopMapId]
const POTS = (() => { const out = {}, q = [];
  for (const [npc, mid] of D.potshops || []) if (D.nav[mid] && !out[mid]){ out[mid] = [0, npc, mid]; q.push(mid) }
  while (q.length){ const u = q.shift(); for (const v of D.nav[u] || []) if (!out[v]){ out[v] = [out[u][0] + 1, out[u][1], out[u][2]]; q.push(v) } }
  return out })();
const potsText = mid => { const p = POTS[mid]; return p ? `${p[0]} portal${p[0] === 1 ? "" : "s"} to ${p[1]}` : "" };
// party (meowdb EXP + spawn guides): +10/20/30% bonus EXP at 2/3/4+ players; map capacity 75% solo, +5% a player up to 100% at 6
// (meowdb: not fully confirmed). Assumes equal players sharing the kills and the EXP evenly.
const partyBonus = n => [0, 0, 0.1, 0.2, 0.3, 0.3, 0.3][n] || 0, partyCap = n => Math.min(1, 0.75 + 0.05 * (n - 1));
let ACC_FROM_BUILDER = null; // set by "Use this in Where to train"; cleared when class or level is changed here
const accFor = (cls, L) => classAcc(MAGIC.has(cls) ? "Magician" : cls, L);
// seconds to kill one monster (HP / damage after hit chance, defense, level penalty, element) + 1 s walking and aiming
// mesos one kill drops: community reports on meowdb (D.meso), else D.mesok × level (the reported monsters' median, ~2 per level)
const mesoKill = id => D.meso?.[id]?.[0] ?? (D.mesok || 0) * (D.mobs[id]?.[1] || 0);
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
// damage lost per extra target: Iron Arrow pierces at 100/80/60/40% (meowdb damage formula)
const AOE_FALL = {"Iron Arrow: Crossbow": 0.2};
function aoeHits(mid, targets, reach, fall = 0){
  if (!targets || targets <= 1 || !reach) return 1;
  const key = `${mid}|${targets}|${reach}|${fall}`; if (AOE[key]) return AOE[key];
  const P = D.mpos[mid] || []; if (P.length < 2) return AOE[key] = 1;
  let sum = 0;
  P.forEach(([x, y], i) => {
    let r = 0, l = 0, rb = 0, lb = 0;
    P.forEach(([x2, y2], j) => { if (i === j || Math.abs(y2 - y) > 60) return; const dx = x2 - x;
      if (dx >= 0 && dx <= reach[0]) r++; if (dx <= 0 && -dx <= reach[0]) l++;
      if (dx < 0 && -dx <= reach[1]) rb++; if (dx > 0 && dx <= reach[1]) lb++; });
    const n = Math.min(targets, 1 + 0.75 * Math.max(r + rb, l + lb));
    sum += n - fall / 2 * n * (n - 1);   // n targets at 1, 1 - fall, 1 - 2·fall, ... (fractional n interpolates)
  });
  return AOE[key] = sum / P.length;
}
// every open map that fits, best EXP/s first. Shared by "Where to train" and the Path Planner.
// aoe = {t: targets, r: reach} spreads each cast over the monsters it reaches on that map.
function mapRates(cls, L, dps, acc, floor = 12, aoe = null, party = 1){
  const rows = [];
  for (const [mid, [name, open, spawns]] of Object.entries(D.maps)){
    if (!open) continue;
    let exp = 0, mes = 0, time = 0, walk = 0, n = 0, lvSum = 0, hitSum = 0, ok = true, names = new Set();
    const hits = aoe ? aoeHits(mid, aoe.t, aoe.r, AOE_FALL[aoe.n] || 0) : 1;
    for (const [id, c] of spawns){
      const m = D.mobs[id]; if (!m) continue;
      const k = mobKill(m, cls, L, dps, acc);
      if (k.hit < 0.05){ ok = false; break }
      exp += m[3] * c; mes += mesoKill(id) * c; time += k.sec * c / hits; walk += c / hits; n += c; lvSum += m[1] * c; hitSum += k.hit * c; names.add(m[0]);
    }
    if (!ok || !n) continue;
    const avg = lvSum / n; if (avg < L - floor) continue;
    const raw = Math.min(party * exp / time, exp * partyCap(party) / 7.56) / party, rate = raw * (1 + partyBonus(party));
    // att = share of the time you're attacking (not walking, not waiting for respawns): for potion/ammo upkeep
    rows.push({id: mid, name, open, mobs:[...names].join(", "), n, avg, hit: hitSum / n, rate, cyc: exp, hits, meso: rate * mes / exp, att: Math.min(1, raw * time / exp) * (time - walk) / time});   // kills/s of a mob = count × rate / cyc
  }
  return rows.sort((a,b) => b.rate - a.rate);
}
// each class's area attack at a level ([job, skill]); Thieves and 1st job Magicians have no damaging one
// (Double Shot isn't one: its 2 arrows split between targets, so total damage stays the same)
const AOE_SKILL = {Warrior: () => ["Warrior", "Slash Blast"], Bowman: L => L >= 30 ? ["Hunter", "Arrow Bomb: Bow"] : null,
  "I/L Wizard": () => ["I/L Wizard", "Thunder Bolt"], "F/P Wizard": () => ["F/P Wizard", "Poison Breath"]};   // Holy Arrow: 3 arrows split, like Double Shot
function classAoe(cls, L){
  const f = AOE_SKILL[cls], js = f && L >= 10 && f(L); if (!js) return null;
  const [job, name] = js, s = (D.skills[job] || []).find(x => x.n === name); if (!s || !s.rg) return null;
  return {t: Array.isArray(s.mob) ? Math.max(...s.mob) : s.mob, r: s.rg, n: name};
}
let AOE_FROM_BUILDER = null;   // the builder's own attack {t, r, n}; cleared with ACC_FROM_BUILDER
let DEF_FROM_BUILDER = null, COST_FROM_BUILDER = null;   // the builder's upkeep {mesoHr, ...}   // the builder's {hp, wdef, mult} for the danger column; cleared with ACC_FROM_BUILDER
// Frugal mode: the default build's upkeep (buildAt: potions for skills and buffs, ammo) when the builder sent none
const FRUGAL_JOB = {Warrior: ["Warrior", "Fighter"], Magician: ["Magician", "F/P Wizard"], Bowman: ["Archer", "Hunter"], Thief: ["Rogue", "Assassin"]};
function frugalBuild(cls, L){
  const base = baseClass(cls), branch = L >= 30 ? (MAGIC.has(cls) && cls !== "Magician" ? cls : FRUGAL_JOB[base][1]) : FRUGAL_JOB[base][0];
  try { return buildAt(base, branch, null, L) } catch (e){ return {} }
}
// HP potions for getting hit (estimate): every monster you kill gets one attack at you, landing at its hit chance vs your
// avoid (mobHits), for hitTaken damage, healed at MESO_HP. mesos/hr.
function hitCostHr(r, L, def){
  let hp = 0;
  for (const [id, c] of D.maps[r.id]?.[2] || []){ const a = D.mobatk?.[id]; if (!a || !D.mobs[id]) continue;
    const dmg = Math.max(hitTaken(a[0], def.wdef, L) * (def.mult ?? 1), a[3] ? hitTaken(a[2], def.mdef || 0, L) * (def.mmult ?? def.mult ?? 1) : 0);
    hp += c * r.rate / r.cyc * mobHits(String(id), L, def.avoid ?? 0) * dmg }
  return hp * 3600 * 0.5;   // Red Potion: 50 mesos for 100 HP
}
function rankMaps(){
  let cls = $("#cls").value, L = +$("#lvl").value || 25, dps = +$("#dps").value || 20*L;
  const acc = ACC_FROM_BUILDER ?? accFor(cls, L), frugal = $("#tmode").value === "frugal";
  const aoe = $("#aoe").value ? (AOE_FROM_BUILDER || classAoe(cls, L)) : null, area = aoe && aoe.t > 1 ? aoe : null;
  const fb = frugal && !(DEF_FROM_BUILDER && COST_FROM_BUILDER) ? frugalBuild(cls, L) : {};
  const party = +$("#party").value || 1, def = DEF_FROM_BUILDER || (fb.hp ? fb : defaultDef(cls, L));
  const cost = COST_FROM_BUILDER || (frugal ? fb.cost : null);
  let rows = mapRates(cls, L, dps, acc, 12, area, party), far = false;
  if (!rows.length){ rows = mapRates(cls, L, dps, acc, Infinity, area, party); far = rows.length > 0 }   // nothing near your level: best of the rest
  let loss = false;
  if (frugal){
    for (const r of rows){ r.dng = mapDanger(r.id, L, def); r.up = (cost?.mesoHr || 0) * (r.att ?? 1); r.hitc = hitCostHr(r, L, def); r.net = r.meso * 3600 - r.up - r.hitc }
    const ok = rows.filter(r => r.net > 0 && r.dng.f < 0.25);
    if (ok.length) rows = ok; else { rows.sort((a, b) => b.net - a.net); loss = rows.length > 0 }
  }
  const top = rows.slice(0, 15), best = Math.max(...top.map(r => r.rate), 1e-9), need = D.exp[L];
  $("#maprows").innerHTML = top.length ? top.map((r,i) => `<tr>
    <td class="num">${i+1}</td>
    <td>${mapLink(r.id, r.name)}${r.open ? "" : ' <span class="pill p-warn">opens later</span>'}${area ? `<div class="sub">hits ~${r.hits.toFixed(1)} per cast</div>` : ""}</td>
    <td class="sub">${mobList(r.mobs)}</td>
    <td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td>
    <td class="num">${r.hit < .9 ? `<span class="pill p-warn">${Math.round(r.hit*100)}%</span>` : Math.round(r.hit*100) + "%"}</td>
    <td>${dangerPill(r.dng || mapDanger(r.id, L, def))}</td><td class="sub">${esc(potsText(r.id))}</td>
    <td><span class="bar"><i style="width:${Math.round(100*r.rate/best)}%"></i></span><span class="mono">${Math.round(100*r.rate/best)}</span></td>
    <td class="num">${fmt(r.rate*3600)}</td>
    <td class="num">${fmt(r.meso*3600)}${frugal ? `<div class="sub" title="Upkeep ${fmt(r.up)} + getting hit ${fmt(r.hitc)} mesos/hr">net <b${r.net > 0 ? "" : ' style="color:var(--bad)"'}>${r.net > 0 ? "+" : ""}${fmt(r.net)}</b></div>` : cost ? `<div class="sub">net ${fmt(r.meso*3600 - cost.mesoHr * (r.att ?? 1))}</div>` : ""}</td>
    <td class="num">${need ? (need/(r.rate*3600)).toFixed(1) : "–"}</td></tr>`).join("")
    : `<tr><td colspan="12" class="empty">No map fits this level and class. Try a different level.</td></tr>`;
  $("#mapnote").innerHTML = (ACC_FROM_BUILDER != null ? `Accuracy <b>${Math.round(acc)}</b> from your Character Builder setup.`
    : `Assumed accuracy at level ${L}: <b>${Math.round(acc)}</b> (all AP in your main stat, secondary stat equal to your level, no accuracy gear${cls==="Warrior"&&L>=15?", Precise Strikes maxed":cls==="Thief"&&L>=15?", Nimble Body maxed":""}).`)
    + (need ? ` Level ${L}→${L+1} needs <b>${fmt(need)}</b> EXP.` : "") + (L > EXP_SURE && need ? ` EXP needed above level ${EXP_SURE} is meowdb's historical table (not yet confirmed in Classic).` : "")
    + (area ? ` Attack: <b>${esc(area.n)}</b>, up to ${area.t} monsters within ${area.r[0]}${area.r[1] ? ` / ${area.r[1]}` : ""} px; hits per cast are estimated from each map's spawn points.`
      : $("#aoe").value ? ` ${esc(cls)} has no area attack at level ${L}, so this is single target.` : ` Single target.`)
    + (party > 1 ? ` Party of ${party}: your share of the EXP plus the ${Math.round(partyBonus(party) * 100)}% party bonus, map spawns at ${Math.round(partyCap(party) * 100)}% (assumes equal players splitting kills).` : "")
    + ` Danger: one touch from the map's hardest hitter as a share of ${DEF_FROM_BUILDER ? "your" : "a typical"} Max HP (${fmt(def.hp)}), before armor.`
    + ` Mesos/hr = monster meso drops: player reports on meowdb for ${Object.keys(D.meso || {}).length} monsters, the rest estimated at ${D.mesok} mesos per monster level (what the reported ones average). Loot sold to NPCs isn't counted.`
    + (frugal ? ` <b>Frugal:</b> only maps that pay for themselves and aren't Danger/Lethal, fastest EXP first. Net = mesos/hr minus ${COST_FROM_BUILDER ? "your build's" : `a default ${esc(cls)} build's`} skill potions and ammo (${fmt(cost?.mesoHr || 0)}/hr attacking nonstop, times the time spent attacking) minus Red Potions for getting hit (estimate: every monster you kill attacks you once, at its hit chance against your avoid, no armor). Loot sold to NPCs isn't counted, so real profit is higher.`
      + (loss ? ` <b>No map comes out meso positive at this level and damage</b>; these lose the least.` : "") : "")
    + (!frugal && COST_FROM_BUILDER ? ` Your build's potions and ammo: up to ${fmt(COST_FROM_BUILDER.mesoHr)} mesos/hr while attacking nonstop; on the top map you attack about ${Math.round((top[0]?.att ?? 1) * 100)}% of the time, so about ${fmt(COST_FROM_BUILDER.mesoHr * (top[0]?.att ?? 1))}/hr. "net" = mesos/hr minus that.` : "")
    + ` EXP/hr is a model estimate${party > 1 ? "" : ", solo"}.`
    + (far ? ` <b>No map has monsters within 12 levels of you</b> (Victoria Island tops out around level 60-75), so these are the best of the rest.` : "");
}
["#cls","#lvl"].forEach(s => $(s).addEventListener("input", () => { ACC_FROM_BUILDER = null; AOE_FROM_BUILDER = null; DEF_FROM_BUILDER = null; COST_FROM_BUILDER = null; rankMaps() }));
$("#party").addEventListener("change", rankMaps);
$("#tmode").addEventListener("change", rankMaps);
$("#aoe").addEventListener("change", rankMaps);
$("#dps").addEventListener("input", rankMaps);
$("#lvl").addEventListener("change", () => { $("#dps").value = Math.max(50, 20 * (+$("#lvl").value || 25)); rankMaps() });
$("#dps").value = 20 * +$("#lvl").value;
rankMaps();


// bosses and timed spawns (D.timed from the export's spawn timers)
const dur = s => s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
$("#timedrows").innerHTML = (D.timed || []).map(([id, name, lv, hp, exp, mid, mname, n, t, boss]) => `<tr${boss ? ' class="vrow"' : ""}>
  <td>${D.mobs[id] ? mobLink(id) : `<b>${esc(name)}</b>`}${boss ? ' <span class="pill p-hot">boss</span>' : ""}</td><td class="num">${lv}</td><td class="num">${fmt(hp)}</td><td class="num">${fmt(exp)}</td>
  <td>${mapLink(mid, mname)}</td><td class="num">${n}</td><td class="num">${dur(t)}${name === "Mushmom" ? ' <span class="sub">(players: ~90 min)</span>' : ""}</td></tr>`).join("");
