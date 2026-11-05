/* Map-title fingerprint (CV efficiency, 2026-11-05). The minimap title is OCR'd through Tesseract every 5 s; the OCR
   caches (core/ocrcache.js) skip that only while the pixels hold, and a title rect re-cut a pixel or two wide (the
   2026-11-04 "1st Accompa" bug class) changes the pixels wholesale, so the tolerant cache kept serving the cut text
   until the map changed under it. A title is fixed UI text: the same map paints the same glyphs for hours, so the
   crop's ink shape identifies the map on its own.

   The fingerprint is the binarized ink bitmap (the crop mapTextCrop builds is already black-on-white) trimmed to its
   ink bounding box - that absorbs the rect being cut at a different origin - then downsampled to a fixed grid of
   column x row cells, each holding the cell's ink density quantized to 4 levels. Quantized coarsely, a 1-2 px rect
   jitter or an encoder shimmer moves a cell or two across a level edge; a different title moves most of them (measured
   on Danny's 35 report folders' 280 frames: same-title pairs sit far under different-title pairs - see cv.test.js).
   The lookup is nearest-neighbour under a Hamming cap: under the cap = the same title, answer without OCR; over it
   (a cut rect, a new map) = OCR as before and, once the read is accepted twice running, remember it.

   Pure; cv.test.js runs it in Node. Persisted by the renderer under settings.mapfps ({v, fps:[{s, id, name, t}]}),
   the same shape problem as the learned glyphs (settings.glyphs).

   sig(crop) -> string | null   crop: {w, h, d: RGBA bytes}, black ink on white, as mapTextCrop returns
   dist(a, b) -> Hamming distance between two signatures (cells that differ)
   createStore(max = 200) -> {find(sig) -> {id, name} | null, offer(sig, map) -> changed, entries(), stats}
     find: nearest stored signature within FP_MAX_DIST; a miss means OCR.
     offer: called by the renderer when a read is accepted (the map read twice running, the same rule as the event);
       a signature we already hold (a jitter variant) refreshes its place, a new one pushes the oldest out (LRU). */
(function (root){
  const COLS = 24, ROWS = 5, T1 = 0.06, T2 = 0.18, T3 = 0.36;   // cell edges measured on Danny's report frames (cv.test.js keeps them honest)
  const FP_MAX_DIST = 4;   // same-title pairs measured 0-2 apart; different titles 10+ (cv.test.js). A cut rect loses cells wholesale: never under the cap
  function sig(c){
    const w = c.w, h = c.h, d = c.d;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!d[(y * w + x) * 4]){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 < 0) return null;   // a crop with no ink: nothing to remember (an empty read, not a title)
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, out = [];
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++){
      const xa = x0 + Math.floor(bw * cx / COLS), xb = Math.max(xa + 1, x0 + Math.floor(bw * (cx + 1) / COLS));
      const ya = y0 + Math.floor(bh * cy / ROWS), yb = Math.max(ya + 1, y0 + Math.floor(bh * (cy + 1) / ROWS));
      let n = 0, tot = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++){ tot++; if (!d[(y * w + x) * 4]) n++ }
      const f = tot ? n / tot : 0;
      out.push(f < T1 ? 0 : f < T2 ? 1 : f < T3 ? 2 : 3);
    }
    return out.join("");
  }
  function dist(a, b){ let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }
  function createStore(max = 200){
    const m = new Map(), stats = {hits: 0, misses: 0, adds: 0};
    function find(s){
      if (!s || !m.size) return null;
      let best = null, bd = FP_MAX_DIST + 1;
      for (const [k, e] of m){ const d = dist(s, k); if (d < bd){ bd = d; best = e } }
      if (!best) return null;
      stats.hits++;
      m.delete(best.s); m.set(best.s, best);   // newest last (LRU)
      return {id: best.id, name: best.name};
    }
    function offer(s, map){
      if (!s || !map || !(map.id || map.name)) return false;
      for (const [k, e] of m) if (dist(s, k) <= FP_MAX_DIST){ m.delete(k); m.set(k, e); return false }   // a signature we already hold (a jitter variant of it): refresh its place, nothing new
      m.set(s, {s, id: map.id ?? null, name: map.name ?? null});
      stats.adds++;
      while (m.size > max) m.delete(m.keys().next().value);
      return true;
    }
    return {find, offer, entries: () => [...m.values()].map(e => ({s: e.s, id: e.id, name: e.name})), stats, size: () => m.size};
  }
  /* the persisted shape: {v, fps: [{s, id, name}]}; anything else (old version, junk, a list) is dropped, entries without
     a usable signature or map with it */
  function load(store, data, max = 200){
    if (!data || data.v !== 1 || !Array.isArray(data.fps)) return 0;
    let n = 0;
    for (const e of data.fps.slice(-max)) if (e && typeof e.s === "string" && e.s.length === COLS * ROWS && (e.id != null || e.name != null) && !store.find(e.s)){ store.offer(e.s, e); n++ }
    return n;
  }
  const api = {sig, dist, createStore, load, FP_MAX_DIST};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindMapFp = api;
})(typeof window !== "undefined" ? window : globalThis);
