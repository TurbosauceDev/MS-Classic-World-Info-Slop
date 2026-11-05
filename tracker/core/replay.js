// Replay mode (0.3.42), the pure parts: which folder `--replay` names, and the order and recorded times of a bug report's
// pictures. main.js reads the folder and hands the bytes to a special tracker window (renderer-replay.js) that runs the REAL
// readers and the REAL tracker logic over them against a throwaway session. Nothing here touches disk.
(function (root){
  // `--replay <folder>` or `--replay=<folder>` anywhere in argv (a packaged app has the exe first); null when absent
  function argFolder(argv){
    const a = Array.isArray(argv) ? argv : [];
    for (let i = 0; i < a.length; i++){
      const s = String(a[i]);
      if (s === "--replay"){ const n = a[i + 1]; return typeof n === "string" && n && !n.startsWith("--") ? n : null }
      if (s.startsWith("--replay=")) return s.slice(9) || null;
    }
    return null;
  }
  const NAME = /^frame-(\d+)-(\d{2})(\d{2})(\d{2})\.png$/;
  /* Frames in the order they were taken, each with the time it was taken. A report saved by 0.3.42+ lists them in log.json
     (frames: [{name, t}]); older reports only have the UTC HH:MM:SS in the file name, so the day comes from the `saved` time
     (a name that lands after it belongs to the day before). Pure: names are the folder's listing. */
  function planFrames(names, meta, savedMs){
    const known = new Map((Array.isArray(meta) ? meta : []).filter(m => m && typeof m.name === "string" && isFinite(m.t)).map(m => [m.name, +m.t]));
    const rows = [];
    for (const n of names || []){
      const m = NAME.exec(n); if (!m) continue;
      let t = known.get(n);
      if (t == null && isFinite(savedMs)){
        const day = Date.UTC(new Date(savedMs).getUTCFullYear(), new Date(savedMs).getUTCMonth(), new Date(savedMs).getUTCDate());
        t = day + ((+m[2] * 60 + +m[3]) * 60 + +m[4]) * 1000;
        if (t > savedMs + 60e3) t -= 864e5;
      }
      rows.push({name: n, i: +m[1], t: t ?? null});
    }
    rows.sort((x, y) => x.i - y.i);
    // no time at all (no meta, no saved stamp): the 3 s the ring keeps between pictures
    rows.forEach((r, k) => { if (r.t == null) r.t = k * 3000 });
    return rows.map(({name, t}) => ({name, t}));
  }
  const Replay = {argFolder, planFrames};
  root.GrindReplay = Replay;
  if (typeof module !== "undefined") module.exports = Replay;
})(typeof window !== "undefined" ? window : globalThis);
