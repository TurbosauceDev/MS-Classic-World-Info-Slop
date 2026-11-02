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
// timed spawns for the boss-spot checks (0.3.30): map -> [[mob id, respawn seconds, boss flag], ...], plus mob names
const timed = {}, mobnames = {};
for (const [mob, name, , , , map, , , sec, boss] of D.timed || []){
  (timed[map] = timed[map] || []).push([String(mob), sec || 3600, boss ? 1 : 0]);
  mobnames[String(mob)] = name;
}
// per-map physics ceilings for the weekly ladder's auto-flag pass (P1-5, 2026-11-02): every spawn point on the
// map yielding a kill at most every 15 s (240/hour) times the mob's base EXP, summed over the mobs with spawn
// data (OSMS, D.mobdb[mob].sp[map]). Optimistic on purpose; a map with no spawn data at all is left out —
// server/src/check.js mapCeiling only ever FLAGS a ladder line with this, never refuses a run.
const CEIL_KILLS_PER_SPAWN_HR = 240, ceils = {};
for (const [map, ids] of Object.entries(maps)){
  let total = 0, seen = false;
  for (const id of ids){
    const sp = D.mobdb?.[id]?.sp?.[map];
    if (!Array.isArray(sp) || !sp.length) continue;
    const exp = mobs[id] || D.mobs[id]?.[3] || D.mobdb?.[id]?.exp || 0;
    if (exp <= 0) continue;
    seen = true; total += sp.length * exp * CEIL_KILLS_PER_SPAWN_HR;
  }
  if (seen) ceils[map] = total;
}
fs.writeFileSync(path.join(__dirname, "src/gamedata.json"), JSON.stringify({maps, mobs, mapnames, exp: D.exp, items: Object.fromEntries(Object.entries(D.items).map(([id, it]) => [id, it.p || 0])), timed, mobnames, ceils}));
console.log("gamedata.json", Object.keys(maps).length, "maps", Object.keys(mobs).length, "monsters", Object.keys(timed).length, "timed maps", Object.keys(ceils).length, "ceilings");
