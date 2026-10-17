// data/data.json -> src/gamedata.json: which monsters live on which map and their base EXP, for the run checks.
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/data.json"), "utf8"));
const maps = {}, mobs = {};
for (const [id, m] of Object.entries(D.maps)) maps[id] = (m[2] || []).map(([mob]) => String(mob));
const mapnames = {...D.mapnames};
for (const k of D.kpq || []) if (k.mob?.length && !maps[k.id]){ maps[k.id] = [...new Set(k.mob.map(([id]) => String(id)))]; mapnames[k.id] = k.name }   // KPQ stages (bonus stage)
for (const ids of Object.values(maps)) for (const id of ids) mobs[id] = D.mobs[id]?.[3] || 0;
fs.writeFileSync(path.join(__dirname, "src/gamedata.json"), JSON.stringify({maps, mobs, mapnames, exp: D.exp}));
console.log("gamedata.json", Object.keys(maps).length, "maps", Object.keys(mobs).length, "monsters");
