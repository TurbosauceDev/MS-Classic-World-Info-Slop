// Performance monitor maths (pure, Node-tested; loaded by the window). Turns Electron's app.getAppMetrics() rows plus the
// reader's per-stage timings (PERF in renderer-live.js) into table rows and plain warnings.
// Warning limits are our own judgement for "don't hurt the game", not game numbers or benchmarks: CPU is % of ONE core
// (Electron's percentCPUUsage), so 100 = a whole core busy.
(function (root){
  const LIMIT = {cpu: 25, mem: 1500, busy: 40, read: 80, rate: 0.6};   // total CPU %, total MB, % of time reading, avg read ms, achieved/target reads
  const KIND = {Browser: "App (main)", Tab: "Window or reader", GPU: "Graphics", Utility: "Helper", "Zygote": "Helper"};
  const name = m => (m.name && m.type === "Utility" ? m.name : KIND[m.type] || m.type || "Other");
  const MB = kb => Math.round((kb || 0) / 1024);
  /* metrics: getAppMetrics() rows ({type, name?, cpu:{percentCPUUsage}, memory:{workingSetSize KB, privateBytes? KB}}).
     privateBytes (Windows) is the memory the process holds itself — JS heap, frame buffers, its own copy of shared
     pages — the same figure Task Manager's Memory column shows. Summing working sets instead counted the system
     libraries every Electron process maps (200-300 MB each) once per process, so the total warned at 2+ GB that was
     mostly the same shared pages counted six times. Elsewhere privateBytes is missing and the working set stands in. */
  function procs(metrics){
    return (metrics || []).map(m => ({name: name(m), cpu: +(m.cpu?.percentCPUUsage || 0).toFixed(1), mem: MB(m.memory?.privateBytes ?? m.memory?.workingSetSize)}))
      .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem);
  }
  /* perf: PERF-shaped {tick:{n,sum,max}, grab, same, read}; el = ms since reading started; rate = reads/s measured over the last
     few seconds (null if not reading); target = the wanted reads/s (FPS) */
  function stages(perf, el){
    const avg = k => perf?.[k]?.n ? perf[k].sum / perf[k].n : null;
    return {grab: avg("grab"), same: avg("same"), read: avg("read"), tick: avg("tick"), readMax: perf?.read ? perf.read.max : null,
      busy: perf?.tick && el > 0 ? perf.tick.sum / el * 100 : null};
  }
  function warnings(rows, st, rate, target){
    const w = [], cpu = rows.reduce((a, r) => a + r.cpu, 0), mem = rows.reduce((a, r) => a + r.mem, 0);
    if (cpu > LIMIT.cpu) w.push(`The tracker is using ${Math.round(cpu)}% of one CPU core. Try Simple mode or turn off the Chat blocker.`);
    if (mem > LIMIT.mem) w.push(`The tracker is using ${mem} MB of memory.`);
    if (st.busy != null && st.busy > LIMIT.busy) w.push(`Reading takes ${Math.round(st.busy)}% of the time. Close other heavy programs or lower the game's resolution.`);
    if (st.read != null && st.read > LIMIT.read) w.push(`One screen read takes ${Math.round(st.read)} ms, which is slow for this PC.`);
    if (rate != null && target && rate < target * LIMIT.rate) w.push(`Reading ${rate.toFixed(1)} times a second, short of the ${target} wanted: the PC can't keep up.`);
    return {list: w, cpu: +cpu.toFixed(1), mem};
  }
  const api = {LIMIT, procs, stages, warnings};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindPerf = api;
})(typeof window !== "undefined" ? window : globalThis);
