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
     {t, type: "map",   id, name?}        map read from the minimap (id null: a map our data doesn't have, name as read)
     {t, type: "party", size}             party size from the party HP bars (1 = solo)
     {t, type: "job",   name}             class read from the screen
   Rates use active time only: any gap of more than IDLE_MS with no EXP, meso or item event is left out. */
(function (root){
  const IDLE_MS = 60000, RECENT_MS = 5 * 60e3;
  function createSession(G, opts = {}){
    const idleMs = opts.idleMs || IDLE_MS;
    const S = {start: null, last: null, activeMs: 0, map: null, party: 1, job: null, level: null,
      msgExp: 0, barExp: 0, recent: [], kills: 0, timedKills: {}, mesos: 0, byMob: {}, items: {}, unreadItems: 0, otherExp: 0, bar: null, lastKillMob: null, events: 0};

    /* which monster on this map gives this much EXP? Solo: its base EXP (within 15%). In a party the kill message is only
       your part: in Danny's KPQ bonus frames (party of 4, Horny/Green Mushroom, 41/26 base) it read +7 and +15, so the split
       isn't even (the party bonus comes as its own line). There a kill is the monster only when just one monster on the
       map gives that much; otherwise it's a kill with the monster unknown ("?"). More than any monster gives = not a kill. */
    function matchMob(gain){
      const mobs = (G.maps[S.map]?.[2] || []).map(([id]) => String(id)).filter(id => G.mobs[id]?.[3]);
      const base = id => G.mobs[id][3];
      if (S.party <= 1){
        let best = null, bestErr = Infinity;
        for (const id of mobs){ const err = Math.abs(base(id) - gain) / base(id); if (err < bestErr){ bestErr = err; best = id } }
        return bestErr <= 0.15 ? best : null;
      }
      // a boss on the map fits almost any small share: only count it when no regular monster gives that much
      const regular = mobs.filter(id => !timed(id)), fitsReg = regular.filter(id => gain <= base(id) * 1.05);
      const fits = fitsReg.length ? fitsReg : mobs.filter(id => gain <= base(id) * 1.05);
      if (!fits.length) return null;
      const exact = fits.filter(id => Math.abs(base(id) - gain) / base(id) <= 0.03);
      return exact.length === 1 ? exact[0] : fits.length === 1 ? fits[0] : "?";
    }
    // monsters on this map with a long respawn (bosses etc.), from the game data
    const timed = id => (G.timed?.[S.map] || []).find(([m]) => m === String(id));
    // respawn timers for this map: when each timed monster was last killed here and when it's due back
    function respawns(now){
      return (G.timed?.[S.map] || []).map(([id, sec, boss]) => { const k = S.timedKills[id];
        return {id, name: G.mobs[id]?.[0] || "Monster " + id, sec, boss: !!boss, killed: k || null, dueIn: k ? Math.max(0, k + sec * 1000 - now) : null} });
    }
    const mob = id => S.byMob[id] || (S.byMob[id] = {kills: 0, exp: 0, mesos: 0, mesoDrops: 0, items: {}});

    function add(e){
      S.events++;
      if (S.start === null) S.start = e.t;
      const counts = ["exp", "bonus", "meso", "item", "itemraw", "bar"].includes(e.type);
      if (counts && S.last !== null){ const gap = e.t - S.last; S.activeMs += gap > idleMs || gap < 0 ? 0 : gap }   // < 0: the PC clock went back
      if (counts) S.last = e.t;
      switch (e.type){
        case "map": S.map = e.id == null ? null : String(e.id); S.mapName = e.name || null; break;
        case "party": S.party = Math.max(1, e.size | 0); break;
        case "job": S.job = e.name; break;
        case "exp": {
          S.msgExp += e.gain;
          if (!G.maps[S.map]){ S.kills++; S.lastKillMob = null; break }   // map not known: a kill, monster unknown
          const id = matchMob(e.gain);
          if (id === "?"){ S.kills++; S.lastKillMob = null }   // a party kill, monster unknown
          else if (id){ const m = mob(id); m.kills++; m.exp += e.gain; S.kills++; S.lastKillMob = id; if (timed(id)) S.timedKills[id] = e.t }
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
            // leveled up: the level says so, or (just after a level-up, when the % is too small to work the level out)
            // the bar was at 90%+ and fell to under half of that; a death only takes a few %
            const up = e.level && p.level ? e.level > p.level : p.level && p.pct >= 90 && e.exp < p.exp * 0.5;
            if (d < 0 && up){ d = (G.exp[p.level] || 0) - p.exp + e.exp; if (!e.level) S.level = p.level + 1 }
            if (d > 0) S.barExp += d;   // a drop without a level-up (death) is just skipped
          }
          S.bar = {t: e.t, exp: e.exp, pct: e.pct, level: S.level}; break;
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
      // EXP so far at this moment, for the last-5-minutes rate
      if (counts){ S.recent.push([e.t, S.barExp, S.msgExp]); while (S.recent.length > 2 && S.recent[1][0] < e.t - RECENT_MS) S.recent.shift() }
      return S;
    }

    // market value of one item: player-shop median (meso.watch), else NPC sell price
    const worth = id => G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;

    // EXP/hr over the last 5 minutes (wall time, breaks included): how you're doing right now
    function recentExpHr(){
      const r = S.recent; if (r.length < 2) return null;
      const a = r.find(p => p[0] >= S.last - RECENT_MS) || r[0], b = r[r.length - 1], ms = b[0] - a[0];
      if (ms < 60e3) return null;
      const gain = b[1] > a[1] || S.barExp ? b[1] - a[1] : b[2] - a[2];
      return gain / ms * 3.6e6;
    }

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
      return {activeMin: S.activeMs / 6e4, map: S.map, mapName: G.mapnames?.[S.map] || G.maps[S.map]?.[0] || S.mapName || null, party: S.party,
        job: S.job, level: S.level, kills: S.kills, killsHr: per(S.kills), exp, expHr, toLevelHrs, otherExp: S.otherExp,
        // share of the bar's EXP that showed up as readable messages: below ~70%, kills/mesos/drops are undercounted
        readShare: S.barExp > 0 ? Math.min(1, S.msgExp / S.barExp) : null,
        // kills if the missed lines were kills at the same rate as the ones read (an estimate; only from 20% read up)
        killsEstHr: S.barExp > 0 && S.msgExp / S.barExp >= 0.2 && S.msgExp < S.barExp ? per(S.kills * S.barExp / S.msgExp) : null,
        expHr5: recentExpHr(),
        mesos: S.mesos, mesosHr: per(S.mesos), mesoPerKill: S.kills ? S.mesos / S.kills : 0, unreadItems: S.unreadItems, lootValue, lootHr: per(lootValue), items, mobs};
    }

    // anonymous summary for the shared drop tables (no character name, no timestamps beyond the date)
    function shareable(){
      const s = stats();
      return {v: 1, date: new Date(S.start || Date.now()).toISOString().slice(0, 10), map: s.map, mapName: s.mapName, party: s.party, job: s.job,
        level: s.level, activeMin: Math.round(s.activeMin * 10) / 10, kills: s.kills, exp: s.exp, mesos: s.mesos,
        msgExp: S.msgExp, barExp: S.barExp, readShare: s.readShare, otherExp: S.otherExp, unreadItems: S.unreadItems, items: S.items,
        mobs: s.mobs.map(m => ({id: m.id, kills: m.kills, mesos: m.mesos, mesoDrops: m.mesoDrops, items: m.items}))};
    }

    return {add, stats, shareable, respawns, state: S};
  }

  /* Shared runs (the same rules as beanguri's Maple Classic Exp Overlay): 15 minutes of non-stop farming on one map with
     the same party. A map or party change, or a break longer than idleMs, starts a new run; a finished run goes to onRun. */
  const RUN_MS = 15 * 60e3;
  function createRunSlicer(G, opts = {}){
    const idleMs = opts.idleMs || IDLE_MS, runMs = opts.runMs || RUN_MS, onRun = opts.onRun || (() => {});
    let cur = null, last = null, bar = null;
    const ctx = {};   // latest map / party / job, carried into each new run
    // a new run at time t; after a finished run the last bar reading is its EXP baseline (not after a break)
    function fresh(t, keepBar){
      cur = createSession(G, {idleMs});
      for (const e of Object.values(ctx)) cur.add({...e, t});
      if (keepBar && bar) cur.add({...bar, t});
    }
    const same = (a, b) => JSON.stringify({...a, t: 0}) === JSON.stringify({...b, t: 0});
    function add(e){
      if (e.type === "map" || e.type === "party" || e.type === "job"){
        const was = ctx[e.type]; ctx[e.type] = e;
        if (!cur || e.type !== "job" && was && !same(was, e)) fresh(e.t, false); else cur.add(e);
        return;
      }
      const counts = ["exp", "bonus", "meso", "item", "itemraw", "bar"].includes(e.type);
      if (!cur || counts && last !== null && e.t - last > idleMs) fresh(e.t, false);
      cur.add(e);
      if (counts) last = e.t;
      if (e.type === "bar") bar = e;
      const S = cur.state;
      if (S.last !== null && S.last - S.start >= runMs){
        onRun({...cur.shareable(), minutes: Math.round((S.last - S.start) / 6e3) / 10});
        fresh(e.t, true);
      }
    }
    return {add, get current(){ return cur }};
  }

  /* Speed check for a finished run against the shared data (server /api/summary rows: one per player per map, their
     typical run). Peers = players within 5 levels, solo vs party the same as you. A map counts once 3+ players have farmed
     it, without runs under half or over double its median (the same rules as the site). Verdict cut-offs are our own
     choice: under 0.75x the peers' median = slow, up to 1.25x average, up to 1.75x good, above that very fast. */
  const medianOf = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null };
  function speedCheck(run, summary, G){
    const hr = run.exp / (run.minutes / 60), party = run.party > 1;
    // without the EXP bar the run's EXP is only the messages read, which undercounts: no verdict
    if (!run.level || !run.barExp || !summary?.rows) return {expHr: hr, verdict: null, noBar: !run.barExp};
    const peers = summary.rows.filter(r => r.level && Math.abs(r.level - run.level) <= 5 && (r.party > 1) === party && r.map);
    const byMap = {};
    for (const r of peers) (byMap[r.map] = byMap[r.map] || []).push(r);
    // 3+ groups: a party sharing a party code is one group, so one party can't rank a map on its own
    const groups = a => new Set(a.map((r, i) => r.group ?? "row" + i)).size;
    const maps = [];
    for (const [map, a] of Object.entries(byMap)){
      const m = medianOf(a.map(r => r.expHr)), kept = a.filter(r => r.expHr >= m / 2 && r.expHr <= m * 2);
      if (groups(kept) >= 3) maps.push({map, name: G.mapnames?.[map] || G.maps?.[map]?.[0] || "Map " + map, expHr: medianOf(kept.map(r => r.expHr)), players: kept.length});
    }
    const all = maps.flatMap(m => byMap[m.map].filter(r => r.expHr >= m.expHr / 2 && r.expHr <= m.expHr * 2).map(r => r.expHr));
    if (all.length < 3) return {expHr: hr, verdict: null, peers: all.length};
    const ref = medianOf(all), x = hr / ref;
    const verdict = x < 0.75 ? "slow" : x <= 1.25 ? "average" : x <= 1.75 ? "good" : "very fast";
    const faster = maps.filter(m => m.expHr > hr && m.map !== String(run.map)).sort((a, b) => b.expHr - a.expHr).slice(0, 3);
    return {expHr: hr, verdict, ref, peers: all.length, faster};
  }

  const api = {createSession, createRunSlicer, speedCheck, IDLE_MS, RUN_MS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindSession = api;
})(typeof window !== "undefined" ? window : globalThis);
