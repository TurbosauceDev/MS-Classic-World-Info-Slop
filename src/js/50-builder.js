/* character planner */
let buildAt; // set inside the builder; used by the Path Planner
let BLD;     // builder internals for the screenshot import (52-shotimport.js)
/* ---------------- character planner ---------------- */
(() => {
const WMULT = { // [swing, stab, shoot] from the client damage routine
  "1H Sword":[1.8,1.8], "2H Sword":[2.5,2.5], "1H Blunt Weapon":[2.4,1.2], "2H Blunt Weapon":[3,2],
  "1H Axe":[2.4,1.2], "2H Axe":[3,2], "Spear":[1.5,3.5], "Polearm":[3.5,1.5],
  "Bow":[1,1,2.5], "Crossbow":[1,1,2.5], "Claw":[1,1,2.5], "Dagger":[1,2], "Wand":[1.8,1.8], "Staff":[1.8,1.8]
};
const SWING_SHARE = {"Crossbow":0.5}; // others 60/40 swing/stab for melee
const BRANCHES = {
  Warrior:  [["Warrior",0,["1H Sword","2H Sword","1H Axe","2H Axe","1H Blunt Weapon","2H Blunt Weapon","Spear","Polearm"]],
             ["Fighter",30,["1H Sword","2H Sword","1H Axe","2H Axe"]],["Page",30,["1H Sword","2H Sword","1H Blunt Weapon","2H Blunt Weapon"]],
             ["Spearman",30,["Spear","Polearm"]]],
  Magician: [["Magician",0,["Wand","Staff"]],["F/P Wizard",30,["Wand","Staff"]],["I/L Wizard",30,["Wand","Staff"]],["Cleric",30,["Wand","Staff"]]],
  Bowman:   [["Archer",0,["Bow","Crossbow"]],["Hunter",30,["Bow"]],["Crossbowman",30,["Crossbow"]]],
  Thief:    [["Rogue",0,["Claw","Dagger"]],["Assassin",30,["Claw"]],["Bandit",30,["Dagger"]]]
};
const JOBLABEL = {Warrior:"Warrior", Magician:"Mage", Bowman:"Bowman", Thief:"Thief"};
const PRIMARY = {Warrior:"STR", Magician:"INT", Bowman:"DEX", Thief:"LUK"};
const SECONDARY = {Warrior:"DEX", Magician:"LUK", Bowman:"STR", Thief:"DEX"};
const NEEDS_WEAPON = {"Arrow Blow":["Bow","Crossbow"],"Double Shot":["Bow","Crossbow"],"Power Knockback":["Bow","Crossbow"],
  "Arrow Bomb":["Bow"],"Iron Arrow":["Crossbow"],"Lucky Seven":["Claw"],"Drain":["Claw"],
  "Double Stab":["Dagger"],"Savage Blow":["Dagger"],"Steal":["Dagger"]};
const STAB_ONLY = new Set(["Double Stab","Savage Blow"]);
const AMMO = {Claw:[["Subi Throwing Stars",15],["Wolbi Throwing Stars",17],["Mokbi Throwing Stars",19],["Kumbi Throwing Stars",21],["Tobi Throwing Stars",23],["Steely Throwing Knives",25],["Ilbi Throwing Stars",27]],
  Bow:[["Arrows for Bows",0],["Bronze Arrows for Bows",1],["Iron Arrows for Bows",2],["Adamantium Arrows for Bows",3]],
  Crossbow:[["Arrows for Crossbows",0],["Bronze Arrows for Crossbows",1],["Iron Arrows for Crossbows",2],["Mithril Arrows for Crossbows",3]]};
// event and GM weapons: the Wizet staff item and the summer-event tubes (all sell for 1 meso)
const HIDDEN_WEAPON = w => /Wizet|GM\b/.test(w[0]) || (w[11] === 1 && /Tube$/.test(w[0]));
const W = D.weapons.filter(w => !HIDDEN_WEAPON(w)).map(w => ({name:w[0], type:w[1], lvl:w[2], STR:w[3], DEX:w[4], INT:w[5], LUK:w[6], pad:w[7], mad:w[8], spd:w[9], job:w[10], id:w[12]}));
const SK = D.skills; // job name -> skills from the COT2 export
const BASIC = {id:"basic", n:"Basic attack", max:0};

let S = {cls:"Warrior", lvl:30, branch:"Fighter", weapon:null, skill:null, ammo:null, ap:null, sp:{}, buffs:true, gear:{}, gender:""};
const S0 = JSON.stringify(S);   // a fresh build, for Reset
// armor (D.armor rows: [id, name, slot, reqLevel, job, gender, [reqSTR, DEX, INT, LUK], {stat: n}, shop price])
const ARMOR = Object.fromEntries((D.armor || []).map(a => [a[0], a]));
const SLOTS = [["Hat", "Hat"], ["Overall", "Overall"], ["Top", "Top"], ["Bottom", "Bottom"], ["Glove", "Gloves"], ["Shoes", "Shoes"], ["Shield", "Shield"], ["Cape", "Cape"], ["Earring", "Earrings"]];
const TWO_HANDED = t => /^2H |^(Bow|Crossbow|Claw|Spear|Polearm)$/.test(t || "");
// total gear stats; a shield doesn't count with a two-handed weapon, top/bottom don't count under an overall
function gearTotals(){
  const g = {STR:0, DEX:0, INT:0, LUK:0, PDD:0, MDD:0, MHP:0, MMP:0, ACC:0, EVA:0, CRT:0, CRD:0, Speed:0, Jump:0};
  const w = W.find(x => x.name === S.weapon), gear = S.gear || {};
  for (const [slot, id] of Object.entries(gear)){
    const a = ARMOR[id]; if (!a || a[3] > S.lvl) continue;
    if (slot === "Shield" && TWO_HANDED(w?.type)) continue;
    if ((slot === "Top" || slot === "Bottom") && gear.Overall) continue;
    for (const [k, v] of Object.entries(a[7])) g[k] = (g[k] || 0) + v;
  }
  return g;
}
try { const saved = JSON.parse(localStorage.getItem("planner") || "null"); if (saved && saved.cls) S = Object.assign(S, saved) } catch(e) {}
if (HASH.b && HASH.b.cls) S = Object.assign(S, HASH.b);   // shared link
// a saved state or shared link can be stale or hand-edited: put anything out of range back on a valid value
{ const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
  S.cls = String(S.cls); if (!Object.hasOwn(BRANCHES, S.cls)) Object.assign(S, {cls:"Warrior", branch:null, fam:null});
  S.lvl = Math.min(MAX_LEVEL, Math.max(10, Math.round(+S.lvl) || 30));
  if (!obj(S.sp)) S.sp = {}; if (!obj(S.gear)) S.gear = {};
  if (S.ap != null && !(obj(S.ap) && ["STR","DEX","INT","LUK"].every(k => Number.isFinite(S.ap[k])))) S.ap = null;
  for (const k of ["weapon","skill","ammo","branch","fam"]) if (S[k] != null && typeof S[k] !== "string") S[k] = null }

const apTotal = L => 5 * L + 20;
// SP: +1 at each job advancement, +3 per level. 1st job gets levels 11-30 (61 total); 2nd job SP can't go into 1st job skills.
const firstJob = () => BRANCHES[S.cls][0][0];
const tierOf = s => s.job === firstJob() ? 1 : 2;
const spPool = (t, L = S.lvl) => t === 1 ? (L >= 10 ? 1 + 3 * (Math.min(L, 30) - 10) : 0) : (isSecond() && L >= 30 ? 1 + 3 * (L - 30) : 0);
const spTotal = L => spPool(1, L) + spPool(2, L);
const spentIn = (sp, t, list) => list.filter(s => tierOf(s) === t).reduce((a, s) => a + (sp[s.id] || 0), 0);
const branchList = () => BRANCHES[S.cls].filter(b => S.lvl >= b[1]);
const branchInfo = () => BRANCHES[S.cls].find(b => b[0] === S.branch) || BRANCHES[S.cls][0];
const isSecond = () => branchInfo()[1] >= 30;
const jobs = () => [BRANCHES[S.cls][0][0]].concat(isSecond() ? [S.branch] : []);
// weapon specialization (Fighter sword/axe, Page sword/blunt, Spearman spear/polearm, etc.)
const families = () => [...new Set(branchInfo()[2].map(t => t.replace(/^(1H|2H) /, "")))];
const famActive = () => S.cls !== "Magician" && families().length > 1;
const famOK = t => !famActive() || t.replace(/^(1H|2H) /, "") === S.fam;
const famSkillOK = s => {
  if (!famActive()) return true;
  if (NEEDS_WEAPON[s.n] && !NEEDS_WEAPON[s.n].some(famOK)) return false;
  return !families().filter(f => f !== S.fam).some(f => new RegExp("\\b" + f + "\\b").test(s.n));
};
const JS_CACHE = {};
const jobSkills = () => { const k = `${S.cls}|${S.branch}|${S.fam}|${isSecond()}`;
  return JS_CACHE[k] || (JS_CACHE[k] = jobs().flatMap(j => (SK[j] || []).map(s => Object.assign({job:j}, s))).filter(famSkillOK)) };
const byName = (n, list) => list.find(s => s.n === n);
const at = (v, lv) => Array.isArray(v) ? v[Math.max(0, lv - 1)] : v;
const num = (str, re) => { const m = str && str.match(re); return m ? +m[1] : 0 };
const kindOf = t => t.replace(/^(1H|2H) /, "");

// effective level: 0 when a prerequisite isn't met
function lv(s, sp, list){
  const v = sp[s.id] || 0;
  if (!v) return 0;
  for (const [n, need] of s.req) { const p = byName(n, list); if (p && lv(p, sp, list) < need) return 0 }
  return v;
}
const stat = (s, l) => l > 0 ? s.st[l - 1] : "";

const AI_CACHE = new Map();
function attackInfo(s, l){
  const k = s.id + "|" + l;
  if (!AI_CACHE.has(k)) AI_CACHE.set(k, attackInfo0(s, l));
  return AI_CACHE.get(k);
}
// the export gives Lucky Seven and Double Shot 1 hit; both throw/fire 2 (skill text, and meowdb's Thief and Bowman guides:
// Lucky Seven "two 140% lines", Double Shot "two 120% arrows" that hit one mob twice or two mobs once each, so its total
// damage doesn't grow with targets)
// Holy Arrow is the same: 3 arrows split over up to 3 targets, a fixed total (meowdb DPS rankings)
const HITS_FIX = {"Lucky Seven": {hits: 2}, "Double Shot": {hits: 2, targets: 1}, "Holy Arrow": {hits: 3, targets: 1}};
// attack time (ms) per speed tier 0-10: [swing, spear/polearm stab, crossbow] (meowdb attack speed guide, COT2 frames).
// Every Magician spell is tier 6 (810 ms) whatever the weapon; Booster moves a matching weapon 2 tiers.
const SPEED_MS = [[510,480,540],[570,540,570],[600,570,630],[660,630,690],[720,660,720],[750,720,780],[810,750,840],[870,810,870],[900,870,930],[960,900,990],[1020,960,1050]];
// upkeep prices (meowdb): MP 1 meso (Lemon 150 for 150 MP), HP 0.5 meso (Red Potion 50 for 100 HP); arrows 1 meso, Bronze 2
// (Raymond); star recharge per star from the Assassin guide. Iron/Mithril/Adamantium arrows are crafted only: no price.
const MESO_MP = 1, MESO_HP = 0.5;
const AMMO_COST = {"Arrows for Bows": 1, "Arrows for Crossbows": 1, "Bronze Arrows for Bows": 2, "Bronze Arrows for Crossbows": 2,
  "Subi Throwing Stars": 0.3, "Wolbi Throwing Stars": 0.4, "Mokbi Throwing Stars": 0.5, "Kumbi Throwing Stars": 0.6, "Tobi Throwing Stars": 0.7,
  "Steely Throwing Knives": 0.8, "Ilbi Throwing Stars": 0.9};
const tierMs = (t, col = 0) => SPEED_MS[Math.max(0, Math.min(10, t))][col];
function attackInfo0(s, l){
  const r = attackInfo1(s, l);
  return r && HITS_FIX[s.n] ? Object.assign(r, HITS_FIX[s.n]) : r;
}
function attackInfo1(s, l){
  if (s.id === "basic") return {kind:"phys", pct:100, hits:1, targets:1};
  const t = stat(s, l) || s.st[0];
  if (!["attack","action_hitbox","weapon_projectile","magic_projectile"].includes(s.k)) return null;
  if (/^Final Attack/.test(s.n)) return null;   // a proc on other attacks, not a skill you cast (OSMS tags it as an attack since Oct 17)
  const ba = num(t, /Basic Attack (\d+)/);
  if (ba) return {kind:"magic", pct:ba, mast:num(t, /Mastery level (\d+)/), hits:at(s.att, l), targets:at(s.mob, l)};
  let m = t.match(/Attack (\d+)x with (\d+)% damage/);
  if (m) return {kind:"phys", pct:+m[2], hits:+m[1], targets:at(s.mob, l)};
  const pct = num(t, /[Dd]amage (\d+)%/) || num(t, /apply (\d+)% in damage/);
  if (!pct) return null;
  return {kind:"phys", pct, hits:at(s.att, l), targets:num(t, /knockback (\d+) enemies/) || at(s.mob, l)};
}

// weapons you can get at launch: sold, craftable, a launch quest reward, or dropped by a launch monster (D.wsrc)
// value = the level you can get it from (quest-only weapons wait for the quest's level)
const LAUNCH_Q = new Map(D.quests.filter(r => !["El Nath","Orbis","Forgotten Hollow"].includes(r.region)).map(r => [r.id, r.lvl]));
const OBTAINABLE = new Map();
for (const [n, s] of Object.entries(D.wsrc || {})){
  if (s.shop || s.craft || (s.drops || []).some(([m]) => MOBID[m] && !D.latermobs.includes(MOBID[m]))) OBTAINABLE.set(n, 0);
  else { const q = (s.quest || []).filter(id => LAUNCH_Q.has(id)).map(id => LAUNCH_Q.get(id)); if (q.length) OBTAINABLE.set(n, Math.min(...q)) }
}
const weaponsFor = () => {
  const types = branchInfo()[2];
  return W.filter(w => types.includes(w.type) && famOK(w.type) && w.lvl <= S.lvl && (w.job === "All" || w.job.includes(JOBLABEL[S.cls])) && (!S.obt || (OBTAINABLE.has(w.name) && OBTAINABLE.get(w.name) <= S.lvl)))
          .sort((a,b) => (S.cls === "Magician" ? b.mad - a.mad : b.pad - a.pad) || b.lvl - a.lvl);
};
const attackSkills = w => {
  const list = jobSkills().filter(s => attackInfo(s, 1) && (!NEEDS_WEAPON[s.n] || (w && NEEDS_WEAPON[s.n].includes(w.type))));
  return S.cls === "Magician" ? list : list.concat([BASIC]);
};

function autoAP(w){
  const ap = {STR:4, DEX:4, INT:4, LUK:4};
  if (w) for (const k of ["STR","DEX","INT","LUK"]) ap[k] = Math.max(4, w[k] || 0);
  const used = ap.STR + ap.DEX + ap.INT + ap.LUK;
  ap[PRIMARY[S.cls]] += Math.max(0, apTotal(S.lvl) - used);
  return ap;
}
function bestWeapon(){
  const list = weaponsFor();
  return list.find(w => (Math.max(4,w.STR)+Math.max(4,w.DEX)+Math.max(4,w.INT)+Math.max(4,w.LUK)) <= apTotal(S.lvl)) || list[0] || null;
}

// launch monsters from 3 below to 6 above the level (cached: calc runs thousands of times in the auto-build)
const NEAR = {};
const nearMobs = L => NEAR[L] || (NEAR[L] = (() => {
  const near = Object.entries(D.mobs).filter(([id]) => !D.latermobs.includes(id)).map(([, m]) => m).filter(m => m[1] >= L - 3 && m[1] <= L + 6)
    .filter((m, i, arr) => arr.findIndex(x => x[0] === m[0]) === i).sort((a,b) => a[1] - b[1]).slice(0, 10);
  return {near, even: near.filter(m => Math.abs(m[1] - L) <= 3)};
})());
// Final Attack proc chance and damage from a skill-level line. OSMS wrote "success rate" before the Oct 17 export and
// "trigger rate" since; missing both silently dropped Final Attack from every DPS figure (tests/golden.js).
function faStats(t){ return [num(t, /(\d+)% (?:success|trigger) rate/), num(t, /damage (\d+)%/)] }

/* the whole calculation as a pure function of the build, so the auto-build can try options */
function calc(sp){
  const w = W.find(x => x.name === S.weapon) || null;
  const list = jobSkills();
  // ap = base AP + armor stats (damage, accuracy, avoid and defense all use total stats)
  const L = S.lvl, cls = S.cls, gear = gearTotals(), ap = Object.fromEntries(["STR","DEX","INT","LUK"].map(k => [k, S.ap[k] + gear[k]]));
  const L_ = n => { const s = byName(n, list); return s ? lv(s, sp, list) : 0 };
  const T = n => { const s = byName(n, list); const l = s ? lv(s, sp, list) : 0; return l ? stat(s, l) : "" };
  const buffs = S.buffs;
  const wk = w ? kindOf(w.type) : "";

  let accB = gear.ACC + num(T("Precise Strikes"), /Accuracy \+(\d+)/) + num(T("Nimble Body"), /Accuracy \+(\d+)/);
  let evaB = gear.EVA + num(T("Nimble Body"), /Evasion \+(\d+)/) + (wk === "Bow" ? num(T("Bow Mastery"), /Evasion \+(\d+)/) : 0);
  let crit = 5 + gear.CRT + num(T("Precise Strikes"), /Critical Rate \+(\d+)%/) + num(T("Critical Shot"), /Critical Rate \+(\d+)%/)
           + num(T("Critical Throw"), /Critical Rate \+(\d+)%/)
           + (wk ? num(T(wk + " Mastery"), /Critical Rate \+(\d+)%/) : 0);   // weapon mastery (Bow +10, Dagger +20; Bow was missed: Danny stat window 10-29)
  let critDmg = 20 + gear.CRD + num(T("Critical Shot"), /Critical Damage \+(\d+)%/) + num(T("Critical Throw"), /Critical Damage \+(\d+)%/)
           + (wk ? num(T(wk + " Mastery"), /Critical Damage \+(\d+)%/) : 0);   // Blunt, Crossbow Mastery
  let atkB = wk === "Claw" ? num(T("Claw Mastery"), /Attack Power \+(\d+)/) : 0;
  let matkB = 0, booster = false, steal = 0;
  if (buffs){
    // Bandit: Steal on success gives +N Attack Power for 30 s; kept up by recasting (meowdb DPS rankings: 2 casts/min)
    const st = wk === "Dagger" && S.skill !== byName("Steal", list)?.id ? T("Steal") : "";
    if (st){ steal = num(st, /(\d+)% chance to steal/) / 100; atkB += num(st, /\+(\d+) Attack Power/) * steal }
    accB += num(T("Focus"), /Accuracy \+(\d+)/) + num(T("Bless"), /Accuracy \+(\d+)/);
    evaB += num(T("Focus"), /Evasion \+(\d+)/) + num(T("Bless"), /Evasion \+(\d+)/);
    atkB += num(T("Rage"), /Attack Power \+(\d+)/);
    matkB += num(T("Meditation"), /Magic Attack \+(\d+)/);
    booster = wk && L_(wk + " Booster") > 0;
  }
  const mastLv = wk ? num(T(wk + " Mastery"), /Mastery level (\d+)/) : 0;

  const common = ap.DEX*1.2 + L*2 + ap.LUK*0.6;
  let acc = cls === "Warrior" ? common/2.5 + 10 : cls === "Bowman" ? common/4.8 + 20 : cls === "Thief" ? common/4 + 15
          : (ap.INT*1.2 + L*2 + ap.LUK*0.6)/5.1 + 20;
  acc += accB;
  const avoid = Math.trunc(ap.LUK/3) + Math.trunc(ap.DEX/6) + 5 + evaB;
  crit = Math.min(crit, 100);

  const sk = attackSkills(w).find(s => s.id === S.skill) || null;
  const sl = sk ? (sk.id === "basic" ? 1 : lv(sk, sp, list)) : 0;
  const ai = sk && sl ? attackInfo(sk, sl) : null;
  let min = 0, max = 0, mast = 0, faRate = 0, faPct = 0, form = null;   // form: the damage formula's inputs, for Where to train's kill breakpoints
  if (ai && ai.kind === "magic"){
    const magic = Math.floor(ap.INT / 2) + (w?.mad || 0) + matkB;
    mast = (0.1 + ai.mast / 10) * 0.7;   // launch client: mastery ×0.7, INT/125 (OSMS formulas page)
    min = ai.pct / 100 * magic * (ap.INT * mast / 125 + 1);
    max = ai.pct / 100 * magic * (ap.INT / 125 + 1);
    form = {magic: true, M: magic, INT: ap.INT, mast};
  } else if (ai && w){
    const ammo = (AMMO[w.type] || []).find(a => a[0] === S.ammo)?.[1] || 0;
    const watk = w.pad + ammo;
    const prim = ap[PRIMARY[cls]], sec = cls === "Thief" ? ap.STR + ap.DEX : ap[SECONDARY[cls]];   // Thief: STR and DEX share the secondary term (meowdb Thief guide)
    const ranged = ["Bow","Crossbow","Claw"].includes(w.type);
    const wm = WMULT[w.type];
    let wmult;
    if (sk.n === "Lucky Seven") wmult = 3.0;
    else if (ranged) wmult = wm[2];
    else if (STAB_ONLY.has(sk.n)) wmult = wm[1];
    else { const sw = SWING_SHARE[w.type] ?? 0.6; wmult = wm[0]*sw + wm[1]*(1-sw) }
    mast = sk.n === "Lucky Seven" ? 0.5 : (0.1 + mastLv / 10) * 0.7;
    const mult = ai.pct / 100;
    min = mult * (0.8 + (prim * wmult * mast + sec) / 100 + atkB / 50) * watk;
    max = mult * (1.0 + (prim * wmult + sec) / 100 + atkB / 50) * watk;
    form = {watk, prim, sec, wmult, mast, atkB, stat: PRIMARY[cls]};
    const fa = T("Final Attack: " + wk);
    if (fa) [faRate, faPct] = faStats(fa);
  }
  min = Math.min(min, 99999); max = Math.min(max, 99999);
  const avg = (min + max) / 2;
  const critF = 1 - crit/100 + crit/100 * (100 + critDmg)/100;
  let perCast = avg * critF * (ai?.hits || 0);
  // attack time from the speed ladder: spells 810 ms; Savage Blow has its own 960 ms base action scaled by tier;
  // crossbows use their own column; spears and polearms mix swings (60%) and stabs
  const magicK = ai?.kind === "magic";
  const stage = magicK ? 6 : Math.max(0, (w?.spd ?? 6) - (booster ? 2 : 0));
  let ms = tierMs(stage);
  if (!magicK && sk?.n === "Savage Blow") ms = 30 * Math.ceil(960 * (10 + stage) / 16 / 30);
  else if (!magicK && w?.type === "Crossbow") ms = tierMs(stage, 2);
  else if (!magicK && ["Spear", "Polearm"].includes(w?.type)) ms = 0.6 * tierMs(stage) + 0.4 * tierMs(stage, 1);
  let interval = ms / 1000;
  // Final Attack is a toggle and each proc plays its own attack (~0.6 s with Booster), so it only helps when its damage
  // outweighs that time; it stays on only if it raises DPS. 0.88 × the weapon's attack time = 636 ms at speed 4, which
  // reproduces meowdb's "12% less damage on one mob" for a max-Final-Attack Lv 70 Fighter.
  let faOn = false;
  if (faRate && ai){
    // Hunter's Final Attack: Bow fires 3 arrows that all hit a lone target (meowdb Hunter guide); the others hit once
    const add = faRate / 100 * (avg / (ai.pct / 100)) * faPct / 100 * critF * (wk === "Bow" ? 3 : 1), t = faRate / 100 * 0.88 * tierMs(stage);
    if ((perCast + add) / (interval + t / 1000) > perCast / interval){ perCast += add; interval += t / 1000; faOn = true }
  }
  let dps = perCast / interval * (steal ? 1 - 2 * interval / 60 : 1);
  // Axe Mastery bleed: each hit has p% to start a non-stacking 3 s bleed worth X% of a plain hit; uptime = chance at least
  // one hit in the last 3 s procced. (meowdb's Lv 70 Fighter: +5.5% DPM; this gives about +6%.)
  const bleed = wk === "Axe" && ai && !magicK ? T("Axe Mastery") : "";
  if (bleed){ const p = num(bleed, /(\d+)% chance to inflict bleed/) / 100, x = num(bleed, /dealing (\d+)% total damage/) / 100;
    const up = 1 - Math.pow(1 - p, (ai.hits || 1) * 3 / interval); dps += up * x * (avg / (ai.pct / 100)) / 3 }
  // Poison Breath poison: DoT core = BA/100 × Magic × (INT/125 + 1) over its duration, kept up on every target it hits
  // (meowdb damage formula; ignores defense)
  if (sk?.n === "Poison Breath" && ai){ const t = stat(sk, sl), ba = num(t, /deals (\d+) Basic Attack over/), sec = num(t, /over (\d+) sec/) || 5;
    dps += ba / 100 * (Math.floor(ap.INT / 2) + (w?.mad || 0) + matkB) * (ap.INT / 125 + 1) / sec }

  // upkeep while attacking nonstop: attack MP/HP, buffs kept up (MP and HP per second of their duration), ammo used
  let mpHr = 0, hpHr = 0, ammoHr = 0;
  if (ai && sk && sk.id !== "basic"){ const t = stat(sk, sl); mpHr += num(t, /MP -\s?(\d+)/) * 3600 / interval; hpHr += num(t, /HP -(\d+)/) * 3600 / interval }
  if (buffs) for (const s of list) if (["self_buff", "party_support"].includes(s.k) && lv(s, sp, list) > 0){
    const t = stat(s, lv(s, sp, list)), d = num(t, /for (\d+) sec/); if (d){ mpHr += num(t, /MP -?\s?(\d+)/) * 3600 / d; hpHr += num(t, /HP -(\d+)/) * 3600 / d } }
  const ammoName = w && AMMO[w.type] && ai && !magicK && ["Bow", "Crossbow", "Claw"].includes(w.type) ? S.ammo : null;
  const soul = buffs && ["Bow", "Crossbow"].includes(w?.type) && L_("Soul Arrow: " + w.type) > 0;
  if (ammoName && !soul) ammoHr = ((ai.hits || 1) + (faOn && wk === "Bow" ? faRate / 100 * 3 : 0)) * 3600 / interval
    * (wk === "Claw" ? 1 - num(T("Claw Mastery"), /(\d+)% chance to retrieve/) / 100 : 1);
  const cost = {mpHr, hpHr, ammoHr, ammoName, ammoPrice: AMMO_COST[ammoName], mesoHr: mpHr * MESO_MP + hpHr * MESO_HP + ammoHr * (AMMO_COST[ammoName] || 0)};
  // HP, MP and physical defense (no armor: we don't model it) for the danger estimate
  const [hp0, mp0] = hpmpAt(cls, L, num(T("Max HP Increase"), /Max HP \+(\d+)%/), num(T("Max MP Increase"), /Max MP \+(\d+)%/), isSecond());
  const hp = hp0 + gear.MHP, mp = mp0 + gear.MMP;
  const defFlat = (wk === "Sword" ? num(T("Sword Mastery"), /Weapon Def\. \+(\d+)/) : 0) + (buffs ? num(T("Magic Armor"), /Weapon Def\. \+(\d+),/) + num(T("Iron Will"), /Weapon Def\. \+(\d+),/) - num(T("Rage"), /Weapon Def\. -(\d+)/) : 0);
  const wdef = Math.max(0, defFlat + Math.trunc((1 + (buffs ? num(T("Iron Body"), /Weapon Def\. \+(\d+)%/) : 0) / 100) * (Math.floor(ap.STR / 4) + gear.PDD)));
  const mdef = Math.floor(ap.INT / 4) + gear.MDD + (buffs ? num(T("Magic Armor"), /Magic Def\. \+(\d+)/) : 0);
  const guard = buffs ? 1 - num(T("Magic Guard"), /Replace (\d+)% of HP damage/) / 100 : 1;
  const hpMult = guard * (buffs ? 1 - num(T("Invincible"), /Physical damage -(\d+)%/) / 100 : 1);
  const {near, even} = nearMobs(L);
  const hitAvg = even.length ? even.reduce((a, m) => a + hitProb(acc, m[4], m[1] - L), 0) / even.length : 1;
  return {cost, hp, mp, wdef, mdef, hpMult, mpMult: guard, w, sk, sl, ai, min, max, avg, crit, critDmg, perCast, stage, interval, dps, acc, avoid, booster, mast, faRate: faOn ? faRate : 0, faPct, atkB, matkB, near, hitAvg, eff: dps * hitAvg, form};
}

/* greedy auto-build: keep buying the next 1-5 points that add the most real damage per SP */
function autoSP(seed = {}){   // seed: points already fixed (the class guide's first-job build)
  const list = jobSkills();
  const sp = Object.assign({}, seed);
  const raiseTo = (o, s, target) => { // copy of o with s at target and its prerequisites met
    const n = Object.assign({}, o);
    const raise = (sk, t) => {
      for (const [rn, need] of sk.req){ const p = byName(rn, list); if (p) raise(p, need) }
      if ((n[sk.id] || 0) < t) n[sk.id] = t;
    };
    raise(s, target);
    return n;
  };
  const fits = n => [1, 2].every(t => spentIn(n, t, list) <= spPool(t));
  const cost = (n, o) => [1, 2].reduce((a, t) => a + spentIn(n, t, list) - spentIn(o, t, list), 0);
  // 1) damage first: buy the next 1-5 points with the best damage gain per SP
  for (let guard = 0; guard < 400; guard++){
    const base = calc(sp).eff;
    let best = null;
    for (const s of list){
      const cur = sp[s.id] || 0;
      for (let k = 1; k <= Math.min(5, s.max - cur); k++){
        const n = raiseTo(sp, s, cur + k), c = cost(n, sp);
        if (c <= 0 || !fits(n)) continue;
        const gain = (calc(n).eff - base) / c;
        if (gain > 1e-6 && (!best || gain > best.gain)) best = {gain, n};
      }
    }
    if (!best) break;
    Object.assign(sp, best.n);
  }
  // 2) the game makes you spend everything, so leftovers go to passives, then buffs, then the rest
  const rank = s => s.k === "passive" ? 0 : (s.k === "self_buff" || s.k === "party_support") ? 1 : 2;
  for (const s of list.slice().sort((x, y) => rank(x) - rank(y))){
    for (let target = s.max; target > (sp[s.id] || 0); target--){
      const n = raiseTo(sp, s, target);
      if (fits(n)){ Object.assign(sp, n); break }
    }
  }
  return sp;
}

// fill in any missing choice (job, weapon type, weapon, attack, ammo, AP) with the default; no DOM
function applyDefaults(){
  const bl = branchList();
  if (!bl.some(b => b[0] === S.branch)) S.branch = (bl.find(b => b[1] >= 30) || bl[0])[0];
  const fams = families();
  if (famActive() && !fams.includes(S.fam)) S.fam = fams[0];
  const wl = weaponsFor();
  if (!wl.some(w => w.name === S.weapon)) S.weapon = bestWeapon()?.name || null;
  const w = W.find(x => x.name === S.weapon), al = attackSkills(w);
  if (!al.some(s => s.id === S.skill)){
    // default to the strongest single-target skill of the newest job; an AoE build (Path Planner) weighs targets too,
    // as if ~3 monsters are in reach (Rush, Steal and Power Knockback move or push monsters; not grinding attacks)
    const val = i => i.pct * i.hits * (S.aoe ? Math.min(i.targets || 1, 3) : 1);
    const pick = al.filter(s => s.id !== "basic" && !(S.aoe && ["Rush", "Steal", "Power Knockback"].includes(s.n))).map(s => [s, attackInfo(s, s.max)]).sort((a,b) => val(b[1]) - val(a[1]) || (S.aoe ? (b[1].targets || 1) - (a[1].targets || 1) : 0))[0];
    S.skill = (pick ? pick[0] : al[0])?.id;
  }
  const am = w && AMMO[w.type];
  if (am && !am.some(a => a[0] === S.ammo)) S.ammo = am[0][0];
  if (!S.ap || Object.values(S.ap).reduce((a,b) => a+b, 0) > apTotal(S.lvl)) S.ap = autoAP(w);
  return {bl, fams, wl, w, al, am};
}
// Beginner (below 10): basic attack, Wooden Club then Razor from level 5, creation + level AP all in the future main stat
// (meowdb beginner guide). STR/DEX drive a Beginner's basic attack; accuracy = trunc(common / 2.5 + 5) (OSMS launch client).
function beginnerAt(cls, L){
  const ap = {STR:4, DEX:4, INT:4, LUK:4}; ap[PRIMARY[cls]] += apTotal(L) - 16;
  const w = W.find(x => x.name === (L >= 5 ? "Razor" : "Wooden Club")), wm = WMULT[w.type], sw = SWING_SHARE[w.type] ?? 0.6;
  const wmult = wm[0] * sw + wm[1] * (1 - sw), mast = 0.07;
  const min = (0.8 + (ap.STR * wmult * mast + ap.DEX) / 100) * w.pad, max = (1 + (ap.STR * wmult + ap.DEX) / 100) * w.pad;
  const critF = 0.95 + 0.05 * 1.2, interval = 0.42 + 0.06 * w.spd;
  return {dps: (min + max) / 2 * critF / interval, acc: Math.trunc((ap.DEX * 1.2 + L * 2 + ap.LUK * 0.6) / 2.5 + 5), branch: "Beginner", weapon: w.name, wid: w.id, skill: "Basic attack"};
}
// class guide build (16-guides.js): first-job SP in the guide's order (kept above 30, 2nd-job SP auto), and up to 30 the
// guide's AP and weapons; the attack is whichever of the skilled ones does most (AoE build: as if ~3 monsters are in reach)
// Past 30 the branch's 30-70 guide (GUIDE2) adds its 2nd-job SP order, AP rules and weapons; above 70 the SP left over is auto
// and the best known weapon also competes.
function guideBuild(){
  const g = GUIDE[S.cls], L = S.lvl, g2 = L >= 30 && isSecond() ? GUIDE2[S.branch] : null, list = jobSkills(), seed = {};
  const first = g2?.reset && L >= g2.reset.at ? g2.reset.first : guideSP(S.cls, Math.min(L, 30));
  const fam = S.fam || kindOf(branchInfo()[2][0]);
  for (const [n, v] of Object.entries(first).concat(g2 ? Object.entries(guideSP2(S.branch, Math.min(L, 70), fam)) : [])){ const s = byName(n, list); if (s) seed[s.id] = v }
  S.sp = autoSP(seed);
  if (L > 30 && !g2) return;
  S.ap = g2 ? guideAP2(S.cls, S.branch, L, S.fam) : guideAP(S.cls, L, S.fam);
  const tbl = g2 ? g2.weapons : g.weapons, c = guideAt(tbl, L);
  const types = branchInfo()[2].concat(g2?.reset && L < g2.reset.at ? ["Claw"] : []);   // a Sindit keeps the claw until the reset
  let cand = (c ? tbl[c] : []).map(n => W.find(w => w.name === n)).filter(w => w && types.includes(w.type) && (w.type === "Claw" || famOK(w.type)));
  if (L > 70) cand = cand.concat(weaponsFor().slice(0, 4));
  if (!cand.length) cand = weaponsFor().filter(w => D.wsrc[w.name]?.shop).slice(0, 4);   // no guide weapon for this family: shop weapons
  let best = null;
  for (const w of cand){
    S.weapon = w.name;
    const am = AMMO[w.type];
    S.ammo = am ? (g.ammo && L >= g.ammo.from && g.ammo[w.type]) || am[0][0] : null;
    for (const sk of attackSkills(w).filter(x => x.id !== "basic" && !["Rush", "Steal", "Power Knockback"].includes(x.n))){
      S.skill = sk.id; const r = calc(S.sp); if (!r.ai) continue;
      const v = r.eff * (S.aoe ? Math.min(r.ai.targets || 1, 3) : 1);
      if (!best || v > best.v) best = {v, w: w.name, sk: sk.id, ammo: S.ammo};
    }
  }
  if (best){ S.weapon = best.w; S.skill = best.sk; S.ammo = best.ammo }
}
// default character at a level (best weapon, auto AP, auto skill build), for the Path Planner. Leaves the builder untouched.
// guide = follow the meowdb class guides (16-guides.js); future Bandits level with a claw before 30, as the Thief guide says.
buildAt = (cls, branch, fam, lvl, aoe = false, obt = false, guide = false) => {
  if (lvl < 10) return beginnerAt(cls, lvl);
  const keep = S;
  if (guide && GUIDE[cls].claw && lvl < (GUIDE2[branch]?.reset?.at || 30)) fam = lvl < 30 ? "Claw" : fam;
  S = {cls, lvl, branch, fam, weapon:null, skill:null, ammo:null, ap:null, sp:{}, buffs:true, aoe, obt, gear:{}};
  try { applyDefaults(); if (guide) guideBuild(); else S.sp = autoSP(); const r = calc(S.sp);
    if (aoe && !(r.dps > 0)) return buildAt(cls, branch, fam, lvl, false, obt, guide);   // area skill not learnable yet (Lv 10 Warrior: Slash Blast needs Power Strike 1)
    return {dps: r.dps, acc: r.acc, hp: r.hp, wdef: r.wdef, mdef: r.mdef, mult: r.hpMult, mmult: r.mpMult, avoid: r.avoid, cost: r.cost, branch: S.branch, weapon: r.w?.name, wid: r.w?.id, skill: r.sk?.n, sid: r.sk?.id, targets: r.ai?.targets || 1, reach: r.sk?.rg, ammo: S.ammo,
      min: r.min, max: r.max, pct: r.ai?.pct, hits: r.ai?.hits, interval: r.interval, crit: r.crit, critDmg: r.critDmg, mast: r.mast, magic: r.ai?.kind === "magic", form: r.form,
      basicIv: tierMs(r.w?.spd ?? 6, r.w?.type === "Crossbow" ? 2 : 0) / 1000, ammoPrice: AMMO_COST[S.ammo] || 0} }
  finally { S = keep }
};
function fillControls(){
  document.querySelectorAll("#pclass button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === S.cls));
  $("#plvl").value = S.lvl; $("#plvlout").textContent = S.lvl;
  const {bl, fams, wl, w, al, am} = applyDefaults();
  $("#pbranch").innerHTML = bl.map(b => `<option${b[0] === S.branch ? " selected" : ""}>${esc(b[0])}</option>`).join("");
  $("#pfamwrap").hidden = !famActive();
  $("#pfam").innerHTML = famActive() ? fams.map(f => `<button data-v="${esc(f)}" aria-checked="${f === S.fam}">${esc(f === "Blunt Weapon" ? "Blunt" : f)}</button>`).join("") : "";
  const opt = w => `<option value="${esc(w.name)}"${w.name === S.weapon ? " selected" : ""}>${esc(w.name)} · Lv ${w.lvl} · ${S.cls === "Magician" ? w.mad + " M.ATK" : w.pad + " ATK"}</option>`;
  $("#pweapon").innerHTML = branchInfo()[2].filter(t => wl.some(w => w.type === t))
    .map(t => `<optgroup label="${esc(t)}">${wl.filter(w => w.type === t).map(opt).join("")}</optgroup>`).join("");
  $("#pskill").innerHTML = al.map(s => `<option value="${s.id}"${s.id === S.skill ? " selected" : ""}>${esc(s.n)}</option>`).join("");
  $("#pammowrap").hidden = !am;
  if (am){
    $("#pammo").innerHTML = am.map(a => `<option${a[0] === S.ammo ? " selected" : ""}>${esc(a[0])} (+${a[1]})</option>`).join("");
    $("#pammo").value = [...$("#pammo").options].find(o => o.text.startsWith(S.ammo))?.value;
  }
  for (const k of ["STR","DEX","INT","LUK"]) $("#p" + k).value = S.ap[k];
  $("#pbuffs").checked = S.buffs;
  const wantAuto = !!S.sp.__auto; delete S.sp.__auto;
  // drop points in skills that no longer belong to this build
  const ids = new Set(jobSkills().map(s => s.id));
  for (const id of Object.keys(S.sp)) if (!ids.has(id)) delete S.sp[id];
  if (wantAuto) S.sp = autoSP();
  fillGear();
}

// armor selects: pieces your class can wear at this level (and gender, if set), best level first
const CRAFTED = new Set((D.craft?.rec || []).map(r => r[3]));
const QREWARD = new Set([...D.quests, ...D.citq].flatMap(r => (r.ri || []).flatMap(g => g.it.map(x => x[0]))));
/* simc-style scale factors: re-run the same calc() with +1 of one input and report the DPS change (after misses, like r.eff).
   Every number comes from calc(), so it is only as sourced as the damage model itself. */
function statWeights(r){
  const base = r.eff, out = [], w = r.w;
  for (const k of ["STR","DEX","INT","LUK"]){
    S.ap[k]++; const d = calc(S.sp).eff - base; S.ap[k]--; out.push([k, d]);
  }
  if (w){ w.pad++; const d = calc(S.sp).eff - base; w.pad--; out.push(["W.ATK", d]) }
  return out;
}
const STAT_SHORT = {STR:"STR", DEX:"DEX", INT:"INT", LUK:"LUK", PDD:"W.DEF", MDD:"M.DEF", MHP:"HP", MMP:"MP", ACC:"ACC", EVA:"Avoid", CRT:"Crit %", CRD:"Crit dmg %", Speed:"Speed", Jump:"Jump"};
const armorSrc = a => a[8] ? `shop ${fmt(a[8])}` : CRAFTED.has(a[0]) ? "craft" : QREWARD.has(a[0]) ? "quest" : "drop / FM";
function fillGear(){
  const w = W.find(x => x.name === S.weapon), gear = S.gear || (S.gear = {});
  $("#pgender").value = S.gender || "";
  $("#pgear").innerHTML = SLOTS.map(([slot, label]) => {
    if (slot === "Shield" && TWO_HANDED(w?.type)) return "";
    const list = (D.armor || []).filter(a => a[2] === slot && a[3] <= S.lvl && (a[4] === "All" || a[4].includes(JOBLABEL[S.cls])) && (!S.gender || !a[5] || a[5] === S.gender))
      .sort((a, b) => b[3] - a[3] || a[1].localeCompare(b[1]));
    const off = (slot === "Top" || slot === "Bottom") && gear.Overall;
    return `<label class="lab">${label}<select data-slot="${slot}"${off ? " disabled" : ""}><option value="">${off ? "(overall)" : "none"}</option>${list.map(a =>
      `<option value="${a[0]}"${gear[slot] === a[0] ? " selected" : ""}>${esc(a[1])} · Lv ${a[3]} · ${Object.entries(a[7]).filter(([k]) => k !== "PDD" && k !== "MDD").map(([k, v]) => `+${v} ${STAT_SHORT[k]}`).join(" ") || `${a[7].PDD || 0} W.DEF`} · ${armorSrc(a)}</option>`).join("")}</select></label>`;
  }).join("");
  const n = Object.keys(gear).filter(k => gear[k]).length;
  $("#pgearsum").textContent = n ? `${n} piece${n === 1 ? "" : "s"}` : "none";
}
function renderSkills(){
  const list = jobSkills();
  const cap = t => list.filter(s => tierOf(s) === t).reduce((a, s) => a + s.max, 0);
  const full = t => spentIn(S.sp, t, list) >= cap(t);
  const leftT = t => spPool(t) - spentIn(S.sp, t, list);
  const open = [1, 2].filter(t => leftT(t) > 0 && !full(t)).reduce((a, t) => a + leftT(t), 0);
  const spare = [1, 2].filter(t => leftT(t) > 0 && full(t)).reduce((a, t) => a + leftT(t), 0);
  $("#pspleft").textContent = open ? `${open} SP left` : spare ? `All skills maxed · ${spare} SP spare` : "All SP spent";
  $("#pspleft").className = "pill " + (open ? "p-warn" : "p-good");
  $("#pskills").innerHTML = jobs().map(j => { const t = j === firstJob() ? 1 : 2, lt = leftT(t);
    return `<div class="sjob">${esc(j)} <span>${t === 1 ? "1st job" : "2nd job"} · ${spentIn(S.sp, t, list)} / ${spPool(t)} SP${t === 1 && S.lvl > 30 ? " (earned by 30)" : ""}</span>${lt ? (full(t) ? `<span class="pill p-good">maxed, ${lt} spare</span>` : `<span class="pill p-warn">${lt} left</span>`) : ""}</div>` +
    (SK[j] || []).filter(famSkillOK).map(s0 => {
      const s = Object.assign({job:j}, s0), v = S.sp[s.id] || 0, eff = lv(s, S.sp, list);
      const unmet = s.req.filter(([n, need]) => { const p = byName(n, list); return p && lv(p, S.sp, list) < need });
      const locked = list.some(d => (S.sp[d.id] || 0) > 0 && d.req.some(([n, need]) => n === s.n && need >= v));
      const canAdd = v < s.max && !unmet.length && lt > 0;
      const desc = v ? stat(s, v) : s.st[0];
      const next = v < s.max ? stat(s, v + 1) : "";
      const tip = `<span class="tip" role="tooltip"><b>${esc(s.n)}</b> <span class="sub">max ${s.max}</span><br>${esc(s.d).replace(/\n/g, "<br>")}${next ? `<span class="tipnext">Next level: ${esc(next)}</span>` : ""}</span>`;
      const ic = `<span class="sic" tabindex="0" aria-label="${esc(s.n)} description">${D.icons[s.id] ? `<img class="sicon" src="data:image/png;base64,${D.icons[s.id]}" alt="" width="32" height="32">` : `<span class="sicon"></span>`}${tip}</span>`;
      return `<div class="srow${v ? "" : " off"}">${ic}
        <div class="sname"><b>${esc(s.n)}</b>${unmet.length ? ` <span class="down tiny">needs ${unmet.map(([n,l]) => esc(n) + " " + l).join(", ")}</span>` : ""}
          <div class="tiny">${v ? "" : "Lv 1: "}${esc(desc.replace(/^(?:HP -\d+[,;] )?MP -\s?\d+[,;] ?/, ""))}</div></div>
        <div class="stepper" data-id="${s.id}">
          <button data-d="-1" aria-label="Remove a point from ${esc(s.n)}"${v && !locked ? "" : " disabled"}${locked ? ` title="Another skill needs this at level ${v}"` : ""}>−</button>
          <span class="sv${eff !== v ? " down" : ""}">${v}<small>/${s.max}</small></span>
          <button data-d="1" aria-label="Add a point to ${esc(s.n)}"${canAdd ? "" : " disabled"}>+</button>
          <button data-d="max" class="smax"${canAdd ? "" : " disabled"}>max</button>
        </div></div>`;
    }).join("") }).join("");
}

// the character wearing the picked gear, drawn live by maplestory.io from its Classic World (MCW, CBT2) client data. Danny OK'd
// relying on it (2026-10-19), the one outside request the page makes; if it fails or is blocked the picture just stays hidden.
// Default face/hair per gender (20000/30000 male, 21000/31000 female), light skin (2000). Two-handed swords/axes/BWs, spears
// and polearms (140-144xxxx) only show in the two-handed pose (stand2).
function avatar(w){
  const f = S.gender === "female", ids = [f ? 21000 : 20000, f ? 31000 : 30000, ...Object.values(S.gear), ...(w ? [w.id] : [])];
  const src = `https://maplestory.io/api/MCW/CBT2/character/2000/${ids.join(",")}/${w && w.id / 10000 >= 140 && w.id / 10000 < 145 ? "stand2" : "stand1"}/0`, img = $("#pavatar");
  if (img.dataset.src === src) return;
  img.dataset.src = src; img.onload = () => img.hidden = false; img.onerror = () => img.hidden = true;
  // set after the page's load event so a slow maplestory.io never holds up page load (tests wait on it)
  const go = () => { if (img.dataset.src === src) img.src = src };
  document.readyState === "complete" ? go() : addEventListener("load", go, {once: true});
}
function render(){
  const L = S.lvl, ap = S.ap, cls = S.cls, br = S.branch;
  const r = calc(S.sp), w = r.w;
  S.dps = Math.round(r.dps); S.acc = r.acc; S.win = {min: r.min, max: r.max, pct: r.ai?.pct || 100, magic: r.ai?.kind === "magic" ? Math.floor(ap.INT / 2) + (w?.mad || 0) + r.matkB : 0, INT: ap.INT, form: r.form, hits: r.ai?.hits || 1, crit: r.crit, critDmg: r.critDmg}; S.def = {hp: r.hp, wdef: r.wdef, mdef: r.mdef, mult: r.hpMult, mmult: r.mpMult, avoid: r.avoid}; S.cost = r.cost; S.area = r.ai && r.sk?.rg ? {t: r.ai.targets || 1, r: r.sk.rg, n: r.sk.n} : null;
  const left = apTotal(L) - (ap.STR + ap.DEX + ap.INT + ap.LUK);
  $("#papleft").textContent = left === 0 ? "All AP spent" : left > 0 ? `${left} AP unspent` : `${-left} AP over budget`;
  $("#papleft").className = "pill " + (left === 0 ? "p-good" : "p-warn");
  const gt = gearTotals(), unmet = w ? ["STR","DEX","INT","LUK"].filter(k => (w[k] || 0) > ap[k] + gt[k]) : [];
  $("#preqnote").innerHTML = !w ? "No weapon available for this job at this level." :
    unmet.length ? `<span class="down">Can't equip ${esc(w.name)}: needs ${unmet.map(k => `${w[k]} ${k}`).join(", ")}.</span>` :
    `${esc(w.name)} needs ${["STR","DEX","INT","LUK"].filter(k => w[k]).map(k => `${w[k]} ${k}`).join(", ") || "no stats"} at level ${w.lvl}. Stats from the armor you pick count toward it; the armor's own requirements aren't checked.`;
  renderSkills();

  const skName = r.sk ? r.sk.n : "no attack";
  avatar(w);
  $("#psicon").innerHTML = (w ? itemIcon(w.id) : "") + (r.sk && D.icons[r.sk.id] ? `<img src="data:image/png;base64,${D.icons[r.sk.id]}" alt="" width="32" height="32">` : "");
  $("#psummary").textContent = `Level ${L} ${br} · ${w ? w.name : "no weapon"} · ${skName}${r.sk && r.sk.id !== "basic" ? " " + r.sl : ""}`;
  $("#pdps").textContent = r.ai ? fmt(r.dps) : "0";
  const c = r.cost;
  $("#pcost").innerHTML = r.ai ? `<b>Upkeep:</b> up to ~${fmt(c.mesoHr)} mesos/hr while attacking nonstop: ${fmt(c.mpHr)} MP (${fmt(c.mpHr / 150)} Lemons)${c.hpHr ? `, ${fmt(c.hpHr)} HP` : ""}${c.ammoHr ? `, ${fmt(c.ammoHr)} ${esc(c.ammoName)}${c.ammoPrice ? "" : " (crafted, no price)"}` : ""}, attacks and buffs included. Getting hit and walking aren't counted.` : "";
  $("#pdpsnote").textContent = !r.ai ? `Put at least 1 point into ${skName} (and its prerequisites) to use it.` :
    `${fmt(r.perCast)} per cast every ~${r.interval.toFixed(2)} s (attack speed ${r.stage}${r.booster && r.ai.kind === "phys" ? ", booster on" : ""}). About ${fmt(r.eff)} after misses against monsters within 3 levels of you. Single target, before monster defense.`;
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  $("#pattack").innerHTML = r.ai ? [
    row("Damage range", `${fmt(r.min)} – ${fmt(r.max)}`),
    row("Average hit", fmt(r.avg)),
    ...(r.sk?.id !== "basic" && r.ai.kind === "phys" ? [row("Stat window", `${fmt(r.min * 100 / r.ai.pct)} – ${fmt(r.max * 100 / r.ai.pct)}`)] : []),
    row("Hits × targets", `${r.ai.hits} × ${r.ai.targets}`),
    row("Skill", r.ai.kind === "magic" ? "Basic Attack " + r.ai.pct : r.ai.pct + "%"),
    row("Mastery", Math.round(r.mast * 100) + "%"),
    row("Crit", `${r.crit}% for +${r.critDmg}%`),
    ...(r.faRate ? [row("Final Attack", `${r.faRate}% for ${r.faPct}%`)] : [])
  ].join("") : `<p class="tiny">No damage until the attack skill has points.</p>`;
  const sw = r.ai ? statWeights(r) : [], swTop = Math.max(...sw.map(x => x[1]), 0);
  $("#pweights").innerHTML = swTop > 0 ? sw.map(([k, d]) => row("+1 " + k, `${d >= 0.05 ? "+" + d.toFixed(d < 10 ? 2 : 1) : "0"} <span class="tiny">(${Math.round(d / swTop * 100)}%)</span>`)).join("") : `<p class="tiny">Needs an attack with points in it.</p>`;
  $("#pstats").innerHTML = [
    row("STR / DEX", `${ap.STR + gt.STR} / ${ap.DEX + gt.DEX}`), row("INT / LUK", `${ap.INT + gt.INT} / ${ap.LUK + gt.LUK}`),
    row("Accuracy", Math.round(r.acc)), row("Avoid", r.avoid),
    cls === "Magician" ? row("Magic", Math.floor(ap.INT/2) + (w?.mad || 0) + r.matkB) : row("Weapon attack", w ? w.pad + (r.atkB ? ` +${r.atkB}` : "") : "–"),
    row("HP / MP", `${fmt(r.hp)} / ${fmt(r.mp)}`), row("W.DEF / M.DEF", `${r.wdef} / ${r.mdef}${Object.keys(S.gear || {}).length ? "" : ' <span class="sub">no armor</span>'}`),
    row("AP / SP", `${apTotal(L)} / ${spTotal(L)}`)
  ].join("");

  $("#phits").innerHTML = r.near.length ? `<table class="mini"><tbody>${r.near.map(m => {
    const pct = Math.round(hitProb(r.acc, m[4], m[1] - L) * 100);
    return `<tr><td>${mobLink(m[0])}</td><td class="num sub">Lv ${m[1]}</td><td class="num"><span class="pill ${pct >= 95 ? "p-good" : pct >= 70 ? "p-warn" : "p-bad"}">${pct}%</span></td></tr>`;
  }).join("")}</tbody></table>` : `<p class="tiny">No monsters near this level in the launch areas.</p>`;
  try { localStorage.setItem("planner", JSON.stringify(S)) } catch(e) {}
  track();
}

function refresh(){ fillControls(); render() }
const rebuild = () => { S.sp = {__auto:1} };
document.querySelectorAll("#pclass button").forEach(b => b.addEventListener("click", () => {
  S.cls = b.dataset.v; S.branch = null; S.weapon = null; S.skill = null; S.ap = null; rebuild(); refresh();
}));
$("#plvl").addEventListener("input", () => { S.lvl = +$("#plvl").value; S.weapon = null; S.ap = null; $("#plvlout").textContent = S.lvl });
$("#plvl").addEventListener("change", () => { rebuild(); refresh() });
$("#pfam").addEventListener("click", e => {
  const b = e.target.closest("button[data-v]"); if (!b || b.dataset.v === S.fam) return;
  S.fam = b.dataset.v; S.weapon = null; S.skill = null; S.ap = null; rebuild(); refresh();
});
$("#pbranch").addEventListener("change", () => { S.branch = $("#pbranch").value; S.weapon = null; S.skill = null; S.ap = null; rebuild(); refresh() });
$("#pweapon").addEventListener("change", () => { S.weapon = $("#pweapon").value; S.ap = autoAP(W.find(x => x.name === S.weapon)); refresh() });
$("#pskill").addEventListener("change", () => { S.skill = $("#pskill").value; refresh() });
$("#pammo").addEventListener("change", () => { S.ammo = $("#pammo").selectedOptions[0].text.replace(/ \(\+\d+\)$/, ""); refresh() });
$("#pgear").addEventListener("change", e => { const sl = e.target.dataset.slot; if (!sl) return; if (e.target.value) S.gear[sl] = e.target.value; else delete S.gear[sl];
  if (sl === "Overall" && S.gear.Overall){ delete S.gear.Top; delete S.gear.Bottom } fillGear(); render() });
$("#pgender").addEventListener("change", () => { S.gender = $("#pgender").value; for (const [k, id] of Object.entries(S.gear)) if (ARMOR[id]?.[5] && S.gender && ARMOR[id][5] !== S.gender) delete S.gear[k]; fillGear(); render() });
$("#pgearclear").addEventListener("click", () => { S.gear = {}; fillGear(); render() });
$("#pbuffs").addEventListener("change", () => { S.buffs = $("#pbuffs").checked; render() });
for (const k of ["STR","DEX","INT","LUK"]) $("#p" + k).addEventListener("input", () => { HIST.typing = true; S.ap[k] = Math.min(9999, Math.max(4, Math.floor(+$("#p" + k).value) || 4)); render() });   // 9999: input sanity cap (1e308 scrolled phones sideways), not a game limit
$("#pauto").addEventListener("click", () => { S.ap = autoAP(W.find(x => x.name === S.weapon)); refresh() });
$("#pspauto").addEventListener("click", () => { S.sp = autoSP(); render() });
$("#pspreset").addEventListener("click", () => { S.sp = {}; render() });
// d: +1, -1 or "max"; false when the skill can't take a point (maxed, prerequisite unmet, no SP left in its job)
const canSP = id => { const list = jobSkills(), s = list.find(x => x.id === id);
  return !!s && (S.sp[id] || 0) < s.max && spPool(tierOf(s)) > spentIn(S.sp, tierOf(s), list) && !s.req.some(([n, need]) => { const p = byName(n, list); return p && lv(p, S.sp, list) < need }) };
function addSP(id, d){
  const list = jobSkills(), s = list.find(x => x.id === id); if (!s) return false;
  const v = S.sp[id] || 0, room = spPool(tierOf(s)) - spentIn(S.sp, tierOf(s), list);
  if (d !== -1 && !canSP(id)) return false;
  const n = d === "max" ? Math.min(s.max, v + room) : Math.max(0, Math.min(s.max, v + Math.min(+d, room)));
  if (n) S.sp[id] = n; else delete S.sp[id];
  render(); return true;
}
$("#pskills").addEventListener("click", e => {
  const b = e.target.closest("button[data-d]"); if (b) addSP(b.parentElement.dataset.id, b.dataset.d === "max" ? "max" : +b.dataset.d);
});
// Undo / Redo / Reset (Danny 10-21). Every change to the build is one step (typing in an AP box is one step per burst); the
// screenshot import's own state rides along through BLD.extra, so undoing a paste also takes that screenshot back off.
const KEYS = ["cls","lvl","branch","fam","weapon","skill","ammo","ap","sp","buffs","gear","gender"];
const HIST = {undo: [], redo: [], cur: null, t: 0, quiet: false, typing: false, typed: false}, onRender = [];
const snap = () => { const s = JSON.stringify(Object.fromEntries(KEYS.map(k => [k, S[k]]))), x = BLD?.extra?.get(); return {s, x, k: s + "|" + (BLD?.extra?.key(x) ?? "")} };
function track(){
  if (HIST.hold) return;
  const now = snap(), c = HIST.cur;
  if (c && c.k !== now.k && !HIST.quiet){
    if (!(HIST.typing && HIST.typed && Date.now() - HIST.t < 800)) HIST.undo.push(c), HIST.undo.length > 100 && HIST.undo.shift();
    HIST.t = Date.now(); HIST.redo = []; HIST.typed = HIST.typing;
  }
  HIST.cur = now; HIST.typing = false;
  $("#pundo").disabled = !HIST.undo.length; $("#predo").disabled = !HIST.redo.length;
  for (const f of onRender) f();
}
function restore(h){
  HIST.quiet = true; for (const k of KEYS) delete S[k]; Object.assign(S, JSON.parse(h.s)); BLD.extra?.set(h.x);
  refresh(); HIST.quiet = false; HIST.typed = false;
}
const undo = () => { if (!HIST.undo.length) return; HIST.redo.push(HIST.cur); const r = HIST.redo; restore(HIST.undo.pop()); HIST.redo = r; track() };
const redo = () => { if (!HIST.redo.length) return; HIST.undo.push(HIST.cur); const r = HIST.redo, h = r.pop(); restore(h); HIST.redo = r; track() };
$("#pundo").addEventListener("click", undo);
$("#predo").addEventListener("click", redo);
$("#preset").addEventListener("click", () => { for (const k of KEYS) delete S[k]; Object.assign(S, JSON.parse(S0)); rebuild(); BLD.extra?.set(null); refresh() });
// Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) on the builder; a focused text box keeps its own undo
document.addEventListener("keydown", e => {
  if ($("#plan").hidden || !(e.ctrlKey || e.metaKey) || e.altKey || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey){ e.preventDefault(); undo() }
  else if (k === "y" || (k === "z" && e.shiftKey)){ e.preventDefault(); redo() }
});
$("#pshare").addEventListener("click", () => copyShare($("#pshare"), shareUrl("b", Object.fromEntries(["cls","lvl","branch","fam","weapon","skill","ammo","ap","sp","buffs","gear","gender"].map(k => [k, S[k]])))));
$("#ppath").addEventListener("click", () => pathFrom(S.cls, S.branch, S.fam, S.lvl));
$("#psend").addEventListener("click", () => {
  const map = {Magician:"Magician","F/P Wizard":"F/P Wizard","I/L Wizard":"I/L Wizard",Cleric:"Cleric"};
  const mcls = S.cls === "Magician" ? (map[S.branch] || "Magician") : S.cls;
  $("#cls").value = (S.cls === "Magician" && S.lvl < 30) ? "Magician" : mcls;
  $("#lvl").value = Math.min(MAX_LEVEL, S.lvl);
  setTrainStats(S);
  ACC_FROM_BUILDER = S.acc ?? null; AOE_FROM_BUILDER = S.area?.t > 1 ? S.area : null; DEF_FROM_BUILDER = S.def || null; COST_FROM_BUILDER = S.cost || null;
  document.querySelector('[data-tab="maps"]').click();
  rankMaps();
});
BLD = {get S(){ return S }, weightsAt: (cls, branch, fam, lvl) => { const keep = S; S = {cls, lvl, branch, fam, weapon:null, skill:null, ammo:null, ap:null, sp:{}, buffs:true, aoe:false, obt:true, gear:{}};
    try { applyDefaults(); guideBuild(); return Object.fromEntries(statWeights(calc(S.sp))) } finally { S = keep } }, W, ARMOR, BRANCHES, JOBLABEL, PRIMARY, SLOTS, apTotal, kindOf, faStats, TWO_HANDED,
  apply(fn){ fn(S); refresh() }, skills: jobSkills, tierOf, spPool, spentIn, addSP, canSP, autoSP, onRender: f => onRender.push(f), extra: null,
  group(fn){ HIST.hold = true; try { fn() } finally { HIST.hold = false; track() } }};   // several changes, one Undo step
if (!Object.keys(S.sp).length) rebuild();
refresh();
})();

