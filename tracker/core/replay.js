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
  const NAME = /^frame-(\d+)-(\d{2})(\d{2})(\d{2})\.(?:png|webp)$/;
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
  /* Picture size straight from the file header, so the capture size is known before any picture is decoded: PNG (IHDR) or WebP
     (lossless VP8L, extended VP8X, lossy VP8). {w, h}, or null for anything else. */
  function imageSize(b){
    if (!b || b.length < 30) return null;
    const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return {w: u32(16), h: u32(20)};
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50){
      const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tag === "VP8L" && b[20] === 0x2f){ const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; return {w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1} }
      if (tag === "VP8X") return {w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1};
      if (tag === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return {w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff};
    }
    return null;
  }
  const Replay = {argFolder, planFrames, imageSize};
  root.GrindReplay = Replay;
  if (typeof module !== "undefined") module.exports = Replay;
})(typeof window !== "undefined" ? window : globalThis);
