/* History (the window's History tab): pure maths over saved sessions (main.js sessions(): the summaries renderer-run.js
   saves at Stop, plus `saved`, the file's time stamp). No DOM; core.test.js runs it in Node. Every number is worked out from
   what the session recorded: nothing here guesses a rate.

   metrics(x, ctx) -> {h, expHr, exp, apm, killsHr, mesosHr, lootHr, usedHr, netHr, mesoPerKill, bestEach, min, deaths, kpqBest, kpqRounds, readShare}
   compareRuns(runs, base, ctx) -> {groups: [{name, rows: [{key, label, low, show, vals, best, delta}]}], wins}
   perHour(runs, "mobs" | "items", top) -> [{id, vals}]   kills or pickups per hour of farming, the top ids across the runs
   byMap(list) / bests(list) / filterRuns(list, f)
   today(list, now) -> {runs, min, exp, mesos}   the runs saved on now's local calendar day
   goalEta(list, {exp, goal, now}) -> {level, pct, goal, need, perDay, maps: [{name, expHr, hours, at}]} | {why}
     exp = the EXP table the session uses (G.exp, from data.json); "at your <map> rate" from byMap's EXP/hr
   applyEdit(x, patch) -> a copy with name/note/map/numbers fixed by hand (x.orig keeps the first values, x.edited the time)
   ctx.bestDrop(x) -> {each} | null (the renderer's, which knows item prices) */
(function (root){
  const MAX_CMP = 6, PB_MIN = 15;   // compare up to 6 runs; personal bests only from runs with 15+ min farming (as Last 7 days' fastest map)
  const isKpq = x => !!(x.kpq && typeof x.kpq === "object");
  const expOf = x => x.expTotal ?? (x.snap?.exp ?? x.exp ?? 0);
  function metrics(x, ctx = {}){
    const h = (x.activeMin || 0) / 60, hr = v => h && v != null ? v / h : null, kq = isKpq(x), sn = x.snap && x.snap.minutes > 0 ? x.snap : null;
    // EXP/hr as the History row shows it: the start/end readings over their clock time when there are some, else the live
    // count over farming time; KPQ over time in the stages only (the readings' clock time includes the waits in Kerning)
    const expHr = kq ? hr(sn ? sn.exp : x.exp) : sn ? sn.exp / (sn.minutes / 60) : hr(x.exp);
    const loot = x.lootValue ?? null, used = x.usedCost ?? null;
    return {h, expHr, exp: expOf(x), apm: x.expPerActiveMin ?? (x.activeMin >= 1 ? expOf(x) / x.activeMin : null), killsHr: hr(x.kills),
      mesosHr: hr(x.mesos || 0), lootHr: hr(loot), usedHr: hr(used), netHr: loot == null ? null : hr((x.mesos || 0) + loot - (used || 0)),
      mesoPerKill: x.kills ? (x.mesos || 0) / x.kills : null, bestEach: ctx.bestDrop ? ctx.bestDrop(x)?.each ?? null : x.bestDrop?.each ?? null,
      min: x.activeMin || 0, deaths: x.deaths || 0, kpqBest: kq ? x.kpq.best ?? null : null, kpqRounds: kq ? +x.kpq.rounds || 0 : null,
      readShare: x.readShare ?? null};
  }
  // [key, label, lower is better (null: neither), shown as]   shown as: n | meso | min | mss | pct
  const GROUPS = [["Speed", [["expHr", "EXP/hr"], ["exp", "EXP gained (total)"], ["apm", "Active EXP/min"], ["killsHr", "Kills/hr"]]],
    ["Money per hour", [["mesosHr", "Mesos picked up", false, "meso"], ["lootHr", "Items looted (worth)", false, "meso"], ["usedHr", "Potions and arrows used", true, "meso"],
      ["mesoPerKill", "Mesos per kill", false, "meso"], ["bestEach", "Best drop (each)", false, "meso"], ["netHr", "Net", false, "meso"]]],
    ["Run", [["min", "Farming time", null, "min"], ["deaths", "Deaths", true], ["kpqRounds", "KPQ rounds", false], ["kpqBest", "KPQ best round", true, "mss"],
      ["readShare", "EXP lines read", null, "pct"]]]];
  // runs side by side against one of them (base, an index): per row the values, the best run (-1: a tie or nothing to rank)
  // and each run's change from the base; wins = how many rows each run was best on
  function compareRuns(runs, base = 0, ctx = {}){
    const m = runs.map(x => metrics(x, ctx)), wins = runs.map(() => 0);
    const groups = GROUPS.map(([name, defs]) => ({name, rows: defs.map(([key, label, low = false, show = "n"]) => {
      const vals = m.map(r => r[key] ?? null); if (vals.every(v => v == null)) return null;
      let best = -1;
      const nums = vals.map((v, i) => [v, i]).filter(([v]) => typeof v === "number");
      if (low !== null && nums.length > 1){
        const top = low ? Math.min(...nums.map(n => n[0])) : Math.max(...nums.map(n => n[0])), at = nums.filter(n => n[0] === top);
        if (at.length === 1){ best = at[0][1]; wins[best]++ }
      }
      const b = vals[base];
      const delta = vals.map((v, i) => { if (i === base || typeof v !== "number" || typeof b !== "number" || v === b) return null;
        return {pct: b ? Math.round((v / b - 1) * 100) : null, diff: v - b, up: v > b, better: low === null ? null : low ? v < b : v > b} });
      return {key, label, low, show, vals, best, delta};
    }).filter(Boolean)})).filter(g => g.rows.length);
    return {groups, wins};
  }
  // kills per monster or pickups per item, per hour of farming, for the ids that matter most across the runs
  function perHour(runs, what, top = 8){
    const per = runs.map(x => { const h = (x.activeMin || 0) / 60, o = {}; if (!h) return o;
      if (what === "mobs") for (const mb of Array.isArray(x.mobs) ? x.mobs : []) { if (mb && mb.kills > 0) o[mb.id] = (o[mb.id] || 0) + mb.kills / h }
      else for (const [id, n] of Object.entries(x.items || {})) if (n > 0) o[id] = n / h;
      return o });
    const sum = {}; for (const o of per) for (const [id, v] of Object.entries(o)) sum[id] = (sum[id] || 0) + v;
    return Object.keys(sum).sort((a, b) => sum[b] - sum[a]).slice(0, top).map(id => ({id, vals: per.map((o, i) => (runs[i].activeMin || 0) > 0 ? o[id] || 0 : null)}));
  }
  const placeOf = x => isKpq(x) ? "KPQ" : x.mapName || "?";
  // one line per map: runs, farming time, EXP/hr over all of it (each run's EXP/hr weighted by its farming time), the best run,
  // mesos/hr, the newest run; most farmed first. ids = the runs there, newest first
  function byMap(list){
    const g = {};
    for (const x of list){ const k = placeOf(x), m = metrics(x), o = g[k] ||= {name: k, runs: 0, min: 0, expW: 0, hW: 0, mesos: 0, best: null, bestId: null, last: 0, ids: []};
      o.runs++; o.min += m.min; o.mesos += x.mesos || 0; o.ids.push(x.saved); o.last = Math.max(o.last, +x.saved || 0);
      if (m.expHr != null && m.h){ o.expW += m.expHr * m.h; o.hW += m.h; if (o.best == null || m.expHr > o.best){ o.best = m.expHr; o.bestId = x.saved } } }
    return Object.values(g).map(o => ({name: o.name, runs: o.runs, min: o.min, expHr: o.hW ? o.expW / o.hW : null, bestExpHr: o.best, bestId: o.bestId,
      mesosHr: o.min ? o.mesos / (o.min / 60) : null, last: o.last, ids: o.ids.sort((a, b) => b - a)})).sort((a, b) => b.min - a.min || b.last - a.last);
  }
  // personal bests: the run with the most EXP/hr, mesos/hr, net/hr and kills/hr (15+ min farming) -> {key: saved}
  function bests(list){
    const out = {};
    for (const k of ["expHr", "mesosHr", "netHr", "killsHr"]){ let top = null;
      for (const x of list){ if ((x.activeMin || 0) < PB_MIN) continue; const v = metrics(x)[k]; if (v != null && v > 0 && (top == null || v > top.v)) top = {v, id: x.saved} }
      if (top) out[k] = top.id }
    return out;
  }
  // the History list's search and filters: f = {q, map, player, kind: "" | "grind" | "kpq", sort: "new" | "old" | "expHr" | "mesosHr" | "netHr" | "min"}
  function filterRuns(list, f = {}){
    const q = String(f.q || "").trim().toLowerCase();
    let out = list.filter(x => (!f.map || placeOf(x) === f.map) && (!f.player || (x.player || "") === f.player)
      && (!f.kind || (f.kind === "kpq") === isKpq(x))
      && (!q || [x.name, x.note, x.mapName, x.player, x.job, x.topMob?.name, x.date].some(v => v && String(v).toLowerCase().includes(q))));
    const s = f.sort || "new";
    if (s === "old") out = out.sort((a, b) => a.saved - b.saved);
    else if (s === "new") out = out.sort((a, b) => b.saved - a.saved);
    else { const v = x => metrics(x)[s] ?? -Infinity; out = out.sort((a, b) => v(b) - v(a) || b.saved - a.saved) }
    return out;
  }
  // Today (top of History): the runs saved on the same local calendar day as now (by when they were saved, i.e. Stop)
  const dayKey = t => { const d = new Date(+t); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() };
  function today(list, now = Date.now()){
    const k = dayKey(now), runs = list.filter(x => +x.saved && dayKey(x.saved) === k);
    return {runs: runs.length, min: runs.reduce((a, x) => a + (+x.activeMin || 0), 0), exp: runs.reduce((a, x) => a + (+expOf(x) || 0), 0),
      mesos: runs.reduce((a, x) => a + (+x.mesos || 0), 0)};
  }
  // Goal ETA: "Lv 30 by Thursday at your Pig Beach rate". Where you are = the newest run's end level (and its end EXP % when
  // the end reading was on that level, else the start of the level); EXP left from the EXP table (past it: unknown, no
  // guess); hours = EXP left / the map's EXP/hr (byMap: every run weighted by farming time, 15+ min there); the day = those
  // hours at the farming time a day you played in the last 7 days (days with a run only)
  function goalEta(list, o = {}){
    const exp = o.exp || {}, now = o.now ?? Date.now();
    const last = [...list].filter(x => +x.saved && (x.endLevel ?? x.level)).sort((a, b) => b.saved - a.saved)[0];
    if (!last) return {why: "no level"};
    const level = +(last.endLevel ?? last.level), pct = last.snap && +last.snap.endLevel === level && Number.isFinite(+last.snap.endPct) ? Math.min(100, Math.max(0, +last.snap.endPct)) : null;
    const goal = o.goal === "next" ? level + 1 : +o.goal || 0;
    if (!goal) return {why: "no goal"};
    if (goal <= level) return {why: "reached", level, goal};
    let need = 0;
    for (let L = level; L < goal; L++){ const e = +exp[L]; if (!(e > 0)) return {why: "no table", level, goal}; need += L === level ? e * (1 - (pct || 0) / 100) : e }
    const week = list.filter(x => +x.saved > now - 7 * 864e5 && +x.saved <= now), days = new Set(week.map(x => dayKey(x.saved))).size;
    const perDay = days ? week.reduce((a, x) => a + (+x.activeMin || 0), 0) / 60 / days : null;   // hours a day you played
    const maps = byMap(list).filter(m => m.name !== "?" && m.name !== "KPQ" && m.expHr > 0 && m.min >= PB_MIN)
      .map(m => { const hours = need / m.expHr; return {name: m.name, expHr: m.expHr, hours, at: perDay > 0 ? now + hours / perDay * 864e5 : null} })
      .sort((a, b) => a.hours - b.hours);
    return {level, pct, goal, need, perDay, maps};
  }
  // a saved run fixed by hand (History details > Edit, main.js update-session): name/note as text, the map, and the numbers a
  // misread can get wrong. Only the keys in patch change; the first value of each edited number is kept in x.orig, and
  // x.edited marks it. EXP is set wherever History reads it (expTotal, the start/end readings, the live count)
  const EDIT_NUM = {activeMin: [0, 10080, 1], exp: [0, 2e9, 0], mesos: [0, 2e10, 0], kills: [0, 1e7, 0], deaths: [0, 1e4, 0]};
  function applyEdit(x, patch, now = Date.now()){
    const y = JSON.parse(JSON.stringify(x)), cut = (v, n) => typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
    if (!patch || typeof patch !== "object") return y;
    if ("name" in patch) y.name = cut(patch.name, 60);
    if ("note" in patch) y.note = cut(patch.note, 1000);
    const keep = (k, v) => { y.orig ||= {}; if (!(k in y.orig)) y.orig[k] = v ?? null };
    let changed = false;
    if ("mapName" in patch){ const n = cut(patch.mapName, 60), id = patch.map != null && /^\d{1,10}$/.test(String(patch.map)) ? String(patch.map) : null;
      if (n && n !== y.mapName){ keep("mapName", y.mapName); keep("map", y.map); y.mapName = n; y.map = id; changed = true } }
    for (const [k, [lo, hi, dp]] of Object.entries(EDIT_NUM)){
      if (!(k in patch)) continue; const v = Number(patch[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) continue;
      const r = dp ? Math.round(v * 10) / 10 : Math.round(v), was = k === "exp" ? expOf(y) : y[k];
      if (r === was) continue;
      keep(k, was); changed = true;
      if (k === "exp"){ y.exp = r; if ("expTotal" in y) y.expTotal = r; if (y.snap && typeof y.snap === "object") y.snap.exp = r }
      else y[k] = r;
      // the start/end readings' minutes are clock time; a fixed farming time is what the rate should use
      if (k === "activeMin" && y.snap && typeof y.snap === "object" && y.snap.minutes > 0) y.snap.minutes = r;
    }
    if (changed){ y.edited = now; if (y.activeMin >= 1) y.expPerActiveMin = Math.round(expOf(y) / y.activeMin); else y.expPerActiveMin = null }
    return y;
  }
  const api = {metrics, applyEdit, EDIT_NUM, today, goalEta, compareRuns, perHour, byMap, bests, filterRuns, placeOf, isKpq, expOf, GROUPS, MAX_CMP, PB_MIN};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
