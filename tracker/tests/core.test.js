// node tests/core.test.js — session math on synthetic reader events (no screen needed)
const assert = require("assert"), G = require("../app/gamedata.json"), {createSession} = require("../core/session.js");
const T0 = Date.UTC(2026, 9, 17, 12), sec = s => T0 + s * 1000;

// solo on Snail Hunting Ground III (Snail 2 EXP, Blue Snail 4, Red Snail 8): one kill every 10 s for 10 min
let s = createSession(G);
s.add({t: sec(0), type: "map", id: 42});
s.add({t: sec(0), type: "bar", exp: 100, level: 10});
for (let i = 0; i < 60; i++){
  s.add({t: sec(i * 10), type: "exp", gain: [2, 4, 8][i % 3]});
  if (i % 3 === 2) s.add({t: sec(i * 10 + 1), type: "meso", amount: 10});
  if (i % 6 === 1) s.add({t: sec(i * 10 + 2), type: "item", id: 4000019});
}
let st = s.stats();
assert.strictEqual(st.kills, 60);
assert.deepStrictEqual(st.mobs.map(m => [m.name, m.kills]).sort(), [["Blue Snail", 20], ["Red Snail", 20], ["Snail", 20]]);
assert.strictEqual(st.mobs.find(m => m.name === "Red Snail").mesos, 200, "mesos credited to the kill before the pickup");
assert.strictEqual(st.mobs.find(m => m.name === "Blue Snail").items["4000019"], 10);
assert.ok(Math.abs(st.activeMin - 591 / 60) < 1e-9, "active time from first to last pickup");
assert.ok(Math.abs(st.killsHr - 60 / (591 / 3600)) < 1e-6);
// Etc monster drops at the NPC sell price, useful items (ores, crafting materials, equipment) at the player price (Danny 2026-10-23)
assert.strictEqual(st.lootValue, 10 * G.items["4000019"].p, "Horny Mushroom Cap at its NPC price");
assert.ok(st.lootLo === st.lootValue && st.lootHi === st.lootValue && st.lootRough === 0 && st.items[0].npc, "NPC price: no range, not rough");
{ const {lootPrice} = require("../core/session.js");
  assert.strictEqual(lootPrice(G, "4010000").each, G.pw["4010000"][0], "Bronze Ore at its meso.watch median");
  assert.ok(!lootPrice(G, "4010000").npc && lootPrice(G, "4020000").each === G.pw["4020000"][0], "ores are useful");
  assert.strictEqual(lootPrice(G, "4003000").each, G.pw["4003000"][0], "Screw (crafting) at the player price");
  assert.strictEqual(lootPrice(G, "4000021").each, G.items["4000021"].p, "Wild Boar Tooth at NPC price");
  const eq = Object.keys(G.pw).find(id => G.items[id]?.c === "Equipment"); assert.strictEqual(lootPrice(G, eq).each, G.pw[eq][0], "equipment at the player price") }
assert.ok(st.toLevelHrs > 0 && st.toLevelHrs < 100);

// idle: a 5-minute AFK gap adds nothing to active time
s = createSession(G);
s.add({t: sec(0), type: "map", id: 40});
s.add({t: sec(0), type: "exp", gain: 2});
s.add({t: sec(30), type: "exp", gain: 2});
s.add({t: sec(330), type: "exp", gain: 2});
s.add({t: sec(340), type: "exp", gain: 2});
assert.strictEqual(s.stats().activeMin, 40 / 60);

// EXP goes to the map it was gained on, not where the run ended (Danny 2026-10-23: a death or town scroll back to Lith Harbor
// made "Lith Harbor Department Store" the run's training map)
{ const m = createSession(G), lv = 20, at = (t, e) => m.add({t: sec(t), type: "bar", exp: e, pct: e / G.exp[lv] * 100, level: lv});
  m.add({t: sec(0), type: "map", id: 42}); at(0, 1000);
  for (let i = 1; i <= 60; i++){ m.add({t: sec(i * 10), type: "exp", gain: 8}); at(i * 10 + 1, 1000 + i * 8) }   // 10 min, 480 EXP
  at(610, 1000 + 480 - 50);   // died
  m.add({t: sec(620), type: "map", id: 10000000}); m.add({t: sec(640), type: "map", id: 10000002});
  for (let i = 0; i < 30; i++) at(650 + i * 20, 1430);   // 10 min shopping, the bar still reading
  const st = m.stats();
  assert.strictEqual(st.map, "42", "run map = where the EXP came from");
  assert.strictEqual(st.mapName, "Snail Hunting Ground III");
  assert.strictEqual(st.nowMapName, "Lith Harbor Department Store", "live display = where the player is now");
  assert.deepStrictEqual(st.maps.map(x => [x.map, x.exp, x.kills]), [["42", 480, 60], ["10000002", 0, 0]]);
  assert.strictEqual(m.shareable().map, "42");
  // EXP on two maps: the one with more wins, whichever came last
  const n = createSession(G); n.add({t: sec(0), type: "map", id: 42});
  for (let i = 0; i < 10; i++) n.add({t: sec(i * 10), type: "exp", gain: 8});
  n.add({t: sec(100), type: "map", id: 40}); for (let i = 0; i < 5; i++) n.add({t: sec(110 + i * 10), type: "exp", gain: 2});
  assert.strictEqual(n.stats().map, "42"); assert.strictEqual(n.stats().nowMap, "40") }

// Simple Mode (2026-10-23): EXP per clock minute (a minute with none is 0), best minute, the run's first bar reading
{ const m = createSession(G), lv = 20, at = (t, e) => m.add({t: T0 + t * 1000, type: "bar", exp: e, pct: e / G.exp[lv] * 100, level: lv});
  m.add({t: T0, type: "map", id: 42}); at(0, 1000); at(30, 1100); at(70, 1150); at(190, 1400);   // min 0: +100, min 1: +50, min 2: 0, min 3: +250
  const st = m.stats();
  assert.deepStrictEqual(st.perMin.map(p => p[1]), [100, 50, 0, 250]); assert.strictEqual(st.bestMin, 250);
  assert.ok(st.firstBar.level === 20 && Math.abs(st.firstBar.pct - 1000 / G.exp[lv] * 100) < 1e-9 && st.bar.level === 20) }

// party of 3 on A Split Road (Blue Snail 4, Shroom 6, Red Snail 8): +7 fits only Red Snail; +3 could be any (a kill,
// monster unknown); quest EXP (500) is not a kill
s = createSession(G);
s.add({t: sec(0), type: "map", id: 50});
s.add({t: sec(0), type: "party", size: 3});
s.add({t: sec(5), type: "exp", gain: 7});
s.add({t: sec(6), type: "exp", gain: 3});
s.add({t: sec(9), type: "exp", gain: 500});
st = s.stats();
assert.strictEqual(st.kills, 2);
assert.deepStrictEqual(st.mobs.map(m => [m.name, m.kills]), [["Red Snail", 1]]);
assert.strictEqual(st.otherExp, 500);
assert.ok(!("name" in s.shareable()), "shared summary carries no character name");

// KPQ bonus stage (from D.kpq): party of 4, the +7 and +15 kills from Danny's frames
s = createSession(G);
s.add({t: sec(0), type: "map", id: 80000500}); s.add({t: sec(0), type: "party", size: 4});
s.add({t: sec(1), type: "exp", gain: 7}); s.add({t: sec(2), type: "exp", gain: 15}); s.add({t: sec(3), type: "exp", gain: 33});
st = s.stats();
assert.strictEqual(st.mapName, "1st Accompaniment <Bonus>");
assert.strictEqual(st.kills, 3);
assert.deepStrictEqual(st.mobs.map(m => [m.name, m.kills]), [["Horny Mushroom", 1]], "+33 is more than a Green Mushroom gives");
// Danny's report 2026-10-19 ("monsters killed isn't tracking kills"): party shares (+5, +7, +10, +16) fit both mushrooms,
// so they are kills with no monster; the Monsters box shows them as their own row
assert.strictEqual(st.unknownKills, 2);

// real readings (Danny's party grind, map not in our data): EXP from the bar, kills from EXP messages, level-up carried over
s = createSession(G);
s.add({t: sec(0), type: "party", size: 4});
s.add({t: sec(0), type: "bar", exp: 18572, level: 22});
s.add({t: sec(2), type: "exp", gain: 7}); s.add({t: sec(2), type: "bonus", gain: 2}); s.add({t: sec(3), type: "meso", amount: 16});
s.add({t: sec(54), type: "bar", exp: 20066, level: 22});
s.add({t: sec(60), type: "bar", exp: 28900, level: 22});
s.add({t: sec(70), type: "bar", exp: 100, level: 23});
st = s.stats();
assert.strictEqual(st.kills, 1);
assert.strictEqual(st.exp, 28980 - 18572 + 100, "bar EXP across the level-up");
assert.strictEqual(st.mesoPerKill, 16);
assert.strictEqual(st.killsEstHr, null, "under 20% of EXP read: no estimate");
assert.ok(st.expHr5 > 0, "last-5-minutes rate");
assert.strictEqual(st.mobs.length, 0, "no monster guess without a map");

// map names from OCR: close enough matches our map, otherwise the line as read
const {mapFromText} = require("../app/readers.js");
assert.deepStrictEqual(mapFromText("Victoria Road\nSnail Hunting Graund lll\n", G), {id: "42", name: "Snail Hunting Ground III"});
assert.deepStrictEqual(mapFromText("| Hidden Street\n1st Accompaniment <Bonus=\n", G), {id: "80000500", name: "1st Accompaniment <Bonus>"}, "KPQ bonus stage");
assert.strictEqual(mapFromText("Hidden Street\nSecret Garden of Nowhere=\n", G), null, "a map we don't have is dropped, not logged as read");
// Danny's event log 10-29: Kerning City's minimap title misread as junk, logged as "entered" between real Kerning City events
for (const junk of ["I i it Cr", "I i LI", "1 CY Ara you looking", "Victoria Road\nI i it Cr\n"]) assert.strictEqual(mapFromText(junk, G), null, "junk: " + junk);
s = createSession(G);
s.add({t: sec(0), type: "map", id: null, name: "1st Accompaniment <Bonus"});
assert.strictEqual(s.stats().mapName, "1st Accompaniment <Bonus");

// level-up read at 0.2% (too small to work out the level): still carried over, level goes up by one
s = createSession(G);
s.add({t: sec(0), type: "bar", exp: 28900, pct: 99.72, level: 22});
s.add({t: sec(10), type: "bar", exp: 50, pct: 0.17, level: null});
s.add({t: sec(20), type: "bar", exp: 300, level: 23});
st = s.stats();
assert.strictEqual(st.exp, 28980 - 28900 + 300); assert.strictEqual(st.level, 23);
// level-up where the EXP number comes back higher (low level near the top -> next level a bit in): still the whole rest
s = createSession(G);
s.add({t: sec(0), type: "bar", exp: 33, pct: 97, level: 2});
s.add({t: sec(10), type: "bar", exp: 40, pct: 70, level: 3});
assert.strictEqual(s.stats().exp, G.exp[2] - 33 + 40, "level-up with a higher EXP number");
// deaths: a drop without a level-up counts once, however many readings stay low; EXP rising again re-arms it
s = createSession(G); s.add({t: sec(0), type: "map", id: 42});
for (const [t, exp] of [[0, 5000], [10, 5200], [20, 4700], [30, 4700], [40, 4650], [50, 4800], [60, 4300]]) s.add({t: sec(t), type: "bar", exp, pct: exp / G.exp[22] * 100, level: 22});
assert.strictEqual(s.stats().deaths, 2); assert.strictEqual(s.state.deathMaps["42"], 2);
// goal level: rest of this level plus the next ones at the current rate
s = createSession(G, {goalLevel: 24});
s.add({t: sec(0), type: "bar", exp: 0, pct: 0.01, level: 22}); s.add({t: sec(30), type: "bar", exp: 1000, pct: 1000 / G.exp[22] * 100, level: 22});
// a misread EXP number whose % reads right (Danny's KPQ run: "1 [68.01%]" between good reads): no death, no fake EXP
{ const m = createSession(G), at = p => ({exp: Math.round(p / 100 * G.exp[25]), pct: p, level: 25});
  m.add({t: sec(0), type: "bar", ...at(68)}); m.add({t: sec(5), type: "bar", exp: 1, pct: 68.01, level: 25}); m.add({t: sec(10), type: "bar", ...at(68.1)});
  m.add({t: sec(15), type: "bar", exp: Math.round(0.20 * G.exp[25]), pct: 20, level: 25});   // a misread that still fits the level
  m.add({t: sec(20), type: "bar", ...at(68.2)});
  const ms = m.stats(); assert.equal(ms.deaths, 0, "misread bar = no death"); assert.ok(ms.exp < 0.002 * G.exp[25], "misread bar = no fake EXP " + ms.exp) }
const gs = s.stats(); assert.ok(Math.abs(gs.toGoalHrs - (G.exp[22] - 1000 + G.exp[23]) / gs.expHr) < 1e-9, "goal hours");
s.setGoal("next"); { const n = s.stats(); assert.equal(n.goalLevel, 23); assert.ok(Math.abs(n.toGoalHrs - n.toLevelHrs) < 1e-9, "next level = time to level") }
s.setGoal(0); assert.strictEqual(s.stats().toGoalHrs, null);
// a death low in the level (EXP drops to 0) is not a level-up
s = createSession(G);
s.add({t: sec(0), type: "bar", exp: 1000, pct: 3.45, level: 22});
s.add({t: sec(10), type: "bar", exp: 0, pct: 0, level: null});
s.add({t: sec(20), type: "bar", exp: 100, pct: 0.35, level: null});
assert.strictEqual(s.stats().exp, 100); assert.strictEqual(s.stats().level, 22);

// half the EXP seen as messages: estimated kills are double the kills read
s = createSession(G);
s.add({t: sec(0), type: "bar", exp: 0, level: 10});
for (let i = 1; i <= 10; i++){ s.add({t: sec(i * 10), type: "exp", gain: 8}); s.add({t: sec(i * 10 + 1), type: "bar", exp: i * 16, level: 10}) }
st = s.stats();
assert.strictEqual(st.readShare, 0.5);
assert.ok(Math.abs(st.killsEstHr - 2 * st.killsHr) < 1e-6);

// shared runs: 15 min non-stop on one map; a break or a map change starts over
const runs = [], sl = require("../core/session.js").createRunSlicer(G, {onRun: r => runs.push(r)});
sl.add({t: sec(0), type: "map", id: 42}); sl.add({t: sec(0), type: "bar", exp: 0, level: 10});
for (let i = 1; i <= 100; i++) sl.add({t: sec(i * 10), type: "exp", gain: 8});   // 16.7 min: one run
assert.strictEqual(runs.length, 1); assert.strictEqual(runs[0].minutes, 15); assert.strictEqual(runs[0].kills, 90);
sl.add({t: sec(1300), type: "exp", gain: 8});   // after a 5-minute break: a new run, not finished
sl.add({t: sec(1310), type: "map", id: 41});    // map change: starts over again
for (let i = 1; i <= 80; i++) sl.add({t: sec(1310 + i * 10), type: "exp", gain: 4});   // 13.3 min: not a run yet
assert.strictEqual(runs.length, 1); assert.strictEqual(sl.current.stats().kills, 80); assert.strictEqual(sl.current.stats().map, "41");
// Start, the map reads, 20 min idle, then farming: the idle time isn't a run (it made a 20-min run of one kill, 2026-10-19)
const idle = [], si = require("../core/session.js").createRunSlicer(G, {onRun: r => idle.push(r)});
si.add({t: sec(0), type: "map", id: 42}); si.add({t: sec(0), type: "party", size: 1});
for (let i = 0; i < 200; i++) si.add({t: sec(1200 + i * 5), type: "exp", gain: 8});
assert.deepStrictEqual(idle.map(r => [r.minutes, r.kills]), [[15, 181]], "idle start: " + JSON.stringify(idle.map(r => [r.minutes, r.activeMin, r.kills])));

// respawn timer: Mano on Thicket Around the Beach III (60 min in the game data)
s = createSession(G);
s.add({t: sec(0), type: "map", id: 10000013});
s.add({t: sec(10), type: "exp", gain: 148});
let rs = s.respawns(sec(70)).find(r => r.name === "Mano");
assert.strictEqual(s.stats().mobs[0].name, "Mano");
// in a party on Snail Hunting Ground I (Snails only... plus no boss) a small share is still a Snail; on Mano's map a big one is Mano
s = createSession(G); s.add({t: sec(0), type: "map", id: 10000013}); s.add({t: sec(0), type: "party", size: 2});
s.add({t: sec(1), type: "exp", gain: 60});
assert.deepStrictEqual(s.stats().mobs.map(m => m.name), ["Mano"], "only Mano gives 60+");
assert.ok(rs && rs.boss && rs.sec === 3600 && rs.dueIn === 3540e3, JSON.stringify(rs));

// speed check against shared rows: peers within 5 levels, solo. Snail Hunting Ground III: 4 players, 60000 an outlier;
// map 41: only 2 players (not counted); the Lv 40 row is out of the level band
const {speedCheck} = require("../core/session.js");
const rows = [[42, 20, 4000], [42, 22, 5000], [42, 18, 6000], [42, 21, 60000], [41, 20, 9000], [41, 20, 9500], [40, 40, 99999]]
  .map(([map, level, expHr]) => ({map: String(map), level, party: 1, expHr}));
let sc = speedCheck({exp: 1000, barExp: 1000, minutes: 15, level: 20, party: 1, map: 40}, {rows}, G);
assert.strictEqual(sc.ref, 5000); assert.strictEqual(sc.verdict, "average"); assert.strictEqual(sc.peers, 3);
assert.deepStrictEqual(sc.faster.map(m => m.name), ["Snail Hunting Ground III"]);
assert.strictEqual(speedCheck({exp: 500, barExp: 500, minutes: 15, level: 20, party: 1}, {rows}, G).verdict, "slow");
assert.strictEqual(speedCheck({exp: 2500, barExp: 2500, minutes: 15, level: 20, party: 1}, {rows}, G).verdict, "very fast");
assert.strictEqual(speedCheck({exp: 1000, barExp: 1000, minutes: 15, level: 20, party: 3}, {rows}, G).verdict, null, "no party peers");
assert.strictEqual(speedCheck({exp: 1000, minutes: 15, level: 20, party: 1}, {rows}, G).verdict, null, "EXP bar not read: no verdict");
// the same 3 rows from one party (one group): not enough groups
const one = rows.map(r => ({...r, group: "g1"}));
assert.strictEqual(speedCheck({exp: 1000, barExp: 1000, minutes: 15, level: 20, party: 1}, {rows: one}, G).verdict, null);
// the PC clock going back adds no negative time
s = createSession(G); s.add({t: sec(100), type: "exp", gain: 2}); s.add({t: sec(40), type: "exp", gain: 2});
assert.strictEqual(s.stats().activeMin, 0);

// auto-pause: a channel change (30 s) and the Cash Shop (2 min) don't count as farming; runs leave pauses out
s = createSession(G); s.add({t: sec(0), type: "exp", gain: 2}); s.add({t: sec(20), type: "exp", gain: 2});
s.add({t: sec(25), type: "pause"}); assert.ok(s.stats().paused);
s.add({t: sec(55), type: "exp", gain: 2}); assert.ok(!s.stats().paused);
s.add({t: sec(60), type: "exp", gain: 2}); s.add({t: sec(61), type: "pause"}); s.add({t: sec(181), type: "resume"}); s.add({t: sec(186), type: "exp", gain: 2});
assert.strictEqual(Math.round(s.stats().activeMin * 60), 25 + 5 + 1 + 5, "seconds farmed: 0-25, 55-60, 60-61, 181-186");
assert.strictEqual(s.state.pausedMs, 150e3);
const pr = []; const ps = require("../core/session.js").createRunSlicer(G, {onRun: r => pr.push(r)});
ps.add({t: 0, type: "map", id: 42});
for (let i = 1; i <= 16 * 6; i++){ ps.add({t: i * 10e3, type: "exp", gain: 2}); if (i === 30) ps.add({t: i * 10e3 + 1, type: "pause"}) }
assert.strictEqual(pr.length, 1); assert.ok(pr[0].minutes >= 15 && pr[0].minutes < 15.2, "run minutes leave the pause out: " + pr[0].minutes);
// level-up log: time each level took (active minutes), only for levels this session saw start
s = createSession(G); const bar = (t, lv, exp) => s.add({t: sec(t), type: "bar", exp, pct: Math.round(exp / G.exp[lv] * 1e4) / 100, level: lv});
bar(0, 20, 100); bar(30, 20, G.exp[20] - 10); bar(40, 21, 5); bar(50, 21, G.exp[21] - 5); bar(60, 22, 3); bar(61, 21, 900); bar(62, 22, 5);
assert.deepStrictEqual(s.stats().levelUps.map(l => [l.level, l.activeMin]), [[21, null], [22, 0.3]], "Lv 20 started mid-way: no time; Lv 21 took 20 s; a flicker back to 21 isn't a new level-up");

// items used: priced at the cheapest NPC shop; no known price = counted but not costed
s = createSession(G); for (let i = 0; i <= 60; i++) s.add({t: sec(i * 30), type: "exp", gain: 2});
s.add({t: sec(10), type: "use", id: "2000002", n: 3}); s.add({t: sec(20), type: "use", id: "2000002", n: 1}); s.add({t: sec(30), type: "use", id: "2999999", n: 40});
st = s.stats();
assert.deepStrictEqual(st.used.map(u => [u.id, u.n, u.total]), [["2000002", 4, 4 * G.buy["2000002"]], ["2999999", 40, null]]);
assert.strictEqual(Math.round(st.usedCostHr), 4 * G.buy["2000002"] * 2, "half an hour: cost x2 per hour");

// start/end snapshots: Danny's KPQ run (Lv 25, 46.61% -> 71.40%) and one across a level-up
{ const {expBetween, levelOf} = require("../core/session.js"), n = G.exp[25];
  assert.ok(Math.abs(expBetween(G, {level: 25, pct: 46.61}, {level: 25, pct: 71.40}) - 0.2479 * n) < 1, "same level");
  assert.strictEqual(expBetween(G, {level: 24, exp: 100}, {level: 26, exp: 50}), G.exp[24] - 100 + G.exp[25] + 50, "across levels");
  assert.strictEqual(expBetween(G, {level: 25, pct: 50}, {level: 24, pct: 10}), null, "level went down: no answer");
  { const m = G.exp[32], d = expBetween(G, {level: 32, pct: 81.93, exp: 200579}, {level: 32, pct: 94.68, exp: 116233});   // 10-23 "3 kpq rush": start read 200,579 for ~100,578
    assert.ok(d > 0 && Math.abs(d - 0.1275 * m) < 0.002 * m, "raw EXP that contradicts its % is ignored: " + d) }
  assert.strictEqual(levelOf(G, Math.round(0.7094 * n), 70.94), 25, "level from EXP / %");
  assert.strictEqual(levelOf(G, 1, 68.01), null, "misread EXP fits no level");
  assert.strictEqual(expBetween(G, {level: 20, pct: 50}, {level: 21, pct: null}), null, "a % left blank: no answer, not 0%") }

// bug hunt 2026-10-18: a level-up from under 90% (quest turn-in to under 0.5%, level not readable) was a death; a jump of
// 2 levels between readings froze EXP for the rest of the session
{ const bar = (s, t, L, pct, level) => s.add({t: sec(t), type: "bar", exp: Math.round(pct / 100 * G.exp[L] * 100) / 100 | 0, pct, level});
  let s = createSession(G); bar(s, 0, 20, 80, 20);
  for (let i = 1; i <= 3; i++){ const e = Math.round(0.003 * G.exp[21]); s.add({t: sec(i), type: "bar", exp: e, pct: Math.round(e / G.exp[21] * 1e4) / 100, level: null}) }
  assert.strictEqual(s.state.deaths, 0, "turn-in level-up isn't a death"); assert.strictEqual(s.state.level, 21);
  s = createSession(G); bar(s, 0, 6, 70, 6);
  for (let i = 1; i <= 3; i++) bar(s, i, 8, 30, 8);
  bar(s, 4, 8, 40, 8);
  assert.strictEqual(s.state.level, 8, "2-level jump taken after 3 readings");
  assert.ok(s.stats().exp > G.exp[6] * 0.3 + G.exp[7] + G.exp[8] * 0.35, "EXP keeps counting after the jump: " + s.stats().exp) }
// KPQ (Danny's run 2026-10-18 over-counted kills): stage-clear EXP on the puzzle stages isn't a kill; King Slime is one
// kill per visit to the Last Stage, in a party too
{ const s = createSession(G); s.add({t: sec(0), type: "party", size: 4});
  s.add({t: sec(1), type: "map", id: "80000100"}); s.add({t: sec(2), type: "exp", gain: 600}); s.add({t: sec(3), type: "exp", gain: 600});
  assert.strictEqual(s.state.kills, 0, "puzzle stage EXP isn't kills");
  s.add({t: sec(4), type: "map", id: "80000400"}); s.add({t: sec(5), type: "exp", gain: 20}); s.add({t: sec(6), type: "exp", gain: 900}); s.add({t: sec(7), type: "exp", gain: 1500});
  assert.strictEqual(s.state.kills, 2, "one regular kill + King Slime once: " + s.state.kills);
  assert.ok(s.state.otherExp >= 1500 + 1200, "the rest is stage-clear EXP") }
// a pickup name that fits several items: the one this map's monsters drop (Horny Mushroom on the bonus stage), KPQ's Pass
{ const s = createSession(G); s.add({t: sec(0), type: "map", id: "80000500"});
  const horny = Object.keys(G.items).filter(id => (G.drops["19"] || []).includes(id))[0];
  s.add({t: sec(1), type: "itemraw", text: "x", qty: 2, cands: ["1002000", horny]}); s.add({t: sec(2), type: "itemraw", text: "x", cands: ["1002000", "1002001"]});
  s.add({t: sec(3), type: "map", id: "80000100"}); s.add({t: sec(4), type: "itemraw", text: "Pa?? x1", cands: ["4001002", "1002001"]}); s.add({t: sec(5), type: "itemraw", text: ".? ??.?on x1earned. (Etc)", qty: 1, cands: []});
  assert.strictEqual(s.state.items[horny], 2); assert.strictEqual(s.state.items["4001002"], undefined, "KPQ Pass isn't loot"); assert.strictEqual(s.state.unreadItems, 1) }
// Use-tab counts that went down between inventory looks = used up (Danny 2026-10-18: arrows/meat showed only as -48/-2)
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2060000": 100, "2010001": 5}, unknown: 0});
  s.add({t: sec(60), type: "use", id: "2060000", n: 10});
  s.add({t: sec(120), type: "inv", tab: "use", items: {"2060000": 52, "2010001": 3}, unknown: 0});
  const u = Object.fromEntries(s.stats().used.map(x => [x.id, x.n]));
  assert.strictEqual(u["2060000"], 48); assert.strictEqual(u["2010001"], 2);
  // the saved session's "used" matches the Consumables used box (Danny's KPQ Test #2, 2026-10-18: arrows 1,011 saved, 1,576 shown)
  assert.deepStrictEqual(s.shareable().used, {"2060000": 48, "2010001": 2}) }
// pickup line with two letters drawn as one unread glyph: "Emerald Sta?" is the Emerald Staff (Danny's report, 2026-10-19)
{ const R = require("../app/readers.js"); R.createReaders(G);
  assert.deepStrictEqual(R.itemByName("Emerald Sta?", "Equip", true), ["1382002"]);
  assert.deepStrictEqual(R.itemByName("Biue Potion", "Use", true), ["2000003"]) }
// an item gone from the Use tab while a slot didn't read: not all used (Danny's 75 Lemons, 2026-10-18; 13 really eaten)
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2010005": 75, "2010003": 75}, unknown: 0});
  s.add({t: sec(120), type: "inv", tab: "use", items: {"2010003": 45}, unknown: 1});
  const u = Object.fromEntries(s.stats().used.map(x => [x.id, x.n]));
  assert.strictEqual(u["2010005"], undefined); assert.strictEqual(u["2010003"], 30) }
// an arrow stack that didn't read (one stack fewer, one more slot unread): not 215 arrows used
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2060001": 1015}, stacks: {"2060001": 2}, unknown: 0});
  s.add({t: sec(120), type: "inv", tab: "use", items: {"2060001": 800}, stacks: {"2060001": 1}, unknown: 1});
  assert.ok(!s.stats().used.some(x => x.id === "2060001" && x.n)) }
// a Bronze Arrow stack never read at the first look (marked partial): 2,183 -> 2,767 is not +584 arrows (Danny's KPQ run, 2026-10-18)
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2060001": 2183}, stacks: {"2060001": 3}, partial: {"2060001": 1}, unknown: 1});
  s.add({t: sec(120), type: "inv", tab: "use", items: {"2060001": 2767}, stacks: {"2060001": 4}, unknown: 0});
  assert.ok(!s.stats().inv.some(x => x.id === "2060001"));
  s.add({t: sec(240), type: "inv", tab: "use", items: {"2060001": 461}, stacks: {"2060001": 1}, unknown: 0});
  assert.strictEqual(s.stats().inv.find(x => x.id === "2060001").n, 461 - 2183, "short at the first look: at least that many used") }
// arrows left: every stack on the Use tab (not partial), quick-slot totals as they change; listed before any are used
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2060001": 2775, "2000001": 22}, unknown: 0});
  s.add({t: sec(5), type: "have", items: {"2000001": 21}});
  const u = Object.fromEntries(s.stats().used.map(x => [x.id, [x.n, x.have]]));
  assert.deepStrictEqual(u["2060001"], [0, 2775]); assert.strictEqual(u["2000001"], undefined, "a potion not used isn't listed") }
// went down while showing, then unread: what went down counts (Danny's Warrior Potion 2 -> 1, then gone, 2026-10-18)
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "use", items: {"2002000": 2, "2010003": 75}, unknown: 0});
  s.add({t: sec(60), type: "inv", tab: "use", items: {"2002000": 1, "2010003": 70}, unknown: 0});
  s.add({t: sec(120), type: "inv", tab: "use", items: {"2010003": 60}, unknown: 1});
  const u = Object.fromEntries(s.stats().used.map(x => [x.id, x.n]));
  assert.strictEqual(u["2002000"], 1); assert.strictEqual(u["2010003"], 15) }
// one Mace in the Equip tab, read clean before and after two pickup lines: 1, not 2 (Danny, 2026-10-18)
{ const s = createSession(G);
  s.add({t: sec(0), type: "inv", tab: "equip", items: {}, unknown: 0});
  s.add({t: sec(60), type: "item", id: "1322003"}); s.add({t: sec(61), type: "item", id: "1322003"});
  s.add({t: sec(120), type: "inv", tab: "equip", items: {"1322003": 1}, unknown: 0});
  assert.strictEqual(s.stats().items.find(x => x.id === "1322003").n, 1) }
// KPQ middle stages: no monsters, so 4 minutes without EXP there is still active time
{ const s = createSession(G); s.add({t: sec(0), type: "map", id: "80000100"}); s.add({t: sec(1), type: "bar", exp: 1000, pct: 10, level: 20});
  s.add({t: sec(241), type: "bar", exp: 1600, pct: 16, level: 20});
  assert.ok(s.state.activeMs >= 240e3, "KPQ stage time counted: " + s.state.activeMs) }
// paused by hand (hold): EXP read meanwhile doesn't restart the clock; "resume" does; works before anything was read too
{ const s = createSession(G); s.add({t: sec(0), type: "pause", hold: true});
  s.add({t: sec(10), type: "exp", gain: 5}); assert.ok(s.state.pausedAt !== null && s.state.held, "still paused by hand");
  s.add({t: sec(100), type: "resume"}); s.add({t: sec(110), type: "exp", gain: 5}); s.add({t: sec(130), type: "exp", gain: 5});
  assert.strictEqual(s.state.pausedAt, null); assert.strictEqual(s.state.activeMs, 20e3, "only the time after Go on counts") }
// the default theme (Elv, 0.3.22) is the planner site's colours exactly: read them from src/styles.css :root so a site
// recolour that skips themes.js fails here (the 2026-10-18 "match our webtool perfectly" rule, now on the Elv scheme);
// text on accent is --panel like the site's buttons. Clanker Chic (the old purple default) and the "Default" preset-name
// alias for old share codes and profiles are pinned too
{
  const TH = require("../app/themes.js"), css = require("fs").readFileSync(require("path").join(__dirname, "../../src/styles.css"), "utf8");
  const vars = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const site = vars(css.slice(css.indexOf(":root{"), css.indexOf("body{")));
  const d = TH.PRESETS[0]; assert.equal(d.name, "Elv", "Elv theme is first (the default)");
  assert.equal(d.sk, "elv", "the default wears the elv panel skin");
  for (const [k, [v]] of Object.entries(TH.TOKENS)){
    const want = site[v === "--on-accent" ? "panel" : v.slice(2)];
    assert.equal(d.c[k], want, `Elv ${k} matches site ${v}`);
  }
  const cl = TH.PRESETS[1]; assert.equal(cl.name, "Clanker Chic", "the classic look is one click away");
  assert.equal(cl.mode, "system", "Clanker Chic keeps its light and dark sides");
  const legacy = TH.decodeSetup("MSCS1." + Buffer.from(JSON.stringify({layout: {v: 2, order: {dock: ["main"]}}, theme: {preset: "Default"}, name: "Old"})).toString("base64"), ["main"]);
  assert.deepEqual(legacy.theme, {preset: "Clanker Chic"}, "old Default preset codes read as Clanker Chic");
}
console.log("core tests passed");

// run log (Danny 2026-10-18, "like WoW's combat log"): batched, one line per kind per batch
{
  const {createFeed} = require("../core/feed.js"), f = createFeed(G, {every: 2000}), s = createSession(G);
  s.add({t: sec(0), type: "map", id: 42}); s.add({t: sec(0), type: "bar", exp: 100, level: 10});
  assert.deepStrictEqual(f.step(s.state, sec(0), "Danny"), [], "first step only takes the baseline");
  for (const g of [2, 4, 4, 8]) s.add({t: sec(0.2), type: "exp", gain: g});
  s.add({t: sec(0.3), type: "meso", amount: 12}); s.add({t: sec(0.4), type: "item", id: 4000019}); s.add({t: sec(0.5), type: "item", id: 4000019});
  assert.deepStrictEqual(f.step(s.state, sec(1), "Danny"), [], "nothing before the batch time");
  const l = f.step(s.state, sec(2), "Danny");
  assert.deepStrictEqual(l.map(x => x.kind), ["exp", "meso", "loot"]);
  assert.strictEqual(l[0].text, "Danny gained 18 EXP from 4 kills (2 Blue Snail, 1 Snail, 1 Red Snail)");
  assert.strictEqual(l[1].text, "Danny picked up 12 mesos");
  assert.strictEqual(l[2].text, `Danny looted 2 ${G.items[4000019].n}`); assert.strictEqual(l[2].parts[0].id, "4000019");
  assert.deepStrictEqual(f.step(s.state, sec(4), "Danny"), [], "quiet batch: no lines");
  s.add({t: sec(5), type: "map", id: 1}); s.add({t: sec(5), type: "exp", gain: 999999});
  const m = f.step(s.state, sec(6));
  assert.strictEqual(m[0].kind, "map"); assert.ok(m[0].text.startsWith("You entered "));
  assert.ok(/^You gained 999,999 EXP/.test(m[1].text), m[1].text);
  // event log lines (Danny 2026-10-19): job read, job advance, party size
  s.add({t: sec(7), type: "job", name: "Archer"}); s.add({t: sec(7), type: "party", size: 3});
  assert.deepStrictEqual(f.step(s.state, sec(8), "Danny").map(x => x.text), ["Job: Archer", "Party of 3"]);
  s.add({t: sec(9), type: "job", name: "Hunter"}); s.add({t: sec(9), type: "party", size: 1});
  assert.deepStrictEqual(f.step(s.state, sec(10)).map(x => x.kind + ":" + x.text), ["job:You are a Hunter now", "party:You are solo now"]);
}
console.log("feed ok");
// Companion's Magic Box opened (Danny's frame 2026-10-19 03:54, chat OCR as read; "Pation" is the OCR's): the "earned"
// lines just above "...Box x1 has been lost" are its rewards; they're loot with no monster
{ const R = require("../app/readers.js"); R.createReaders(G);
  const ocr = "N H ne\n[03:54] White Pation x15 earned. (Use)\n[03:54] Red Potion x5 earned. (Use) [\n[03:54] Companion's Magic Box x1 has been lost. (Use) a\n5 = EE";
  const g = R.boxFromText(ocr);
  assert.strictEqual(g.length, 1);
  assert.deepStrictEqual(g[0].items.map(i => [i.id, i.qty]), [["2000002", 15], ["2000000", 5]]);
  assert.strictEqual(R.boxFromText("[03:54] You received EXP (+1,102)\n[03:54] Companion's Magic Box x1 earned. (Use)").length, 0, "getting a box isn't opening one");
  const s = createSession(G);
  s.add({t: sec(0), type: "map", id: 80000500}); s.add({t: sec(1), type: "exp", gain: 41});
  s.add({t: sec(2), type: "item", id: "2000002", qty: 15, src: "box"});
  assert.strictEqual(s.state.items["2000002"], 15); assert.deepStrictEqual(s.state.byMob["19"].items, {}, "box loot isn't a Horny Mushroom drop") }
console.log("box ok");

// History (core/history.js): rates from what each session recorded, compare 2-6 runs against a baseline, maps, bests, filters
{
  const Hi = require("../core/history.js");
  const a = {saved: 1000, mapName: "Pig Beach", activeMin: 30, exp: 3000, kills: 60, mesos: 600, deaths: 2, lootValue: 300, usedCost: 100, player: "Turbow", name: "pigs", mobs: [{id: "1210100", kills: 60}], items: {"4000021": 10}};
  const b = {saved: 2000, mapName: "Pig Beach", activeMin: 60, exp: 9000, kills: 150, mesos: 900, deaths: 0, lootValue: 600, usedCost: 50, player: "Turbow", snap: {exp: 10000, minutes: 50}, mobs: [{id: "1210100", kills: 150}], items: {"4000021": 40}};
  const c = {saved: 3000, mapName: "Ant Tunnel I", activeMin: 10, exp: 4000, kills: 40, mesos: 100, deaths: 1, player: "Bo", note: "ch 3 crowded", kpq: null};
  const k = {saved: 4000, mapName: "1st stage", activeMin: 20, exp: 5000, mesos: 0, kpq: {mode: "Rush", rounds: 2, best: 300}};
  // EXP/hr: the start/end readings over their clock time when present; KPQ over farming time; net = mesos + loot - used
  const ma = Hi.metrics(a), mb = Hi.metrics(b), mk = Hi.metrics(k);
  assert.strictEqual(ma.expHr, 6000); assert.strictEqual(mb.expHr, 12000); assert.strictEqual(mk.expHr, 15000);
  assert.strictEqual(ma.netHr, 1600); assert.strictEqual(ma.mesoPerKill, 10); assert.strictEqual(Hi.metrics(c).netHr, null);
  // three runs: wins per run, the base's change, lower-is-better rows (deaths, used) and rows that rank nothing (farming time)
  const r = Hi.compareRuns([a, b, c], 0), row = key => r.groups.flatMap(g => g.rows).find(x => x.key === key);
  assert.deepStrictEqual(row("expHr").vals, [6000, 12000, 24000]); assert.strictEqual(row("expHr").best, 2);
  assert.deepStrictEqual(row("expHr").delta.map(d => d && d.pct), [null, 100, 300]);
  assert.strictEqual(row("deaths").best, 1); assert.strictEqual(row("deaths").delta[1].better, true); assert.strictEqual(row("deaths").delta[2].better, true);
  assert.strictEqual(row("min").best, -1); assert.strictEqual(row("min").delta[1].better, null);
  assert.strictEqual(row("kpqBest"), undefined);   // no KPQ run: the row is left out
  assert.strictEqual(r.wins.reduce((s, w) => s + w, 0), r.groups.flatMap(g => g.rows).filter(x => x.best >= 0).length);
  // a tie ranks nobody; another baseline moves the change
  const t = Hi.compareRuns([a, {...a, saved: 1500}], 1); assert.ok(t.wins.every(w => w === 0)); assert.ok(t.groups.flatMap(g => g.rows).every(x => x.delta.every(d => d === null)));
  assert.strictEqual(Hi.compareRuns([a, b], 1).groups[0].rows[0].delta[0].pct, -50);
  // base 0 EXP: the change is the difference, not a percent
  assert.deepStrictEqual(Hi.compareRuns([{...a, deaths: 0}, a]).groups.flatMap(g => g.rows).find(x => x.key === "deaths").delta[1], {pct: null, diff: 2, up: true, better: false});
  // per hour by monster and item; a run with no farming time has no per-hour value
  assert.deepStrictEqual(Hi.perHour([a, b, {saved: 5, activeMin: 0}], "mobs"), [{id: "1210100", vals: [120, 150, null]}]);
  assert.deepStrictEqual(Hi.perHour([a, b], "items")[0], {id: "4000021", vals: [20, 40]});
  // maps: EXP/hr weighted by farming time, the best run, newest first; KPQ as one place
  const maps = Hi.byMap([a, b, c, k]), pig = maps.find(m => m.name === "Pig Beach");
  assert.strictEqual(maps[0].name, "Pig Beach"); assert.strictEqual(pig.runs, 2); assert.strictEqual(pig.expHr, (6000 * 0.5 + 12000 * 1) / 1.5);
  assert.strictEqual(pig.bestId, 2000); assert.deepStrictEqual(pig.ids, [2000, 1000]); assert.strictEqual(pig.mesosHr, 1000); assert.ok(maps.some(m => m.name === "KPQ"));
  // bests: 15+ min farming only (Ant Tunnel's 24,000 EXP/hr over 10 min doesn't count)
  assert.deepStrictEqual(Hi.bests([a, b, c, k]), {expHr: 4000, mesosHr: 1000, netHr: 1000, killsHr: 2000});
  // filters and sorts
  const ids = l => l.map(x => x.saved);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k])), [4000, 3000, 2000, 1000]);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k], {q: "CROWDED"})), [3000]);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k], {map: "Pig Beach", sort: "old"})), [1000, 2000]);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k], {kind: "kpq"})), [4000]);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k], {kind: "grind", player: "Turbow", sort: "netHr"})), [1000, 2000]);
  assert.deepStrictEqual(ids(Hi.filterRuns([a, b, c, k], {sort: "expHr"})), [3000, k.saved, 2000, 1000]);
  // old sessions with missing fields don't throw
  assert.doesNotThrow(() => { Hi.compareRuns([{saved: 1}, {saved: 2, mobs: "x", items: null}]); Hi.byMap([{saved: 1}]); Hi.perHour([{saved: 1, activeMin: 5, mobs: [null]}], "mobs") });
}
console.log("history ok");
// History > Edit run (2026-10-23): the map and misread numbers fixed by hand, first values kept, EXP set where History reads it
{ const Hi = require("../core/history.js"), x = {saved: 1, mapName: "Lith Harbor Department Store", map: "10000002", activeMin: 30, exp: 900, expTotal: 1000, snap: {exp: 1000, minutes: 40}, mesos: 50, kills: 10, deaths: 0, name: "a"};
  const y = Hi.applyEdit(x, {mapName: "Snail Hunting Ground III", map: "42", exp: 1200, activeMin: 20, deaths: "x", kills: -3, name: "  ", note: "fixed"}, 5);
  assert.deepStrictEqual([y.mapName, y.map, y.exp, y.expTotal, y.snap.exp, y.snap.minutes, y.activeMin, y.deaths, y.kills, y.name, y.note, y.edited, y.expPerActiveMin],
    ["Snail Hunting Ground III", "42", 1200, 1200, 1200, 20, 20, 0, 10, null, "fixed", 5, 60]);
  assert.deepStrictEqual(y.orig, {mapName: "Lith Harbor Department Store", map: "10000002", exp: 1000, activeMin: 30});
  assert.strictEqual(Hi.metrics(y).expHr, 3600, "EXP/hr from the fixed numbers");
  const z = Hi.applyEdit(y, {exp: 1300}, 6); assert.strictEqual(z.orig.exp, 1000, "the first value stays"); assert.strictEqual(x.exp, 900, "input untouched");
  assert.strictEqual(Hi.applyEdit(x, {name: "b"}).edited, undefined, "a rename isn't an edit") }


// Today card (History, 0.2.60): only runs saved on now's local calendar day; EXP as History rows count it (start/end readings first)
{ const Hi = require("../core/history.js"), now = new Date(2026, 9, 19, 15, 0).getTime(), mid = new Date(2026, 9, 19, 0, 0, 30).getTime();
  const list = [{saved: now - 3600e3, activeMin: 40, exp: 4000, mesos: 900}, {saved: mid, activeMin: 20, exp: 1, snap: {exp: 2500, minutes: 20}, mesos: 100},
    {saved: mid - 60e3, activeMin: 60, exp: 9999, mesos: 9999}, {saved: "x", activeMin: 5}, {activeMin: 5}];
  assert.deepStrictEqual(Hi.today(list, now), {runs: 2, min: 60, exp: 6500, mesos: 1000}, "today: yesterday 23:59 and runs with no time stamp left out");
  assert.deepStrictEqual(Hi.today([], now), {runs: 0, min: 0, exp: 0, mesos: 0});
}
// goal ETA (0.2.60): EXP left from the EXP table (G.exp = data.json), hours at each map's EXP/hr (15+ min there), the day at
// the farming time a day played this week; past the table: no guess
{ const Hi = require("../core/history.js"), now = new Date(2026, 9, 19, 15, 0).getTime(), D = 864e5;
  const list = [{saved: now - 2 * D, mapName: "Pig Beach", activeMin: 30, exp: 3000, level: 21},
    {saved: now - 3600e3, mapName: "Snail Hunting Ground III", activeMin: 60, exp: 3000, endLevel: 22, snap: {endLevel: 22, endPct: 50, exp: 3000, minutes: 60}},
    {saved: now - 3 * D, mapName: "Tiny", activeMin: 5, exp: 9e6}, {saved: now - D, kpq: {rounds: 2}, activeMin: 30, exp: 9e6, level: 21}];
  const e = Hi.goalEta(list, {exp: G.exp, goal: 24, now}), need = G.exp[22] * 0.5 + G.exp[23];
  assert.equal(e.level, 22); assert.equal(e.pct, 50); assert.equal(e.need, need);
  assert.deepStrictEqual(e.maps.map(m => m.name), ["Pig Beach", "Snail Hunting Ground III"], "fastest first; KPQ and maps under 15 min left out");
  assert.ok(Math.abs(e.maps[0].hours - need / 6000) < 1e-9);
  const perDay = 125 / 60 / 4; assert.ok(Math.abs(e.perDay - perDay) < 1e-9, "farming a day over the 4 days played: " + e.perDay);
  assert.ok(Math.abs(e.maps[0].at - (now + need / 6000 / perDay * D)) < 1);
  assert.equal(Hi.goalEta(list, {exp: G.exp, goal: "next", now}).need, G.exp[22] * 0.5);
  assert.equal(Hi.goalEta(list, {exp: G.exp, goal: 0, now}).why, "no goal");
  assert.equal(Hi.goalEta(list, {exp: G.exp, goal: 20, now}).why, "reached");
  assert.equal(Hi.goalEta(list, {exp: {22: 100}, goal: 24, now}).why, "no table", "a level missing from the table: no estimate");
  assert.equal(Hi.goalEta([{saved: 5}], {exp: G.exp, goal: 30, now}).why, "no level");
  // no end reading on the run's level: from the start of the level
  assert.equal(Hi.goalEta([{saved: now, mapName: "A", activeMin: 20, exp: 100, level: 10, snap: {endLevel: 9, endPct: 80}}], {exp: G.exp, goal: 11, now}).need, G.exp[10]);
}
// setup codes (layout + theme in one line, 0.2.60): round trip, and junk in a pasted code never reaches the layout
{ const TH = require("../app/themes.js"), ids = ["main", "log", "mobs", "items", "hist"];
  const layout = {v: 2, order: {dock: ["main", {row: ["log", ["mobs", "items"]], w: [2, 3], h: 300}]}, folded: ["log"], h: {main: 240}};
  for (const theme of [{preset: "Slime"}, TH.clean({name: "Mine", mode: "light", c: TH.PRESETS.find(t => t.name === "Slime").c})]){
    const code = TH.encodeSetup({layout, theme}, ids); assert.ok(/^MSCS1\.[A-Za-z0-9+/=]+$/.test(code));
    assert.deepStrictEqual(TH.decodeSetup("look: " + code + " (mine)", ids), {layout, theme}, "setup round trip") }
  const enc = x => "MSCS1." + Buffer.from(JSON.stringify(x)).toString("base64");
  const bad = TH.decodeSetup(enc({layout: {order: {dock: ["main", "main", "<img onerror=x>", 5, {row: ["log", "nope"], w: ["9e99"]}, {row: [["mobs", "mobs"], "items"], w: [-1, 1e9], h: "x"}, {row: "hist"}]}, folded: ["mobs", {}, "zzz"], h: {log: 1e9, items: 99, x: 50}},
    theme: {name: "<b>x</b>", mode: "dark", c: {bg: "red"}}}), ids);
  assert.deepStrictEqual(bad, {layout: {v: 2, order: {dock: ["main", "log", {row: ["mobs", "items"], w: [1, 1]}]}, folded: ["mobs"], h: {items: 99}}, theme: null});
  assert.equal(TH.decodeSetup(enc({layout: {order: {dock: ["nope"]}}, theme: {preset: "Not a preset"}}), ids), null, "nothing usable");
  for (const junk of [null, "", "MSCS1.", "MSCS1.!!!!!!!!!!!!!!!!!!!!!!!!", "MSCS1." + "A".repeat(40), enc([1, 2]), enc("x")])
    assert.equal(TH.decodeSetup(junk, ids), null, "junk code: " + junk);
  assert.equal(TH.encodeSetup({layout: null, theme: null}, ids), null);
  // profiles (0.2.61): name, prefs and window size ride along in the same MSCS1 code; junk in them is dropped, not fatal;
  // a theme code (MSCT1) pasted in the setup box is a theme-only setup
  const full = {layout, theme: {preset: "Slime"}, name: "Danny's KPQ", prefs: {fit: false, fitWin: true, snap: true, opacity: 0.85}, win: {w: 420, h: 900}};
  assert.deepStrictEqual(TH.decodeSetup(TH.encodeSetup(full, ids), ids), full, "profile round trip");
  assert.deepStrictEqual(TH.decodeSetup(enc({layout, name: "<x>\u0007" + "n".repeat(60), prefs: {fit: "yes", snap: 1, opacity: 0.1, evil: true}, win: {w: 1e9, h: 500}}), ids),
    {layout, theme: null, name: "x" + "n".repeat(39)}, "profile junk dropped");
  const thc = TH.decode(TH.encode({name: "x", mode: "dark", c: TH.PRESETS.find(t => t.name === "Purple night").c}));
  assert.deepStrictEqual(TH.decodeSetup(TH.encode(thc), ids), {layout: null, theme: thc, name: "x"}, "theme code as a setup");
  // built-in profiles (Danny's Default, 2026-10-20): decode against the real box ids with every box Danny placed; a
  // profile's window size never leaves the monitor (his 2560x1392 on a 1920x1040 work area, zoom 1 and 1.25, off to the right)
  { const fs = require("fs"), path = require("path"), real = [...fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8").matchAll(/data-box="([a-z]+)"/g)].map(m => m[1]), B = TH.builtins(real);
    assert.ok(B.length >= 1 && B[0].name === "Danny's Default" && B[0].win.w === 2560 && B[0].theme.preset === "Clanker Chic", "built-in decodes");
    assert.equal(B[0].layout.order.dock.flatMap(i => typeof i === "string" ? [i] : i.row.flat()).length, 10, "every box Danny placed survives (12 before Start and end + Inventory check moved into the main card, 0.2.71)");
    const wa = {x: 0, y: 0, width: 1920, height: 1040}, b = {x: 1500, y: 300, width: 376, height: 640}, c = [360, 600];
    for (const z of [1, 1.25]){ const f = TH.winFit(B[0].win, z, b, c, wa);
      assert.deepStrictEqual([f.w + 16, f.h + 40, f.x, f.y], [1920, 1040, 0, 0], "fits the work area at zoom " + z) }
    assert.deepStrictEqual(TH.winFit({w: 400, h: 500}, 1, b, c, wa), {w: 400, h: 500, x: 1500, y: 300}, "a small size stays put");
    assert.deepStrictEqual(TH.winFit({w: 400, h: 500}, 1, {...b, x: 1800}, c, {...wa, x: -1920}), {w: 400, h: 500, x: -416, y: 300}, "pulled back onto a left monitor") }
}
// the overlay boots from the whole saved overlay settings, not just its widgets (0.2.87: profiles, Snap/Grid and the panel's spot were lost on every restart)
{ const O = require("../core/overlaycfg.js");
  const st = O.state({overlay: {edit: false, widgets: {exp: {x: 5}}, snap: false, grid: true, gsize: 32, panel: {x: 9, y: 8}, profile: "Boss", profiles: {Boss: {widgets: {}}}, junk: 1}});
  assert.deepStrictEqual([st.snap, st.grid, st.gsize, st.profile, Object.keys(st.profiles), st.panel.x, st.junk], [false, true, 32, "Boss", ["Boss"], 9, undefined]);
  assert.ok(/ov-state", \(\) => \{[^\n]*\{\.\.\.OVCFG\.state\(readSettings\(\)\)/.test(require("fs").readFileSync(require("path").join(__dirname, "../app/main.js"), "utf8")), "main.js ov-state must hand over the whole saved overlay");
  { const m = require("fs").readFileSync(require("path").join(__dirname, "../app/main.js"), "utf8"), f = m.slice(m.indexOf("function bdOpen"), m.indexOf("function bdExit"));
    assert.ok(f.includes("bdFade(0") && !f.includes("minimize"), "Borderless fades the same window; it must not minimize it"); }
  assert.deepStrictEqual(O.state({}), {widgets: {}}); assert.deepStrictEqual(O.state({overlay: {widgets: [1], profiles: [], panel: 3, profile: 4}}), {widgets: {}});
}
// crash recovery (0.2.60): the autosave is swapped in whole, read back, never listed as a session, and cleared
{ const A = require("../core/autosave.js"), fs = require("fs"), os = require("os"), path = require("path");
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "msct-")), "sessions");
  assert.equal(A.read(dir), null, "nothing yet");
  assert.ok(A.write(dir, {mapName: "Pig Beach", activeMin: 12, autosaved: 5})); assert.ok(A.write(dir, {mapName: "Pig Beach", activeMin: 13, autosaved: 6}));
  assert.deepStrictEqual(A.read(dir), {mapName: "Pig Beach", activeMin: 13, autosaved: 6});
  assert.deepStrictEqual(fs.readdirSync(dir), ["autosave.json"], "no temp file left, not a <digits>.json session");
  fs.writeFileSync(path.join(dir, "autosave.json.tmp"), "{\"half"); assert.equal(A.read(dir).activeMin, 13, "a half-written temp file doesn't touch the last good copy");
  for (const bad of [null, [1], "x", 5]) assert.equal(A.write(dir, bad), false);
  fs.writeFileSync(path.join(dir, "autosave.json"), "{\"half"); assert.equal(A.read(dir), null, "a broken file reads as none");
  fs.writeFileSync(path.join(dir, "autosave.json"), "[1]"); assert.equal(A.read(dir), null);
  A.write(dir, {a: 1}); A.clear(dir); assert.equal(A.read(dir), null); assert.deepStrictEqual(fs.readdirSync(dir), [], "clear removes the temp file too");
  assert.ok(A.clear(dir), "clearing twice is fine");
  fs.rmSync(path.dirname(dir), {recursive: true, force: true});
}
console.log("today, goal ETA, setup codes, autosave ok");

// markKill (0.2.81): a kill the readers missed restarts a timed monster's respawn by hand — only for the timed monsters
// of the map you're on
{ const s2 = createSession(G); s2.add({t: T0, type: "map", id: "10000013"});   // Henesys Hunting Ground I: Mano (boss, 1 h)
  const before = s2.respawns(T0 + 1e3);
  assert.strictEqual(before.length, 1); assert.strictEqual(before[0].killed, null, "not killed yet");
  assert.strictEqual(before[0].name, "Mano"); assert.strictEqual(before[0].boss, true);
  assert.strictEqual(s2.markKill("999999"), false, "not a timed monster on this map: refused");
  assert.ok(s2.markKill("700004"), "Mano marked killed");
  const after = s2.respawns(Date.now() + 2e3);   // markKill stamps the real clock
  assert.ok(after[0].killed > 0 && Math.abs(after[0].dueIn - 3600e3) < 5e3, "timer restarted for the full respawn");
}

// patch notes split into a lead + bullets for the app and the site (abbreviations don't end a sentence)
{ const LOG = require("../app/changelog.js"), r = LOG.parts("One. Two e.g. this thing. Lv. 10 is first job. Three!");
  assert.equal(r.lead, "One."); assert.deepEqual(r.bullets, ["Two e.g. this thing.", "Lv. 10 is first job.", "Three!"]);
  assert.deepEqual(LOG.parts("Just one."), {lead: "Just one.", bullets: []}) }
// patch notes (changelog.js): the top entry is the version being built, so a release can't ship without its line
{ const LOG = require("../app/changelog.js"), pkg = require("../package.json");
  assert.equal(LOG[0][0], pkg.version, "add a changelog.js line for " + pkg.version);
  const num = v => v.split(".").map(Number);
  for (let i = 1; i < LOG.length; i++){
    const [a, b] = [num(LOG[i - 1][0]), num(LOG[i][0])];
    assert.ok(a[0] > b[0] || a[0] === b[0] && (a[1] > b[1] || a[1] === b[1] && a[2] > b[2]), "newest first: " + LOG[i - 1][0] + " before " + LOG[i][0]);
    assert.ok(LOG[i - 1][1] >= LOG[i][1], "dates newest first at " + LOG[i][0]);
  }
  for (const [v, d, t] of LOG) assert.ok(/^\d+\.\d+\.\d+$/.test(v) && /^2026-\d\d-\d\d$/.test(d) && t.length > 5, "entry " + v);
}

// conditions & alerts (0.2.78): the engine over synthetic snapshots — thresholds held and crossed, respawn/KPQ/session/goal
// triggers, drop events, idle, migration from the pre-0.2.78 keys (no screen needed)
{ const A = require("../core/alerts.js"), T = T0 + 3600e3, mins = m => T + m * 6e4;
  const base = {on: true, paused: false, respawns: [], events: [], kpq: null, runT0: 0};
  // normalize: unknown kinds out, numbers finite, defaults in
  const nl = A.normalize([{kind: "nope"}, {kind: "expHrBelow", v: "x"}, {kind: "lootWorth", v: 5, on: false}]);
  assert.strictEqual(nl.length, 2);
  assert.strictEqual(nl[0].v, 1000); assert.strictEqual(nl[0].min, 2); assert.strictEqual(nl[0].sound, "low");
  assert.strictEqual(nl[1].v, 5); assert.strictEqual(nl[1].on, false);
  // migration from the pre-0.2.78 keys
  const mig = A.synth({alertWorth: 1e6, alertItems: "Bronze Ore, Glove scroll", stopBeep: false});
  assert.deepStrictEqual(mig.map(a => a.kind), ["lootWorth", "lootNamed"]);
  assert.deepStrictEqual(A.synth({}).map(a => a.kind), ["idleExp"]);
  assert.deepStrictEqual(A.synth({stopBeep: false}).map(a => a.kind), []);
  // sustained: EXP/hr (last 5 min) under 1,000 for 2 min; refire after 10; recover re-arms
  const al = [{id: "x", kind: "expHrBelow", on: true, sound: "low", toast: true, log: true, v: 1000, min: 2}], sx = {};
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 2000}}, sx, mins(0)).length, 0);
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(1)).length, 0, "holding, not long enough");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(2)).length, 0, "held 1 of 2 min");
  let f = A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(3) + 1000);
  assert.strictEqual(f.length, 1); assert.match(f[0].text, /500/); assert.strictEqual(f[0].w, "exp");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 400}}, sx, mins(4)).length, 0, "still bad: cooldown");
  assert.ok(A.evaluate(al, {...base, st: {expHr5: 400}}, sx, mins(14)).length >= 1, "refire after 10 min");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 5000}}, sx, mins(15)).length, 0, "recovered");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(16)).length, 0, "needs the hold again");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(18)).length, 0, "cooldown from the earlier refire");
  assert.strictEqual(A.evaluate(al, {...base, st: {expHr5: 500}}, sx, mins(24) + 1000).length, 1, "cool again: says it");
  // crossing: fires on the rise, again only after a dip back under
  const up = [{id: "y", kind: "expHrAbove", on: true, sound: "mid", toast: true, log: true, v: 1000}], su = {};
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 800}}, su, mins(0)).length, 0);
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 1500}}, su, mins(1)).length, 1);
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 1600}}, su, mins(2)).length, 0);
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 900}}, su, mins(3)).length, 0, "dips: re-arms");
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 1500}}, su, mins(5)).length, 0, "within the anti-flap guard");
  assert.strictEqual(A.evaluate(up, {...base, st: {expHr5: 1500}}, su, mins(6) + 1000).length, 1, "past the guard: fires");
  // boss due: once per kill, again on the next kill; gone when the map has no timers
  const bd = [{id: "b", kind: "bossDue", on: true, sound: "high", toast: true, log: true, min: 2}], sb = {};
  const R = k => [{name: "Mushmom", boss: true, killed: k, dueIn: 30e3}];
  assert.strictEqual(A.evaluate(bd, {...base, respawns: R(T - 6e5)}, sb, T).length, 1);
  assert.strictEqual(A.evaluate(bd, {...base, respawns: R(T - 6e5)}, sb, T + 1e4).length, 0, "same kill: once");
  assert.strictEqual(A.evaluate(bd, {...base, respawns: R(T + 6e4)}, sb, T + 6e4).length, 1, "next kill fires again");
  assert.strictEqual(A.evaluate(bd, {...base, respawns: []}, sb, T + 7e4).length, 0);
  // KPQ clock: once per round
  const kp = [{id: "k", kind: "kpqClock", on: true, sound: "high", toast: true, log: true, sec: 60}], sk = {};
  assert.strictEqual(A.evaluate(kp, {...base, kpq: {left: 45e3, rounds: 3}}, sk, T).length, 1);
  assert.strictEqual(A.evaluate(kp, {...base, kpq: {left: 20e3, rounds: 3}}, sk, T + 5e3).length, 0);
  assert.strictEqual(A.evaluate(kp, {...base, kpq: {left: 50e3, rounds: 4}}, sk, T + 6e3).length, 1);
  // session break: at the mark, then every 15 min
  const br = [{id: "r", kind: "sessionTime", on: true, sound: "mid", toast: true, log: true, min: 120}], sr = {};
  assert.strictEqual(A.evaluate(br, {...base, runT0: T}, sr, T + 119 * 6e4).length, 0);
  assert.strictEqual(A.evaluate(br, {...base, runT0: T}, sr, T + 121 * 6e4).length, 1);
  assert.strictEqual(A.evaluate(br, {...base, runT0: T}, sr, T + 130 * 6e4).length, 0);
  assert.strictEqual(A.evaluate(br, {...base, runT0: T}, sr, T + 137 * 6e4).length, 1);
  // goal reached, once per level/goal pair
  const gl = [{id: "g", kind: "goalReached", on: true, sound: "high", toast: true, log: true}], sg = {};
  assert.strictEqual(A.evaluate(gl, {...base, st: {level: 29, goalLevel: 30}}, sg, T).length, 0);
  assert.strictEqual(A.evaluate(gl, {...base, st: {level: 30, goalLevel: 30}}, sg, T + 1e3).length, 1);
  assert.strictEqual(A.evaluate(gl, {...base, st: {level: 31, goalLevel: 30}}, sg, T + 2e3).length, 0);
  // drop events: worth + watched names, no refire on the same pickup
  const lw = [{id: "w", kind: "lootWorth", on: true, sound: "mid", toast: true, log: true, v: 1e6},
    {id: "n", kind: "lootNamed", on: true, sound: "high", toast: true, log: true, names: "glove"}], sw = {};
  const ev = [{t: T, name: "Glove ATK Scroll", worth: 2e6}];
  f = A.evaluate(lw, {...base, events: ev}, sw, T);
  assert.deepStrictEqual(f.map(x => x.id).sort(), ["n", "w"]);
  assert.strictEqual(A.evaluate(lw, {...base, events: ev}, sw, T + 1).length, 0, "same pickup: once");
  assert.strictEqual(A.evaluate(lw, {...base, events: [{t: T + 1, name: "Bronze Ore", worth: 5}]}, sw, T + 2).length, 0);
  // idle: fires once per quiet stretch, not while paused, back after EXP returns and stops again
  const id = [{id: "i", kind: "idleExp", on: true, sound: "low", toast: true, log: true, min: 2}], si = {};
  const iq = {...base, st: {lastExpT: T - 3 * 6e4}};
  assert.strictEqual(A.evaluate(id, iq, si, T).length, 1);
  assert.strictEqual(A.evaluate(id, iq, si, T + 1e4).length, 0);
  assert.strictEqual(A.evaluate(id, {...base, paused: true, st: {lastExpT: T - 3 * 6e4}}, si, T + 2e4).length, 0, "paused: no idle alert");
  assert.strictEqual(A.evaluate(id, {...base, st: {lastExpT: T}}, si, T + 2e4).length, 0, "EXP came back");
  assert.strictEqual(A.evaluate(id, iq, si, T + 3e4).length, 1, "quiet again: fires again");
  // 0.2.92 triggers: baseline first (a trigger added mid-run never fires for what already happened), then once per change
  const mk = (kind, extra = {}) => [{id: kind, kind, on: true, sound: "low", toast: true, log: true, ...extra}];
  { const d = mk("died"), sd = {}; const run = (n, t) => A.evaluate(d, {...base, st: {deaths: n}}, sd, T + t).length;
    assert.strictEqual(run(2, 0), 0, "baseline"); assert.strictEqual(run(2, 1), 0); assert.strictEqual(run(3, 2), 1, "a new death"); assert.strictEqual(run(3, 3), 0, "once"); assert.strictEqual(run(0, 4), 0, "reset run"); }
  { const l = mk("levelUp"), sl = {}; const run = (lv, t) => A.evaluate(l, {...base, st: {level: 30 + lv.length, levelUps: lv.map(x => ({level: x}))}}, sl, T + t);
    assert.strictEqual(run([], 0).length, 0); const f2 = run([31], 1); assert.strictEqual(f2.length, 1); assert.ok(/level 31/.test(f2[0].text)); assert.strictEqual(run([31], 2).length, 0); }
  { const m2 = mk("mapEntered", {name: "ellinia"}), sm = {}; const run = (nm, t) => A.evaluate(m2, {...base, st: {nowMapName: nm}}, sm, T + t).length;
    assert.strictEqual(run("Henesys Hunting Ground I", 0), 0); assert.strictEqual(run("Ant Tunnel", 1), 0, "other map: filtered"); assert.strictEqual(run("Ellinia Tree Dungeon", 2), 1); assert.strictEqual(run("Ellinia Tree Dungeon", 3), 0); assert.strictEqual(run(null, 4), 0); }
  { const il = mk("itemLow", {name: "red potion", v: 50}), si2 = {}; const run = (have, t) => A.evaluate(il, {...base, st: {used: [{id: "2000000", name: "Red Potion", have}, {id: "2000001", name: "Orange Potion", have: 1}]}}, si2, T + t).length;
    assert.strictEqual(run(80, 0), 0); assert.strictEqual(run(49, 1), 1, "under the line"); assert.strictEqual(run(30, 2), 0, "once"); assert.strictEqual(run(200, 3), 0); assert.strictEqual(run(10, 4), 1, "restocked, low again");
    assert.strictEqual(A.evaluate(mk("itemLow", {name: "", v: 5}), {...base, st: {used: [{id: "1", name: "x", have: 0}]}}, {}, T).length, 0, "no item named: quiet"); }
  { const bk = mk("bigKill", {v: 5000}), sb = {}; const run = (g, t) => A.evaluate(bk, {...base, st: {gains: g}}, sb, T + t);
    assert.strictEqual(run([{t: 1, gain: 9999}], 0).length, 0, "baseline: past kills stay quiet");
    assert.strictEqual(run([{t: 1, gain: 9999}, {t: 2, gain: 100}], 1).length, 0, "small kill");
    const f3 = run([{t: 1, gain: 9999}, {t: 2, gain: 100}, {t: 3, gain: 7000}], 2); assert.strictEqual(f3.length, 1); assert.ok(/7,000/.test(f3[0].text));
    assert.strictEqual(run([{t: 3, gain: 7000}], 3).length, 0, "once"); }
  { const pc = mk("partyChange"), sp = {}; const run = (n, t) => A.evaluate(pc, {...base, st: {party: n}}, sp, T + t).length;
    assert.strictEqual(run(1, 0), 0); assert.strictEqual(run(3, 1), 1); assert.strictEqual(run(3, 2), 0); assert.strictEqual(run(1, 3), 1); }
  { const mb = mk("mesoBurst", {v: 1000, sec: 30}), sm2 = {}; const run = (m, s) => A.evaluate(mb, {...base, st: {mesos: m}}, sm2, T + s * 1e3).length;
    assert.strictEqual(run(0, 0), 0); assert.strictEqual(run(400, 10), 0); assert.strictEqual(run(1500, 20), 1, "1500 within 30 s"); assert.strictEqual(run(2600, 30), 0, "once a minute");
    assert.strictEqual(run(2600, 100), 0, "a quiet window is quiet"); }
  { const rt = mk("readTrouble", {v: 50, min: 5}), sr = {}; const run = (share, am, t) => A.evaluate(rt, {...base, st: {readShare: share, activeMin: am}}, sr, T + t).length;
    assert.strictEqual(run(0.2, 2, 0), 0, "too early"); assert.strictEqual(run(0.2, 6, 1), 1); assert.strictEqual(run(0.2, 7, 2), 0, "once per stretch"); assert.strictEqual(run(0.9, 8, 3), 0); assert.strictEqual(run(0.3, 9, 4), 1, "again after recovering"); assert.strictEqual(run(null, 9, 5), 0); }
  { const ns = A.normalize([{kind: "died", act: {sound: "file:boom.mp3"}}, {kind: "died", act: {sound: "file:../../evil.exe"}}, {kind: "died", act: {sound: "file:a/b.wav"}}]);
    assert.deepStrictEqual(ns.map(x => x.sound), ["file:boom.mp3", "low", "low"], "file sounds: plain names only"); }
  // has(): the renderer's gates for the legacy paths
  assert.ok(A.has([{kind: "idleExp", on: true}], "idleExp", true) && !A.has([{kind: "idleExp", on: false}], "idleExp", true));
}
console.log("alerts ok");

// site market data (0.2.83): core/prices.js parse/quote/movers/fmtM + the priceAbove/priceBelow alert kinds
{ const P = require("../core/prices.js");
  const j = {read: "2026-10-28", listed: "2026-10-28 17:00",
    it: {"4010001": [300, 299, 330, 16866, 0, -0.06], "4010002": [500, 480, 520, 60, 0, 0.5], "4000000": [10, 9, 11, 5, 1, 0]},
    hist: {"4010001": [["2026-10-26", 350, 2014], ["2026-10-27", 310, 2326], ["2026-10-28", 300, 1662]],
           "4010002": [["2026-10-27", 400, 50], ["2026-10-28", 500, 60]],
           "4000000": [["2026-10-28", 10, 3]]},
    asks: {"4010001": [[299, 1, 15, "FM <10>", "Levon", 29886734], [310, 2, 12, "FM <1>", "A", 1]]},
    tot: {sales: 721874, top: ["4010001", 330, 2, "12:00"]}};
  const p = P.parse(j);
  assert.ok(p.ok, "parses");
  const q1 = P.quote(p, "4010001");
  assert.strictEqual(q1.median, 300); assert.strictEqual(q1.live, 299); assert.strictEqual(q1.listings, 2);
  assert.strictEqual(P.quote(p, "nope"), null);
  assert.strictEqual(P.parse({}).ok, false, "no items: bad");
  assert.strictEqual(P.parse({it: {"1": "x"}}).ok, false, "non-array row: bad");
  assert.strictEqual(P.parse({it: {"1": [-5]}}).ok, false, "negative median: bad");
  assert.strictEqual(P.parse({it: {"1": [0]}, asks: 7}).ok, false, "non-object asks: bad");
  // movers: needs 2 history days + >= 20 sales today; flat days skipped; sorted by |pct|
  const mv = P.movers(p, 5, 20);
  assert.deepStrictEqual(mv.map(m => m.id), ["4010002", "4010001"], "by |pct| desc, thin rows out");
  assert.ok(mv[0].up && Math.abs(mv[0].pct - 0.25) < 1e-9, "up mover math");
  assert.ok(!mv[1].up && Math.abs(mv[1].pct - (-10 / 310)) < 1e-9, "down mover math");
  assert.strictEqual(P.fmtM(999), "999"); assert.strictEqual(P.fmtM(12300), "12.3k"); assert.strictEqual(P.fmtM(1200000), "1.2m");
  assert.strictEqual(P.priceCtx(p, id => id === "4010001" ? "Red Potion" : null).length, 1, "ctx rows only for named items");
  // cross-source compare (0.2.84): field positions per source, spread multiplier, empty-safe
  const PR = {pw: {it: {"4010001": [300, 299, 330, 16866]}}, cmp: {it: {"4010001": [310, 300, 330, 12]}},
    mdb: {it: {"4010001": [305, 310, 6]}}, mi: {it: {"4010001": [0, 0, 0, 0]}}, srcd: {mesowatch_prices: "2026-10-28 17:00", classicmarket_market: "2026-10-28 16:52", meowdb_market: "2026-10-28 16:23"}};
  const srcs = P.sources(PR, "4010001");
  assert.deepStrictEqual(srcs.map(s => s.key), ["pw", "cmp", "mdb"], "zero-price sources drop out");
  assert.strictEqual(srcs[0].sales, 16866); assert.strictEqual(srcs[2].sales, 6, "meowdb's sales idx is 2");
  assert.strictEqual(srcs[0].read, "2026-10-28 17:00");
  assert.strictEqual(P.sources(PR, "nope").length, 0); assert.strictEqual(P.sources(null, "4010001").length, 0);
  assert.ok(Math.abs(P.spreadOf(srcs) - 310 / 300) < 1e-9, "spread = max/min");
  assert.strictEqual(P.spreadOf(srcs.slice(0, 1)), null, "one source: no spread");
  assert.strictEqual(P.spreadOf([]), null);
  // price alerts: crossing fires, holding is quiet, falls back under re-arms (5-min firedAt guard respected)
  const A = require("../core/alerts.js"), T = T0 + 3600e3;
  const mk = m => ({on: true, paused: false, respawns: [], events: [], kpq: null, runT0: 0,
    prices: [{id: "4010001", name: "Red Potion", median: m}]});
  const above = [{id: "pa", kind: "priceAbove", on: true, sound: "mid", toast: true, log: true, name: "red potion", v: 250}];
  const sa = {};
  assert.strictEqual(A.evaluate(above, mk(300), sa, T).length, 1, "over the mark fires");
  assert.strictEqual(A.evaluate(above, mk(300), sa, T + 1e4).length, 0, "staying over is quiet");
  A.evaluate(above, mk(200), sa, T + 2e4);   // falls back under: re-arms
  assert.strictEqual(A.evaluate(above, mk(200), sa, T + 3e4).length, 0, "under the mark: silent");
  assert.strictEqual(A.evaluate(above, mk(300), sa, T + 2e4).length, 0, "inside the firedAt guard");
  assert.strictEqual(A.evaluate(above, mk(300), sa, T + 31 * 6e4).length, 1, "re-armed crossing fires again");
  const below = [{id: "pb", kind: "priceBelow", on: true, sound: "mid", toast: true, log: true, name: "4010001", v: 250}];
  assert.strictEqual(A.evaluate(below, mk(200), {}, T).length, 1, "by id, under the mark fires");
  assert.strictEqual(A.evaluate(below, {on: true, paused: false, respawns: [], events: [], kpq: null, runT0: 0, prices: []}, {}, T).length, 0, "no price data: silent");
  assert.strictEqual(A.evaluate([{id: "px", kind: "priceAbove", on: true, sound: "mid", toast: true, log: true, name: "", v: 100}], mk(300), {}, T).length, 0, "blank item: silent");
}
console.log("site prices ok");

// bag check reminders (core/bagstale.js): green -> yellow -> orange after 30 s -> red, glow at 2 min overdue (Danny 2026-10-29)
{ const B = require("../core/bagstale.js"), m = 60e3;
  // Set Up / Cash / Deco (Danny 10-29): a card can watch any of the six tabs in game order; the default stays Equip, Use, Etc
  assert.deepStrictEqual(B.ALL.map(t => t[0]), ["equip", "use", "setup", "etc", "cash", "deco"]);
  assert.deepStrictEqual(B.tabs({}, 0, 1, 5, true).map(t => t.k), ["equip", "use", "etc"]);
  assert.deepStrictEqual(B.tabs({}, 0, 1, 5, true, ["deco", "cash"]).map(t => t.k), ["cash", "deco"]);
  assert.ok(B.ALL.every(([k]) => B.ICONS[k]), "every watchable tab has an icon");
  assert.strictEqual(B.level(4 * m, 5).stage, "ok", "inside the fresh window: green");
  assert.strictEqual(B.level(5 * m, 5).stage, "soon"); assert.strictEqual(B.level(5 * m, 5).hue, 50, "due: yellow");
  assert.strictEqual(B.level(5 * m + 29e3, 5).hue, 50, "yellow holds 30 s");
  const o = B.level(5 * m + 31e3, 5); assert.ok(o.stage === "late" && o.hue < 50 && o.hue > 30, "then orange");
  assert.ok(B.level(5 * m + 100e3, 5).hue < o.hue, "redder as it goes stale");
  const n = B.level(7 * m, 5); assert.ok(n.stage === "now" && n.pulse && n.hue === 0, "2 min overdue: red + glow");
  assert.strictEqual(B.every("x"), 5); assert.strictEqual(B.every(0), 1); assert.strictEqual(B.every(99), 30);
  const t = B.tabs({equip: {last: 1000 + 3 * m, first: 1000}}, 1000, 1000 + 5 * m + 10e3, 5, true);
  assert.deepStrictEqual(t.map(x => x.stage), ["ok", "soon", "soon"], "a read tab counts from its read, an unread one from the run start");
  assert.ok(B.tabs({}, 0, 1e9, 5, false).every(x => x.stage === "idle"), "not tracking: grey, no urgency");
  assert.ok(B.ICONS.equip && B.ICONS.use && B.ICONS.etc);
}
console.log("bag stale ok");

console.log("patch notes ok");

// performance monitor maths (core/perfwatch.js): rows sorted by CPU, warnings only past our limits
{ const P = require("../core/perfwatch.js"), m = (type, c, kb) => ({type, cpu: {percentCPUUsage: c}, memory: {workingSetSize: kb}});
  const rows = P.procs([m("GPU", 3, 102400), m("Browser", 12, 204800), m("Tab", 20, 307200)]);
  assert.deepStrictEqual(rows.map(r => r.name), ["Window or reader", "App (main)", "Graphics"]);
  assert.strictEqual(P.warnings(rows, {}, null, 0).list.length, 1, "35% CPU warns");
  assert.strictEqual(P.warnings(P.procs([m("Tab", 5, 1024)]), {busy: 10, read: 20}, 2, 2).list.length, 0, "light load: no warning");
  const st = P.stages({tick: {n: 2, sum: 100, max: 60}, read: {n: 2, sum: 90, max: 70}}, 1000);
  assert.strictEqual(st.busy, 10); assert.strictEqual(st.read, 45);
  assert.ok(P.warnings([], {read: 120}, 0.5, 2).list.length === 2, "slow read + low rate both warn"); }

// performance monitor memory: privateBytes (Windows, what the process holds itself) wins over the working set, which
// counts the same shared system libraries once per process and warned at totals that were mostly double-counting
{ const P = require("../core/perfwatch.js"), m = (type, c, kb, pb) => ({type, cpu: {percentCPUUsage: c}, memory: {workingSetSize: kb, privateBytes: pb}});
  const rows = P.procs([m("Tab", 2, 409600, 102400), m("Browser", 1, 409600, 51200)]);
  assert.strictEqual(rows.reduce((a, r) => a + r.mem, 0), 150, "privateBytes summed when present");
  assert.strictEqual(P.procs([m("Tab", 2, 102400)]).reduce((a, r) => a + r.mem, 0), 100, "no privateBytes (non-Windows): working set stands in");
  assert.strictEqual(P.procs([m("Tab", 2, 102400, 0)]).reduce((a, r) => a + r.mem, 0), 0, "privateBytes 0 counts as 0, not a fallback"); }

// frame buffer pool (core/bufpool.js): exact-size take, give dedupes and rejects non-buffers, the cap drops the oldest
{ const BP = require("../core/bufpool.js"), p = BP.createBufPool(2), a = new ArrayBuffer(16), b = new ArrayBuffer(32);
  assert.strictEqual(p.take(16), null, "empty pool: miss");
  assert.strictEqual(p.give(a), true);
  assert.strictEqual(p.take(32), null, "size must match exactly");
  assert.strictEqual(p.take(16), a, "exact-size take returns the buffer");
  assert.strictEqual(p.take(16), null, "a taken buffer has left the pool");
  assert.strictEqual(p.give(b), true);
  assert.strictEqual(p.give(b), false, "the same buffer is never pooled twice");
  assert.strictEqual(p.give({}), false, "only real ArrayBuffers are pooled");
  assert.strictEqual(p.give(new ArrayBuffer(0)), false, "empty buffers are refused");
  assert.strictEqual(p.give(new ArrayBuffer(8)), true); assert.strictEqual(p.give(new ArrayBuffer(64)), true);
  assert.strictEqual(p.size, 2, "the cap holds and dropped the oldest");
  p.clear(); assert.strictEqual(p.size, 0, "clear empties the pool"); }

// KPQ scoring (core/kpqscore.js, 2026-10-29): speed against a recorded reference, NPC-priced drops, item bonuses, Pan Lid, no reference = provisional
{ const K = require("../core/kpqscore.js"), W = K.WEIGHTS;
  const items = {"4000000": {c: "Etc", p: 10}, "2000000": {c: "Consumable", p: 50}, "2040000": {c: "Scroll", p: 0}, "1002000": {c: "Equipment", p: 300}, "1092002": {c: "Equipment", p: 2000}};
  const l = K.lootSummary(items, {"4000000": 3, "2000000": 1, "2040000": 2, "1092002": 1, "9999999": 5});
  assert.deepStrictEqual(l, {etc: 3, use: 1, scroll: 2, equip: 1, pan: 1, npc: 3 * 10 + 50 + 2000}, "loot counted per tab, Pan Lid apart, unknown ids ignored");
  assert.strictEqual(K.lootBonus(l), 3 * W.ETC_PTS + W.USE_PTS + 2 * W.SCROLL_PTS + W.EQUIP_PTS + W.PAN_PTS);
  const st = {"80000000": 60, "80000100": 60, "80000200": 60, "80000300": 60, "80000400": 60}, base = {stages: st, rush: {loot: K.emptyLoot()}, bonus: null};
  let r = K.score(base, null); assert.strictEqual(r.rush.pts, W.CLEAR_BASE); assert.ok(r.provisional && r.rush.speed === 0, "no reference: base points only, flagged provisional");
  const rows = Array.from({length: 10}, (_, i) => ({stages: Object.fromEntries(K.RUSH_STAGES.map(id => [id, 60 + i * 2])), bonus: {exp: 900 + i * 20, mesos: 100, loot: {npc: 0}}}));
  const ref = K.buildRef(rows); assert.strictEqual(ref.med["80000000"], 69); assert.strictEqual(ref.best["80000000"], 60); assert.ok(Math.abs(ref.perPoint - 1000 / 1090) < 1e-9, "Bonus scale: median Bonus gain = 1000 points");
  assert.strictEqual(K.buildRef(rows.slice(0, 9)).perPoint, null, "under 10 rounds: no reference");
  const at = sec => K.score({...base, stages: Object.fromEntries(K.RUSH_STAGES.map(id => [id, sec]))}, ref).rush;
  assert.strictEqual(at(69).pts, W.CLEAR_BASE, "average pace = base"); assert.ok(at(60).perfect === W.PERFECT && at(60).pts === W.CLEAR_BASE + 5 * W.STAGE_W + W.PERFECT, "record pace on all five = perfect");
  assert.ok(at(50).pts > at(60).pts && at(50).pts <= W.CLEAR_BASE + 5 * 1.5 * W.STAGE_W + W.PERFECT, "beating the record keeps paying, capped");
  assert.strictEqual(at(200).pts, W.CLEAR_BASE - 5 * W.STAGE_W, "far slower than average loses points, floored per stage"); assert.ok(at(200).provisional === false);
  const b = K.bonus({bonus: {sec: 60, exp: 1000, mesos: 99, kills: 5, loot: {...K.emptyLoot(), pan: 1, npc: 2000}}}, ref); assert.strictEqual(b.pts, Math.round((1000 + 99 + 2000) * ref.perPoint + W.PAN_PTS), "EXP + mesos + NPC drop value, plus Pan Lid");
  assert.strictEqual(K.bonus(base, ref), null, "no Bonus kills: no Bonus section");
}
console.log("kpq score ok");
