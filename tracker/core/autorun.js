/* Always-on tracking (Danny approved 2026-11-01, docs/ai/minerva-vs-ours.md): with no run going, the idle watch reads the
   EXP bar; the first rise starts a run by itself, and a run it started ends (saved) after 2 minutes with no EXP.
   Runs started by hand are never ended by this. Pure decisions only; the wiring is in renderer-journal.js (start) and
   renderer-live.js (break). cv.test.js runs it.

   gained(prevExp, e): a bar reading that proves EXP came in (a rise, or a level-up). A first reading, a drop (death) and
     other event types are not.
   shouldBreak({auto, wrap, held, kpq, lastGain, now}): true when an auto-started run has had no EXP for IDLE_MS. */
(function (root){
  const IDLE_MS = 120e3, COOLDOWN_MS = 10e3;
  const gained = (prevExp, prevLevel, e) => !!e && e.type === "bar" && prevExp != null && (e.exp > prevExp || (e.level || 0) > (prevLevel || 0));
  const shouldBreak = o => !!o.auto && !o.wrap && !o.held && !o.kpq && o.lastGain != null && o.now - o.lastGain >= IDLE_MS;
  const api = {IDLE_MS, COOLDOWN_MS, gained, shouldBreak};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindAutoRun = api;
})(typeof window !== "undefined" ? window : globalThis);
