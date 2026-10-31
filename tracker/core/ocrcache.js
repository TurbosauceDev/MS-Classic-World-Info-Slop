/* OCR result cache (CV efficiency, T-13). The map title, job and name crops are black-on-white PNGs that only change when the
   game changes them, but each was run through Tesseract (about 90 ms) on a timer: the map every 5 s, the job every 30 s.
   Same pixels give the same text, so the text is kept under a hash of the crop. A hit skips the PNG encode, the IPC and
   Tesseract. Pure; core.test.js / cv.test.js run it in Node.

   createOcrCache(max) -> {key(crop), run(crop, ocr), stats}   crop: {w, h, d: RGBA bytes}; ocr(crop) -> Promise<text> */
(function (root){
  function key(c){
    const p = c.d.byteLength % 4 === 0 && c.d.byteOffset % 4 === 0 ? new Uint32Array(c.d.buffer, c.d.byteOffset, c.d.byteLength >> 2) : null;
    let a = 0x811c9dc5, b = 0x9e3779b9;
    const n = p ? p.length : c.d.length;
    for (let i = 0; i < n; i++){ const v = p ? p[i] : c.d[i]; a = Math.imul(a ^ v, 16777619); b = Math.imul(b + v, 0x85ebca6b) ^ (b >>> 13) }
    return c.w + "x" + c.h + ":" + (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  function createOcrCache(max = 24){
    const m = new Map(), stats = {hits: 0, misses: 0};
    async function run(c, ocr){
      const k = key(c);
      if (m.has(k)){ const t = m.get(k); m.delete(k); m.set(k, t); stats.hits++; return t }   // newest last
      stats.misses++;
      const t = await ocr(c);
      if (typeof t === "string" && t){ m.set(k, t); if (m.size > max) m.delete(m.keys().next().value) }   // "" = a broken worker: not kept
      return t;
    }
    return {key, run, stats, size: () => m.size};
  }
  /* Tolerance layer (customclassic-chat port, 2026-10-31): the hash above only hits on identical pixels, and one
     shimmering pixel from the video encoder is a miss and a ~90 ms Tesseract run for the same words. A slot keeps
     the last crop it accepted plus its text; when the new crop's moved-pixel share stays under the change gate
     (core/framegate.js), it answers from the slot instead. Measured there: real content moves >= 12% of a text
     box, idle noise ~0 — these crops (map title, job, name) hold fixed UI text that only ever changes wholesale.
     Only for crops whose freshness can wait one real change; the chat-box death/box reads stay exact.
     createTolCache() -> {run(slot, crop, ocr, step, share), stats} */
  function createTolCache(gate){
    const slots = new Map(), stats = {tolHits: 0, runs: 0};
    async function run(slot, c, ocr, step, share){
      const p = c.d.byteOffset % 4 === 0 ? new Uint32Array(c.d.buffer, c.d.byteOffset, c.d.byteLength >> 2) : new Uint32Array(c.d.buffer.slice(c.d.byteOffset, c.d.byteOffset + c.d.byteLength));
      const s = slots.get(slot);
      if (s && s.pix.length === p.length && !gate.changed(s.pix, p, step, share)){ stats.tolHits++; return s.text }
      stats.runs++;
      const t = await ocr(c);
      if (typeof t === "string" && t) slots.set(slot, {pix: p.slice(), text: t});   // "" = a broken worker: not kept
      return t;
    }
    return {run, stats};
  }
  const api = {createOcrCache, createTolCache};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindOcrCache = api;
})(typeof window !== "undefined" ? window : globalThis);
