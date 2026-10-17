/* Grind session tracker: turns what the screen readers saw (timestamped events) into rates. Pure logic, no screen or DOM,
   so it runs the same in the Windows app and in Node tests. Game data comes from tracker/app/gamedata.json (built from
   data/data.json by tracker/build_data.js).

   Events (t = ms since epoch):
     {t, type: "exp",   gain}             one "You received EXP (+gain)" message = one kill (yours or a party member's)
     {t, type: "bonus", gain}             "Bonus EXP for PARTY (+gain)": EXP, not a kill
     {t, type: "bar",   exp, level?}      EXP bar reading: current EXP into the level (and level, when worked out)
     {t, type: "itemraw", text}           an item pickup line whose item name couldn't be read yet
     {t, type: "meso",  amount}           meso pickup message
     {t, type: "item",  id, qty?}         item pickup message (id resolved by the reader from the item name)
     {t, type: "map",   id}               map read from the minimap
     {t, type: "party", size}             party size from the party HP bars (1 = solo)
     {t, type: "job",   name}             class read from the screen
   Rates use active time only: any gap of more than IDLE_MS with no EXP, meso or item event is left out. */
(function (root){
  const IDLE_MS = 60000;
  // party EXP (same model as the planner, src/js/10-maps.js): even split, +10/20/30% at 2/3/4+ players
  const partyBonus = n => [0, 0, 0.1, 0.2, 0.3, 0.3, 0.3][n] || 0;

  function createSession(G, opts = {}){
    const idleMs = opts.idleMs || IDLE_MS;
    const S = {start: null, last: null, activeMs: 0, map: null, party: 1, job: null, level: null,
      msgExp: 0, barExp: 0, kills: 0, mesos: 0, byMob: {}, items: {}, unreadItems: 0, otherExp: 0, bar: null, lastKillMob: null, events: 0};

    // which monster on this map gives this much EXP? Exact base EXP first, then the party share, then nearest within 15%.
    function matchMob(gain){
      const mobs = (G.maps[S.map]?.[2] || []).map(([id]) => id);
      const share = S.party > 1 ? (1 + partyBonus(S.party)) / S.party : 1;
      let best = null, bestErr = Infinity;
      for (const id of mobs){
        const base = G.mobs[id]?.[3]; if (!base) continue;
        for (const f of share === 1 ? [1] : [1, share]){
          const err = Math.abs(base * f - gain) / (base * f);
          if (err < bestErr){ bestErr = err; best = id }
        }
      }
      return bestErr <= 0.15 ? best : null;
    }
    const mob = id => S.byMob[id] || (S.byMob[id] = {kills: 0, exp: 0, mesos: 0, mesoDrops: 0, items: {}});

    function add(e){
      S.events++;
      if (S.start === null) S.start = e.t;
      const counts = ["exp", "bonus", "meso", "item", "itemraw", "bar"].includes(e.type);
      if (counts && S.last !== null){ const gap = e.t - S.last; S.activeMs += gap > idleMs ? 0 : gap }
      if (counts) S.last = e.t;
      switch (e.type){
        case "map": S.map = String(e.id); break;
        case "party": S.party = Math.max(1, e.size | 0); break;
        case "job": S.job = e.name; break;
        case "exp": {
          S.msgExp += e.gain;
          if (!G.maps[S.map]){ S.kills++; S.lastKillMob = null; break }   // map not known: a kill, monster unknown
          const id = matchMob(e.gain);
          if (id){ const m = mob(id); m.kills++; m.exp += e.gain; S.kills++; S.lastKillMob = id }
          else S.otherExp += e.gain;   // fits no monster here: quest reward etc.
          break;
        }
        case "bonus": S.msgExp += e.gain; break;
        case "itemraw": S.unreadItems++; break;
        case "bar": {
          if (e.level) S.level = e.level;
          const p = S.bar;
          if (p){
            let d = e.exp - p.exp;
            if (d < 0 && e.level && p.level && e.level > p.level) d = (G.exp[p.level] || 0) - p.exp + e.exp;   // leveled up
            if (d > 0) S.barExp += d;   // a drop without a level-up (death) is just skipped
          }
          S.bar = {t: e.t, exp: e.exp, level: S.level}; break;
        }
        case "meso":
          S.mesos += e.amount;
          // credited to the last monster killed: exact on one-monster maps, a guess where several share the map
          if (S.lastKillMob){ const m = mob(S.lastKillMob); m.mesos += e.amount; m.mesoDrops++ }
          break;
        case "item": {
          const q = e.qty || 1, id = String(e.id);
          S.items[id] = (S.items[id] || 0) + q;
          if (S.lastKillMob){ const m = mob(S.lastKillMob); m.items[id] = (m.items[id] || 0) + q }
          break;
        }
      }
      return S;
    }

    // market value of one item: player-shop median (meso.watch), else NPC sell price
    const worth = id => G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;

    function stats(){
      const hrs = S.activeMs / 3.6e6, per = v => hrs > 0 ? v / hrs : 0;
      // EXP/hr: from the EXP bar when it's being read (counts every source), else the EXP messages
      const exp = S.barExp || S.msgExp;
      const expHr = per(exp);
      const need = S.bar && S.level ? G.exp[S.level] : null;
      const toLevelHrs = need && expHr > 0 ? Math.max(0, need - S.bar.exp) / expHr : null;
      const items = Object.entries(S.items).map(([id, n]) => ({id, name: G.items[id]?.n || "Item " + id, n, each: worth(id), total: worth(id) * n}))
        .sort((a, b) => b.total - a.total);
      const lootValue = items.reduce((a, b) => a + b.total, 0);
      const mobs = Object.entries(S.byMob).map(([id, m]) => ({id, name: G.mobs[id]?.[0] || "Monster " + id, ...m,
        mesoPerKill: m.kills ? m.mesos / m.kills : 0})).sort((a, b) => b.kills - a.kills);
      return {activeMin: S.activeMs / 6e4, map: S.map, mapName: G.mapnames?.[S.map] || G.maps[S.map]?.[0] || null, party: S.party,
        job: S.job, level: S.level, kills: S.kills, killsHr: per(S.kills), exp, expHr, toLevelHrs, otherExp: S.otherExp,
        mesos: S.mesos, mesosHr: per(S.mesos), mesoPerKill: S.kills ? S.mesos / S.kills : 0, unreadItems: S.unreadItems, lootValue, lootHr: per(lootValue), items, mobs};
    }

    // anonymous summary for the shared drop tables (no character name, no timestamps beyond the date)
    function shareable(){
      const s = stats();
      return {v: 1, date: new Date(S.start || Date.now()).toISOString().slice(0, 10), map: s.map, party: s.party, job: s.job,
        level: s.level, activeMin: Math.round(s.activeMin * 10) / 10, kills: s.kills, exp: s.exp, mesos: s.mesos,
        mobs: s.mobs.map(m => ({id: m.id, kills: m.kills, mesos: m.mesos, mesoDrops: m.mesoDrops, items: m.items}))};
    }

    return {add, stats, shareable, state: S};
  }

  const api = {createSession, IDLE_MS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindSession = api;
})(typeof window !== "undefined" ? window : globalThis);
