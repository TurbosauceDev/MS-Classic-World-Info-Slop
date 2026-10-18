/* Grind session tracker: turns what the screen readers saw (timestamped events) into rates. Pure logic, no screen or DOM,
   so it runs the same in the Windows app and in Node tests. Game data comes from tracker/app/gamedata.json (built from
   data/data.json by tracker/build_data.js).

   Events (t = ms since epoch):
     {t, type: "exp",   gain}             one "You received EXP (+gain)" message = one kill (yours or a party member's)
     {t, type: "bonus", gain}             "Bonus EXP for PARTY (+gain)": EXP, not a kill
     {t, type: "bar",   exp, level?}      EXP bar reading: current EXP into the level (and level, when worked out)
     {t, type: "itemraw", text, qty?, cands?}  an item pickup line whose name fits several items (cands) or none; the one
                                          this map's monsters drop is taken when only one of them does
     {t, type: "inv", tab, items, alike?, unknown}  the inventory's open tab (equip/use/etc): {id: count}; alike = how many
                                          items share that picture (scrolls); unknown = slots that didn't read
     {t, type: "meso",  amount}           meso pickup message
     {t, type: "item",  id, qty?}         item pickup message (id resolved by the reader from the item name)
     {t, type: "map",   id, name?}        map read from the minimap (id null: a map our data doesn't have, name as read)
     {t, type: "party", size}             party size from the party HP bars (1 = solo)
     {t, type: "job",   name}             class read from the screen
     {t, type: "use",   id, n}            n of an item used up (potion, food, arrows), from the quick-slot / Use-tab counts
     {t, type: "useseen"}                 item counts are on screen (so nothing used = 0, not unknown)
     {t, type: "wallet", n}               the meso total in the inventory window (spending shows here, pickups alone don't)
     {t, type: "pause"} / {t, type: "resume"}  the game screen is gone (Cash Shop, changing channel): that time isn't farming
   Rates use active time only: any gap of more than IDLE_MS with no EXP, meso or item event is left out. */
(function (root){
  const IDLE_MS = 60000, RECENT_MS = 5 * 60e3;
  // the player's own calendar day (toISOString alone is UTC: an evening in America would land on tomorrow)
  const localDate = t => { const d = new Date(t); return new Date(t - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) };
  function createSession(G, opts = {}){
    const idleMs = opts.idleMs || IDLE_MS;
    const S = {start: null, last: null, activeMs: 0, map: null, party: 1, job: null, level: null,
      msgExp: 0, barExp: 0, recent: [], kills: 0, timedKills: {}, mesos: 0, byMob: {}, items: {}, unreadItems: 0, otherExp: 0, bar: null, lastKillMob: null, events: 0, deaths: 0, deathMaps: {}, lastExpT: null,
      pausedAt: null, pausedMs: 0, levelUps: [], levelAt: null, used: {}, walletFirst: null, walletLast: null, bigKilled: new Set(), inv: {}};

    /* which monster on this map gives this much EXP? Solo: its base EXP (within 15%). In a party the kill message is only
       your part: in Danny's KPQ bonus frames (party of 4, Horny/Green Mushroom, 41/26 base) it read +7 and +15, so the split
       isn't even (the party bonus comes as its own line). There a kill is the monster only when just one monster on the
       map gives that much; otherwise it's a kill with the monster unknown ("?"). More than any monster gives = not a kill. */
    function matchMob(gain){
      const list = G.maps[S.map]?.[2] || [], mobs = list.map(([id]) => String(id)).filter(id => G.mobs[id]?.[3]);
      const base = id => G.mobs[id][3];
      // a lone monster worth 5x the smallest one on the map (KPQ's King Slime) is a boss: one kill per visit to the map, so
      // stage-clear EXP after it isn't taken for more kills (Danny's KPQ run, 2026-10-18)
      const least = Math.min(...mobs.map(base)), big = id => mobs.length > 1 && list.find(([m]) => String(m) === id)?.[1] === 1 && base(id) >= 5 * least;
      const r = pick();
      if (r && r !== "?" && big(r)){ if (S.bigKilled.has(r)) return null; S.bigKilled.add(r) }
      return r;
      function pick(){
        if (S.party <= 1){
          let best = null, bestErr = Infinity;
          for (const id of mobs){ const err = Math.abs(base(id) - gain) / base(id); if (err < bestErr){ bestErr = err; best = id } }
          return bestErr <= 0.15 ? best : null;
      }
      // a boss on the map fits almost any small share: only count it when no regular monster gives that much
      const regular = mobs.filter(id => !timed(id) && !big(id)), fitsReg = regular.filter(id => gain <= base(id) * 1.05);
      const fits = fitsReg.length ? fitsReg : mobs.filter(id => gain <= base(id) * 1.05);
      if (!fits.length) return null;
      const exact = fits.filter(id => Math.abs(base(id) - gain) / base(id) <= 0.03);
      return exact.length === 1 ? exact[0] : fits.length === 1 ? fits[0] : "?";
      }
    }
    // monsters on this map with a long respawn (bosses etc.), from the game data
    const timed = id => (G.timed?.[S.map] || []).find(([m]) => m === String(id));
    // respawn timers for this map: when each timed monster was last killed here and when it's due back
    function respawns(now){
      return (G.timed?.[S.map] || []).map(([id, sec, boss]) => { const k = S.timedKills[id];
        return {id, name: G.mobs[id]?.[0] || "Monster " + id, sec, boss: !!boss, killed: k || null, dueIn: k ? Math.max(0, k + sec * 1000 - now) : null} });
    }
    // KPQ's middle stages have no monsters, so minutes with no EXP there are still play time (Danny, 2026-10-18): no idle cut-off in a stage
    const kpqStage = () => (G.kpq || []).includes(S.map) && S.map !== "80000600";
    function credit(t){ const gap = t - S.last; S.activeMs += gap > (kpqStage() ? 30 * 60e3 : idleMs) || gap < 0 ? 0 : gap }   // < 0: the PC clock went back
    // a level-up: how long the level before took (active time), when this session saw that level start
    function levelUp(level, t){
      const was = S.levelAt;
      S.levelUps.push({level, t, map: S.map, mapName: G.mapnames?.[S.map] || G.maps[S.map]?.[0] || S.mapName || null,
        activeMin: was && !was.partial && was.level === level - 1 ? Math.round((S.activeMs - was.activeMs) / 6e3) / 10 : null});
      S.levelAt = {level, activeMs: S.activeMs};
    }
    // inventory now minus at the first read, per item (tabs read at least twice), biggest change first
    function invGain(){
      const out = [];
      for (const [tab, {first, last}] of Object.entries(S.inv)){
        if (last.t <= first.t) continue;
        for (const id of new Set([...Object.keys(first.items), ...Object.keys(last.items)])){
          const n = (last.items[id] || 0) - (first.items[id] || 0);
          if (n && !(G.kpqItems || []).includes(id)) out.push({id, tab, n, alike: last.alike[id] || first.alike[id] || 1, name: G.items[id]?.n || "Item " + id});
        }
      }
      return out.sort((a, b) => Math.abs(b.n) - Math.abs(a.n));
    }
    // KPQ's Pass and Coupon only matter inside KPQ: not loot (Danny, 2026-10-18)
    function gotItem(id, q){ id = String(id); if ((G.kpqItems || []).includes(id)) return; S.items[id] = (S.items[id] || 0) + q; if (S.lastKillMob){ const m = mob(S.lastKillMob); m.items[id] = (m.items[id] || 0) + q } }
    const mob = id => S.byMob[id] || (S.byMob[id] = {kills: 0, exp: 0, mesos: 0, mesoDrops: 0, items: {}});

    function add(e){
      S.events++;
      if (S.start === null) S.start = e.t;
      const counts = ["exp", "bonus", "meso", "item", "itemraw", "bar"].includes(e.type);
      // paused: farming time up to the pause counts, the pause itself doesn't; anything counted (or "resume") ends it
      if (e.type === "pause"){ if (S.pausedAt === null && S.last !== null){ credit(e.t); S.last = e.t; S.pausedAt = e.t } return S }
      if (S.pausedAt !== null && (counts || e.type === "resume")){ S.pausedMs += Math.max(0, e.t - S.pausedAt); S.pausedAt = null; S.last = e.t }
      if (e.type === "resume") return S;
      if (counts && S.last !== null) credit(e.t);
      if (counts) S.last = e.t;
      switch (e.type){
        case "map": S.map = e.id == null ? null : String(e.id); S.mapName = e.name || null; S.bigKilled.clear(); break;
        case "party": S.party = Math.max(1, e.size | 0); break;
        case "job": S.job = e.name; break;
        case "exp": {
          S.msgExp += e.gain; S.lastExpT = Math.max(S.lastExpT || 0, e.t);
          if (!G.maps[S.map]){ S.kills++; S.lastKillMob = null; break }   // map not known: a kill, monster unknown
          const id = matchMob(e.gain);
          if (id === "?"){ S.kills++; S.lastKillMob = null }   // a party kill, monster unknown
          else if (id){ const m = mob(id); m.kills++; m.exp += e.gain; S.kills++; S.lastKillMob = id; if (timed(id)) S.timedKills[id] = e.t }
          else S.otherExp += e.gain;   // fits no monster here: quest reward etc.
          break;
        }
        case "bonus": S.msgExp += e.gain; S.lastExpT = Math.max(S.lastExpT || 0, e.t); break;
        // the inventory's open tab read: kept as first and latest per tab (Equip, Use, Etc)
        case "inv": {
          if (!e.tab || !e.items) break;
          const read = {t: e.t, items: e.items, alike: e.alike || {}, unknown: e.unknown || 0};
          (S.inv[e.tab] ||= {first: read}).last = read;
          break;
        }
        case "itemraw": {
          // a name that fits several items: the one the monsters here drop (player drop reports), or KPQ's Coupon/Pass
          const here = new Set((G.maps[S.map]?.[2] || []).flatMap(([m]) => G.drops?.[m] || []).concat((G.kpq || []).includes(S.map) ? G.kpqItems || [] : []));
          const fit = (e.cands || []).filter(id => here.has(String(id)));
          if (fit.length === 1) gotItem(fit[0], e.qty || 1); else S.unreadItems++;
          break;
        }
        case "wallet": if (Number.isFinite(e.n) && e.n >= 0){ if (S.walletFirst === null) S.walletFirst = e.n; S.walletLast = e.n } break;
        case "use": { S.useSeen = true; const n = Math.max(0, e.n | 0); if (n) S.used[String(e.id)] = (S.used[String(e.id)] || 0) + n; break }
        case "useseen": S.useSeen = true; break;
        case "bar": {
          const p = S.bar, before = S.level;
          // the EXP number and the % come from one line, so EXP / % must be some level's total: "1 [68.01%]" is a misread
          // number (Danny's KPQ run: each one counted as a death, then the next good read as +32k EXP). Ignore it.
          // and that level must be this one or the next (a garbled % can make EXP / % land on another level's total)
          const fit = e.pct > 0.5 ? levelOf(G, e.exp, e.pct) : null;
          // under 0.5% the level can't be worked out, but the EXP must still be that % (to 2 decimals) of this level or the next
          // (of some level, before the level is known)
          const tiny = !(e.pct > 0.5) && Number.isFinite(e.pct) && !(S.level ? [S.level, S.level + 1] : Object.keys(G.exp).map(Number))
            .some(L => G.exp[L] && Math.abs(e.exp - e.pct / 100 * G.exp[L]) <= Math.max(2, G.exp[L] * 0.00006));
          // a jump of 2+ levels (quest turn-in, bar unread for a while): taken once the same level reads 3 times running (twice let garbled readings through in the fuzz test)
          const jump = fit && S.level && fit > S.level + 1 && S.bar?.level && (S.jumpTo === fit ? ++S.jumpN >= 3 : (S.jumpTo = fit, S.jumpN = 1, false));
          if (!jump && (tiny || e.pct > 0.5 && (!fit || S.level && fit !== S.level && fit !== S.level + 1))){ S.badBars = (S.badBars || 0) + 1; break }
          S.jumpTo = null;
          if (jump){ const q = S.bar; let d = (G.exp[q.level] || 0) - q.exp + e.exp; for (let L = q.level + 1; L < fit; L++) d += G.exp[L] || 0;
            S.barExp += d; S.lastExpT = Math.max(S.lastExpT || 0, e.t); for (let L = q.level + 1; L <= fit; L++){ S.level = L; if (!(S.levelUps.at(-1)?.level >= L)) levelUp(L, e.t) }
            S.bar = {t: e.t, exp: e.exp, pct: e.pct, level: fit}; break }
          if (e.level) S.level = e.level;
          // level not known yet (only readings under 0.5%, which can't be checked well): nothing counted until it is
          if (!S.level){ S.bar = {t: e.t, exp: e.exp, pct: e.pct, level: null}; break }
          if (p && p.level){
            let d = e.exp - p.exp;
            // leveled up: the level says so, or (just after a level-up, when the % is too small to work the level out)
            // the bar was at 90%+ and fell to under half of that; a death only takes a few %
            const up = e.level && p.level ? e.level > p.level : p.level && p.pct >= 90 && e.exp < p.exp * 0.5;
            // the EXP number can come back higher after a level-up (it's into a bigger level); the % going down says so too
            if (up && (d < 0 || e.pct != null && p.pct != null && e.pct < p.pct)){ d = (G.exp[p.level] || 0) - p.exp + e.exp; if (!e.level) S.level = p.level + 1 }
            // a death takes at most about a tenth of the level; a bigger drop without a level-up is a misread: ignore it,
            // unless it keeps reading that way (3 in a row: a level-up the reader couldn't tell, e.g. a quest turn-in)
            else if (d < 0 && G.exp[p.level] && -d > 0.2 * G.exp[p.level] && (S.bigDrops = (S.bigDrops || 0) + 1) < 3){ S.badBars = (S.badBars || 0) + 1; S.level = before; break }
            else if (d < 0 && S.bigDrops >= 3 && !e.level){ d = (G.exp[p.level] || 0) - p.exp + e.exp; S.level = p.level + 1 }   // 3 in a row: the level-up it was
            S.bigDrops = 0;
            if (d > 0){ S.barExp += d; S.lastExpT = Math.max(S.lastExpT || 0, e.t) }
            // a drop without a level-up = a death (the game takes a share of the level's EXP); not counted again until EXP rises
            else if (d < -Math.max(5, (G.exp[p.level] || 0) * 0.001) && !p.dead){   // a few EXP down is the last digit misread, not a death
              S.deaths++; const k = S.map || "?"; S.deathMaps[k] = (S.deathMaps[k] || 0) + 1 }
          }
          if (before && S.level === before + 1 && !(S.levelUps.at(-1)?.level >= S.level)) levelUp(S.level, e.t);   // once per level, even if a misread flickers it
          else if (S.level && !S.levelAt) S.levelAt = {level: S.level, activeMs: S.activeMs, partial: true};   // started mid-level: its time is unknown
          S.bar = {t: e.t, exp: e.exp, pct: e.pct, level: S.level, dead: p && e.exp < p.exp && !(e.level > p.level) ? true : p?.dead && e.exp <= p.exp}; break;
        }
        case "meso":
          S.mesos += e.amount;
          // credited to the last monster killed: exact on one-monster maps, a guess where several share the map
          if (S.lastKillMob){ const m = mob(S.lastKillMob); m.mesos += e.amount; m.mesoDrops++ }
          break;
        case "item": {
          gotItem(e.id, e.qty || 1);
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
      // a goal level: the rest of this level plus every level up to it, at the current rate
      const goal = +opts.goalLevel || 0;
      let toGoalHrs = null;
      if (need && expHr > 0 && goal > S.level){ let left = Math.max(0, need - S.bar.exp); let known = true; for (let l = S.level + 1; l < goal; l++){ if (!G.exp[l]) known = false; left += G.exp[l] || 0 } toGoalHrs = known ? left / expHr : null }   // past the EXP table: unknown, not "sooner"
      // the inventory read at two times (a tab opened early and again later): what's in it now minus what was in it then.
      // Etc, equips and scrolls only (potions go up when bought). Per item the bigger of that and the pickup lines: the
      // inventory catches lines that didn't read, the lines catch loot sold or stored in between
      const inv = invGain(), seenN = {...S.items}, filled = {};
      for (const g of inv) if (g.n > 0 && !(G.kpqItems || []).includes(g.id) && g.alike === 1 && ["Etc", "Equipment", "Scroll"].includes(G.items[g.id]?.c) && g.n > (seenN[g.id] || 0)){ filled[g.id] = g.n - (seenN[g.id] || 0); seenN[g.id] = g.n }
      const items = Object.entries(seenN).map(([id, n]) => ({id, name: G.items[id]?.n || "Item " + id, n, each: worth(id), total: worth(id) * n, inv: filled[id] || 0}))
        .sort((a, b) => b.total - a.total);
      const unreadLeft = Math.max(0, S.unreadItems - Object.values(filled).reduce((a, b) => a + b, 0));
      const lootValue = items.reduce((a, b) => a + b.total, 0);
      // used up: NPC shop price (cheapest shop), else the player-shop median; unknown price = left out of the cost
      // Use-tab items that went down between inventory looks count as used too (max of the two, like loot above)
      const usedN = {...S.used};
      for (const g of inv) if (g.tab === "use" && g.n < 0 && g.alike === 1 && -g.n > (usedN[g.id] || 0)) usedN[g.id] = -g.n;
      const used = Object.entries(usedN).map(([id, n]) => { const each = G.buy?.[id] ?? G.pw?.[id]?.[0] ?? null;
        return {id, name: G.items[id]?.n || "Item " + id, n, each, total: each == null ? null : each * n} }).sort((a, b) => (b.total || 0) - (a.total || 0));
      const usedCost = used.reduce((a, u) => a + (u.total || 0), 0);
      const mobs = Object.entries(S.byMob).map(([id, m]) => ({id, name: G.mobs[id]?.[0] || "Monster " + id, ...m,
        mesoPerKill: m.kills ? m.mesos / m.kills : 0})).sort((a, b) => b.kills - a.kills);
      return {activeMin: S.activeMs / 6e4, map: S.map, mapName: G.mapnames?.[S.map] || G.maps[S.map]?.[0] || S.mapName || null, party: S.party,
        job: S.job, level: S.level, kills: S.kills, killsHr: per(S.kills), exp, expHr, toLevelHrs, otherExp: S.otherExp,
        // share of the bar's EXP that showed up as readable messages: below ~70%, kills/mesos/drops are undercounted
        readShare: S.barExp > 0 ? Math.min(1, S.msgExp / S.barExp) : null,
        // kills if the missed lines were kills at the same rate as the ones read (an estimate; only from 20% read up)
        killsEstHr: S.barExp > 0 && S.msgExp / S.barExp >= 0.2 && S.msgExp < S.barExp ? per(S.kills * S.barExp / S.msgExp) : null,
        expHr5: recentExpHr(), deaths: S.deaths, paused: S.pausedAt !== null, levelUps: S.levelUps, toGoalHrs, goalLevel: goal || null, lastExpT: S.lastExpT,
        mesos: S.mesos, mesosHr: per(S.mesos), mesoPerKill: S.kills ? S.mesos / S.kills : 0, unreadItems: unreadLeft, unreadLines: S.unreadItems, inv, invTabs: Object.fromEntries(Object.entries(S.inv).map(([k, v]) => [k, {first: v.first.t, last: v.last.t}])), lootValue, lootHr: per(lootValue), items, mobs,
        used, usedCost, usedCostHr: per(usedCost), netHr: per(S.mesos + lootValue - usedCost),
        // inventory mesos now minus at the first read: real money in or out, shop trips included (loot not sold yet isn't in it)
        walletNet: S.walletFirst === null ? null : S.walletLast - S.walletFirst, walletNetHr: S.walletFirst === null ? null : per(S.walletLast - S.walletFirst)};
    }

    // anonymous summary for the shared drop tables (no character name, no timestamps beyond the date)
    function shareable(){
      const s = stats();
      return {v: 1, deaths: S.deaths, date: localDate(S.start || Date.now()), map: s.map, mapName: s.mapName, party: s.party, job: s.job,
        level: s.level, activeMin: Math.round(s.activeMin * 10) / 10, kills: s.kills, exp: s.exp, mesos: s.mesos,
        msgExp: S.msgExp, barExp: S.barExp, readShare: s.readShare, otherExp: S.otherExp, unreadItems: S.unreadItems, items: S.items, used: S.used,
        usedCost: S.useSeen || S.inv.use?.last.t > S.inv.use?.first.t ? Math.round(s.usedCost) : null,
        mobs: s.mobs.map(m => ({id: m.id, kills: m.kills, mesos: m.mesos, mesoDrops: m.mesoDrops, items: m.items}))};
    }

    const setGoal = lv => { opts.goalLevel = lv };
    return {add, stats, shareable, respawns, setGoal, state: S};
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
      // run length is wall time minus pauses (a channel change inside a run doesn't count as farming)
      if (S.last !== null && S.last - S.start - S.pausedMs >= runMs){
        onRun({...cur.shareable(), minutes: Math.round((S.last - S.start - S.pausedMs) / 6e3) / 10, hour: new Date(S.start).getUTCHours()});   // UTC hour: "best time to farm"
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
    return {expHr: hr, verdict, ref, peers: groups(maps.flatMap(m => byMap[m.map].filter(r => r.expHr >= m.expHr / 2 && r.expHr <= m.expHr * 2))), faster};
  }

  // start/end snapshots (mapleexp.com's way: two screenshots, level + EXP % on each, elapsed time between them).
  // level: the EXP table level whose total fits EXP / % (null when the % is too small to tell)
  function levelOf(G, exp, pct){
    if (!(pct > 0.5)) return null;
    for (const [L, need] of Object.entries(G.exp)) if (Math.abs(exp / (pct / 100) - need) / need < 0.004) return +L;
    return null;
  }
  // EXP gained from snapshot a to b ({level, exp}; exp optional, else pct of the level's total): the rest of a's level,
  // every full level between, and b's EXP into its level. null when it can't be worked out.
  function expBetween(G, a, b){
    const into = s => s.exp != null ? s.exp : G.exp[s.level] && s.pct != null ? s.pct / 100 * G.exp[s.level] : null;
    if (!a?.level || !b?.level || b.level < a.level) return null;
    const ea = into(a), eb = into(b);
    if (ea == null || eb == null) return null;
    if (a.level === b.level) return eb - ea;
    let d = (G.exp[a.level] || 0) - ea + eb;
    for (let L = a.level + 1; L < b.level; L++){ if (!G.exp[L]) return null; d += G.exp[L] }
    return d;
  }

  const api = {createSession, createRunSlicer, speedCheck, levelOf, expBetween, IDLE_MS, RUN_MS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindSession = api;
})(typeof window !== "undefined" ? window : globalThis);
