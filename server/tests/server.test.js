// node tests/server.test.js — the Worker against an in-memory SQLite stand-in for D1 (node:sqlite)
import assert from "assert";
import {readFileSync} from "fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../src/index.js";

const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const DB = {prepare(q){ let args = []; const st = sql.prepare(q); return {
  bind(...a){ args = a; return this }, async first(){ return st.get(...args) ?? null }, async run(){ const r = st.run(...args); return {meta: {last_row_id: Number(r.lastInsertRowid)}} },
  async all(){ return {results: st.all(...args)} } } }};
const env = {DB};
const post = (body, ip = "10.0.0." + body.install.charCodeAt(0)) => worker.fetch(new Request("https://x/api/runs", {method: "POST", body: JSON.stringify(body), headers: {"cf-connecting-ip": ip}}), env).then(async r => [r.status, await r.json()]);

// Snail Hunting Ground III (42): Snail, Blue Snail, Red Snail
const run = (install, exp, extra = {}) => ({install, date: "2026-10-17", map: 42, party: 1, level: 22, job: "Magician", minutes: 15, exp, msgExp: exp, barExp: exp,
  kills: 100, mesos: 900, mobs: [{id: "2", kills: 100, mesos: 900, mesoDrops: 60, items: {"4000019": 3}}], items: {"4000019": 3}, ...extra});
const G = JSON.parse(readFileSync(new URL("../src/gamedata.json", import.meta.url)));
assert.ok(G.maps["42"].includes("2"), "Snail (2) lives on map 42");

let [s, r] = await post(run("aaaaaaaaaaaaaaaa1", 1000));
assert.strictEqual(s, 200); assert.strictEqual(r.counted, true);
[s, r] = await post(run("aaaaaaaaaaaaaaaa1", 1200));
[s, r] = await post(run("bbbbbbbbbbbbbbbb2", 2000, {mobs: [{id: "4", kills: 5, items: {}}]}));   // monster 4 (Shroom) isn't on this map
assert.strictEqual(r.counted, false); assert.strictEqual(r.why, "monster not on this map");
[s, r] = await post(run("cccccccccccccccc3", 2000, {barExp: 1500}));
assert.strictEqual(r.why, "EXP bar and messages disagree");
[s, r] = await post(run("cccccccccccccccc3", 9e6, {msgExp: 9e6, barExp: 9e6}));
assert.strictEqual(r.why, "too much EXP for this level");
[s, r] = await post(run("dddddddddddddddd4", 2000, {minutes: 3}));
assert.strictEqual(s, 400);
for (let i = 0; i < 7; i++) [s] = await post(run("eeeeeeeeeeeeeeee5", 500));
assert.strictEqual(s, 429, "7th run in an hour is refused");

[s, r] = await post(run("ffffffffffffffff6", 1000, {map: 80000500, mapName: "1st Accompaniment <Bonus>", party: 4, mobs: [{id: "19", kills: 10, items: {}}]}));
assert.strictEqual(r.counted, true, "KPQ bonus stage with Horny Mushrooms");
[s, r] = await post(run("ffffffffffffffff6", 1000, {map: 99999999, mapName: "Somewhere New", mobs: []}));
assert.strictEqual(s, 200, "unknown map id: kept under its name");
// a 7th new install ID from the same IP today is refused (6 = a party on one home network)
for (const id of ["g000000000000001", "g000000000000002", "g000000000000003", "g000000000000005", "g000000000000006", "g000000000000007"]) [s] = await post(run(id, 1000), "9.9.9.9");
assert.strictEqual(s, 200);
[s] = await post(run("g000000000000004", 1000), "9.9.9.9");
assert.strictEqual(s, 429, "ID rotation");
[s] = await post(run("g000000000000001", 1000), "9.9.9.9");
assert.strictEqual(s, 200, "a known ID from that IP still sends");
// two players with the same party code: one group
[s] = await post(run("hhhhhhhhhhhhhhh01", 1000, {partyCode: "Shroomies", party: 2}));
[s] = await post(run("hhhhhhhhhhhhhhh02", 1000, {partyCode: "shroomies ", party: 2}));
[s] = await post(run("jjjjjjjjjjjjjjj01", 1000, {partyCode: "shroomies"}));   // soloing with the same code: its own group
const fresh = async () => { sql.exec("DELETE FROM meta WHERE k = 'summary'"); return (await worker.fetch(new Request("https://x/api/summary"), env)).json() };
const sum = await fresh();
const a = sum.rows.find(x => x.expHr === 4400);   // player 1: median of 4000 and 4800 EXP/hr
assert.ok(a && a.runs === 2 && a.map === "42");
assert.strictEqual(sum.players, 12, "only counted runs: players 1, 5, 6, the six g IDs, the two h IDs and j");
assert.ok(sum.rows.some(x => x.map === null && x.mapName === "Somewhere New"));
assert.strictEqual(sum.mobs["2"].items["4000019"], 3 * 2 + 3 * 6 + 3 * 7 + 3 * 3, "players 1, 5, the g IDs (7 runs), the h IDs and j");
assert.ok(!JSON.stringify(sum).includes("aaaaaaaa"), "no install ids in the summary");
assert.strictEqual(new Set(sum.rows.map(x => x.group)).size, sum.rows.length - 1 - 5, "the two party members share a group; the six g IDs on one network are one player");
const gg = sum.rows.filter(x => x.map === "42" && x.party === 1).map(x => x.group);
assert.ok(new Set(gg).size < gg.length, "same network, same day: one group");
// one network joins installs across days too: an install seen on two networks links both
[s] = await post(run("mmmmmmmmmmmmmmm01", 1000), "7.7.7.7");
[s] = await post(run("mmmmmmmmmmmmmmm02", 1000), "7.7.7.7");
[s] = await post(run("nnnnnnnnnnnnnnn01", 1000), "6.6.6.6");
const nets = (await fresh()).rows.filter(x => x.map === "42" && x.party === 1);
const gm = new Set(nets.slice(-3).map(x => x.group));
assert.strictEqual(gm.size, 2, "m01 + m02 (one network) and n01");
// best time to farm: 3 players, each 3 runs at 02:00 UTC (1000) and 3 at 20:00 (2000): slower than their usual at night
for (const who of ["t00000000000001a", "t00000000000002b", "t00000000000003c"]) for (let i = 0; i < 6; i++)
  [s, r] = await post(run(who, i < 3 ? 1000 : 2000, {hour: i < 3 ? 2 : 20}), "5.5.5." + who.at(-1).charCodeAt(0));
assert.strictEqual(r.counted, true, JSON.stringify(r));
const tsum = await fresh();
assert.deepStrictEqual(tsum.times["42"], [[0, 0.67, 3], [18, 1.33, 3]], JSON.stringify(tsum.times));
[s] = await post(run("t00000000000004d", 1000, {hour: 99}), "5.5.6.1");
assert.strictEqual(s, 200, "a junk hour is dropped, not refused");
// deaths: kept per run, a median per player per hour in the summary
[s] = await post(run("kkkkkkkkkkkkkkkk1", 1000, {deaths: 2}));
[s] = await post(run("kkkkkkkkkkkkkkkk1", 1000, {deaths: 4}));
assert.strictEqual((await fresh()).rows.find(x => x.deathsHr != null && x.runs === 2 && x.deathsHr === 12).expHr, 4000, "deaths/hr: median of 8 and 16");
// potions/arrows spent: a median per player per hour; a tracker that saw no item counts sends null (left out, not 0)
[s] = await post(run("uuuuuuuuuuuuuuu1", 1000, {usedCost: 300}), "4.4.4.1");
[s] = await post(run("uuuuuuuuuuuuuuu1", 1000, {usedCost: 500}), "4.4.4.1");
[s] = await post(run("uuuuuuuuuuuuuuu2", 1000, {usedCost: null}), "4.4.4.2");
const us = (await fresh()).rows.filter(x => x.usedHr != null);
assert.deepStrictEqual(us.map(x => x.usedHr), [1600], JSON.stringify(us));
// junk counts are clamped: negative items dropped, a monster's kills no more than the run's
[s, r] = await post(run("iiiiiiiiiiiiiiii1", 1000, {mobs: [{id: "3", kills: 1e9, mesos: -5, items: {"4000000": -3, "4000001": 2}}, null]}));
assert.strictEqual(s, 200);
const cached = await (await worker.fetch(new Request("https://x/api/summary"), env)).json();
assert.strictEqual(cached.mobs["3"], undefined, "summary kept for 5 minutes");
const bad = (await fresh()).mobs["3"];
assert.strictEqual(bad.kills, 100); assert.strictEqual(bad.mesos, 0); assert.deepStrictEqual(bad.items, {"4000001": 2});
// attack-style input: "__proto__" ids on an unknown map, non-text names. Never crashes the summary or touches Object.prototype
[s] = await post(run("llllllllllllllll1", 1000, {map: 99999999, mobs: [{id: "__proto__", kills: 5, items: {"__proto__": 3, "4000000": 1}}, {id: "constructor"}]}));
assert.strictEqual(s, 200);
[s] = await post(run("llllllllllllllll1", 1000, {map: 99999999, mapName: {toString: 1}, job: ["x"]}));
assert.strictEqual(s, 200, "object map name: stored without a name, no crash");
const after = await fresh();
assert.strictEqual(({}).kills, undefined); assert.ok(after.runs > 0 && !("__proto__" in JSON.parse(JSON.stringify(after.mobs)) && after.mobs.__proto__?.kills));
assert.strictEqual((await worker.fetch(new Request("https://x/api/runs", {method: "POST", body: "{"}), env)).status, 400);
// party view
const party = (body, ip = "10.1.0." + body.install.slice(-1)) => worker.fetch(new Request("https://x/api/party", {method: "POST", body: JSON.stringify(body), headers: {"cf-connecting-ip": ip}}), env).then(async r => [r.status, await r.json()]);
[s, r] = await party({install: "pppppppppppppp01", partyCode: "Snails", nick: "Danny<b>", job: "Cleric", level: 31, expHr: 50000});
assert.strictEqual(s, 200); assert.strictEqual(r.members.length, 1); assert.strictEqual(r.members[0].nick, "Dannyb"); assert.ok(r.members[0].you);
[s, r] = await party({install: "pppppppppppppp02", partyCode: "snails ", job: "Hunter", level: 30, expHr: 40000});
assert.strictEqual(r.members.length, 2); assert.strictEqual(r.expHr, 90000); assert.strictEqual(r.members.filter(m => m.you).length, 1);
assert.ok(!JSON.stringify(r).includes("pppppp"), "no install ids back");
[s] = await party({install: "pppppppppppppp01", partyCode: "Snails", expHr: 1});
assert.strictEqual(s, 429, "at most every 20 s");
[s, r] = await party({install: "pppppppppppppp03", partyCode: "other", expHr: 1});
assert.strictEqual(r.members.length, 1, "other code, other party");
for (let i = 4; i <= 8; i++) [s] = await party({install: "pppppppppppppp0" + i, partyCode: "snails"});
assert.strictEqual(s, 429, "7th member refused");
[s] = await party({install: "pppppppppppppp09"});
assert.strictEqual(s, 400, "no code");
for (let i = 1; i <= 7; i++) [s] = await party({install: "qqqqqqqqqqqqqq0" + i, partyCode: "q" + i}, "8.8.8.8");
assert.strictEqual(s, 429, "7 trackers from one IP");

// KPQ leaderboard: rounds per mode, one line per party code or player, best clear first; a party's 4 trackers sending the
// same round count it once; broken times are kept but not counted
const kpost = (body, ip) => worker.fetch(new Request("https://x/api/kpq", {method: "POST", body: JSON.stringify(body), headers: {"cf-connecting-ip": ip}}), env).then(async r => [r.status, await r.json()]);
const kr = (install, clear, extra = {}) => ({kpq: true, install, date: "2026-10-18", hour: 20, mode: "Bonus", party: 4, level: 25, job: "Hunter", clear, total: clear + 60, clock: true,
  exp: 9000, mesos: 300, stages: {"80000000": 60, "80000100": 60, "80000200": 60, "80000300": 60, "80000400": clear - 250}, ...extra});
for (let i = 1; i <= 4; i++){ [s, r] = await kpost(kr("kpqparty0000000" + i, 400, {partyCode: "Slimes"}), "20.0.0." + i); assert.ok(r.counted, JSON.stringify(r)) }
for (let i = 1; i <= 4; i++) [s, r] = await kpost(kr("kpqparty0000000" + i, 500, {partyCode: "slimes"}), "20.0.0." + i);
[s, r] = await kpost(kr("kpqsolo000000001", 900, {party: 1}), "21.0.0.1");
[s, r] = await kpost(kr("kpqsolo000000002", 700, {mode: "Rush"}), "21.0.0.2");
[s, r] = await kpost(kr("kpqsolo000000003", 30), "21.0.0.3"); assert.ok(!r.counted && r.why === "clear time", "30 s round not counted: " + JSON.stringify([s, r]));
[s, r] = await kpost(kr("kpqsolo000000004", 400, {stages: {"80000100": 60}}), "21.0.0.4"); assert.strictEqual(r.why, "stages missing");
[s] = await kpost({install: "x"}, "21.0.0.5"); assert.strictEqual(s, 400);
const kb = (await fresh()).kpq;
assert.strictEqual(kb.rounds, 10); assert.strictEqual(kb.board.Bonus.length, 2); assert.strictEqual(kb.board.Rush.length, 1);
assert.deepStrictEqual([kb.board.Bonus[0].best, kb.board.Bonus[0].rounds, kb.board.Bonus[0].median, kb.board.Bonus[0].party], [400, 2, 450, 4]);
assert.strictEqual(kb.board.Bonus[1].best, 900);
assert.ok(!JSON.stringify(kb).includes("kpqparty"), "no install ids in the board");
for (let i = 0; i < 13; i++) [s] = await kpost(kr("kpqsolo000000009", 600 + i, {party: 1}), "22.0.0.1");
assert.strictEqual(s, 429, "13th round in an hour refused");
console.log("server tests passed");
