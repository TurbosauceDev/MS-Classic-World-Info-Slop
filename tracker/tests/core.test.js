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
assert.strictEqual(st.lootValue, 10 * 22, "Horny Mushroom Cap at its meso.watch median (22)");
assert.ok(st.toLevelHrs > 0 && st.toLevelHrs < 100);

// idle: a 5-minute AFK gap adds nothing to active time
s = createSession(G);
s.add({t: sec(0), type: "map", id: 40});
s.add({t: sec(0), type: "exp", gain: 2});
s.add({t: sec(30), type: "exp", gain: 2});
s.add({t: sec(330), type: "exp", gain: 2});
s.add({t: sec(340), type: "exp", gain: 2});
assert.strictEqual(s.stats().activeMin, 40 / 60);

// party of 3: share = 6 × 1.2 / 3 = 2.4 → Shroom on A Split Road; quest EXP (500) is not a kill
s = createSession(G);
s.add({t: sec(0), type: "map", id: 50});
s.add({t: sec(0), type: "party", size: 3});
s.add({t: sec(5), type: "exp", gain: 2.4});
s.add({t: sec(9), type: "exp", gain: 500});
st = s.stats();
assert.strictEqual(st.kills, 1);
assert.strictEqual(st.mobs[0].name, "Shroom");
assert.strictEqual(st.otherExp, 500);
assert.ok(!("name" in s.shareable()), "shared summary carries no character name");

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
assert.strictEqual(st.mobs.length, 0, "no monster guess without a map");

console.log("core tests passed");
