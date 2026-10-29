// node tests/journal.test.js — the journey log (core/combatlog.js lines + observer, core/journalfile.js rotation)
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const J = require("../core/combatlog.js"), {createWriter} = require("../core/journalfile.js");
const G = {exp: {10: 1000, 11: 1500, 12: 2000}, items: {2000000: {n: "Red Potion"}, 4000000: {n: "Blue Snail Shell"}}, mapnames: {100: "Henesys"}, maps: {100: ["Henesys", 1, []], 200: ["Hunting Ground", 1, []]}};
const T0 = Date.parse("2026-10-29T00:00:00Z");

// format: round trip, quoting, bad lines
{ const l = J.line(T0 + 483, "MAP_CHANGE", 100, 'He"nes,ys', null, 2.5);
  assert.strictEqual(l, '2026-10-29T00:00:00.483Z  MAP_CHANGE,100,"He""nes,ys",,2.5');
  const p = J.parse(l); assert.deepStrictEqual(p, {t: T0 + 483, kind: "MAP_CHANGE", f: [100, 'He"nes,ys', null, 2.5]});
  assert.strictEqual(J.parse("garbage"), null); assert.strictEqual(J.parse("2026-10-29T00:00:00Z  X"), null);
  assert.strictEqual(J.parse(J.line(T0, "NOTE", "line\nbreak")).f[0], "line break");
  assert.deepStrictEqual(J.parse(J.line(T0, "RUN_START")).f, []); }

// observer
const run = (events, fn) => { const out = []; const o = J.createObserver(G, (t, k, ...f) => out.push([t - T0, k, ...f]), {}); fn ? fn(o, events) : events.forEach(e => o.event({...e, t: T0 + e.t})); return {out, o} };
const kinds = out => out.map(x => x[1]);

// login, map, combat start/end, exp, level-up
{ const {out, o} = run([
    {t: 0, type: "bar", level: 10, pct: 50, exp: 500}, {t: 100, type: "map", id: 100, name: "Henesys"}, {t: 200, type: "map", id: 100, name: "Henesys"},
    {t: 1000, type: "exp", gain: 20}, {t: 2000, type: "exp", gain: 20}, {t: 2500, type: "meso", amount: 15}, {t: 2600, type: "item", id: 4000000, qty: 1},
    {t: 3000, type: "bar", level: 10, pct: 54, exp: 540}, {t: 5000, type: "map", id: 200, name: "Hunting Ground"}]);
  assert.deepStrictEqual(kinds(out), ["LOGIN", "MAP_CHANGE", "COMBAT_START", "EXP_GAIN", "EXP_GAIN", "MESO_GAIN", "ITEM_PICKUP", "EXP_BAR", "COMBAT_END", "MAP_CHANGE"], kinds(out).join());
  assert.deepStrictEqual(out.find(x => x[1] === "COMBAT_END").slice(2), [1, 2, 40, 100, "map"]);   // 1 s from first to last EXP
  assert.deepStrictEqual(out.find(x => x[1] === "ITEM_PICKUP").slice(2), [4000000, "Blue Snail Shell", 1, "kill"]);
  assert.strictEqual(out.filter(x => x[1] === "MAP_CHANGE").length, 2, "the same map twice is one change");
  o.event({t: T0 + 6000, type: "bar", level: 11, pct: 1, exp: 15}); assert.strictEqual(out.at(-2)[1], "LEVEL_UP"); assert.strictEqual(out.at(-2)[2], 11); }

// combat ends when it goes quiet (tick), and not before
{ const {out, o} = run([{t: 0, type: "exp", gain: 5}]);
  o.tick(T0 + 5000); assert.strictEqual(kinds(out).includes("COMBAT_END"), false);
  o.tick(T0 + J.COMBAT_IDLE_MS + 1); assert.strictEqual(out.at(-1)[1], "COMBAT_END"); assert.strictEqual(out.at(-1)[6], "idle"); }

// Danny's "crazy jump" case: a bar gain no EXP message explains is held, not logged as progress; one read alone is rejected
{ const {out, o} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 15000, type: "bar", level: 10, pct: 60, exp: 600}, {t: 30000, type: "bar", level: 10, pct: 11, exp: 110}]);
  const jumps = out.filter(x => x[1] === "EXP_JUMP").map(x => x[2]); assert.deepStrictEqual(jumps, ["suspect", "rejected"], jumps.join());
  assert.strictEqual(o.state.bar.exp, 110, "the bar went on from the real reading, not the jump"); }
// ...and two reads that agree confirm it (a real big gain, e.g. a quest reward)
{ const {out} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 15000, type: "bar", level: 10, pct: 60, exp: 600}, {t: 30000, type: "bar", level: 10, pct: 60, exp: 600}]);
  assert.deepStrictEqual(out.filter(x => x[1] === "EXP_JUMP").map(x => x[2]), ["suspect", "confirmed"]); }
// a gain the EXP messages explain is no jump
{ const {out} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 1000, type: "exp", gain: 300}, {t: 1500, type: "exp", gain: 200}, {t: 15000, type: "bar", level: 10, pct: 60, exp: 600}]);
  assert.strictEqual(kinds(out).includes("EXP_JUMP"), false); }
// a level that skips (10 -> 12) waits for a second read
{ const {out} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 1000, type: "bar", level: 12, pct: 5, exp: 100}, {t: 2000, type: "bar", level: 10, pct: 11, exp: 110}]);
  assert.deepStrictEqual(out.filter(x => /EXP_JUMP|LEVEL_UP/.test(x[1])).map(x => x[1] + (x[2] || "")), ["EXP_JUMPsuspect"]); }
// a drop with no level-up is a loss; a digit wobble is not
{ const {out} = run([{t: 0, type: "bar", level: 10, pct: 50, exp: 500}, {t: 1000, type: "bar", level: 10, pct: 50, exp: 497}, {t: 2000, type: "bar", level: 10, pct: 40, exp: 400}]);
  assert.deepStrictEqual(out.filter(x => x[1] === "EXP_LOSS").map(x => x[4]), [97]); }

// wallet: pickups explain a rise, the rest is "other_income"; a fall is "spent"
{ const {out} = run([{t: 0, type: "wallet", n: 1000}, {t: 1000, type: "meso", amount: 50}, {t: 2000, type: "wallet", n: 1050}, {t: 3000, type: "wallet", n: 800}, {t: 4000, type: "wallet", n: 5800}]);
  assert.deepStrictEqual(out.filter(x => x[1] === "MESO_CHANGE").map(x => x.slice(2)), [[-250, 800, "spent"], [5000, 5800, "other_income"]]); }

// inventory diffs between two reads of a tab; potions used
{ const {out} = run([{t: 0, type: "inv", tab: "use", items: {2000000: 10}}, {t: 5000, type: "inv", tab: "use", items: {2000000: 7}, unknown: 0}, {t: 6000, type: "use", id: 2000000, n: 3}]);
  assert.deepStrictEqual(out.filter(x => x[1] === "INV_DELTA").map(x => x.slice(2)), [["use", "2000000", "Red Potion", -3]]);
  assert.deepStrictEqual(out.at(-1).slice(1), ["ITEM_USED", 2000000, "Red Potion", 3]); }

// the status bar gone for a while: HUD_LOST ends combat, HUD_BACK says how long
{ const {out, o} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 100, type: "exp", gain: 1}], (o, ev) => ev.forEach(e => o.event({...e, t: T0 + e.t})));
  o.hud(T0 + 1000, false); o.hud(T0 + 4000, false); assert.strictEqual(kinds(out).includes("HUD_LOST"), false, "not yet");
  o.hud(T0 + 8000, false); const k = kinds(out); assert.deepStrictEqual(k.slice(-2), ["COMBAT_END", "HUD_LOST"]);
  o.hud(T0 + 20000, true); assert.deepStrictEqual(out.at(-1).slice(1), ["HUD_BACK", 19]); }

// every line the observer makes parses back, with kinds that are documented
{ const {out} = run([{t: 0, type: "bar", level: 10, pct: 10, exp: 100}, {t: 1, type: "map", id: 100}, {t: 2, type: "exp", gain: 5}, {t: 3, type: "party", size: 3}, {t: 4, type: "job", name: "Archer"}, {t: 5, type: "pause", hold: true}, {t: 6, type: "resume"}, {t: 7, type: "itemraw", text: 'Red "Pot', qty: 2}]);
  for (const x of out){ assert(J.KINDS[x[1]] !== undefined, "undocumented " + x[1]); const l = J.line(T0 + x[0], x[1], ...x.slice(2)); assert.strictEqual(J.parse(l).kind, x[1]) } }

// rotation: prune keeps the newest, trims by count and by bytes
{ const f = [1, 2, 3, 4, 5].map(i => ({name: "j" + i, size: 100, mtime: i}));
  assert.deepStrictEqual(J.prune(f, {maxFiles: 3, maxBytes: 1e9}), ["j1", "j2"]);
  assert.deepStrictEqual(J.prune(f, {maxFiles: 10, maxBytes: 250}), ["j1", "j2", "j3"]);
  assert.deepStrictEqual(J.prune([{name: "big", size: 9e9, mtime: 1}], {maxBytes: 10}), [], "the only (newest) file stays"); }

// the writer: header per file, new file past maxFile, folder capped, junk lines dropped
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jr-")); let now = T0;
  const w = createWriter(dir, {app: "9.9.9", maxFile: 600, maxFiles: 3, maxBytes: 1e6, now: () => now += 1000});
  const mk = i => J.line(T0 + i, "NOTE", "x".repeat(80));
  assert.strictEqual(w.append(["junk", 5, mk(1)]), 1, "junk dropped");
  for (let i = 0; i < 40; i++) w.append([mk(i)]);
  const files = w.list().sort((a, b) => a.name < b.name ? -1 : 1);
  assert(files.length <= 3, "capped at 3 files, got " + files.length);
  for (const f of files){ const first = fs.readFileSync(path.join(dir, f.name), "utf8").split("\n")[0]; const p = J.parse(first); assert.strictEqual(p.kind, "JOURNAL_START"); assert.deepStrictEqual(p.f, [1, "9.9.9", "screen"]) }
  assert(files.every(f => f.size < 900), "files stay near maxFile");
  for (const f of files) for (const l of fs.readFileSync(path.join(dir, f.name), "utf8").trim().split("\n")) assert(J.parse(l), "every line parses: " + l);
  fs.rmSync(dir, {recursive: true}); }
console.log("journal tests ok");
