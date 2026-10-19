/* History (the window's History tab): pure maths over saved sessions (main.js sessions(): the summaries renderer-run.js
   saves at Stop, plus `saved`, the file's time stamp). No DOM; core.test.js runs it in Node. Every number is worked out from
   what the session recorded: nothing here guesses a rate.

   metrics(x, ctx) -> {h, expHr, exp, apm, killsHr, mesosHr, lootHr, usedHr, netHr, mesoPerKill, bestEach, min, deaths, kpqBest, kpqRounds, readShare}
   compareRuns(runs, base, ctx) -> {groups: [{name, rows: [{key, label, low, show, vals, best, delta}]}], wins}
   perHour(runs, "mobs" | "items", top) -> [{id, vals}]   kills or pickups per hour of farming, the top ids across the runs
   byMap(list) / bests(list) / filterRuns(list, f)
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
  const api = {metrics, compareRuns, perHour, byMap, bests, filterRuns, placeOf, isKpq, expOf, GROUPS, MAX_CMP, PB_MIN};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
