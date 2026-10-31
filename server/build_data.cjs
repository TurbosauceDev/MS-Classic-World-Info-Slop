// data/data.json -> src/gamedata.json: which monsters live on which map and their base EXP, for the run checks; items = every item id with its NPC price (shop rows are checked against the ids).
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/data.json"), "utf8"));
const maps = {}, mobs = {};
for (const [id, m] of Object.entries(D.maps)) maps[id] = (m[2] || []).map(([mob]) => String(mob));
const mapnames = {...D.mapnames};
for (const k of D.kpq || []) if (k.mob?.length && !maps[k.id]){ maps[k.id] = [...new Set(k.mob.map(([id]) => String(id)))]; mapnames[k.id] = k.name }   // KPQ stages (bonus stage)
for (const [mob, , , , exp, map, mapName] of D.timed || []){   // bosses / timed spawns, on their maps
  if (!maps[map]){ maps[map] = []; mapnames[map] = mapnames[map] || mapName }
  if (!maps[map].includes(String(mob))){ maps[map].push(String(mob)); mobs[mob] = exp }
}
for (const ids of Object.values(maps)) for (const id of ids) mobs[id] = mobs[id] || D.mobs[id]?.[3] || D.mobdb?.[id]?.exp || 0;   // KPQ monsters are only in mobdb
fs.writeFileSync(path.join(__dirname, "src/gamedata.json"), JSON.stringify({maps, mobs, mapnames, exp: D.exp, items: Object.fromEntries(Object.entries(D.items).map(([id, it]) => [id, it.p || 0]))}));
console.log("gamedata.json", Object.keys(maps).length, "maps", Object.keys(mobs).length, "monsters");
