// data/data.json (the site's data) -> app/gamedata.json: only what the tracker needs. Run after build_data.py changes.
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/data.json"), "utf8"));
const items = {};
for (const [id, it] of Object.entries(D.items)) items[id] = {n: it.n, p: it.p || 0, c: it.c};
const G = {
  mobs: Object.fromEntries(Object.entries(D.mobs).map(([id, m]) => [id, m.slice(0, 4)])),   // [name, level, hp, exp]
  maps: D.maps, mapnames: D.mapnames, exp: D.exp, items, pw: D.pw?.it || {}, pwRead: D.pw?.read || null,
};
// KPQ stages aren't in D.maps (the site's grind maps): add the ones with monsters, e.g. the bonus stage players grind
for (const k of D.kpq || []){
  if (!k.mob?.length || G.maps[k.id]) continue;
  const n = {}; for (const [id] of k.mob) n[id] = (n[id] || 0) + 1;
  G.maps[k.id] = [k.name, 1, Object.entries(n).map(([id, c]) => [+id, c])];
  G.mapnames = {...G.mapnames, [k.id]: k.name};
}
// timed spawns (bosses and slow respawns; D.timed rows [mob, name, level, hp, exp, map, mapName, count, respawn s, boss]):
// map -> [[mob, respawn s, boss]]; those monsters join their map's list so their kills are recognised
G.timed = {};
for (const [mob, name, level, hp, exp, map, mapName, , sec, boss] of D.timed || []){
  if (!G.maps[map]){ G.maps[map] = [mapName, 1, []]; G.mapnames = {...G.mapnames, [map]: G.mapnames[map] || mapName} }
  if (!G.mobs[mob]) G.mobs[mob] = [name, level, hp, exp];   // bosses aren't in D.mobs
  (G.timed[map] = G.timed[map] || []).push([String(mob), sec, boss]);
  if (G.maps[map] && !G.maps[map][2].some(([id]) => String(id) === String(mob))) G.maps[map] = [G.maps[map][0], G.maps[map][1], [...G.maps[map][2], [+mob, 0]]];
}
// monsters only in the site's monster pages (KPQ stages: Ligator, Curse Eye, King Slime...): same [name, level, hp, exp]
for (const [, , list] of Object.values(G.maps)) for (const [id] of list){ const m = D.mobdb?.[id]; if (!G.mobs[id] && m) G.mobs[id] = [m.name, m.level, m.hp, m.exp] }
// items used up while farming (potions, food, arrows, throwing stars): icons for reading their counts on the quick slots
// and in the Use tab, and the lowest NPC shop price (D.ishop) for their cost
const used = Object.entries(D.items).filter(([id, it]) => /^20(60|61|70)/.test(id) || ["hp", "mp", "hpR", "mpR"].some(k => it.sp?.[k])).map(([id]) => id);
G.icons = Object.fromEntries(used.filter(id => D.iicons[id]).map(id => [id, D.iicons[id]]));
G.buy = Object.fromEntries(used.map(id => [id, Math.min(...(D.ishop[id] || []).map(s => s[3]).filter(p => p > 0))]).filter(([, p]) => isFinite(p)));
// plain arrows aren't in our shop data: Danny's price, 2 arrows = 1 meso (2026-10-17). Bronze arrows are 2 each (shop data, matches him)
for (const id of ["2060000", "2061000"]) G.buy[id] ??= 0.5;
fs.writeFileSync(path.join(__dirname, "app/gamedata.json"), JSON.stringify(G));   // tests
fs.writeFileSync(path.join(__dirname, "app/gamedata.js"), "const GAMEDATA = " + JSON.stringify(G) + ";\n");   // the app (no fetch of file: URLs)
// the site's screenshot reader (game digit font, un-doubling, icon matching) is shared, not forked
fs.copyFileSync(path.join(__dirname, "../src/js/51-shot.js"), path.join(__dirname, "app/shot.js"));
console.log("gamedata.json", (JSON.stringify(G).length / 1024).toFixed(0), "KB");
