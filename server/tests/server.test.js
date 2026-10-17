// node tests/server.test.js — the Worker against an in-memory SQLite stand-in for D1 (node:sqlite)
import assert from "assert";
import {readFileSync} from "fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../src/index.js";

const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const DB = {prepare(q){ let args = []; const st = sql.prepare(q); return {
  bind(...a){ args = a; return this }, async first(){ return st.get(...args) ?? null }, async run(){ st.run(...args); return {} },
  async all(){ return {results: st.all(...args)} } } }};
const env = {DB};
const post = (body, ip = "1.2.3.4") => worker.fetch(new Request("https://x/api/runs", {method: "POST", body: JSON.stringify(body), headers: {"cf-connecting-ip": ip}}), env).then(async r => [r.status, await r.json()]);

// Snail Hunting Ground III (42): Snail, Blue Snail, Red Snail
const run = (install, exp, extra = {}) => ({install, date: "2026-10-17", map: 42, party: 1, level: 12, job: "Magician", minutes: 15, exp, msgExp: exp, barExp: exp,
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
[s, r] = await post(run("dddddddddddddddd4", 2000, {minutes: 3}));
assert.strictEqual(s, 400);
for (let i = 0; i < 7; i++) [s] = await post(run("eeeeeeeeeeeeeeee5", 500));
assert.strictEqual(s, 429, "7th run in an hour is refused");

[s, r] = await post(run("ffffffffffffffff6", 1000, {map: 80000500, mapName: "1st Accompaniment <Bonus>", party: 4, mobs: [{id: "19", kills: 10, items: {}}]}));
assert.strictEqual(r.counted, true, "KPQ bonus stage with Horny Mushrooms");
[s, r] = await post(run("ffffffffffffffff6", 1000, {map: 99999999, mapName: "Somewhere New", mobs: []}));
assert.strictEqual(s, 200, "unknown map id: kept under its name");
const sum = await (await worker.fetch(new Request("https://x/api/summary"), env)).json();
const a = sum.rows.find(x => x.expHr === 4400);   // player 1: median of 4000 and 4800 EXP/hr
assert.ok(a && a.runs === 2 && a.map === "42");
assert.strictEqual(sum.players, 3, "only counted runs: players 1, 5 and 6");
assert.ok(sum.rows.some(x => x.map === null && x.mapName === "Somewhere New"));
assert.strictEqual(sum.mobs["2"].items["4000019"], 3 * 2 + 3 * 6);
assert.ok(!JSON.stringify(sum).includes("aaaaaaaa"), "no install ids in the summary");
console.log("server tests passed");
