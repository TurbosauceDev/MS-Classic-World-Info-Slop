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
  // below 10 everyone is a Beginner: trunc(common / 2.5 + 5) (OSMS formulas page, launch client), same assumed stats
  if (L < 10){ const dex = cls === "Bowman" ? prim : cls === "Magician" ? 4 : sec, luk = cls === "Thief" ? prim : cls === "Magician" ? sec : 4;
    return Math.trunc((dex*1.2 + L*2 + luk*0.6)/2.5 + 5) }
  // client truncs the base before skill bonuses (OSMS formulas page); +20 / +15 = maxed Precise Strikes / Nimble Body
  if (cls === "Warrior") return Math.trunc((sec*1.2 + L*2 + 2.4)/2.5 + 10) + (L >= 15 ? 20 : 0);
  if (cls === "Bowman")  return Math.trunc((prim*1.2 + L*2 + 2.4)/4.8 + 20);
  if (cls === "Thief")   return Math.trunc((sec*1.2 + L*2 + prim*0.6)/4 + 15) + (L >= 15 ? 15 : 0);
  return Math.trunc((prim*1.2 + L*2 + sec*0.6)/5.1 + 20);
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
// launch client (OSMS formulas page, damage taken): I × (1 − D / (D + 2I + 300)) − D/25 − Level/10, I = Atk × 1.3 on average
const hitTaken = (atk, def, L) => { const raw = atk * 1.3; return Math.max(1, Math.trunc(raw * (1 - def / (def + 2 * raw + 300)) - def / 25 - L / 10)) };
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
// party (meowdb EXP guide): +10/20/30% bonus EXP at 2/3/4+ players. Assumes equal players sharing the kills and the EXP evenly.
// OSMS party EXP (azzy): min(30%, 10% × (eligible − 1)) + 5% × (members who hit it − 1); assumes everyone hits
const partyBonus = n => n > 1 ? Math.min(0.3, 0.1 * (n - 1)) + 0.05 * (n - 1) : 0;
// share of a map's spawn points alive at once: its mob capacity (OSMS maps.json: solo target from map size, checked in game)
// over its spawn points, at most 1. Players on the map add floor(0.75 × (players − 5)) (OSMS theory from 3 counts, unverified),
// so a party of up to 5 gets no more monsters than solo. Maps without a capacity: meowdb's 75% solo, +5% a player.
const mapShare = (mid, n = 1) => { const m = D.maps[mid]; if (!m) return 0.75;
  const sp = m[2].reduce((s, x) => s + x[1], 0), cap = m[3];
  return cap ? Math.min(1, (cap + Math.floor(0.75 * Math.max(n - 5, 0))) / sp) : Math.min(1, 0.75 + 0.05 * (n - 1)) };
let ACC_FROM_BUILDER = null; // set by "Use this in Where to train"; cleared when class or level is changed here
const accFor = (cls, L) => classAcc(MAGIC.has(cls) ? "Magician" : cls, L);
// seconds to kill one monster (HP / damage after hit chance, defense, level penalty, element) + 1 s walking and aiming
// mesos one kill drops, OSMS formulas page (azzy, fitted to captures): base = floor(2.1 × level) + 3, each drop floor(base ×
// rand(90..110) / 100), dropped on ~67% of kills. Returns the expected mesos per kill.
const MESO_CHANCE = 0.67;
const mesoRange = L => { const b = Math.floor(21 * L / 10) + 3; return [Math.floor(b * 90 / 100), Math.floor(b * 110 / 100)] };
const mesoAvg = L => { if (!L) return 0; const b = Math.floor(21 * L / 10) + 3;
  let s = 0; for (let r = 90; r <= 110; r++) s += Math.floor(b * r / 100); return MESO_CHANCE * s / 21 };
const mesoKill = id => mesoAvg(D.mobs[id]?.[1]);
function mobKill(m, cls, L, dps, acc){
  const [nm, lv, hp, ex, eva, pdd, mdd, el] = m, magic = MAGIC.has(cls), els = ELEMS[cls] || [];
  const diff = lv - L, hit = hitProb(acc, eva, diff);
  let em = 1; if (els.length){ em = Math.max(...els.map(e => EMULT[el[e]] ?? 1)); if (em === 0) em = 1 }
  const eff = hp / (hit * lvlPen(diff) * em * 100 / ((magic ? mdd : pdd) + 100));
  return {hit, sec: eff / dps + 1};
}
// how many monsters one cast of an area attack hits on a map (estimate from spawn points): from each spawn point, count
// the others on the same platform (within 60 px up/down) inside the attack's reach, facing the busier side; the map's
// mapShare() of spawns are alive solo; capped at the skill's target count. reach = [front, back] px.
const AOE = {};
// damage kept per extra target: Iron Arrow pierces at 0.8^k (1, 0.8, 0.64, 0.512; OSMS launch client)
const AOE_FALL = {"Iron Arrow": 0.8};
function aoeHits(mid, targets, reach, fall = 0){
  if (!targets || targets <= 1 || !reach) return 1;
  const key = `${mid}|${targets}|${reach}|${fall}`; if (AOE[key]) return AOE[key];
  const P = D.mpos[mid] || []; if (P.length < 2) return AOE[key] = 1;
  let sum = 0; const alive = mapShare(mid);
  P.forEach(([x, y], i) => {
    let r = 0, l = 0, rb = 0, lb = 0;
    P.forEach(([x2, y2], j) => { if (i === j || Math.abs(y2 - y) > 60) return; const dx = x2 - x;
      if (dx >= 0 && dx <= reach[0]) r++; if (dx <= 0 && -dx <= reach[0]) l++;
      if (dx < 0 && -dx <= reach[1]) rb++; if (dx > 0 && dx <= reach[1]) lb++; });
    const n = Math.min(targets, 1 + alive * Math.max(r + rb, l + lb));
    sum += fall ? (1 - fall ** n) / (1 - fall) : n;   // n targets at 1, fall, fall², ... (fractional n interpolates)
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
    const raw = Math.min(party * exp / time, exp * mapShare(mid, party) / 7.56) / party, rate = raw * (1 + partyBonus(party));
    // att = share of the time you're attacking (not walking, not waiting for respawns): for potion/ammo upkeep
    rows.push({id: mid, name, open, mobs:[...names].join(", "), n, avg, hit: hitSum / n, rate, cyc: exp, hits, meso: raw * mes / exp, att: Math.min(1, raw * time / exp) * (time - walk) / time});   // kills/s of a mob = count × rate / cyc
  }
  return rows.sort((a,b) => b.rate - a.rate);
}
// each class's area attack at a level ([job, skill]); Thieves and 1st job Magicians have no damaging one
// (Double Shot isn't one: its 2 arrows split between targets, so total damage stays the same)
const AOE_SKILL = {Warrior: () => ["Warrior", "Slash Blast"], Bowman: L => L >= 30 ? ["Hunter", "Arrow Bomb"] : null,
  "I/L Wizard": () => ["I/L Wizard", "Thunder Bolt"], "F/P Wizard": () => ["F/P Wizard", "Poison Breath"]};   // Holy Arrow: 3 arrows split, like Double Shot
function classAoe(cls, L){
  const f = AOE_SKILL[cls], js = f && L >= 10 && f(L); if (!js) return null;
  const [job, name] = js, s = (D.skills[job] || []).find(x => x.n === name); if (!s || !s.rg) return null;
  // not learnable yet: the skill plus its prerequisites cost more SP than the job has given by L (a Lv 10 Warrior has 1 SP;
  // Slash Blast needs Power Strike 1 first, so it comes at 11). 1st job SP from 10, 2nd job from 30 (BLD spPool rule).
  const from = ["Warrior", "Magician", "Archer", "Rogue"].includes(job) ? 10 : 30;
  if (1 + 3 * (L - from) < 1 + (s.req || []).reduce((t, r) => t + r[1], 0)) return null;
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
// typed stats are clamped to 0-99,999 (a sanity bound, not a game cap): 1e308 printed a 300-digit number off the phone screen
const statNum = s => { const v = $(s).value.trim(); return v === "" || !isFinite(+v) ? null : Math.max(0, Math.min(99999, +v)) };
function setTrainStats(S){   // from "Use this in Where to train"
  const w = S.win || {}, pm = (w.pct || 100) / 100;
  $("#atk").value = w.max ? `${Math.round(w.min / pm)}-${Math.round(w.max / pm)}` : "";
  $("#umag").value = w.magic || ""; $("#uint").value = w.magic ? w.INT : "";
  $("#uacc").value = S.acc != null ? Math.round(S.acc) : ""; $("#uavo").value = S.def?.avoid ?? ""; $("#uhp").value = S.def?.hp ?? ""; $("#uwdef").value = S.def?.wdef ?? "";
  DPS_FROM_BUILDER = S.dps || null;
  FORM_FROM_BUILDER = w.form ? {...w.form, pct: w.pct, hits: w.hits, crit: w.crit, critDmg: w.critDmg} : null;
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
    if (mag && int != null) return {dps: per(mag * (int * (b.mast || 0) / 125 + 1 + int / 125 + 1) / 2), src: "you"} }
  else { const m = $("#atk").value.match(/(\d+)\D+(\d+)/); if (m) return {dps: per((+m[1] + +m[2]) / 2), src: "you"} }
  return b.dps > 0 ? {dps: b.dps, src: "default"} : {dps: 20 * L, src: "guess"};
}
// Kill breakpoints (estimate). Per-hit damage range after the skill's % and before the monster's defense, from the same
// source as the damage above (typed boxes, the Character Builder hand-off, else the default build; never the 20 × level
// guess, which has no range). Each hit assumed to roll evenly between min and max; a crit multiplies it by (100 + crit
// damage)%. Defense ×100/(def+100), level penalty and element as mobKill. form = the damage formula's inputs
// (50-builder.js calc) so +W.Atk / +main stat can be tried; a typed Attack range alone has none (stat split unknown).
let FORM_FROM_BUILDER = null;   // {…calc form, pct, hits, crit, critDmg} from "Use this in Where to train"; cleared with DPS_FROM_BUILDER
const formWin = (f, dA = 0, dS = 0) => { if (f.magic){ const I = f.INT + dS, M = f.M + dA + Math.floor(I / 2) - Math.floor(f.INT / 2); return [M * (I * f.mast / 125 + 1), M * (I / 125 + 1)] }
  const p = f.prim + dS, w = f.watk + dA; return [(0.8 + (p * f.wmult * f.mast + f.sec) / 100 + f.atkB / 50) * w, (1 + (p * f.wmult + f.sec) / 100 + f.atkB / 50) * w] };
function trainRange(b, basic){
  const F = FORM_FROM_BUILDER, src = F || b, base = {pm: basic ? 1 : (src.pct || 100) / 100, hits: basic ? 1 : src.hits || 1, crit: src.crit || 0, critDmg: src.critDmg || 0};
  if (F && (basic ? !F.magic : true)) return {...base, magic: !!F.magic, form: F, win: formWin(F)};
  if (b.magic && !basic){ const mag = statNum("#umag"), int = statNum("#uint");
    const f = mag && int != null ? {magic: true, M: mag, INT: int, mast: b.mast || 0} : b.form;
    return f?.magic ? {...base, magic: true, form: f, win: formWin(f)} : null }
  const m = $("#atk").value.match(/(\d+)\D+(\d+)/);
  if (m) return +m[2] > 0 ? {...base, magic: false, form: null, win: [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])]} : null;
  return b.form && !b.form.magic ? {...base, magic: false, form: b.form, win: formWin(b.form)} : null;
}
// chance that n hits (each even on [lo, hi], crit chance c% for ×k) add up to at least hp: binned convolution, normal past 16 hits
function pKill(n, lo, hi, c, k, hp){
  const top = c > 0 ? hi * k : hi; if (n <= 0 || n * top < hp) return 0; if (n * lo >= hp) return 1;
  const segs = [[lo, hi, 1 - c / 100]]; if (c > 0) segs.push([lo * k, hi * k, c / 100]);
  if (n > 16){ let mu = 0, m2 = 0; for (const [a, b, w] of segs){ mu += w * (a + b) / 2; m2 += w * ((b - a) ** 2 / 12 + ((a + b) / 2) ** 2) }
    const sd = Math.sqrt(n * (m2 - mu * mu)), z = (hp - n * mu) / (sd || 1e-9), t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
    const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? tail : 1 - tail }
  const B = 64, w = top / B, one = new Float64Array(B);
  for (const [a, b, m] of segs) for (let i = 0; i < B; i++){ const x0 = Math.max(a, i * w), x1 = Math.min(b, (i + 1) * w); if (x1 > x0) one[i] += m * (b > a ? (x1 - x0) / (b - a) : 1) }
  let dist = one;
  for (let j = 1; j < n; j++){ const out = new Float64Array(dist.length + B - 1); for (let i = 0; i < dist.length; i++) if (dist[i]) for (let q = 0; q < B; q++) out[i + q] += dist[i] * one[q]; dist = out }
  // index i of an n-hit sum = n bin centres: (i + n/2) × w, its mass spread over one bin width around that
  let p = 0; for (let i = 0; i < dist.length; i++){ const x = (i + n / 2) * w; p += dist[i] * Math.max(0, Math.min(1, (x + w / 2 - hp) / w)) }
  return Math.max(0, Math.min(1, p));
}
// accuracy for a hit chance (hitProb), searched in whole points: null past +999
const accFor_ = (acc, eva, diff, want) => { for (let d = 0; d <= 999; d++) if (hitProb(acc + d, eva, diff) >= want - 1e-9) return d; return null };
function killInfo(m, L, R, acc, cls){
  const [nm, lv, hp, , eva, pdd, mdd, el] = m, diff = lv - L, els = R.magic ? ELEMS[cls] || [] : [];
  let em = 1; if (els.length){ em = Math.max(...els.map(e => EMULT[el[e]] ?? 1)); if (em === 0) em = 1 }
  const f = lvlPen(diff) * em * 100 / ((R.magic ? mdd : pdd) + 100), k = (100 + R.critDmg) / 100, hit = hitProb(acc, eva, diff);
  const per = win => [win[0] * R.pm * f, win[1] * R.pm * f], [lo, hi] = per(R.win), H = R.hits;
  const out = {nm, hp, hit, acc95: hit >= 0.95 ? 0 : accFor_(acc, eva, diff, 0.95), acc100: hit >= 1 ? 0 : accFor_(acc, eva, diff, 1)};
  if (!(lo > 0)) return out;
  const sure = Math.ceil(hp / (H * lo) - 1e-9); out.sure = sure;
  // chance of a kill in fewer attacks than the sure one, from sure-1 down while it's at least 0.5%: [[attacks, chance]], fastest first
  out.ps = []; for (let c = sure - 1; c >= 1; c--){ const q = pKill(c * H, lo, hi, R.crit, k, hp); if (q < 0.005) break; out.ps.unshift([c, q]) }
  if (sure > 1 && R.form){ const need = hp / ((sure - 1) * H), ok = (dA, dS) => per(formWin(R.form, dA, dS))[0] >= need - 1e-9;
    out.atk = null; for (let d = 1; d <= 200; d++) if (ok(d, 0)){ out.atk = d; break }
    out.stat = null; for (let d = 1; d <= 999; d++) if (ok(0, d)){ out.stat = d; break } }
  return out;
}
const pctTxt = q => q > 0.995 ? ">99%" : Math.round(q * 100) + "%";
const hitWord = (n, H) => H > 1 ? `${n} attack${n === 1 ? "" : "s"}` : `${n} hit${n === 1 ? "" : "s"}`;
function kbpHtml(mid, L, R, acc, cls){
  if (!R) return "";
  const sp = (D.maps[mid]?.[2] || []).filter(([id]) => D.mobs[id]), seen = new Set(), ks = [];
  for (const [id, c] of [...sp].sort((a, b) => b[1] - a[1])) if (!seen.has(id)){ seen.add(id); ks.push(killInfo(D.mobs[id], L, R, acc, cls)) }
  const k0 = ks[0]; if (!k0?.sure) return "";
  const H = R.hits, aName = R.form?.magic ? "Magic ATT" : "W.Atk", sName = R.form?.magic ? "INT" : R.form?.stat || "";
  const lines = ks.map(k => { if (!k.sure) return "";
    const now = `${k.ps.map(([c, q]) => `${hitWord(c, H)} ${pctTxt(q)}, `).join("")}${hitWord(k.sure, H)} always`;
    const nxt = k.sure === 1 ? "" : !R.form ? "" : k.atk == null && k.stat == null ? `<br>${hitWord(k.sure - 1, H)} always: out of reach of +200 ${aName}`
      : `<br>${hitWord(k.sure - 1, H)} always: ${[k.atk != null ? `+${k.atk} ${aName}` : "", k.stat != null ? `+${k.stat} ${sName}` : ""].filter(Boolean).join(" or ")}`;
    const ac = k.hit >= 1 ? "" : `<br>hit ${(k.hit * 100).toFixed(1)}%: ${k.acc95 ? `+${k.acc95} Acc for 95%, ` : ""}${k.acc100 != null ? `+${k.acc100} for 100%` : "100% out of reach"}`;
    return `<div><b>${esc(k.nm)}</b> · ${fmt(k.hp)} HP<br>${now}${nxt}${ac}</div>` }).join("");
  const w = H > 1 ? "attack" : "hit", f0 = k0.ps.find(([, q]) => q >= 0.5), label = `${k0.sure}-${w} sure${f0 ? ` · ${f0[0]}-${w} ${pctTxt(f0[1])}` : ""}`;
  return `<details class="kbp"><summary><span class="pill" title="${H > 1 ? `Attacks (${H} hits each)` : "Hits"} that land to kill ${esc(k0.nm)}: always enough, and the fastest kill that happens at least half the time (estimate; click for every monster and what one fewer takes)">${label}</span></summary><div class="sub">${lines}${R.form ? "" : `<div>+${aName} breakpoints need your build: Character Builder → Use this in Where to train, or clear the Attack box.</div>`}</div></details>`;
}
// worst monster on the map: accuracy to hit them all 100%
const accNeed = (mid, L, acc) => { let w = 0; for (const [id] of D.maps[mid]?.[2] || []){ const m = D.mobs[id]; if (!m) continue; const h = hitProb(acc, m[4], m[1] - L); if (h >= 1) continue; const d = accFor_(acc, m[4], m[1] - L, 1); if (d == null) return null; w = Math.max(w, d) } return w };
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
// PW: meso.watch player-shop prices {itemId: [median, p25, p75, sales, flags 1 = low data / 2 = per set, trend]}, read D.pw.read.
// trend = meso.watch's own recent price trend (fraction, -0.6 = 60% down); its window isn't published to us, so it's labelled
// "recent". PWNOW: cheapest live Free Market listing per non-equip item {itemId: [price each, qty, channel, map, seller]}, as of
// D.pw.listed (UTC), from meso.watch's live listings. Equips left out: rolls and scrolls make them incomparable (Danny, 2026-10-19).
const PW = D.pw?.it || {}, PWNOW = D.pw?.now || {}, MDB = D.mdb?.it || {}, MDBL = D.mdb?.ls || {};
const pwSolid = id => PW[id] && !(PW[id][4] & 1) ? PW[id][0] : 0;
const pwTrend = id => { const p = PW[id], t = p?.[5]; if (t == null || p[4] & 1 || Math.abs(t) < 0.005) return "";
  return `<span class="${t > 0 ? "up" : "down"}" title="Recent price trend (meso.watch)">${t > 0 ? "▲" : "▼"}${Math.round(Math.abs(t) * 100)}%</span>` };
// sell-through = sold / (sold + asks): the share of units put up for sale that were bought (meso.watch). Tags use our own
// cut-offs (about the top and bottom tenth of items with enough sales on 2026-10-17): 40%+ sells fast, under 10% slow.
const pwSell = id => { const p = PW[id], v = p?.[6]; return v == null || p[4] & 1 ? null : v };
const pwSellTag = id => { const v = pwSell(id); return v == null ? "" : v >= 0.4 ? ` <span class="pill p-good" title="${Math.round(v * 100)}% of units put up for sale were bought (meso.watch)">sells fast</span>`
  : v < 0.1 ? ` <span class="pill p-bad" title="Only ${Math.round(v * 100)}% of units put up for sale were bought (meso.watch)">slow seller</span>` : "" };
// listed now vs the usual (median) sale price; cheap = at least 20% under a solid median (our own cut-off)
const pwNowRatio = id => PWNOW[id] && pwSolid(id) ? PWNOW[id][0] / pwSolid(id) : null;
const pwCheap = id => { const r = pwNowRatio(id); return r != null && r <= 0.8 };
// "listings updated 3 h ago": D.pw.listed is "YYYY-MM-DD HH:MM" UTC; worked out when shown (Danny 2026-10-19: easier than a UTC time)
const pwListedAgo = () => { const t = Date.parse((D.pw?.listed || "").replace(" ", "T") + "Z"); if (isNaN(t)) return "";
  const m = Math.max(0, (Date.now() - t) / 6e4);
  return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 48 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
// meowdb drop report confidence: net votes (players confirming minus disputing; meowdb weights some votes, rounded in the build)
const votesHtml = v => `<span class="sub" title="Net player votes on meowdb's drop report: players who confirmed it minus those who disputed it">${fmt(v)} confirmed</span>`;
// Cheapest NPC shop that sells an item: [npc, mapId, mapName, price, test] (meowdb shop list: D.ishop, + D.shopsell for quest items)
const shopBest = id => { const ss = D.shopsell?.[id];
  return [...(D.ishop?.[id] || []), ...(ss ? [[ss[0], "", ss[1], ss[2], ""]] : [])].filter(s => s[3] > 0).sort((a, b) => a[3] - b[3] || !!a[4] - !!b[4])[0] || null };   // ties: launch-read price first
// "NPC sells for less": the cheapest NPC shop beats the cheapest live listing (or the usual player price when nothing is listed)
const npcCheaper = id => { const s = shopBest(id), n = PWNOW[id]?.[0] || PW[id]?.[0]; return s && n > s[3] ? s : null };
const npcCheaperPill = id => { const s = npcCheaper(id);
  return s ? `<span class="pill p-warn" title="${esc(s[0])} (${esc(s[2])}) sells it for ${fmt(s[3])} mesos, under the player-shop price (meowdb shop list${s[4] ? ", " + s[4] + " price" : ""})">NPC sells for less</span>` : "" };
// Every market price we know for one item, one row per source (Items page "Prices" table). A new price source adds a row by
// pushing a function id -> {src, kind, v, detail, n, when, few} (or null when it has nothing for that item) onto PRICE_SRC:
// v = its headline price, detail = short html (range, low), n = what it's based on ("200 sales"), when = how fresh.
const PRICE_SRC = [
  id => { const p = PW[id]; if (!p) return null; const sv = pwSell(id);
    return {src: "meso.watch", kind: "sales seen on stream", v: p[0], per: p[4] & 2 ? "per set" : "", trend: pwTrend(id),
      detail: `half sold for ${fmt(p[1])}-${fmt(p[2])}${sv != null ? ` · ${Math.round(sv * 100)}% of units listed were bought` : ""}`,
      n: `${fmt(p[3])} sale${p[3] === 1 ? "" : "s"}`, few: !!(p[4] & 1), when: D.pw.read} }];
// Every live listing with a place to find it, cheapest first (Items page "Where to buy"). A source with locations pushes a function
// id -> [{v, qty, ch, room, spot, who, ago, src, buy, note}] onto LIST_SRC. meso.watch keeps only the cheapest listing per item.
const LIST_SRC = [id => { const n = PWNOW[id]; return n ? [{v: n[0], qty: n[1], ch: n[2], room: n[3], who: n[4], ago: pwListedAgo(), src: "meso.watch"}] : [] }];
const listingsOf = id => LIST_SRC.flatMap(f => f(id)).filter(x => x.v > 0);
function pwHtml(id, long){ const p = PW[id]; if (!p) return "";
  const per = p[4] & 2 ? " per set" : "", low = p[4] & 1 ? ` <span class="pill p-warn" title="Fewer than 5 sales seen: rough">few sales</span>` : "";
  const tr = pwTrend(id) ? " " + pwTrend(id) : "", st = pwSellTag(id), sv = pwSell(id);
  return long ? `Player shops: about <b>${fmt(p[0])} mesos</b>${per}${tr} (median of ${fmt(p[3])} sale${p[3] === 1 ? "" : "s"} seen; half sold for ${fmt(p[1])}-${fmt(p[2])}${sv != null ? `; ${Math.round(sv * 100)}% of units put up for sale were bought` : ""})${low}${st}<br><span class="sub">meso.watch, as of ${D.pw.read}. Prices move; check before you sell.</span>`
    : `players ~${fmt(p[0])}${per}${tr}${low}${st}` }
const LOOT_BY_MOB = {}; for (const [it, ms] of Object.entries(D.drops || {})) if ((it.startsWith("4000") || POTION_IDS.includes(it)) && D.items[it]?.p) for (const [mob] of ms) (LOOT_BY_MOB[mob] ||= []).push(it);
const lootKill = (mob, pw) => (LOOT_BY_MOB[mob] || []).reduce((a, it) => a + (pw && pwSolid(it) || D.items[it].p), 0);
function lootHr(r, rate, pw){ let v = 0; for (const [id, c] of D.maps[r.id]?.[2] || []) v += c * r.rate / r.cyc * lootKill(id, pw); return v * rate * 3600 }
// Players' EXP/hr on a map: grind tracker runs shared by players within 5 levels, solo or party like you (D.shared.rows, one
// row per player = their typical run). Shown only once 3+ separate players or parties ran it; runs under half or over double
// the median are dropped (same rules as the tracker's speed check and beanguri's overlay).
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null };
function playersExp(map, L, party){
  const a = (D.shared?.rows || []).filter(r => r[0] === String(map) && r[1] === (party > 1 ? 1 : 0) && Math.abs(r[2] - L) <= 5);
  if (!a.length) return null;
  const m = median(a.map(r => r[3])), kept = a.filter(r => r[3] >= m / 2 && r[3] <= m * 2), groups = new Set(kept.map(r => r[4])).size;
  const dh = kept.map(r => r[5]).filter(v => v != null);   // deaths/hr: trackers from 0.2.2 on
  const uh = kept.map(r => r[6]).filter(v => v != null);   // mesos/hr on potions, food, arrows: trackers from 0.2.6 on
  return groups >= 3 ? {expHr: median(kept.map(r => r[3])), groups, lo: Math.min(...kept.map(r => r[2])), hi: Math.max(...kept.map(r => r[2])),
    deathsHr: dh.length >= 3 ? median(dh) : null, usedHr: uh.length >= 3 ? median(uh) : null} : null;
}
const peLine = (pe, party) => `<div class="sub" title="Median of ${pe.groups} grind tracker players or parties at level ${pe.lo}-${pe.hi} (${party > 1 ? "party" : "solo"}), shared runs read ${esc(D.shared.read)}">players: ${fmt(pe.expHr)}${pe.deathsHr != null ? ` · ${+pe.deathsHr.toFixed(1)} death${+pe.deathsHr.toFixed(1) === 1 ? "" : "s"}/hr` : ""}${pe.usedHr != null ? ` · pots/ammo ${fmt(pe.usedHr)}/hr` : ""}</div>`;
// best time to farm: shared runs by time of day (3-hour blocks), each run against the same player's usual speed on the map
// (D.shared.times; a block shows once 3+ players ran it then). Hours are shown in the viewer's own time zone.
const localHour = h => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString([], {hour: "numeric"});
function bestTime(map){
  const t = D.shared?.times?.[String(map)]; if (!t) return null;
  const best = t.reduce((a, b) => b[1] > a[1] ? b : a);
  return best[1] >= 1.05 ? {from: localHour(best[0]), to: localHour((best[0] + 3) % 24), pct: Math.round((best[1] - 1) * 100), players: best[2], blocks: t.length} : null;
}
const btLine = bt => bt ? `<div class="sub" title="Grind tracker runs on this map by time of day, each against the same player's usual speed there (${bt.players} players in the best 3 hours; ${bt.blocks} time blocks with 3+ players). Your time zone.">best time: ${bt.from}-${bt.to} (+${bt.pct}%)</div>` : "";
function rankMaps(){
  let cls = $("#cls").value, L = Math.min(MAX_LEVEL, Math.max(1, Math.round(+$("#lvl").value) || 25));
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
  // "Farmed by players": only maps grind tracker players around your level shared runs on, fastest for them first
  const byPlayers = $("#tmode").value === "players";
  if (byPlayers){ rows = mapRates(cls, L, dps, acc, Infinity, area, party).map(r => ({...r, pe: playersExp(r.id, L, party)})).filter(r => r.pe).sort((a, b) => b.pe.expHr - a.pe.expHr); far = false }
  let loss = false;
  if (frugal){
    for (const r of rows){ r.dng = mapDanger(r.id, L, def); r.up = (cost?.mesoHr || 0) * (r.att ?? 1); r.hitc = hitCostHr(r, L, def, hitsh);
      // what tracker players near your level really spent there on potions, food and ammo replaces both estimates
      const pe = r.pe || playersExp(r.id, L, party); if (pe?.usedHr != null){ r.real = pe.usedHr; r.up = pe.usedHr; r.hitc = 0 } r.loot = lootHr(r, +$("#lootr").value, $("#lootp").value === "pw"); r.net = r.meso * 3600 + r.loot - r.up - r.hitc }
    const ok = rows.filter(r => r.net > 0 && r.dng.f < 0.25);
    if (ok.length) rows = ok; else { rows.sort((a, b) => b.net - a.net); loss = rows.length > 0 }
  }
  const R = trainRange(fb, basic);
  const top = rows.slice(0, 15), best = Math.max(...top.map(r => r.rate), 1e-9), need = D.exp[L];
  $("#maprows").innerHTML = top.length ? top.map((r,i) => `<tr>
    <td class="num">${i+1}</td>
    <td>${mapLink(r.id, r.name)}${r.open ? "" : ' <span class="pill p-warn">opens later</span>'}${area ? `<div class="sub">hits ~${r.hits.toFixed(1)} per cast</div>` : ""}${frugal && mapPots(r.id).length ? `<div class="sub">drops ${mapPots(r.id).map(p => `<span class="itname" tabindex="0" data-item="${p}">${esc(D.items[p]?.n || p)}</span>`).join(", ")}</div>` : ""}</td>
    <td class="sub">${mobList(r.mobs)}${kbpHtml(r.id, L, R, acc, cls)}</td>
    <td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td>
    <td class="num">${r.hit < .9 ? `<span class="pill p-warn">${Math.round(r.hit*100)}%</span>` : Math.round(r.hit*100) + "%"}${r.hit < 0.995 ? (n => n ? `<div class="sub" title="Accuracy to hit every monster here 100% of the time">+${n} Acc → 100%</div>` : "")(accNeed(r.id, L, acc)) : ""}</td>
    <td>${dangerPill(r.dng || mapDanger(r.id, L, def))}</td><td class="sub">${esc(potsText(r.id))}</td>
    <td><span class="bar"><i style="width:${Math.round(100*r.rate/best)}%"></i></span><span class="mono">${Math.round(100*r.rate/best)}</span></td>
    <td class="num">${fmt(r.rate*3600)}${(pe => pe ? peLine(pe, party) : "")(r.pe || playersExp(r.id, L, party))}${btLine(bestTime(r.id))}</td>
    <td class="num">${fmt(r.meso*3600)}${frugal ? `<div class="sub" title="Mesos ${fmt(r.meso * 3600)} + loot sold ${fmt(r.loot)} − ${r.real != null ? `potions/food/ammo players really used ${fmt(r.real)}` : `upkeep ${fmt(r.up)} − getting hit ${fmt(r.hitc)}`} per hr">net <b${r.net > 0 ? "" : ' style="color:var(--bad)"'}>${r.net > 0 ? "+" : ""}${fmt(r.net)}</b>${r.real != null ? " (players' costs)" : ""}</div>` : cost ? `<div class="sub">net ${fmt(r.meso*3600 - cost.mesoHr * (r.att ?? 1))}</div>` : ""}</td>
    <td class="num">${need ? (need/(r.rate*3600)).toFixed(1) : "–"}</td></tr>`).join("")
    : `<tr><td colspan="12" class="empty">${byPlayers ? `No map has runs from 3+ grind tracker players or parties within 5 levels of ${L} (${party > 1 ? "party" : "solo"}) yet.` : "No map fits this level and class. Try a different level."}</td></tr>`;
  const how = basic ? `basic attacks (100%, one hit), ${fb.crit || 0}% crit for +${fb.critDmg || 0}% and ${esc(fb.weapon || "a default weapon")}'s speed`
    : `${esc(fb.skill || "a basic attack")}${fb.pct && fb.pct !== 100 ? ` (${fb.pct}%${fb.hits > 1 ? ` × ${fb.hits}` : ""})` : ""}, ${fb.crit || 0}% crit for +${fb.critDmg || 0}% and ${fb.magic ? "spell speed" : `its weapon's speed (${esc(fb.weapon || "?")})`}`;
  const note1 = `Damage: <b>${fmt(Math.round(dps))}</b>/s ${src === "builder" ? "from your Character Builder setup" : src === "you" ? `from your ${magIn ? "Magic and INT" : "Attack range"} with ${how}, from the default build at your level` : src === "default" ? `from the Character Builder's default build at level ${L} (${esc(fb.weapon || "")}, ${basic ? "basic attacks" : esc(fb.skill || "")}); type your stat-window ${magIn ? "Magic and INT" : "Attack range"} for your own` : `a rough guess (20 × level)${basic && fb.magic ? "; type your stat-window Attack range for wand or staff hits" : ""}`}. `
    + (statNum("#uacc") != null ? `Accuracy <b>${Math.round(acc)}</b> as typed.` : ACC_FROM_BUILDER != null ? `Accuracy <b>${Math.round(acc)}</b> from your Character Builder setup.`
    : `Assumed accuracy at level ${L}: <b>${Math.round(acc)}</b> (all AP in your main stat, secondary stat equal to your level, no accuracy gear${cls==="Warrior"&&L>=15?", Precise Strikes maxed":cls==="Thief"&&L>=15?", Nimble Body maxed":""}).`)
    + (need ? ` Level ${L}→${L+1} needs <b>${fmt(need)}</b> EXP.` : "");
  // the rest of the working sits folded under the summary (audit 10-21: a 10-line paragraph pushed the table down)
  const note2 = ""
    + (area ? ` Attack: <b>${esc(area.n)}</b>, up to ${area.t} monsters within ${area.r[0]}${area.r[1] ? ` / ${area.r[1]}` : ""} px; hits per cast are estimated from each map's spawn points.`
      : basic ? ` Basic attacks only (100%, one hit${fb.weapon ? `, ${esc(fb.weapon)} speed` : ""}).` : $("#aoe").value ? ` ${esc(cls)} has no area attack at level ${L}, so this is single target.` : ` Single target.`)
    + (party > 1 ? ` Party of ${party}: your share of the EXP plus the ${Math.round(partyBonus(party) * 100)}% party bonus, map capacity +${Math.max(0, Math.floor(0.75 * (party - 5)))} monsters (OSMS theory, unverified; assumes equal players splitting kills).` : "")
    + ` Danger: one touch from the map's hardest hitter as a share of ${DEF_FROM_BUILDER || statNum("#uhp") != null ? "your" : "a typical"} Max HP (${fmt(def.hp)}), before armor.`
    + ` Mesos/hr = monster meso drops: floor(2.1 × monster level) + 3, ±10%, on about 67% of kills (OSMS formulas page); a party splits them evenly on average. Loot sold to NPCs isn't counted.`
    + (frugal ? ` <b>Frugal:</b> only maps that pay for themselves and aren't Danger/Lethal, fastest EXP first. Net = mesos/hr minus ${basic ? (ammoP ? `ammo for basic attacks` : "nothing for basic attacks") : COST_FROM_BUILDER ? "your build's skill potions and ammo" : `a default ${esc(cls)} build's skill potions and ammo`} (${fmt(cost?.mesoHr || 0)}/hr attacking nonstop, times the time spent attacking) minus Red Potions for getting hit (estimate: ${({"0.1": "1 in 10", "0.25": "1 in 4", "0.5": "half", "1": "every one"})[$("#hitsh").value]} of the monsters you kill attack${hitsh === 1 ? "s" : ""} you once, at their hit chance against your avoid, no armor). ${+$("#lootr").value ? `Plus loot sold to NPCs: each monster's reported ETC item and potion drops (meowdb player reports) at ${Math.round($("#lootr").value * 100)}% per kill each (an assumption: drop rates aren't in the game files), ${$("#lootp").value === "pw" ? "at the median player-shop sale price (meso.watch, " + D.pw.read + ") where it has 5+ sales, else NPC sell price; selling to players takes a shop and time" : "at NPC sell price"}; ores, gems, equips and scrolls aren't counted.` : "Loot sold to NPCs isn't counted."} Potions its monsters drop are listed under the map name.${rows.some(r => r.real != null) ? ` "(players' costs)": instead of both estimates, what grind tracker players near your level really spent there on potions, food and ammo (median, 3+ players).` : ""}`
      + (loss ? ` <b>No map comes out meso positive at this level and damage</b>; these lose the least.` : "") : "")
    + (!frugal && COST_FROM_BUILDER ? ` Your build's potions and ammo: up to ${fmt(COST_FROM_BUILDER.mesoHr)} mesos/hr while attacking nonstop; on the top map you attack about ${Math.round((top[0]?.att ?? 1) * 100)}% of the time, so about ${fmt(COST_FROM_BUILDER.mesoHr * (top[0]?.att ?? 1))}/hr. "net" = mesos/hr minus that.` : "")
    + (R ? ` Kill badge (under the monsters): hits that land to kill the map's most common monster from your damage range after its defense, level penalty${R.magic ? " and element" : ""} (estimate: each hit rolls evenly between min and max, crits ${R.crit}% for +${R.critDmg}%; misses not counted). Click it for each monster and the +${R.form?.magic ? "Magic ATT" : "W.Atk"} or +${R.form?.magic ? "INT" : R.form?.stat || "main stat"} that makes one fewer hit a sure kill.` : ` No kill badges: ${basic && fb.magic ? "type your stat-window Attack range for wand or staff hits" : "no damage range to work from"}.`)
    + ` EXP/hr is a model estimate${party > 1 ? "" : ", solo"}.` + (D.shared?.rows?.length ? ` "players:" under it = what grind tracker players around your level really got there (median, shown once 3+ players or parties ran the map).` : "") + (Object.keys(D.shared?.times || {}).length ? ` "best time:" = the 3 hours of the day (your time) when tracker players farm that map fastest compared with their own usual speed there.` : "")
    + (far ? ` <b>No map has monsters within 12 levels of you</b> (Victoria Island tops out around level 60-75), so these are the best of the rest.` : "");
  const open = $("#mapnote .mnmore")?.open;
  $("#mapnote").innerHTML = `${note1}${far ? ` <b>No map has monsters within 12 levels of you.</b>` : ""}${loss && frugal ? ` <b>No map comes out meso positive.</b>` : ""} <details class="mnmore"${open ? " open" : ""}><summary>How these numbers are worked out</summary>${note2.trim()}</details>`;
  saveTrain();
}
["#cls","#lvl"].forEach(s => $(s).addEventListener("input", () => { ACC_FROM_BUILDER = null; AOE_FROM_BUILDER = null; DEF_FROM_BUILDER = null; COST_FROM_BUILDER = null; DPS_FROM_BUILDER = null; FORM_FROM_BUILDER = null; rankMaps() }));
$("#cls").addEventListener("change", () => { STAT_IN.forEach(s => $(s).value = ""); rankMaps() });   // another class's stats don't carry over
$("#party").addEventListener("change", rankMaps);
$("#tmode").addEventListener("change", rankMaps);
$("#hitsh").addEventListener("change", rankMaps);
$("#lootr").addEventListener("change", rankMaps);
$("#lootp").addEventListener("change", rankMaps);
$("#aoe").addEventListener("change", rankMaps);
STAT_IN.forEach(s => $(s).addEventListener("input", () => { DPS_FROM_BUILDER = null; FORM_FROM_BUILDER = null; rankMaps() }));
$("#lvl").addEventListener("change", rankMaps);
// Where to train settings + the Character Builder hand-off ("Use this in Where to train") survive a reload: saved after
// every ranking under "train", loaded (and checked: hand edits, old versions) before the first ranking (69-search.js)
const TRAIN = ["cls", "lvl", "party", "tmode", "aoe", "hitsh", "lootr", "lootp", "atk", "umag", "uint", "uacc", "uavo", "uhp", "uwdef"];
const fin = x => typeof x === "number" && isFinite(x);
const numObj = (o, keys) => o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(keys.filter(k => fin(o[k])).map(k => [k, o[k]])) : null;
function saveTrain(){
  try { localStorage.setItem("train", JSON.stringify({v: Object.fromEntries(TRAIN.map(k => [k, $("#" + k).value])),
    fb: {acc: ACC_FROM_BUILDER, aoe: AOE_FROM_BUILDER, def: DEF_FROM_BUILDER, cost: COST_FROM_BUILDER, dps: DPS_FROM_BUILDER, form: FORM_FROM_BUILDER}})) } catch(e) {}
}
function loadTrain(){
  const o = savedState("train", {v: {}, fb: {}}), v = o.v || {}, fb = o.fb || {};
  for (const k of TRAIN){ const x = v[k], el = $("#" + k); if (typeof x !== "string" || x.length > 20) continue;
    if (el.options ? [...el.options].some(op => op.value === x) : k === "lvl" ? /^\d{1,3}$/.test(x) : /^[\d\s-]*$/.test(x)) el.value = x }
  ACC_FROM_BUILDER = fin(fb.acc) ? fb.acc : null; DPS_FROM_BUILDER = fin(fb.dps) && fb.dps >= 0 ? fb.dps : null;
  const d = numObj(fb.def, ["hp", "wdef", "mdef", "mult", "mmult", "avoid"]); DEF_FROM_BUILDER = d && fin(d.hp) && fin(d.wdef) ? d : null;
  const c = numObj(fb.cost, ["mpHr", "hpHr", "ammoHr", "ammoPrice", "mesoHr"]); COST_FROM_BUILDER = c && fin(c.mesoHr) ? c : null;
  const fm = numObj(fb.form, ["watk", "prim", "sec", "wmult", "mast", "atkB", "M", "INT", "pct", "hits", "crit", "critDmg"]), mg = fb.form?.magic === true;
  FORM_FROM_BUILDER = DPS_FROM_BUILDER && fm && (mg ? ["M", "INT", "mast"] : ["watk", "prim", "sec", "wmult", "mast", "atkB"]).every(k => k in fm)
    ? {...fm, magic: mg, ...(!mg && /^(STR|DEX|INT|LUK)$/.test(fb.form.stat) ? {stat: fb.form.stat} : {})} : null;
  const a = fb.aoe, r = Array.isArray(a?.r) && a.r.length <= 2 && a.r.every(fin) ? a.r : null;
  AOE_FROM_BUILDER = a && fin(a.t) && a.t > 1 && a.t <= 15 && r && typeof a.n === "string" ? {t: a.t, r, n: a.n.slice(0, 40)} : null;
}


// bosses and timed spawns (D.timed from the export's spawn timers)
const dur = s => s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
$("#timedrows").innerHTML = (D.timed || []).map(([id, name, lv, hp, exp, mid, mname, n, t, boss]) => `<tr${boss ? ' class="vrow"' : ""}>
  <td>${D.mobs[id] ? mobLink(id) : `<b>${esc(name)}</b>`}${boss ? ' <span class="pill p-hot">boss</span>' : ""}</td><td class="num">${lv}</td><td class="num">${fmt(hp)}</td><td class="num">${fmt(exp)}</td>
  <td>${mapLink(mid, mname)}</td><td class="num">${n}</td><td class="num">${dur(t)}${name === "Mushmom" ? ' <span class="sub">(players: ~90 min)</span>' : ""}</td></tr>`).join("");
