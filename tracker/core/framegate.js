/* Change gate before reading (customclassic-chat port, 2026-10-31). Their chat reader only re-reads when the
   picture really changed: a pixel counts as moved when any of R,G,B moved more than CHANGE_STEP (60/255), and the
   picture counts as changed when more than CHANGE_SHARE (1%) of its pixels moved. Measured there: a new chat line
   moves >= 12% of the box's pixels, an idle one ~0 — so encoder jitter (a few shimmering pixels) is skipped while
   real content never is. Our exact-frame skip (sameAsLast) does the same job, but one jitter pixel defeats it and a
   whole read runs for nothing; this is the same rule as its second stage. Pure; cv.test.js runs it in Node.

   share(before, now, step) -> moved-pixel share 0..1 (alpha ignored; a length mismatch is 1: never gate).
   changed(before, now, step, minShare) -> true when the share is over the limit. */
(function (root){
  const STEP = 60, SHARE = 0.01;   // 60/255 per channel, 1% of the picture: the pair their reader measured
  function share(before, now, step = STEP){
    if (!before || !now || before.length !== now.length) return 1;
    let n = 0;
    for (let i = 0; i < now.length; i++){
      const a = now[i], b = before[i];
      if (a === b) continue;
      const dr = (a & 255) - (b & 255), dg = (a >>> 8 & 255) - (b >>> 8 & 255), db = (a >>> 16 & 255) - (b >>> 16 & 255);
      if (dr > step || dr < -step || dg > step || dg < -step || db > step || db < -step) n++;
    }
    return n / now.length;
  }
  const changed = (before, now, step, minShare = SHARE) => share(before, now, step) > minShare;
  const api = {share, changed, STEP, SHARE};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindFrameGate = api;
})(typeof window !== "undefined" ? window : globalThis);
