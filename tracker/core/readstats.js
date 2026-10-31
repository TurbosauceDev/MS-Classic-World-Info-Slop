/* Reader self-telemetry (customclassic-chat port, 2026-10-31). Their ReadStats appends one jsonl line a minute to a
   size-capped reading.jsonl — what reading the screen costs and how it keeps up — so settings can be compared by
   their real numbers instead of feel, and a regression shows up as a number before it shows up as a complaint.
   Ours: the renderer sums each minute of its reader counters (frames looked at, gate skips, read times, OCR runs,
   cache hits, chat lines, events) and the main process appends the line to reading.jsonl (2 MB cap, newest 6000
   kept, written atomically) and shows the last one in the Performance monitor. Pure here: the counter list, the
   per-minute deltas and the line shape; the file work lives in main.js. cv.test.js runs it in Node.

   record(t, cur, prev) -> a flat jsonl line: every COUNTER as cur - prev (deltas), fps and at carried as they are.
   COUNTERS drives both sides: the renderer keeps these cumulative, main stores whatever arrives. */
(function (root){
  const COUNTERS = ["looks", "reads", "skipExact", "skipTol", "readMs", "tickMs", "ocrRuns", "ocrMs", "cacheHits",
    "tolHits", "memoHits", "chatLooks", "chatNew", "chatGaps", "chatOcrMs", "evExp", "evMeso", "evBonus", "evItems",
    "reTries", "reWins"];
  const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) };
  function record(t, cur, prev){
    prev = prev || {};
    const out = {at: stamp(t)};
    if (cur.fps != null) out.fps = cur.fps;
    for (const k of COUNTERS){
      const v = Math.round((cur[k] || 0) - (prev[k] || 0));
      if (v > 0) out[k] = v;   // only gains: the counters reset on Start, a negative would be a stale prev
    }
    return out;
  }
  const api = {COUNTERS, record, stamp};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindReadStats = api;
})(typeof window !== "undefined" ? window : globalThis);
