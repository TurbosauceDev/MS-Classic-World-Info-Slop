/* core/alerts.js — Conditions & alerts (0.2.78, the WeakAuras-shaped engine behind Settings > Alerts and goal):
   trigger kinds -> one fired[] per tick or drop event, each {id, text, sev, sound, toast, log, w}. The caller
   (renderer-alerts.js) keeps the per-alert state map and turns fired entries into sounds, overlay toasts and run-log
   lines. Pure maths, no DOM, no Electron: core.test.js runs it in Node.

   KINDS  kind -> {label, fields, sound, sev, w, note}   fields drive the Settings rows: [key, label, default, "n"|"t"]
   synth(settings) -> alerts[] migrated from the pre-0.2.78 keys (alertWorth, alertItems, stopBeep)
   normalize(list) -> cleaned copy: known kinds only, numbers finite, ids/defaults filled
   has(list, kind, on) -> is there an alert of this kind (on: only an enabled one)
   evaluate(alerts, ctx, st, now) -> fired[]   st: the caller's state map, mutated in place
     ctx: {on, paused, runT0, st: {expHr, expHr5, killsHr, mesosHr, level, goalLevel, lastExpT},
           respawns: [{name, boss, killed, dueIn}], kpq: {left, rounds}|null, events: [{t, name, worth}],
           prices: [{id, name, median}]|null}   prices feed the site-price kinds (priceAbove/priceBelow)
   Triggers that hold ("under X for M min") refire every COOL ms while they stay true; crossing and event triggers
   re-arm only after their condition clears, so nothing spams. */
(function (root){
  const COOL = 10 * 6e4;   // a held trigger says it again at most every 10 min
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const num = v => (typeof v === "number" && Number.isFinite(v)) ? v : 0;   // price kinds: a bad field is 0 -> never fires
  // fields: [key, label, default, type]; sound/sev/w are the defaults for the fired entries (w = the overlay widget to flash)
  const KINDS = {
    expHrBelow:  {label: "EXP/hr under", fields: [["v", "EXP/hr under", 1000, "n"], ["min", "for this long (min)", 2, "n"]],
      sound: "low", sev: "warn", w: "exp", note: "watches the last-5-min rate, so it only speaks while a rate exists at all"},
    expHrAbove:  {label: "EXP/hr over", fields: [["v", "EXP/hr over", 100000, "n"]],
      sound: "mid", sev: "info", w: "exp", note: "fires when the last-5-min rate crosses it, again only after it dips back under"},
    mesosHrBelow:{label: "Mesos/hr under", fields: [["v", "Mesos/hr under", 10000, "n"], ["min", "for this long (min)", 5, "n"]],
      sound: "low", sev: "warn", w: "mesos", note: "this run's rate"},
    mesosHrAbove:{label: "Mesos/hr over", fields: [["v", "Mesos/hr over", 100000, "n"]],
      sound: "mid", sev: "info", w: "mesos", note: "fires when the run rate crosses it"},
    killsHrBelow:{label: "Kills/hr under", fields: [["v", "Kills/hr under", 100, "n"], ["min", "for this long (min)", 5, "n"]],
      sound: "low", sev: "warn", w: "kills", note: "this run's rate"},
    killsHrAbove:{label: "Kills/hr over", fields: [["v", "Kills/hr over", 1000, "n"]],
      sound: "mid", sev: "info", w: "kills", note: "fires when the run rate crosses it"},
    bossDue:     {label: "Boss respawn due", fields: [["min", "due within (min)", 2, "n"], ["name", "only this boss (blank = any)", "", "t"]],
      sound: "high", sev: "info", w: "map", note: "timed monsters you have killed on the current map; once per kill"},
    kpqClock:    {label: "KPQ clock low", fields: [["sec", "clock under (sec)", 60, "n"]],
      sound: "high", sev: "warn", w: "kpq", note: "once per round"},
    sessionTime: {label: "Session break", fields: [["min", "after (min)", 120, "n"]],
      sound: "mid", sev: "info", w: "status", note: "a break reminder at the mark, then every 15 min while you keep going"},
    goalReached: {label: "Goal level reached", fields: [],
      sound: "high", sev: "good", w: "exp", note: "fires when the session's level reaches the goal level"},
    idleExp:     {label: "No EXP for", fields: [["min", "no EXP for (min)", 2, "n"]],
      sound: "low", sev: "warn", w: "status", note: "died, disconnected, or someone took the map; once per quiet stretch"},
    lootWorth:   {label: "Drop worth over", fields: [["v", "worth at least", 1000000, "n"]],
      sound: "mid", sev: "info", w: "loot", note: "any pickup whose price is at least this (NPC or player price)"},
    lootNamed:   {label: "Watched drops", fields: [["names", "names (comma separated)", "", "t"]],
      sound: "high", sev: "info", w: "loot", note: "part of the item's name matches, 3+ letters per name"},
    priceAbove:  {label: "Site price at or over", fields: [["name", "item (name or id)", "", "t"], ["v", "median at or over", 1000000, "n"]],
      sound: "mid", sev: "good", w: "status", note: "watches the site's meso.watch median (Watchlist card pulls it every 30 min); fires on the crossing, re-arms once the price falls back under"},
    priceBelow:  {label: "Site price at or under", fields: [["name", "item (name or id)", "", "t"], ["v", "median at or under", 100000, "n"]],
      sound: "mid", sev: "info", w: "status", note: "watches the site's meso.watch median; fires on the crossing, re-arms once the price climbs back over"},
    // 0.2.92 — triggers off numbers the screen readers already produce (no new vision work)
    died:        {label: "You died", fields: [], sound: "low", sev: "warn", w: "status", note: "the tracker's death count went up (the 'you died' read); once per death"},
    levelUp:     {label: "Level up", fields: [], sound: "high", sev: "good", w: "exp", note: "the session's level rose; once per level"},
    mapEntered:  {label: "Map changed", fields: [["name", "map name contains (blank = any)", "", "t"]], sound: "mid", sev: "info", w: "map",
      note: "the minimap title read as a different map; once per change"},
    itemLow:     {label: "Item running low", fields: [["name", "item (name or id)", "", "t"], ["v", "fewer than", 50, "n"]], sound: "low", sev: "warn", w: "status",
      note: "the quick-slot / Use-tab count of that item (potions, arrows); fires once, re-arms when you restock"},
    bigKill:     {label: "Big kill", fields: [["v", "one kill gave at least (EXP)", 5000, "n"]], sound: "high", sev: "good", w: "kills",
      note: "a single EXP message at or over this (a boss, or a tough monster); once per message"},
    partyChange: {label: "Party size changed", fields: [], sound: "mid", sev: "info", w: "party", note: "the party HP bars show a different head-count; once per change"},
    finalAttack: {label: "Final Attack proc", fields: [], sound: "high", sev: "good", w: "kills", note: "the Final Attack buff icon (top-right row) appears on screen; read from pixels only, once per proc"},
    mesoBurst:   {label: "Mesos burst", fields: [["v", "mesos gained within the window", 100000, "n"], ["sec", "window (sec)", 30, "n"]], sound: "mid", sev: "good", w: "mesos",
      note: "picked-up mesos over the window (a rich drop or a mesos box); at most once a minute"},
    readTrouble: {label: "Screen reading trouble", fields: [["v", "chat read under (%)", 50, "n"], ["min", "after this many play minutes", 5, "n"]], sound: "low", sev: "warn", w: "status",
      note: "the share of the EXP bar's gain that showed up as readable chat lines is low: the chat is hidden, covered or too small. Once per stretch"},
  };
  const SOUNDS = ["low", "mid", "high", "double"];
  const isFile = v => typeof v === "string" && /^file:[\w .()\-]{1,80}\.(wav|mp3|ogg)$/i.test(v);   // a sound the player added (0.2.92): file:<name> in userData/sounds
  // clean one list: unknown kinds out, numbers finite, defaults in, ids stable; params live flat on the alert (a.v, a.min...)
  function normalize(list){
    if (!Array.isArray(list)) return [];
    return list.filter(a => a && KINDS[a.kind]).map((a, i) => {
      const def = KINDS[a.kind], p = {};
      for (const [k,, d, t] of def.fields){
        let v = a[k] !== undefined ? a[k] : (a.params && a.params[k]);
        if (v === undefined || v === "") v = d;
        p[k] = t === "n" ? (Number.isFinite(+v) ? +v : d) : String(v);
      }
      const act = a.act && typeof a.act === "object" ? a.act : {};
      return {id: typeof a.id === "string" && a.id ? a.id : "a" + (i + 1), kind: a.kind, on: a.on !== false,
        sound: SOUNDS.includes(act.sound) || act.sound === "none" || isFile(act.sound) ? act.sound : def.sound,
        toast: act.toast !== false, log: act.log !== false, ...p};
    });
  }
  // the three pre-0.2.78 behaviours become alerts once, on the first boot that sees them
  function synth(s = {}){
    const out = [];
    if (+s.alertWorth > 0) out.push({id: "m-worth", kind: "lootWorth", v: +s.alertWorth});
    if (String(s.alertItems || "").trim()) out.push({id: "m-items", kind: "lootNamed", names: s.alertItems});
    if (s.stopBeep !== false) out.push({id: "m-idle", kind: "idleExp", min: 2});
    return normalize(out);
  }
  const has = (list, kind, on) => Array.isArray(list) && list.some(a => a && a.kind === kind && (!on || a.on !== false));
  // the heart: one pass over the alerts with the current snapshot
  function evaluate(alerts, ctx, st, now){
    const fired = [], cs = ctx.st || {};
    const rate = k => (cs[k] != null && Number.isFinite(cs[k]) ? cs[k] : null);
    for (const a of Array.isArray(alerts) ? alerts : []){
      if (!a.on || !KINDS[a.kind]) continue;
      const def = KINDS[a.kind];
      const say = text => fired.push({id: a.id, text, sev: def.sev, sound: a.sound === "none" ? null : a.sound,
        toast: a.toast !== false, log: a.log !== false, w: def.w});
      const s = st[a.id] = st[a.id] || {};
      const key = a.kind.startsWith("exp") ? "expHr5" : a.kind.startsWith("mesos") ? "mesosHr" : "killsHr";
      switch (a.kind){
        case "expHrBelow": case "mesosHrBelow": case "killsHrBelow": {
          const v = rate(key), bad = v != null && v < a.v;
          if (!bad){ s.since = null; break }
          if (s.since == null){ s.since = now; break }
          if (now - s.since >= a.min * 6e4 && now - (s.firedAt || 0) >= COOL){ s.firedAt = now;
            say(`${def.label.replace(" under", "")} fell under ${fmt(a.v)} (now ${fmt(v)}${key === "expHr5" ? ", last 5 min" : " this run"})`) }
          break;
        }
        case "expHrAbove": case "mesosHrAbove": case "killsHrAbove": {
          const v = rate(key), good = v != null && v > a.v;
          if (good && s.armed !== false && now - (s.firedAt || 0) >= 5 * 6e4){ s.armed = false; s.firedAt = now;
            say(`${def.label.replace(" over", "")} is over ${fmt(a.v)} (now ${fmt(v)}${key === "expHr5" ? ", last 5 min" : " this run"})`) }
          if (!good) s.armed = true;
          break;
        }
        case "idleExp": {
          const quiet = ctx.on && !ctx.paused && cs.lastExpT && now - cs.lastExpT > a.min * 6e4;
          if (!quiet){ s.q = false; break }
          if (!s.q){ s.q = true; say(`No EXP for ${a.min} min. Died, disconnected, or someone took the map?`) }
          break;
        }
        case "bossDue": {
          const want = String(a.name || "").trim().toLowerCase(), seen = {};
          for (const r of ctx.respawns || []){
            if (!r.killed || r.dueIn == null || r.dueIn > a.min * 6e4) continue;
            if (want && String(r.name || "").toLowerCase() !== want) continue;
            const k = r.name + "@" + r.killed;   // the kill time is the cycle's identity: a new kill re-arms the alert
            seen[k] = 1;
            if (s.b && s.b[k]) continue;
            (s.b = s.b || {})[k] = 1;
            say(`${r.name}${r.boss ? " (boss)" : ""} is back${r.dueIn <= 0 ? " now" : " in about " + Math.ceil(r.dueIn / 6e4) + " min"}`);
          }
          if (s.b) for (const k of Object.keys(s.b)) if (!seen[k]) delete s.b[k];
          break;
        }
        case "kpqClock": {
          const k = ctx.kpq;
          if (!k || k.left == null || k.left / 1000 > a.sec){ s.r = null; break }
          if (s.r !== k.rounds){ s.r = k.rounds;
            say(`KPQ clock under ${a.sec} s (${Math.ceil(k.left / 1000)} s left${k.rounds ? ", round " + k.rounds : ""})`) }
          break;
        }
        case "sessionTime": {
          if (!ctx.runT0 || !ctx.on){ s.next = null; break }
          if (s.next == null || s.t0 !== ctx.runT0){ s.t0 = ctx.runT0; s.next = ctx.runT0 + a.min * 6e4 }
          if (now >= s.next){ s.next = now + 15 * 6e4; say(`${Math.round((now - ctx.runT0) / 6e4)} min this session — time for a break?`) }
          break;
        }
        case "priceAbove": case "priceBelow": {
          // ctx.prices: [{id, name, median}] from the latest site pull (renderer-site.js). Exact id
          // or exact (case-insensitive) name; every match fires once per crossing.
          const want = String(a.name || "").trim(), v = num(a.v);
          if (!want || !(v > 0)) break;
          const wl = want.toLowerCase();
          for (const p of ctx.prices || []){
            if (String(p.id) !== want && String(p.name || "").toLowerCase() !== wl) continue;
            if (!(p.median > 0)) continue;
            const key = a.kind === "priceAbove" ? p.median >= v : p.median <= v;
            const st2 = (s.m = s.m || {})[p.id] = s.m[p.id] || {};
            if (key && st2.armed !== false && now - (st2.firedAt || 0) >= 5 * 6e4){ st2.armed = false; st2.firedAt = now;
              say(`${p.name} is ${a.kind === "priceAbove" ? "at or over" : "at or under"} ${fmt(v)} (median ${fmt(p.median)})`) }
            if (!key) st2.armed = true;
          }
          break;
        }
        case "died": {
          const n = num(cs.deaths); if (s.n == null || n < s.n){ s.n = n; break }
          if (n > s.n){ s.n = n; say(`You died (${n} this run)`) }
          break;
        }
        case "levelUp": {
          const L = Array.isArray(cs.levelUps) ? cs.levelUps : [], n = L.length; if (s.n == null || n < s.n){ s.n = n; break }
          if (n > s.n){ s.n = n; say(`Level up! Now level ${L.at(-1)?.level ?? cs.level}`) }
          break;
        }
        case "mapEntered": {
          const nm = cs.nowMapName || null; if (nm == null) break;
          if (s.m == null){ s.m = nm; break }
          if (nm !== s.m){ s.m = nm; const want = String(a.name || "").trim().toLowerCase();
            if (!want || nm.toLowerCase().includes(want)) say(`Now in ${nm}`) }
          break;
        }
        case "itemLow": {
          const want = String(a.name || "").trim().toLowerCase(), v = num(a.v); if (!want || !(v > 0)) break;
          const seen = (s.i = s.i || {});
          for (const u of Array.isArray(cs.used) ? cs.used : []){
            if (u.have == null || (String(u.id) !== want && !String(u.name || "").toLowerCase().includes(want))) continue;
            const low = u.have < v, st2 = seen[u.id] = seen[u.id] || {};
            if (low && st2.armed !== false){ st2.armed = false; say(`${u.name || "Item"} is running low (${fmt(u.have)} left)`) }
            if (!low) st2.armed = true;
          }
          break;
        }
        case "bigKill": {
          const g = Array.isArray(cs.gains) ? cs.gains : [], top = g.length ? g[g.length - 1].t : null;
          if (s.t == null){ s.t = top ?? 0; break }
          for (const x of g) if (x.t > s.t && x.gain >= num(a.v) && a.v > 0) say(`Big kill: +${fmt(x.gain)} EXP`);
          if (top != null && top > s.t) s.t = top;
          break;
        }
        case "finalAttack": {
          const n = num(cs.procs); if (s.n == null){ s.n = n; break }
          if (n > s.n){ s.n = n; say("Final Attack proc") } else if (n < s.n) s.n = n;
          break;
        }
        case "partyChange": {
          const n = num(cs.party); if (!n) break;
          if (s.n == null){ s.n = n; break }
          if (n !== s.n){ const was = s.n; s.n = n; say(`Party is now ${n} (was ${was})`) }
          break;
        }
        case "mesoBurst": {
          const m = num(cs.mesos), w = Math.max(5, num(a.sec)) * 1e3, h = (s.h = s.h || []);
          if (h.length && m < h.at(-1)[1]) h.length = 0;   // a new run
          h.push([now, m]); while (h.length > 1 && h[0][0] < now - w) h.shift();
          const gain = m - h[0][1];
          if (a.v > 0 && gain >= a.v && now - (s.firedAt || 0) >= 6e4){ s.firedAt = now; say(`+${fmt(gain)} mesos in ${Math.round((now - h[0][0]) / 1e3)} s`) }
          break;
        }
        case "readTrouble": {
          const share = cs.readShare, bad = share != null && share * 100 < a.v && cs.activeMin >= a.min;
          if (!bad){ s.q = false; break }
          if (!s.q){ s.q = true; say(`Only ${Math.round(share * 100)}% of the EXP gain is showing up as chat lines. Is the chat hidden or covered?`) }
          break;
        }
        case "goalReached": {
          const lv = cs.level, goal = cs.goalLevel, k = goal ? String(goal) : null;
          if (!k || !(lv >= goal)){ s.k = null; break }
          if (s.k !== k){ s.k = k; say(`Goal reached: level ${lv} (goal ${goal})`) }   // once per goal, not per level past it
          break;
        }
        case "lootWorth": case "lootNamed": {
          const parts = a.kind === "lootNamed" ? String(a.names || "").split(",").map(x => x.trim().toLowerCase()).filter(x => x.length >= 3) : [];
          for (const e of ctx.events || []){
            if (a.kind === "lootWorth"){ if (!(e.worth >= a.v)) continue }
            else { const nm = String(e.name || "").toLowerCase(); if (!nm || !parts.some(p => nm.includes(p))) continue }
            if ((s.e || []).includes(e.t)) continue;
            s.e = [...(s.e || []), e.t].slice(-40);
            say(a.kind === "lootWorth" ? `${e.name || "A drop"} worth ${fmt(e.worth)} picked up` : `Drop you're watching for: ${e.name}`);
          }
          break;
        }
      }
    }
    return fired;
  }
  const api = {KINDS, SOUNDS, isFile, COOL, synth, normalize, has, evaluate};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindAlerts = api;
})(typeof window !== "undefined" ? window : globalThis);
