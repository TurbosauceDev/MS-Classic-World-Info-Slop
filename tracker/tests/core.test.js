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
assert.strictEqual(st.lootValue, 10 * G.pw["4000019"][0], "Horny Mushroom Cap at its meso.watch median");
assert.ok(st.toLevelHrs > 0 && st.toLevelHrs < 100);

// idle: a 5-minute AFK gap adds nothing to active time
s = createSession(G);
s.add({t: sec(0), type: "map", id: 40});
s.add({t: sec(0), type: "exp", gain: 2});
s.add({t: sec(30), type: "exp", gain: 2});
s.add({t: sec(330), type: "exp", gain: 2});
s.add({t: sec(340), type: "exp", gain: 2});
assert.strictEqual(s.stats().activeMin, 40 / 60);

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
assert.deepStrictEqual(mapFromText("Hidden Street\nSecret Garden of Nowhere=\n", G), {id: null, name: "Secret Garden of Nowhere"}, "a map we don't have");
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
// the Default theme is the planner site's colours exactly (Danny 2026-10-18: "match our webtool perfectly"): read them from
// src/styles.css so a site recolour that skips themes.js fails here; text on accent is --panel like the site's buttons
{
  const TH = require("../app/themes.js"), css = require("fs").readFileSync(require("path").join(__dirname, "../../src/styles.css"), "utf8");
  const vars = block => Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const site = {light: vars(css.slice(css.indexOf(":root{"), css.indexOf("@media (prefers-color-scheme: dark)"))),
    dark: vars(css.slice(css.indexOf(':root[data-theme="dark"]{')))};
  const d = TH.PRESETS[0]; assert.equal(d.name, "Default", "Default theme is first");
  for (const side of ["light", "dark"]) for (const [k, [v]] of Object.entries(TH.TOKENS)){
    const want = site[side][v === "--on-accent" ? "panel" : v.slice(2)];
    assert.equal(d[side][k], want, `Default ${side} ${k} matches site ${v}`);
  }
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
