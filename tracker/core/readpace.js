/* Read pacing from observed content (customclassic-chat port, 2026-10-31). Their ReadPace decides how soon the chat
   may be read again: no sooner than the box could fill up once at the busiest line rate assumed — the rate seen
   lately, times 1.5 for safety — so a busy chat isn't read line by line; and any sign that lines went by unread
   (a "gap": the whole box turned over between reads) or over half the box arriving at once reads at full speed for
   a while. We already pace by how quiet the player is (pace() in renderer-live.js); this adds the busy side: new
   chat lines a second set a floor under the read rate, and gaps hurry it to the cap. Pure; cv.test.js runs it.

   create() -> {note(t, newLines, shown, gap), rate(t), floor(t), reset()}
     note: one read's outcome. shown = lines on screen (the scan's n), newLines = how many were new, gap = the whole
     box turned over (shown >= 3 and new >= shown) — their hurry signals, 60 s for a gap, 10 s for a half-full box.
     rate: new lines a second over the last 30 s (at least a 10 s span, like theirs).
     floor: reads a second wanted so the box can't turn over twice between reads: rate x 1.5 x 1.3 (wraps) / shown,
     capped at 4 (the Chat blocker's rate); the cap while hurrying, 0 when nothing was seen lately. */
(function (root){
  const WINDOW_MS = 30e3, MIN_SPAN_MS = 10e3, SAFETY = 1.5, WRAP = 1.3;   // their constants: 30 s window, x1.5, 1.3 for wraps
  const HURRY_GAP_MS = 60e3, HURRY_HALF_MS = 10e3, CAP = 4;
  function create(){
    const arr = [];   // [t, newLines] of the reads of the last 30 s
    let hurryUntil = 0, shown = 0;
    function note(t, n, linesShown, gap){
      if (linesShown) shown = linesShown;
      arr.push([t, n || 0]);
      while (arr.length && arr[0][0] < t - WINDOW_MS) arr.shift();
      if (gap) hurryUntil = Math.max(hurryUntil, t + HURRY_GAP_MS);
      else if (shown && (n || 0) >= Math.max(2, shown / 2)) hurryUntil = Math.max(hurryUntil, t + HURRY_HALF_MS);
    }
    function rate(t){
      if (!arr.length) return 0;
      const span = Math.max(MIN_SPAN_MS, t - arr[0][0]);
      return arr.reduce((a, x) => a + x[1], 0) / (span / 1000);
    }
    function floor(t){
      if (t < hurryUntil) return CAP;
      if (!shown) return 0;
      const r = rate(t);
      return r > 0 ? Math.min(CAP, r * SAFETY * WRAP / shown) : 0;
    }
    function reset(){ arr.length = 0; hurryUntil = 0; shown = 0 }
    return {note, rate, floor, reset};
  }
  const api = {create, CAP};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindReadPace = api;
})(typeof window !== "undefined" ? window : globalThis);
