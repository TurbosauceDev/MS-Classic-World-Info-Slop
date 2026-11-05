/* The debug log's per-minute performance line (0.3.46, Danny: "its starting to lag like crazy it might be because of
   the tracker idk" — and the old PERF line couldn't answer it: cumulative averages only, and the debug log cut it off
   with "..."). Pure, so core.test.js can pin the format. The renderer collects one minute of numbers (per-minute, not
   cumulative) plus one main-process reading and hands them here; the result is one line, never truncated by
   core/debuglog.js (kind "perf" is written whole).
     frames/fps/skipped — how much the reader worked
     tick, grab, same, read, ring, band, ocr — ms per stage: {n, avg, max} (avg/max per minute)
     busyPct — % of one core the whole tick took, per minute
     heapMb — the renderer window's JS heap (performance.memory, Chromium only; null elsewhere)
     main — the main process: {rss, heap, cpu} MB and % CPU (process.getCPUUsage delta, perf-main IPC)
     lagMs — the worst event-loop lag this minute (how late a 1 s timer fired)
   Missing pieces print as "-" so the line's shape never changes (grep-able, diff-able between minutes). */
(function (root){
  const n1 = v => v == null || !Number.isFinite(v) ? "-" : String(Math.round(v * 10) / 10);
  const st = (p, unit) => p && p.n ? n1(p.avg) + (p.max != null ? "/" + n1(p.max) : "") + unit : "-";
  function line(m){
    m = m || {};
    return "PERF " +
      `${m.frames ?? "-"} frames, fps ${n1(m.fps)}, skipped ${m.skipped ?? "-"}${m.skippedTol ? " (" + m.skippedTol + " jitter)" : ""}` +
      `; tick ${st(m.tick, " ms")}` +
      `; capture ${st(m.grab, " ms")}, compare ${st(m.same, " ms")}, read ${st(m.read, " ms")}` +
      `; ring-encode ${st(m.ring, " ms")}` +
      `; busy ${n1(m.busyPct)}% of one core` +
      `; heap ${n1(m.heapMb)} MB, main ${m.main ? `${m.main.rss ?? "-"}/${m.main.heap ?? "-"} MB cpu ${n1(m.main.cpu)}%` : "-"}` +
      `; loop-lag max ${n1(m.lagMs)} ms` +
      (m.band && m.band.n ? `; pickup band ${m.band.n} looks, ${st(m.band, " ms")} each` : "") +
      (m.ocr && m.ocr.n ? `; ocr ${m.ocr.n} runs, ${st(m.ocr, " ms")} each` : "") +
      (m.memoHits ? `; ${m.memoHits} reads answered from memory` : "");
  }
  const D = {line};
  if (typeof module !== "undefined" && module.exports) module.exports = D; else root.GrindPerfLine = D;
})(typeof window !== "undefined" ? window : globalThis);
