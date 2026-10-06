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
// estimates, said so on the page: talking to accept + turn in a quest (less if it's the same NPC again), crossing one map on
// foot, one cab ride between towns. NPCs with no known launch spot keep the old all-in 3 minutes.
const QUEST_SEC = 60, SAME_NPC_SEC = 30, NO_SPOT_SEC = 180, WALK_SEC = 30, TAXI_SEC = 45;
const RESPAWN = 7.56, SOLO_ALIVE = 0.75;   // respawn timer and share of spawns a solo player keeps alive (same as Where to train)
const STICK = 0.9;       // keep the current map while it's within 10% of the best
const BACKUP_LV = 5, BACKUP_RATE = 0.6;   // backup maps: monsters within 5 levels on average, at least 60% of the EXP/hr
const MAXL = MAX_LEVEL;   // level cap (EXP above 49 is meowdb's historical reference, see 00-core.js)

let X = {cls:"Warrior", branch:"Fighter", fam:"Sword", cur:10, goal:30, mode:"mix", pace:1.5, fast:false, island:true, val:true, drop:0.3, aoe:true, guide:"all", party:1};
const BELOW = 5;          // quests more than 5 levels under your starting level count as done or skipped
try { const s = JSON.parse(localStorage.getItem("path") || "null"); if (s && s.cls) X = Object.assign(X, s) } catch(e) {}
if (HASH.p && HASH.p.cls) X = Object.assign(X, HASH.p);   // shared link
if (typeof X.guide !== "string") X.guide = "all";   // class guides: "all" = build + maps, "build", "" = off

// area attack of the character at a level, for mapRates / aoeHits (null = single target)
const aoeOf = ch => ch.targets > 1 && ch.reach ? {t: ch.targets, r: ch.reach, n: ch.skill} : null;
// class names "Where to train" uses; Beginners hit physically, like a Warrior
const mcls = L => L < 10 ? "Warrior" : X.cls === "Magician" ? (L >= 30 ? X.branch : "Magician") : X.cls;
const BC = {};
function charAt(L){
  const br = L >= 30 ? X.branch : FIRST[X.cls], k = [X.cls, br, X.fam, L, X.aoe, X.guide].join("|");
  if (!BC[k]){ const b = buildAt(X.cls, br, X.fam, L, X.aoe, true, !!X.guide); BC[k] = b.dps > 0 ? b : {dps: 20 * L, acc: b.acc, est: true} }
  return BC[k];
}
// the class guide's Training Advisor maps for this level's checkpoint (levels 10-30), or null
// past 30 the branch guide (GUIDE2) names its maps; only maps open at launch count (its Forgotten Hollow picks drop out)
const OPENMAP = {}; for (const [id, m] of Object.entries(D.maps)) if (m[1] && !(m[0].trim() in OPENMAP)) OPENMAP[m[0].trim()] = id;
const guideMaps = L => {
  if (X.guide !== "all" || L > 70) return null;
  const g2 = L >= 30 && GUIDE2[X.branch];
  if (g2){ const c = guideAt(g2.maps, L); return c != null ? g2.maps[c].map(n => OPENMAP[n]).filter(Boolean) : null }
  if (L > 30) return null;
  const g = GUIDE[X.cls], c = guideAt(g.maps, L); return c ? g.maps[c] : null;
};
const WHERE = {};
// open map with the most of this monster: [mapId, name] or null
const whereMob = id => WHERE[id] !== undefined ? WHERE[id] : (WHERE[id] = Object.entries(D.maps).filter(([, m]) => m[1]).map(([mid, m]) => [mid, m[0], (m[2].find(s => String(s[0]) === id) || [0, 0])[1]])
  .sort((a, b) => b[2] - a[2]).find(m => m[2] > 0) || null);
const qIndex = new Map(D.quests.map((r, i) => [r, i]));
// Casey's Omok / Match Cards sets: the pieces and cards are very rare drops, never worth planning around (Danny)
const NOT_PLANNED = r => r.npc === "Casey";
const pool = () => D.quests.filter(r => !SKIP.includes(r.region) && !r.rep && !NOT_PLANNED(r) && (!CLASSREG.includes(r.region) || r.region === X.cls));
// item requirements with a known dropping monster at launch; anything else (NPC-given, unknown source) can't be timed
const okMob = id => D.mobs[id] && !D.latermobs.includes(String(id));
const dropItems = r => r.il.filter(i => okMob(i[2]));
const timed = r => r.kl.every(([id]) => okMob(id)) && r.il.every(i => okMob(i[2]));
const LOOK = 5;   // collect drops for quests up to 5 levels ahead, before they're accepted
// time and EXP to finish a quest now: its kill requirements, plus the kills still missing for its item drops after
// what's already in the bag (each kill of the source monster drops the item with chance X.drop). Kills overlap per monster.
// shortest trip between two maps: walking map to map, or a cab between towns with one. {sec, walk, taxi}; null if unknown
const DIST = {};
function travel(a, b){
  a = a && String(a); b = b && String(b);
  if (!a || !b || !D.nav[a] || !D.nav[b]) return null;
  if (a === b) return {sec: 0, walk: 0, taxi: 0};
  if (!DIST[a]){
    const best = new Map([[a, {sec: 0, walk: 0, taxi: 0}]]), todo = new Set([a]), cabs = new Set(D.cabs);
    while (todo.size){
      let u = null; for (const x of todo) if (u === null || best.get(x).sec < best.get(u).sec) u = x;
      todo.delete(u); const bu = best.get(u);
      const edges = D.nav[u].map(v => [v, WALK_SEC, 1, 0]).concat(cabs.has(u) ? D.cabs.filter(v => v !== u).map(v => [v, TAXI_SEC, 0, 1]) : []);
      for (const [v, c, w, tx] of edges){
        const s = bu.sec + c;
        if (!best.has(v) || s < best.get(v).sec){ best.set(v, {sec: s, walk: bu.walk + w, taxi: bu.taxi + tx, prev: u, cab: !!tx}); todo.add(v) }
      }
    }
    DIST[a] = best;
  }
  return DIST[a].get(b) || null;
}
const tripSec = (a, b) => travel(a, b)?.sec || 0;
const mapName = id => D.maps[id]?.[0] || D.mapnames[id] || "map " + id;
// "walk 2 maps, cab to Perion, walk 3 maps"
function routeText(a, b){
  const t = travel(a, b); if (!t || !t.sec) return "";
  const hops = []; for (let v = String(b); v !== String(a); v = DIST[String(a)].get(v).prev) hops.unshift([v, DIST[String(a)].get(v).cab]);
  const out = []; let walk = 0;
  for (const [v, cab] of hops){
    if (cab){ if (walk) out.push(`walk ${walk} map${walk === 1 ? "" : "s"}`); walk = 0; out.push(`cab to ${mapName(v)}`) } else walk++;
  }
  if (walk) out.push(`walk ${walk} map${walk === 1 ? "" : "s"}`);
  return out.join(", ");
}
const tripText = tr => !tr || !tr.sec ? "" : [tr.taxi ? `${tr.taxi === 1 ? "cab" : tr.taxi + " cabs"}` : "", tr.walk ? `walk ${tr.walk} map${tr.walk === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
const npcSpot = name => D.npcs[D.npcid[name]]?.[1]?.[0]?.[0] || null;
// where to kill n of a monster, starting from `from`: the map with the least travel + kill time. Kill time is the slower
// of your killing speed and the map's respawn of that monster (count × 75% alive every 7.56 s).
function killSpot(id, n, from, L, ch, island){
  const k = mobKill(D.mobs[id], mcls(L), L, ch.dps, ch.acc); if (k.hit < 0.05) return null;
  let best = null;
  for (const [mid, mp] of Object.entries(D.maps)){
    if (!mp[1] || ISLAND(mid) !== !!island) continue;
    const c = (mp[2].find(s => String(s[0]) === id) || [0, 0])[1]; if (!c) continue;
    const a = aoeOf(ch), kill = Math.max(n * k.sec / (a ? aoeHits(mid, a.t, a.r, AOE_FALL[a.n] || 0) : 1), n / (c * SOLO_ALIVE / RESPAWN)), tr = tripSec(from, mid), tot = kill + tr;
    if (!best || tot < best.tot) best = {map: [mid, mp[0]], kill, tr, tot};
  }
  return best;
}
// a quest from where you are: walk to the giver, to each kill spot, and back to turn it in
function questCost(r, L, ch, lastNpc, bag = new Map(), here = null, island = false){
  const spot = npcSpot(r.npc);
  let sec = !spot ? NO_SPOT_SEC : r.npc === lastNpc ? SAME_NPC_SEC : QUEST_SEC, exp = r.exp, pos = here, trv = 0;
  const legs = [], leg = (to, why) => { const s = tripSec(pos, to); if (s){ trv += s; legs.push({from: pos, to, sec: s, why, npc: r.npc, mobs: []}) } pos = to };
  if (spot) leg(spot, "npc");
  const need = new Map(), items = [];
  for (const [id, n] of r.kl) if (D.mobs[id]) need.set(String(id), Math.max(need.get(String(id)) || 0, n));   // tutorial-only monsters aren't in the export
  for (const [name, n, src] of dropItems(r)){
    const have = Math.min(n, bag.get(name) || 0), k = Math.ceil((n - have) / X.drop);
    need.set(String(src), Math.max(need.get(String(src)) || 0, k)); items.push([name, n, have, src, k]);
  }
  const kills = [];
  for (const [id, k] of need){
    const m = D.mobs[id];
    if (!k){ kills.push([m[0], 0, null]); continue }
    const s = killSpot(id, k, pos, L, ch, island); if (!s) return null;
    leg(s.map[0], "kill");
    const kl = legs.filter(l => l.why === "kill" && l.to === s.map[0]).pop(); if (kl) kl.mobs.push([m[0], k]);
    sec += s.kill; exp += m[3] * k; kills.push([m[0], k, s.map, s.tr]);
  }
  if (spot && pos !== spot) leg(spot, "back");
  return {sec: sec + trv, exp, kills, items, travel: trv, legs, end: pos, unknown: r.il.some(i => !okMob(i[2]))};
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

function plan(mode = X.mode){
  const steps = [], cut = X.cur - BELOW, done = new Set(D.quests.filter(r => r.lvl < cut).map(r => r.id));
  const RW = mode === "rewards";
  let Q = pool().filter(r => (RW || timed(r)) && r.lvl >= cut);
  if (RW){   // every quest that pays something (minus "Skip" and other classes' picks), plus whatever they need first
    const want = Q.filter(r => hasReward(r) && vTier(r) !== 5 && vClassOK(r)), pre = new Set(want.flatMap(r => r.pre));
    Q = Q.filter(r => want.includes(r) || pre.has(r.id));
  }
  let L = X.cur, exp = 0, t = 0, cur = null, qExp = 0, gExp = 0, j1 = X.cur >= 10, j2 = X.cur >= 30, npc = null, here = null;
  let gCit = false, gKit = null, gAmmo = false, gReset = false, kpq = X.cur > 30;   // side steps already shown
  const bag = new Map();   // quest drops collected while grinding, by item name
  const needed = new Set(Q.flatMap(r => r.pre));   // quests another quest needs first
  // community-picked valuable quests, shown as side tasks when their chain starts (their items can't be timed)
  const VL = !X.val || RW ? [] : Object.entries(VALUE).map(([id, v]) => { const r = D.quests.find(x => x.id === id); return r && {r, v, s: chainStart(r)} })
    .filter(o => o && !SKIP.includes(o.r.region) && (!o.v[3] || o.v[3] === X.cls) && o.r.lvl >= cut && !(mode !== "grind" && Q.includes(o.r)))
    .sort((a, b) => a.s.lvl - b.s.lvl || a.r.lvl - b.r.lvl);
  let vi = 0;
  const levelUp = () => { while (L < MAXL && exp >= D.exp[L]){ exp -= D.exp[L]; L++ } };
  // drops still wanted by quests within LOOK levels (accepted or not): item -> {left, src, q: first quest needing it}
  const wanted = () => {
    const w = new Map();
    if (mode === "grind") return w;
    for (const r of Q) if (!done.has(r.id) && r.lvl <= L + LOOK) for (const [name, n, src] of dropItems(r)){
      const o = w.get(name) || {need: 0, src: String(src), q: r}; o.need += n; w.set(name, o);
    }
    for (const [name, o] of w){ o.left = Math.max(0, o.need - (bag.get(name) || 0)); if (!o.left) w.delete(name) }
    return w;
  };
  // grind to the next level. Maps are scored by EXP plus the farming time their drops will save later: each wanted item
  // collected here saves 1/drop kills of its monster, worth (that kill time × best EXP/s − the kill's own EXP).
  // a new weapon (the default character's best weapon changes): its own step with where to get it
  let wpn = null;
  // meso budget: weapons bought (cheapest NPC shop price; free, crafted, quest and dropped weapons count 0), potion and ammo
  // upkeep while grinding (the character's cost/hr × the map's attacking share), quest mesos earned, potions quests hand out
  // (at shop price) and monster meso drops (grinding + the kills quests ask for; meowdb player reports, else ~2 per level).
  let spend = 0, upkeep = 0, earned = 0, drops = 0, qpots = 0;
  const gearCheck = () => { const c = charAt(L); if (c.weapon && c.weapon !== wpn){
    const shop = D.wsrc[c.weapon]?.shop, price = GUIDE_FREE[c.weapon] || !shop ? 0 : Math.min(...shop.map(x => x[3]));
    spend += price; steps.push({k:"gear", L, weapon: c.weapon, wid: c.wid, first: !wpn, t, price, spent: spend + upkeep, earned, drops}); wpn = c.weapon } };
  // moving between maps is its own step, like job advancements
  const pushTravel = lg => { const s = lg.sec * X.pace; t += s; steps.push({k:"travel", L, ...lg, sec: s, t}) };
  // a quest: travel to its giver, the quest itself (talk + kills), then travel to the kill maps and back to turn it in
  const pushQuest = (r, c, vs) => {
    const legs = c.legs || [], first = legs[0]?.why === "npc" ? legs[0] : null;
    if (first) pushTravel(first);
    const sec = (c.sec - (c.travel || 0)) * X.pace; t += sec; exp += c.exp; qExp += c.exp;
    const st = {k:"quest", L, r, c, sec, t, vs}; steps.push(st); earned += r.mesos || 0;
    for (const [id, n] of r.kl || []) drops += n * mesoKill(id);
    for (const g of r.ri || []) if (g.k === "get") for (const [id, n] of g.it) qpots += n * (D.potval?.[id] || 0);
    for (const lg of legs) if (lg !== first) pushTravel(lg);
    return st;
  };
  // backup maps if the pick is crowded: similar monster level (within BACKUP_LV) and at least BACKUP_RATE of its EXP/hr
  const backups = (m, all) => all.filter(x => x.id !== m.id && Math.abs(x.avg - m.avg) <= BACKUP_LV && x.rate >= BACKUP_RATE * m.rate).slice(0, 2);
  const grindOne = (rows, ch, alt = null, all = rows) => {
    if (!rows.length) return false;
    const W = wanted(), E = D.exp[L] - exp, G = rows[0].rate;
    const score = m => {
      const T = E / m.rate, tr = travel(here, m.id); let credit = 0; const got = [];
      for (const [name, o] of W){
        const c = (D.maps[m.id][2].find(sp => String(sp[0]) === o.src) || [0, 0])[1]; if (!c) continue;
        const mob = D.mobs[o.src], items = Math.min(o.left, T * c * m.rate / m.cyc * X.drop);
        // value the saved kills at the level you'd do the quest (you'll be stronger by then)
        const QL = Math.max(L, o.q.lvl), qch = charAt(QL);
        credit += items / X.drop * Math.max(0, mobKill(mob, mcls(QL), QL, qch.dps, qch.acc).sec * G - mob[3]);
        got.push([name, items, o.q]);
      }
      return {m, eff: (E + credit) / (T + (tr?.sec || 0)), got, tr};
    };
    const S = rows.slice(0, 40).map(score).sort((a, b) => b.eff - a.eff);
    let best = S[0];
    if (cur){ const c = S.find(x => x.m.id === cur.id); if (c && c.eff >= STICK * best.eff) best = c }
    if (best.tr?.sec) pushTravel({from: here, to: best.m.id, sec: best.tr.sec, why: "grind"});
    const sec = E / best.m.rate * X.pace; t += sec; gExp += E; exp = 0;
    upkeep += (ch.cost?.mesoHr || 0) * E / best.m.rate * (best.m.att ?? 1) / 3600; drops += E / best.m.rate * (best.m.meso || 0);
    for (const [name, n] of best.got) bag.set(name, (bag.get(name) || 0) + n);
    const last = steps[steps.length - 1];
    let st = last;
    if (last && last.k === "grind" && last.map.id === best.m.id){ last.to = L + 1; last.sec += sec; last.t = t }
    else steps.push(st = {k:"grind", from:L, to:L + 1, map:best.m, sec, t, rate:best.m.rate, ch:charAt(L), got: new Map(), guide: !!alt, alt: alt && alt.id !== best.m.id ? alt : null, backup: backups(best.m, all.filter(x => x.id !== alt?.id))});
    for (const [name, n, q] of best.got){ const g = st.got.get(name) || {n: 0, q}; g.n += n; st.got.set(name, g) }
    cur = best.m; here = best.m.id; L++; return true;
  };
  const finish = (r, c) => { for (const [name, n, have] of c.items || []) bag.set(name, (bag.get(name) || 0) - have) };
  // Maple Island comes first and is the same in every mode: every island quest, island maps in between, then the ship out
  if (X.cur < 10 && X.island){
    const IQ = D.quests.filter(r => r.region === "Maple Island").sort((a, b) => a.lvl - b.lvl || a.id - b.id);
    steps.push({k:"job", L, txt:"Maple Island: hand in every quest before you leave. Pio's quest gives The Green Relaxer chair, which you can't get anywhere else (his screws and boards come from boxes; if they're camped, Mina in Lith Harbor sells the Sky-blue Wooden Chair for 1,000 mesos). Switch to the Razor at level 5." +
      (X.guide ? ` All AP into ${Object.keys(GUIDE[X.cls].start)[0]}; there's no stat requirement for 1st job and AP doesn't reset. Beginner SP: Nimble Feet first, then Three Snails, then Recovery (3 each by 10).` : "")});
    for (let g = 0; g < 500 && L < X.goal; g++){
      gearCheck();
      const left = IQ.filter(r => !done.has(r.id)); if (!left.length && L >= SHIP_LV) break;
      const r = left.find(r => Math.max(1, r.lvl) <= L && r.pre.every(id => done.has(id))), ch = charAt(L);
      if (r){
        const c = questCost(r, L, ch, npc, bag, here, true) || {sec: QUEST_SEC, exp: r.exp, kills: [], items: []}; npc = r.npc; if (c.end) here = c.end;
        done.add(r.id); finish(r, c); const L0 = L, st = pushQuest(r, c, null); levelUp(); if (L > L0) st.ups = [L0 + 1, L]; continue;
      }
      // a quest needs a higher level, or the ship needs level 7: grind on the island
      if (!grindOne(mapRates(mcls(L), L, ch.dps, ch.acc, Infinity, aoeOf(ch), X.party).filter(m => ISLAND(m.id)), ch)){ steps.push({k:"nomap", L}); break }
    }
    if (IQ.every(r => done.has(r.id)) && L >= SHIP_LV) steps.push({k:"job", L, txt:"Leave Maple Island: Shanks at the Southperry dock sails to Lith Harbor (level 7+, 300 mesos, which Mai's and Pio's quests cover). One way, you can't come back. Then do the Lith Harbor quests until 10."});
    cur = null; here = "10000000";   // the ship lands in Lith Harbor
  }
  for (let guard = 0; L < X.goal && guard < 3000; guard++){
    // job advancements: go to the instructor first (their room in the job town), then advance
    const toInstructor = () => { const to = npcSpot(INSTRUCTOR[X.cls]); if (to){ const s = tripSec(here, to); if (s) pushTravel({from: here, to, sec: s, why: "npc", npc: INSTRUCTOR[X.cls]}); here = to; cur = null } };
    if (!j1 && L >= 10){ j1 = true; toInstructor(); steps.push({k:"job", L, txt:`1st job: talk to ${INSTRUCTOR[X.cls]} in ${JOBTOWN[X.cls]} to become a ${FIRST[X.cls]}. Cabs are 90% off while you're a Beginner.` +
      (X.guide ? ` Skill plan (meowdb ${X.cls} guide): ${GUIDE[X.cls].skills} Level-up rows list each level's SP and AP.` : "")}) }
    if (!kpq && L >= 21){ kpq = true; steps.push({k:"kpq", L, r: D.quests.find(x => x.id === "10311")}) }
    while (vi < VL.length && Math.max(1, VL[vi].s.lvl) <= L){ steps.push({k:"value", L, ...VL[vi], t}); vi++ }
    if (!j2 && L >= 30){ j2 = true; toInstructor(); steps.push({k:"job", L, txt:`2nd job: back to ${INSTRUCTOR[X.cls]} in ${JOBTOWN[X.cls]} to become a ${X.branch}.`}) }
    // class guide side steps: citizenship at 12, gear at each guide checkpoint (1st job, then the branch's 30-70 weapons),
    // ammo upgrade, the Bandit's SP reset
    if (X.guide && L <= 70){
      const g = GUIDE[X.cls], g2 = L >= 30 ? GUIDE2[X.branch] : null;
      if (!gCit && L >= 12 && L <= 30){ gCit = true; steps.push({k:"job", id:"cit", L, txt:`Citizenship (level 12+): the ${X.cls} guide recommends ${g.town[0]}. Sign up with ${g.town[1]}. ${g.town[2]} Daily and weekly town quests raise your grade; see the Citizenship tab.`}) }
      const tbl = g2 ? g2.weapons : L <= 30 ? g.gear : null, c = tbl ? guideAt(tbl, L) : null, kk = `${g2 ? X.branch : X.cls}:${c}`;
      if (c != null && kk !== gKit){ gKit = kk; steps.push({k:"kit", L, c, b: g2 ? X.branch : null, t}) }
      const am = g.ammo, fam = X.cls === "Bowman" ? (X.fam || "Bow") : "Claw";
      if (am && !gAmmo && L >= am.from && L <= 30){ gAmmo = true; steps.push({k:"job", id:"ammo", L, txt:`Ammo upgrade: ${am[fam]}. ${am.txt}`}) }
      if (g2?.reset && !gReset && L >= g2.reset.at){ gReset = true; steps.push({k:"job", id:"reset", L, txt:`SP reset (Cash Shop SP Reset Scroll, 7,000 NX): first-job SP becomes ${Object.entries(g2.reset.first).map(([k, v]) => `${k} ${v}`).join(", ")}; second-job SP goes to Dagger Mastery 20, Dagger Booster 1, Savage Blow 10. Switch from the claw to a dagger. (meowdb Bandit guide)`}) }
    }
    gearCheck();
    const ch = charAt(L);
    const all = mapRates(mcls(L), L, ch.dps, ch.acc, Infinity, aoeOf(ch), X.party).filter(m => !ISLAND(m.id));
    let rates = all.filter(m => m.avg >= L - 12), alt = null;
    if (!rates.length) rates = all;   // nothing near your level: best of the rest
    // class guide on: train on the guide's maps for this level (its Training Advisor also checks sure hits, 2-hit kills,
    // danger and the walk to town, which this model doesn't); the model's own pick is kept to show next to it
    const gm = guideMaps(L);
    if (gm){ const gr = all.filter(m => gm.includes(m.id)); if (gr.length){ alt = rates[0]; rates = gr } }
    let best = rates[0];
    if (cur && best){ const c = rates.find(r => r.id === cur.id); if (c && c.rate >= STICK * best.rate) best = c }
    const G = best ? best.rate : 0;
    let pick = null;
    if (mode !== "grind") for (const r of Q){
      if (done.has(r.id) || Math.max(1, r.lvl) > L || !r.pre.every(id => done.has(id))) continue;
      if (!r.exp && !r.kl.length && !needed.has(r.id) && !(RW && hasReward(r))) continue;   // no EXP, no reward, nothing needs it
      const c = questCost(r, L, ch, npc, bag, here); if (!c) continue;
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
      done.add(pick.r.id); finish(pick.r, pick.c); npc = pick.r.npc; if (pick.c.end) here = pick.c.end;
      const L0 = L, st = pushQuest(pick.r, pick.c, G && !RW ? pick.rate / G : null);
      levelUp(); if (L > L0) st.ups = [L0 + 1, L];
      continue;
    }
    if (mode === "quests"){ steps.push({k:"stop", L, exp}); break }
    if (!grindOne(rates, ch, alt, all)){ steps.push({k:"nomap", L}); break }
    npc = null;
  }
  const mesos = steps.filter(s => s.k === "quest").reduce((a, s) => a + s.r.mesos, 0), items = steps.filter(s => s.k === "quest").reduce((a, s) => a + itemValue(s.r), 0);
  return {steps, L, t, qExp, gExp, done, mesos, items, spend, upkeep, drops, qpots};
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
  X.cur = Math.min(MAXL - 1, Math.max(1, Math.round(X.cur) || 1)); X.goal = Math.min(MAXL, Math.max(X.cur + 1, Math.round(X.goal) || X.cur + 1));
  $("#xisland").checked = X.island; $("#xislandwrap").hidden = X.cur >= 10;
  $("#xval").checked = X.val;
  $("#xdrop").value = Math.round(X.drop * 100); $("#xdropout").textContent = Math.round(X.drop * 100) + "%"; $("#xdropwrap").hidden = X.mode === "grind";
  $("#xaoe").value = X.aoe ? "1" : ""; $("#xparty").value = String(X.party || 1); $("#xguide").value = X.guide;
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
  const tot = P.qExp + P.gExp, net = P.drops + P.mesos + Math.min(P.qpots, P.upkeep) - P.spend - P.upkeep;
  $("#xsum").innerHTML = [
    [stop ? `Stops at level ${stop.L}` : `About ${hm(P.t)} to level ${X.goal}`,
      stop ? (stop.k === "stop" ? `Quests that can be timed run out at level ${stop.L}${X.goal > stop.L ? `, ${X.goal - stop.L} short of your goal. Switch to "Quests + grinding" to finish.` : "."}` : `No training map fits level ${stop.L}.`)
           : `From level ${X.cur} at ${X.pace === 1 ? "perfect-play" : X.pace === 2 ? "relaxed" : "average"} pace. Estimate.`],
    [`Mesos: about ${net >= 0 ? "+" : "−"}${fmt(Math.abs(net))} overall`, `Earned about ${fmt(P.drops)} from monster meso drops and ${fmt(P.mesos)} from quests. Spent ${fmt(P.spend)} on weapons (NPC shop prices) and up to ${fmt(P.upkeep)} on potions and ammo while grinding (skills on every attack, at shop prices)${P.qpots ? `, of which quest potions cover about ${fmt(Math.min(P.qpots, P.upkeep))}` : ""}. Monster mesos are player reports on meowdb, estimated at ${D.mesok} per monster level where nobody has reported yet. Selling loot and getting hit aren't counted.`],
    ...(X.mode === "rewards" ? [[`${fmt(P.mesos)} mesos + items worth ≈ ${fmt(P.items)} to NPCs`, `From ${nq} quests, ${S.filter(s => s.k === "quest" && vTier(s.r) === 1).length} of them rated Must do. NPC sell value is a floor: rated items (Sauna Robe, scrolls) sell for far more to players.`]] : []),
    [`${nq} quests · ${maps} training map${maps === 1 ? "" : "s"}${nv ? ` · ${nv} valuable side quests` : ""}`, tot ? `${Math.round(100 * P.qExp / tot)}% of the EXP from quests (including the kills they ask for), ${Math.round(100 * P.gExp / tot)}% from grinding.` : ""],
    ...(G && !stop && !G.steps.some(s => s.k === "nomap") && nq ? [[`Grinding only: ${hm(G.t)}`, P.t > G.t
      ? `The quests cost about ${hm(P.t - G.t)} more than pure grinding, in exchange for their item rewards. Tick "Only quests faster than grinding" to drop the slow ones.`
      : `The quests save about ${hm(G.t - P.t)} over pure grinding.`]] : [])
  ].map(([h, p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
  let n = 0;
  // tick-off boxes: a step's key survives replanning when it's the same quest / job advancement / map and levels
  const key = s => s.k === "gear" ? `w${s.weapon}:${s.L}` : s.k === "quest" || s.k === "value" ? "q" + s.r.id : s.k === "grind" ? `g${s.map.id}:${s.from}-${s.to}` : s.k === "travel" ? `t${s.from}>${s.to}:${s.L}` : s.k === "kit" ? `k${s.b || X.cls}:${s.c}` : s.k === "kpq" ? "kpq" : `j${X.cls}:${s.L}${s.id ? ":" + s.id : ""}`;
  // class guide: what to spend each level's SP and AP on, for the levels a step takes you through
  const ups = (a, b) => !X.guide || a > 70 ? "" : `<div class="sub ups">${Array.from({length: Math.min(b, 70) - a + 1}, (_, i) => a + i)
    .map(l => `<span>Lv ${l}: ${esc(l <= 30 ? guideLevelText(X.cls, l, X.fam) : guideLevelText2(X.branch, l, X.fam))}</span>`).join("")}</div>`;
  const tr = (s, cls = "") => `<tr class="${cls}${DONE.has(key(s)) ? " done" : ""}" data-k="${key(s)}">`;
  const chk = (s, label) => `<label class="stepchk"><input type="checkbox"${DONE.has(key(s)) ? " checked" : ""} aria-label="Step ${label || ""} done">${label}</label>`;
  $("#xrows").innerHTML = S.map(s => {
    if (s.k === "job") return `${tr(s, "branch")}<td class="num">${chk(s, "")}</td><td class="num">${s.L}</td><td colspan="5">${esc(s.txt)}</td></tr>`;
    if (s.k === "kit" && s.b){ const g2 = GUIDE2[s.b], first = s.c === Math.min(...Object.keys(g2.weapons).map(Number));
      return `${tr(s, "grow")}<td class="num">${chk(s, "")}</td><td class="num">${s.L}</td><td colspan="5"><b>${esc(s.b)} guide weapons from level ${s.c}:</b> ${g2.weapons[s.c].map(n => { const w = D.weapons.find(x => x[0] === n); return w ? `${itemIcon(w[12], 1, true)}${esc(n)} <span class="sub">(${esc(w[1])})</span>` : esc(n) }).join(", ")}.${first ? ` ${esc(g2.note)}` : ""} <a class="sub" href="${GUIDE2_SRC(s.b)}" target="_blank" rel="noopener">meowdb ${esc(s.b)} guide</a></td></tr>` }
    if (s.k === "kit"){ const g = GUIDE[X.cls];
      return `${tr(s, "grow")}<td class="num">${chk(s, "")}</td><td class="num">${s.L}</td><td colspan="5"><b>Class guide gear from level ${s.c}:</b> ${g.weapons[s.c].map(esc).join(" or ")}. ${esc(g.gear[s.c])} <a class="sub" href="${GUIDE_SRC[X.cls]}" target="_blank" rel="noopener">meowdb ${esc(X.cls)} guide</a></td></tr>` }
    if (s.k === "kpq") return `${tr(s, "vrow")}<td class="num">${chk(s, "")}</td><td class="num">${s.L}</td><td colspan="5"><b>Kerning Party Quest</b> (optional, needs a party): 4 players, level 21+, 30 minutes, start with Lakelis in Kerning City.
      ${s.r ? `First take ${qlink(s.r)} from Lakelis: kill King Slime once for ${fmt(s.r.exp)} EXP, ${fmt(s.r.mesos)} mesos and a random Intermediate earring scroll.` : ""}
      King Slime can drop Squishy Shoes (level 28, +1 all stats, 5 slots, tradeable), and every member gets a Companion's Magic Box. Not timed. <a class="sub" href="https://meowdb.com/msclassic/guides/kerning-city-party-quest-kpq-guide" target="_blank" rel="noopener">meowdb KPQ guide</a></td></tr>`;
    if (s.k === "stop") return `<tr><td></td><td class="num">${s.L}</td><td colspan="5" class="sub">No more quests to do at this level. Grind or switch to "Quests + grinding".</td></tr>`;
    if (s.k === "nomap") return `<tr><td></td><td class="num">${s.L}</td><td colspan="5" class="sub">No training map fits this level.</td></tr>`;
    n++;
    if (s.k === "gear"){
      const src = D.wsrc[s.weapon] || {}, how = [];
      if (src.shop) how.push(`Buy from ${src.shop.slice(0, 2).map(([npc, mid, mname, price]) => `${esc(npc)} at ${mid ? mapLink(mid, mname) : esc(mname)} for ${fmt(price)} mesos`).join(", or ")}`);
      if (src.craft) how.push(`Craft with ${esc(src.craft[0])} Lv ${src.craft[1]}: ${src.craft[3].map(([i, k]) => `${k} ${esc(i)}`).join(", ")} + ${fmt(src.craft[2])} mesos`);
      if (src.quest) how.push(`Quest reward: ${src.quest.map(id => { const r = D.quests.find(x => x.id === id); return r ? qlink(r) : "" }).filter(Boolean).join(", ")}`);
      const ld = (src.drops || []).filter(([m]) => MOBID[m] && !D.latermobs.includes(MOBID[m]));
      if (ld.length) how.push(`Drops from ${ld.slice(0, 5).map(([m, lv]) => `${mobLink(m)} <span class="sub">Lv ${lv}</span>`).join(", ")}${src.dropsFrom === "msea" ? ` <span class="sub">(old MapleSEA drop list, likely in Classic; meowdb)</span>` : ` <span class="sub">(reported by players on meowdb)</span>`}`);
      if (GUIDE_FREE[s.weapon]) how.push(esc(GUIDE_FREE[s.weapon]));
      how.push(`<span class="budget">${s.price ? `Costs ${fmt(s.price)} mesos. ` : ""}By now: about ${fmt(s.spent)} mesos spent on weapons, potions and ammo; about ${fmt(s.drops + s.earned)} earned (${fmt(s.drops)} monster drops, ${fmt(s.earned)} quests).</span>`);
      if (!how.length) how.push(`No known source yet (not sold, crafted, a quest reward or a reported drop). Keep your current weapon until you find one.`);
      return `${tr(s, "grow")}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td><div class="gear">${s.wid ? itemIcon(s.wid, 1, true) : ""}<b>${s.first ? "Weapon" : "New weapon"}: ${esc(s.weapon)}</b></div><div class="sub how">${how.join("<br>")}</div></td>
      <td class="sub">${src.shop ? `${esc(src.shop[0][0])} · ${src.shop[0][1] ? mapLink(src.shop[0][1], src.shop[0][2]) : esc(src.shop[0][2])}` : ""}</td><td class="num">–</td><td class="num sub">not timed</td><td class="num">${hm(s.t)}</td></tr>`;
    }
    if (s.k === "travel"){
      const why = s.why === "npc" ? ` to see ${npcLink(s.npc)}` : s.why === "back" ? ` to turn in to ${npcLink(s.npc)}` : s.why === "kill" && s.mobs.length ? ` to kill ${s.mobs.map(([m, k]) => `${mobLink(m)} ×${fmt(k)}`).join(", ")}` : s.why === "grind" ? " to grind" : "";
      return `${tr(s, "trow")}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td>Travel to ${mapLink(s.to, mapName(s.to))}${why}<div class="sub">${esc(routeText(s.from, s.to))}</div></td>
      <td class="sub">from ${mapLink(s.from, mapName(s.from))}</td><td class="num">–</td><td class="num">${hm(s.sec)}</td><td class="num">${hm(s.t)}</td></tr>`;
    }
    if (s.k === "value") return `${tr(s, "vrow")}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td>${vPill(s.r.id)} ${qlink(s.r)}<div class="vwhy"><b>${esc(s.v[1])}</b> · ${esc(s.v[2])}</div>
        <div class="ricons">${rewardIcons(VICON[s.r.id] ? D.quests.find(x => x.id === VICON[s.r.id]) : s.r)}</div>
        <div class="sub">${s.s !== s.r ? `Start with ${qlink(s.s)} (Lv ${s.s.lvl}), ${s.r.cn}-quest chain · ` : ""}needs ${reqHTML(s.r, true)}</div></td>
      <td class="sub">${npcLink(s.s.npc)} · ${esc(s.s.region || "")}</td>${rvCell(s.r)}<td class="num sub">not timed</td><td class="num">${hm(s.t)}</td></tr>`;
    if (s.k === "quest") return `${tr(s)}<td class="num">${chk(s, n)}</td><td class="num">${s.L}</td>
      <td>Quest: ${qlink(s.r)} ${vPill(s.r.id)}${s.vs != null ? ` <span class="pill ${s.vs >= 1 ? "p-good" : "p-warn"}" title="Quest EXP per hour compared with grinding at this level">${s.vs >= 1 ? "faster than grinding" : Math.round(s.vs * 100) + "% of grinding speed"}</span>` : ""}${s.r.ri?.length ? `<div class="ricons">${rewardIcons(s.r)}</div>` : ""}<div class="sub">+${fmt(s.c.exp)} EXP${s.c.kills.some(k => k[1] > 0) ? " incl. kills" : ""}${s.r.req !== "talk / deliver only" ? " · " + reqHTML(s.r, true) : " · talk / deliver"}</div>${s.ups ? ups(...s.ups) : ""}${(s.c.items || []).length ? `<div class="sub drops">${s.c.items.map(([name, n, have, src, k]) => `${esc(name)}: ${have ? `<b>${fmt(have)} saved from grinding</b>` : "none saved"}${k ? `, ~${fmt(k)} ${mobLink(src)} kills for the rest` : ""}`).join("<br>")}</div>` : ""}</td>
      <td class="sub">${npcLink(s.r.npc)} · ${esc(s.r.region || "")}${s.c.kills.filter(k => k[1] > 0).map(([m, c, w]) => w ? `<br>${mobLink(m)} ×${fmt(c)}: ${mapLink(w[0], w[1])}` : "").join("")}</td>
      ${rvCell(s.r)}<td class="num">${hm(s.sec)}${s.c.unknown ? `<div class="sub" title="Some items have no known drop source">+ other items</div>` : ""}</td><td class="num">${hm(s.t)}</td></tr>`;
    return `${tr(s)}<td class="num">${chk(s, n)}</td><td class="num">${s.from}→${s.to}</td>
      <td><b>Grind to level ${s.to}</b><div class="sub gear">${s.ch.wid ? itemIcon(s.ch.wid, 1, true) : ""}${s.ch.sid && D.icons[s.ch.sid] ? `<img class="sk" src="data:image/png;base64,${D.icons[s.ch.sid]}" alt="" title="${esc(s.ch.skill)}">` : ""}
        <span>~${fmt(s.rate * 3600 / X.pace)} EXP/hr${s.map.hits > 1.05 ? ` · hits ~${s.map.hits.toFixed(1)} per cast` : ""}${s.ch.weapon ? ` · ${esc(s.ch.weapon)}, ${esc(s.ch.skill || "")}` : ""}</span></div>${ups(s.from + 1, s.to)}</td>
      <td>${mapLink(s.map.id, s.map.name)} ${dangerPill(mapDanger(s.map.id, s.from, s.ch.hp ? s.ch : defaultDef(mcls(s.from), s.from)))}${POTS[s.map.id] ? `<div class="sub">${esc(potsText(s.map.id))}</div>` : ""}${s.guide ? ` <span class="pill p-good" title="meowdb ${esc(X.cls)} guide's Training Advisor pick for this level">guide map</span>` : ""}${s.alt && s.alt.rate > s.rate * 1.02 ? `<div class="sub">Model's fastest: ${mapLink(s.alt.id, s.alt.name)} ~${fmt(s.alt.rate * 3600 / X.pace)} EXP/hr (not a guide pick)</div>` : ""}${s.backup?.length ? `<div class="sub">If it's crowded: ${s.backup.map(b => `${mapLink(b.id, b.name)} (Lv ${Math.round(b.avg)}, ${(d => d >= 0 ? "+" + d : "−" + -d)(Math.round(100 * b.rate / s.rate) - 100)}% EXP/hr)`).join(", ")}</div>` : ""}<div class="sub">${mobList(s.map.mobs)}</div>${s.got?.size ? `<div class="sub farm">Collects on the way: ${[...s.got].filter(([, g]) => g.n >= 1).map(([name, g]) => `${fmt(g.n)} ${esc(name)} <span title="${esc(g.q.name)}, Lv ${g.q.lvl}">(${esc(g.q.name)}${g.q.lvl > s.to ? `, Lv ${g.q.lvl}` : ""})</span>`).join(", ")}</div>` : ""}</td><td class="num">–</td>
      <td class="num">${hm(s.sec)}</td><td class="num">${hm(s.t)}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">You're already at your goal.</td></tr>`;
  saveDone();
  const ex = pool().filter(r => !timed(r) && !P.done.has(r.id) && r.lvl <= X.goal && r.lvl >= Math.max(1, X.cur - 5)).sort((a, b) => a.lvl - b.lvl || b.exp - a.exp);
  $("#xextra").innerHTML = ex.map(r => `<tr><td class="num">${r.lvl}</td><td>${qlink(r)}<div class="sub">${npcLink(r.npc)} · ${esc(r.region || "")}</div></td>
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
$("#xaoe").addEventListener("change", () => { X.aoe = !!$("#xaoe").value; render() });
$("#xshare").addEventListener("click", () => copyShare($("#xshare"), shareUrl("p", X)));
$("#xparty").addEventListener("change", () => { X.party = +$("#xparty").value || 1; render() });
$("#xguide").addEventListener("change", () => { X.guide = $("#xguide").value; render() });
$("#xfast").addEventListener("change", () => { X.fast = $("#xfast").checked; render() });
$("#xdrop").addEventListener("input", () => { X.drop = +$("#xdrop").value / 100; $("#xdropout").textContent = $("#xdrop").value + "%"; later() });
$("#xpace").addEventListener("change", () => { X.pace = +$("#xpace").value; render() });
$("#xcur").addEventListener("input", () => { X.cur = +$("#xcur").value || 1; if (X.goal <= X.cur) X.goal = Math.min(MAXL, X.cur + 1); later() });
$("#xgoal").addEventListener("input", () => { X.goal = +$("#xgoal").value || X.cur + 1; later() });
pathFrom = (cls, branch, fam, lvl) => {
  X.cls = cls; X.cur = Math.min(MAXL - 1, lvl);
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
