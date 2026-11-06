/* data/data.json (the site's data, D) -> the tracker's game data (G): only what the tracker needs. Pure, no files, so the
   app build (build_data.js) and the site's live EXP/hr reader (src/js/63-expclive.js, inlined by build.py) make the same G. */
(function (root){
  function toGamedata(D){
    const items = {};
    for (const [id, it] of Object.entries(D.items)) items[id] = {n: it.n, p: it.p || 0, c: it.c};
    // towns (0.3.47, Danny 2026-11-05): a map the game database names but never spawns a monster on. D.maps misses some grind
    // maps (30, 10001002, B1/B3 <Area 1>...), so D.mobdb's spawn maps count too. Computed before the KPQ/timed additions below
    const spawn = new Set(Object.keys(D.maps));
    for (const m of Object.values(D.mobdb || {})){ for (const r of m.maps || []) spawn.add(String(r[0])); for (const k of Object.keys(m.sp || {})) spawn.add(String(k)) }
    const kpqIds = new Set((D.kpq || []).map(k => String(k.id)));
    const towns = Object.keys(D.mapnames).filter(id => !spawn.has(id) && !kpqIds.has(id)).sort((x, y) => x - y);
    const G = {
      mobs: Object.fromEntries(Object.entries(D.mobs).map(([id, m]) => [id, m.slice(0, 4)])),   // [name, level, hp, exp]
      maps: D.maps, mapnames: D.mapnames, exp: D.exp, items, pw: D.pw?.it || {}, pwRead: D.pw?.read || null,
    };
    // KPQ stages aren't in D.maps (the site's grind maps): every stage's name is known (the minimap OCR matches it: KPQ runs
    // are spotted by these ids, G.kpq), and the ones with monsters are added as maps, e.g. the bonus stage players grind
    G.towns = towns;
    G.kpq = (D.kpq || []).map(k => k.id);
    for (const k of D.kpq || []) G.mapnames = {...G.mapnames, [k.id]: k.name};
    for (const k of D.kpq || []){
      if (G.maps[k.id]) continue;
      // stages without monsters (2-4, Exit) are maps too, with none: EXP there is stage-clear EXP, not kills
      if (!k.mob?.length){ G.maps[k.id] = [k.name, 1, []]; continue }
      const n = {}; for (const [id] of k.mob) n[id] = (n[id] || 0) + 1;
      G.maps[k.id] = [k.name, 1, Object.entries(n).map(([id, c]) => [+id, c])];
      G.mapnames = {...G.mapnames, [k.id]: k.name};
    }
    // mob -> items players have seen it drop (meowdb reports, D.drops item -> [[mob, reports]]): picks the item when a pickup
    // line's name fits several. KPQ's own items (Coupon, Pass) on the KPQ stages
    G.drops = {};
    for (const [item, list] of Object.entries(D.drops || {})) for (const [mob] of list) (G.drops[mob] = G.drops[mob] || []).push(item);
    G.kpqItems = ["4001001", "4001002"];
    // quests for the shared quest-window reader (60b-questread.js / P1-7): the same rows the site's Quest log matches
    // against, trimmed to what matching needs. The three regions the site's Quest log leaves out are left out here too
    const OUT_REGIONS = ["El Nath", "Orbis", "Forgotten Hollow"], qrow = r => ({id: r.id, name: r.name, ln: r.ln, chain: r.chain, region: r.region, lvl: r.lvl, cpos: r.cpos});
    G.quests = (D.quests || []).filter(r => !OUT_REGIONS.includes(r.region)).map(qrow);
    G.citq = (D.citq || []).filter(r => !OUT_REGIONS.includes(r.region)).map(qrow);
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
    // every Equip / Use / Etc item's picture, for reading the inventory window (readers.js readInventory)
    G.iicons = Object.fromEntries(Object.entries(D.iicons).filter(([id]) => ["Equipment", "Consumable", "Scroll", "Etc"].includes(D.items[id]?.c)));
    G.buy = Object.fromEntries(used.map(id => [id, Math.min(...(D.ishop[id] || []).map(s => s[3]).filter(p => p > 0))]).filter(([, p]) => isFinite(p)));
    // plain arrows aren't in our shop data: Danny's price, 2 arrows = 1 meso (2026-10-17). Bronze arrows are 2 each (shop data, matches him)
    for (const id of ["2060000", "2061000"]) G.buy[id] ??= 0.5;
    // Map & spawns card: per map the minimap picture, its size, exits ([x, y, dest, hidden] as minimap fractions) and each
    // monster's spawn points ({mob: [[x, y]]}, D.mobdb[mob].sp[map]); only maps the tracker knows
    G.mmType = D.mmapType || "webp"; G.geo = {};
    for (const mid of Object.keys(G.maps)){
      if (!D.mmaps?.[mid]) continue;
      const sp = {};
      for (const [id] of G.maps[mid][2]){ const pts = D.mobdb?.[id]?.sp?.[mid]; if (pts?.length) sp[id] = pts }
      G.geo[mid] = {mm: D.mmaps[mid], d: D.mmdim?.[mid] || [0, 0], p: D.portals?.[mid] || [], sp};
    }
    return G;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = {toGamedata}; else root.GrindGamedata = {toGamedata};
})(typeof window !== "undefined" ? window : globalThis);
