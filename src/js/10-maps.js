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
// the Character Builder's default build for a Where to train class and level (buildAt): damage when you typed none,
// and its attack skill, speed and crit to turn a stat-window damage range into damage per second; Frugal mode's upkeep
const TRAIN_JOB = {Warrior: ["Warrior", "Fighter"], Magician: ["Magician", "F/P Wizard"], Bowman: ["Archer", "Hunter"], Thief: ["Rogue", "Assassin"]};
const TB = {};
function trainBuild(cls, L){
  const base = baseClass(cls), branch = L >= 30 ? (MAGIC.has(cls) && cls !== "Magician" ? cls : TRAIN_JOB[base][1]) : TRAIN_JOB[base][0];
  const k = cls + "|" + L; if (TB[k]) return TB[k];
  try { return TB[k] = buildAt(base, branch, null, L) } catch (e){ return {} }
}
let DPS_FROM_BUILDER = null;   // the builder's exact damage (Final Attack, bleed etc.) while its numbers sit in the stat boxes
const STAT_IN = ["#atk", "#umag", "#uint", "#uacc", "#uavo", "#uhp", "#uwdef"];
const statNum = s => { const v = $(s).value.trim(); return v === "" ? null : +v };
function setTrainStats(S){   // from "Use this in Where to train"
  const w = S.win || {}, pm = (w.pct || 100) / 100;
  $("#atk").value = w.max ? `${Math.round(w.min / pm)}-${Math.round(w.max / pm)}` : "";
  $("#umag").value = w.magic || ""; $("#uint").value = w.magic ? w.INT : "";
  $("#uacc").value = S.acc != null ? Math.round(S.acc) : ""; $("#uavo").value = S.def?.avoid ?? ""; $("#uhp").value = S.def?.hp ?? ""; $("#uwdef").value = S.def?.wdef ?? "";
  DPS_FROM_BUILDER = S.dps || null;
}
// damage per second: stat-window ATTACK range (or Magic + INT for spells) × the default build's skill %, hits, crit and attack time
// basic = no skills: 100% × 1 hit at the weapon's own speed (buildAt's basicIv), whatever the class
const basicIv = b => b.basicIv || 0.81;
function trainDps(cls, L, b, basic){
  const pm = basic ? 1 : (b.pct || 100) / 100, hits = basic ? 1 : b.hits || 1, iv = basic ? basicIv(b) : b.interval || 0.81, crit = b.crit || 0;
  const critF = 1 - crit / 100 + crit / 100 * (100 + (b.critDmg || 0)) / 100, per = avg => avg * pm * hits * critF / iv;
  if (basic){ const m = $("#atk").value.match(/(\d+)\D+(\d+)/), p0 = (b.pct || 100) / 100;
    if (m) return {dps: per((+m[1] + +m[2]) / 2), src: "you"};
    return b.max && !b.magic ? {dps: per((b.min + b.max) / 2 / p0), src: "default"} : {dps: 20 * L, src: "guess"} }
  if (DPS_FROM_BUILDER) return {dps: DPS_FROM_BUILDER, src: "builder"};
  if (b.magic){ const mag = statNum("#umag"), int = statNum("#uint");
    if (mag && int != null) return {dps: per(mag * (int * (b.mast || 0) / 100 + 1 + int / 100 + 1) / 2), src: "you"} }
  else { const m = $("#atk").value.match(/(\d+)\D+(\d+)/); if (m) return {dps: per((+m[1] + +m[2]) / 2), src: "you"} }
  return b.dps > 0 ? {dps: b.dps, src: "default"} : {dps: 20 * L, src: "guess"};
}
// HP potions for getting hit (estimate): `share` of the monsters you kill (your pick, #hitsh) get one attack at you, landing at its hit chance vs your
// avoid (mobHits), for hitTaken damage, healed at MESO_HP. mesos/hr.
function hitCostHr(r, L, def, share = 1){
  let hp = 0;
  for (const [id, c] of D.maps[r.id]?.[2] || []){ const a = D.mobatk?.[id]; if (!a || !D.mobs[id]) continue;
    const dmg = Math.max(hitTaken(a[0], def.wdef, L) * (def.mult ?? 1), a[3] ? hitTaken(a[2], def.mdef || 0, L) * (def.mmult ?? def.mult ?? 1) : 0);
    hp += c * r.rate / r.cyc * mobHits(String(id), L, def.avoid ?? 0) * dmg }
  return hp * share * 3600 * 0.5;   // Red Potion: 50 mesos for 100 HP
}
// healing potions its monsters drop (meowdb player drop reports, D.drops; no drop rates, so shown, not counted in net)
const POTION_IDS = ["2000000", "2000001", "2000002", "2000003", "2000004", "2010005"];   // Red, Orange, White, Blue, Elixir, Lemon
const POT_BY_MOB = {}; for (const id of POTION_IDS) for (const [mob] of D.drops?.[id] || []) (POT_BY_MOB[mob] ||= new Set()).add(id);
const mapPots = mid => { const out = new Set(); for (const [id] of D.maps[mid]?.[2] || []) for (const p of POT_BY_MOB[id] || []) out.add(p); return POTION_IDS.filter(p => out.has(p)) };
// NPC sale value of one kill's loot (Frugal): meowdb-reported drops that are monster ETC items (4000xxx) or the potions above,
// each at the chosen drop rate (default 5% per kill: Danny, 2026-10-08, judged 15% optimistic); ores, gems, equips and
// scrolls drop too rarely to count. Sell price = the item's NPC price, or (Loot price = player shops) its meso.watch median
// sale price when it has enough sales (else NPC price).
// PW: meso.watch player-shop prices {itemId: [median, p25, p75, sales, flags 1 = low data / 2 = per set]}, read D.pw.read.
const PW = D.pw?.it || {};
const pwSolid = id => PW[id] && !(PW[id][4] & 1) ? PW[id][0] : 0;
function pwHtml(id, long){ const p = PW[id]; if (!p) return "";
  const per = p[4] & 2 ? " per set" : "", low = p[4] & 1 ? ` <span class="pill p-warn" title="Fewer than 5 sales seen: rough">few sales</span>` : "";
  return long ? `Player shops: about <b>${fmt(p[0])} mesos</b>${per} (median of ${fmt(p[3])} sale${p[3] === 1 ? "" : "s"} seen; half sold for ${fmt(p[1])}-${fmt(p[2])})${low}<br><span class="sub">meso.watch, as of ${D.pw.read}. Prices move; check before you sell.</span>`
    : `players ~${fmt(p[0])}${per}${low}` }
const LOOT_BY_MOB = {}; for (const [it, ms] of Object.entries(D.drops || {})) if ((it.startsWith("4000") || POTION_IDS.includes(it)) && D.items[it]?.p) for (const [mob] of ms) (LOOT_BY_MOB[mob] ||= []).push(it);
const lootKill = (mob, pw) => (LOOT_BY_MOB[mob] || []).reduce((a, it) => a + (pw && pwSolid(it) || D.items[it].p), 0);
function lootHr(r, rate, pw){ let v = 0; for (const [id, c] of D.maps[r.id]?.[2] || []) v += c * r.rate / r.cyc * lootKill(id, pw); return v * rate * 3600 }
function rankMaps(){
  let cls = $("#cls").value, L = +$("#lvl").value || 25;
  const basic = $("#aoe").value === "basic", fb = trainBuild(cls, L), {dps, src} = trainDps(cls, L, fb, basic), frugal = $("#tmode").value === "frugal", pm = (fb.pct || 100) / 100;
  // placeholders = the numbers assumed when a box is empty
  const d0 = DEF_FROM_BUILDER || defaultDef(cls, L), acc0 = ACC_FROM_BUILDER ?? accFor(cls, L);
  $("#atk").placeholder = fb.max && !fb.magic ? `${Math.round(fb.min / pm)}-${Math.round(fb.max / pm)}` : "";
  const magIn = fb.magic && !basic; document.querySelectorAll(".magin").forEach(e => e.hidden = !magIn); $("#atk").closest("label").hidden = magIn;
  $("#hitsh").closest("label").hidden = $("#lootr").closest("label").hidden = $("#lootp").closest("label").hidden = !frugal;
  $("#uacc").placeholder = Math.round(acc0); $("#uavo").placeholder = d0.avoid ?? ""; $("#uhp").placeholder = d0.hp; $("#uwdef").placeholder = d0.wdef;
  const acc = statNum("#uacc") ?? acc0, def = {...d0};
  for (const [k, s] of [["avoid", "#uavo"], ["hp", "#uhp"], ["wdef", "#uwdef"]]){ const v = statNum(s); if (v != null) def[k] = v }
  const aoe = $("#aoe").value === "1" ? (AOE_FROM_BUILDER || classAoe(cls, L)) : null, area = aoe && aoe.t > 1 ? aoe : null;
  // basic attacks: no skill MP, no buffs; bows, crossbows and claws still use an arrow or star per attack (none retrieved)
  const ammoP = basic ? fb.ammoPrice || 0 : 0;
  const party = +$("#party").value || 1, hitsh = +$("#hitsh").value, cost = basic ? {mesoHr: ammoP * 3600 / basicIv(fb)} : COST_FROM_BUILDER || (frugal ? fb.cost : null);
  let rows = mapRates(cls, L, dps, acc, 12, area, party), far = false;
  if (!rows.length){ rows = mapRates(cls, L, dps, acc, Infinity, area, party); far = rows.length > 0 }   // nothing near your level: best of the rest
  let loss = false;
  if (frugal){
    for (const r of rows){ r.dng = mapDanger(r.id, L, def); r.up = (cost?.mesoHr || 0) * (r.att ?? 1); r.hitc = hitCostHr(r, L, def, hitsh); r.loot = lootHr(r, +$("#lootr").value, $("#lootp").value === "pw"); r.net = r.meso * 3600 + r.loot - r.up - r.hitc }
    const ok = rows.filter(r => r.net > 0 && r.dng.f < 0.25);
    if (ok.length) rows = ok; else { rows.sort((a, b) => b.net - a.net); loss = rows.length > 0 }
  }
  const top = rows.slice(0, 15), best = Math.max(...top.map(r => r.rate), 1e-9), need = D.exp[L];
  $("#maprows").innerHTML = top.length ? top.map((r,i) => `<tr>
    <td class="num">${i+1}</td>
    <td>${mapLink(r.id, r.name)}${r.open ? "" : ' <span class="pill p-warn">opens later</span>'}${area ? `<div class="sub">hits ~${r.hits.toFixed(1)} per cast</div>` : ""}${frugal && mapPots(r.id).length ? `<div class="sub">drops ${mapPots(r.id).map(p => `<span class="itname" tabindex="0" data-item="${p}">${esc(D.items[p]?.n || p)}</span>`).join(", ")}</div>` : ""}</td>
    <td class="sub">${mobList(r.mobs)}</td>
    <td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td>
    <td class="num">${r.hit < .9 ? `<span class="pill p-warn">${Math.round(r.hit*100)}%</span>` : Math.round(r.hit*100) + "%"}</td>
    <td>${dangerPill(r.dng || mapDanger(r.id, L, def))}</td><td class="sub">${esc(potsText(r.id))}</td>
    <td><span class="bar"><i style="width:${Math.round(100*r.rate/best)}%"></i></span><span class="mono">${Math.round(100*r.rate/best)}</span></td>
    <td class="num">${fmt(r.rate*3600)}</td>
    <td class="num">${fmt(r.meso*3600)}${frugal ? `<div class="sub" title="Mesos ${fmt(r.meso * 3600)} + loot sold ${fmt(r.loot)} − upkeep ${fmt(r.up)} − getting hit ${fmt(r.hitc)} per hr">net <b${r.net > 0 ? "" : ' style="color:var(--bad)"'}>${r.net > 0 ? "+" : ""}${fmt(r.net)}</b></div>` : cost ? `<div class="sub">net ${fmt(r.meso*3600 - cost.mesoHr * (r.att ?? 1))}</div>` : ""}</td>
    <td class="num">${need ? (need/(r.rate*3600)).toFixed(1) : "–"}</td></tr>`).join("")
    : `<tr><td colspan="12" class="empty">No map fits this level and class. Try a different level.</td></tr>`;
  const how = basic ? `basic attacks (100%, one hit), ${fb.crit || 0}% crit for +${fb.critDmg || 0}% and ${esc(fb.weapon || "a default weapon")}'s speed`
    : `${esc(fb.skill || "a basic attack")}${fb.pct && fb.pct !== 100 ? ` (${fb.pct}%${fb.hits > 1 ? ` × ${fb.hits}` : ""})` : ""}, ${fb.crit || 0}% crit for +${fb.critDmg || 0}% and ${fb.magic ? "spell speed" : `its weapon's speed (${esc(fb.weapon || "?")})`}`;
  $("#mapnote").innerHTML = `Damage: <b>${fmt(Math.round(dps))}</b>/s ${src === "builder" ? "from your Character Builder setup" : src === "you" ? `from your ${magIn ? "Magic and INT" : "Attack range"} with ${how}, from the default build at your level` : src === "default" ? `from the Character Builder's default build at level ${L} (${esc(fb.weapon || "")}, ${basic ? "basic attacks" : esc(fb.skill || "")}); type your stat-window ${magIn ? "Magic and INT" : "Attack range"} for your own` : `a rough guess (20 × level)${basic && fb.magic ? "; type your stat-window Attack range for wand or staff hits" : ""}`}. `
    + (statNum("#uacc") != null ? `Accuracy <b>${Math.round(acc)}</b> as typed.` : ACC_FROM_BUILDER != null ? `Accuracy <b>${Math.round(acc)}</b> from your Character Builder setup.`
    : `Assumed accuracy at level ${L}: <b>${Math.round(acc)}</b> (all AP in your main stat, secondary stat equal to your level, no accuracy gear${cls==="Warrior"&&L>=15?", Precise Strikes maxed":cls==="Thief"&&L>=15?", Nimble Body maxed":""}).`)
    + (need ? ` Level ${L}→${L+1} needs <b>${fmt(need)}</b> EXP.` : "") + (L > EXP_SURE && need ? ` EXP needed above level ${EXP_SURE} is meowdb's historical table (not yet confirmed in Classic).` : "")
    + (area ? ` Attack: <b>${esc(area.n)}</b>, up to ${area.t} monsters within ${area.r[0]}${area.r[1] ? ` / ${area.r[1]}` : ""} px; hits per cast are estimated from each map's spawn points.`
      : basic ? ` Basic attacks only (100%, one hit${fb.weapon ? `, ${esc(fb.weapon)} speed` : ""}).` : $("#aoe").value ? ` ${esc(cls)} has no area attack at level ${L}, so this is single target.` : ` Single target.`)
    + (party > 1 ? ` Party of ${party}: your share of the EXP plus the ${Math.round(partyBonus(party) * 100)}% party bonus, map spawns at ${Math.round(partyCap(party) * 100)}% (assumes equal players splitting kills).` : "")
    + ` Danger: one touch from the map's hardest hitter as a share of ${DEF_FROM_BUILDER || statNum("#uhp") != null ? "your" : "a typical"} Max HP (${fmt(def.hp)}), before armor.`
    + ` Mesos/hr = monster meso drops: player reports on meowdb for ${Object.keys(D.meso || {}).length} monsters, the rest estimated at ${D.mesok} mesos per monster level (what the reported ones average). Loot sold to NPCs isn't counted.`
    + (frugal ? ` <b>Frugal:</b> only maps that pay for themselves and aren't Danger/Lethal, fastest EXP first. Net = mesos/hr minus ${basic ? (ammoP ? `ammo for basic attacks` : "nothing for basic attacks") : COST_FROM_BUILDER ? "your build's skill potions and ammo" : `a default ${esc(cls)} build's skill potions and ammo`} (${fmt(cost?.mesoHr || 0)}/hr attacking nonstop, times the time spent attacking) minus Red Potions for getting hit (estimate: ${({"0.1": "1 in 10", "0.25": "1 in 4", "0.5": "half", "1": "every one"})[$("#hitsh").value]} of the monsters you kill attack${hitsh === 1 ? "s" : ""} you once, at their hit chance against your avoid, no armor). ${+$("#lootr").value ? `Plus loot sold to NPCs: each monster's reported ETC item and potion drops (meowdb player reports) at ${Math.round($("#lootr").value * 100)}% per kill each (an assumption: drop rates aren't in the game files), ${$("#lootp").value === "pw" ? "at the median player-shop sale price (meso.watch, " + D.pw.read + ") where it has 5+ sales, else NPC sell price; selling to players takes a shop and time" : "at NPC sell price"}; ores, gems, equips and scrolls aren't counted.` : "Loot sold to NPCs isn't counted."} Potions its monsters drop are listed under the map name.`
      + (loss ? ` <b>No map comes out meso positive at this level and damage</b>; these lose the least.` : "") : "")
    + (!frugal && COST_FROM_BUILDER ? ` Your build's potions and ammo: up to ${fmt(COST_FROM_BUILDER.mesoHr)} mesos/hr while attacking nonstop; on the top map you attack about ${Math.round((top[0]?.att ?? 1) * 100)}% of the time, so about ${fmt(COST_FROM_BUILDER.mesoHr * (top[0]?.att ?? 1))}/hr. "net" = mesos/hr minus that.` : "")
    + ` EXP/hr is a model estimate${party > 1 ? "" : ", solo"}.`
    + (far ? ` <b>No map has monsters within 12 levels of you</b> (Victoria Island tops out around level 60-75), so these are the best of the rest.` : "");
}
["#cls","#lvl"].forEach(s => $(s).addEventListener("input", () => { ACC_FROM_BUILDER = null; AOE_FROM_BUILDER = null; DEF_FROM_BUILDER = null; COST_FROM_BUILDER = null; DPS_FROM_BUILDER = null; rankMaps() }));
$("#cls").addEventListener("change", () => { STAT_IN.forEach(s => $(s).value = ""); rankMaps() });   // another class's stats don't carry over
$("#party").addEventListener("change", rankMaps);
$("#tmode").addEventListener("change", rankMaps);
$("#hitsh").addEventListener("change", rankMaps);
$("#lootr").addEventListener("change", rankMaps);
$("#lootp").addEventListener("change", rankMaps);
$("#aoe").addEventListener("change", rankMaps);
STAT_IN.forEach(s => $(s).addEventListener("input", () => { DPS_FROM_BUILDER = null; rankMaps() }));
$("#lvl").addEventListener("change", rankMaps);


// bosses and timed spawns (D.timed from the export's spawn timers)
const dur = s => s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
$("#timedrows").innerHTML = (D.timed || []).map(([id, name, lv, hp, exp, mid, mname, n, t, boss]) => `<tr${boss ? ' class="vrow"' : ""}>
  <td>${D.mobs[id] ? mobLink(id) : `<b>${esc(name)}</b>`}${boss ? ' <span class="pill p-hot">boss</span>' : ""}</td><td class="num">${lv}</td><td class="num">${fmt(hp)}</td><td class="num">${fmt(exp)}</td>
  <td>${mapLink(mid, mname)}</td><td class="num">${n}</td><td class="num">${dur(t)}${name === "Mushmom" ? ' <span class="sub">(players: ~90 min)</span>' : ""}</td></tr>`).join("");
