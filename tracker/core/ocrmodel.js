/* core/ocrmodel.js — neural text-line reader (P1-6, 2026-11-02). A JavaScript port of the recognition
   half of ocrs (github.com/robertknight/ocrs, MIT) — the same recognition-only model Minerva bundles —
   for the model file we have permission to use (CC BY-SA 4.0, unmodified; see models/NOTICE.md for the
   full attribution). Recognition only, like Minerva's use of it: the caller supplies the line crops
   (black-on-white, exactly what every reader already cut for Tesseract), this prepares them the way
   ocrs does and CTC-decodes what the model says. Pure: no DOM, no Electron, no onnxruntime — the
   runner is injected, so tests drive a mock (tests/ocrmodel.test.js) and the app binds
   onnxruntime-node (app/main.js). Tesseract stays as the fallback engine for anything the model
   reads empty or badly.

   Ported constants, each from ocrs source (recognition.rs / preprocess.rs / lib.rs):
     input height 64 (the model's fixed H; ocrs reads it off the model), width clamp 10..2400,
     line images padded to a multiple of 50 px so same-width lines batch into one run (max 20),
     pixels are BT.601 luma in [0,1] biased by -0.5 (BLACK_VALUE: black -0.5, white +0.5),
     bilinear resize at half-pixel centres (rten resize_image: Linear + HalfPixel, clamped),
     CTC greedy decode: label 0 = blank, label i+1 = alphabet[i], repeated labels collapse,
     the alphabet is ocrs' DEFAULT_ALPHABET, 96 chars (the model emits 97 classes).

   createOcrModel() -> {
     alphabet,
     prepLine(crop, opt) -> {data, w, h},     crop {w, h, d: RGBA bytes} -> {Float32Array, resized}
     readLines(crops, runner, opt) -> [{text, conf}],   one runner.run per width bucket, rows kept in order
   }
   runner: run(data, [batch, 1, h, w]) -> Promise<{data, seq, classes}> with the model's
   [seq, batch, classes] log-softmax layout. opt.allowed: a string of the only characters a read may
   produce (ocrs' allowed_chars) — prices, say, read with "0123456789, " cannot come back "8,001"→"8,oo1". */
(function (root){
  const INPUT_H = 64, MIN_W = 10, MAX_W = 2400, GROUP = 50, BATCH = 20, BLACK = -0.5;
  const ALPHABET = " 0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~EABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  /* ocrs prepare_image: BT.601 luma scaled to [0,1] plus BLACK_VALUE. */
  function gray(crop){
    const {w, h, d} = crop, out = new Float32Array(w * h);
    for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255 + BLACK;
    return out;
  }

  /* rten resize_image: bilinear, half-pixel centres (src = scale * (dst + 0.5) - 0.5), edges clamped. */
  function resize(src, sw, sh, dw, dh){
    const out = new Float32Array(dw * dh), sx = sw / dw, sy = sh / dh;
    for (let y = 0; y < dh; y++){
      const fy = sy * (y + 0.5) - 0.5, y0 = Math.floor(fy), ty = fy - y0;
      const ya = Math.min(Math.max(y0, 0), sh - 1), yb = Math.min(Math.max(y0 + 1, 0), sh - 1);
      for (let x = 0; x < dw; x++){
        const fx = sx * (x + 0.5) - 0.5, x0 = Math.floor(fx), tx = fx - x0;
        const xa = Math.min(Math.max(x0, 0), sw - 1), xb = Math.min(Math.max(x0 + 1, 0), sw - 1);
        const a = src[ya * sw + xa], b = src[ya * sw + xb], c = src[yb * sw + xa], d = src[yb * sw + xb];
        out[y * dw + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }
    }
    return out;
  }

  /* ocrs resized_line_width: keep the line's aspect ratio at the model's input height, width clamped
     (truncated, as the Rust `as u32` does). */
  function resizedWidth(w, h, inputH){
    return Math.trunc(Math.min(MAX_W, Math.max(MIN_W, inputH * w / h)));
  }

  function prepLine(crop, opt = {}){
    const inputH = opt.inputH || INPUT_H;
    if (!crop || !crop.w || !crop.h || !crop.d) return {data: new Float32Array(0), w: 0, h: inputH};
    const w = resizedWidth(crop.w, crop.h, inputH);
    return {data: resize(gray(crop), crop.w, crop.h, w, inputH), w, h: inputH};
  }

  /* The crops arrive hard-binarized at whatever upscale the cutter chose (2x for names on a 2x frame, 4x
     for the second price cut). The model reads them best at ~4x: one nearest-neighbour doubling later its
     own resize antialiases the blocky edges instead of squashing them (measured on the shop fixture:
     names 3/6 -> 6/6 through matchName, prices 6/6 through parseOffer). upscale(c, f) does that doubling. */
  function upscale(c, f){
    const W = c.w * f, H = c.h * f, d = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const q = (y * W + x) * 4, s = ((y / f | 0) * c.w + (x / f | 0)) * 4; d[q] = c.d[s]; d[q + 1] = c.d[s + 1]; d[q + 2] = c.d[s + 2] }
    return {w: W, h: H, d};
  }

  /* ocrs allowed_chars -> excluded labels: every class whose character is not allowed is barred
     from the argmax (label 0, the blank, is never excluded). */
  function excludedFromAllowed(allowed){
    if (!allowed) return null;
    const ex = new Uint8Array(ALPHABET.length + 1);
    for (let i = 0; i < ALPHABET.length; i++) if (!allowed.includes(ALPHABET[i])) ex[i + 1] = 1;
    return ex;
  }

  /* CTC greedy decode of one batch row of [seq, batch, classes] log-softmax. conf: the geometric
     mean of the kept steps' probabilities (exp of the log-prob), low: the weakest kept step's
     probability — one near-certain price with one guessed digit hides in the mean, not in low.
     Both 0 when nothing was read. */
  function decode(seq, data, bi, batch, classes, excluded){
    let text = "", sum = 0, n = 0, prev = -1, low = 1;
    for (let s = 0; s < seq; s++){
      let best = 0, bv = -Infinity;
      const base = (s * batch + bi) * classes;
      for (let c = 0; c < classes; c++){
        if (excluded && excluded[c]) continue;
        const v = data[base + c];
        if (v > bv){ bv = v; best = c }
      }
      if (best === prev) continue;   // repeated label: one character; the blank separates runs
      prev = best;
      if (!best) continue;           // 0 = CTC blank
      text += ALPHABET[best - 1] || "?";
      sum += bv; n++; if (bv < low) low = bv;
    }
    return {text, conf: n ? Math.exp(sum / n) : 0, low: n ? Math.exp(low) : 0};
  }

  /* Read every crop: group by padded width bucket (ocrs' next_multiple_of(50) grouping, so one run
     carries same-width lines together), 20 lines a batch, answers back in input order. */
  async function readLines(crops, runner, opt = {}){
    const inputH = opt.inputH || INPUT_H, excluded = excludedFromAllowed(opt.allowed);
    const out = new Array(crops.length);
    const live = [];
    crops.forEach((c, i) => {
      const p = prepLine(c, opt);
      if (!p.w){ out[i] = {text: "", conf: 0}; return }   // a broken crop answers empty, no run spent on it
      live.push({i, p});
    });
    const groups = new Map();
    const byIndex = new Map(live.map(({i, p}) => [i, p]));
    live.forEach(({i, p}) => {
      const gw = Math.max(GROUP, Math.ceil(p.w / GROUP) * GROUP);
      if (!groups.has(gw)) groups.set(gw, []);
      groups.get(gw).push(i);
    });
    for (const [gw, idxs] of groups){
      for (let i = 0; i < idxs.length; i += BATCH){
        const chunk = idxs.slice(i, i + BATCH), b = chunk.length;
        const tensor = new Float32Array(b * inputH * gw).fill(BLACK);
        chunk.forEach((ci, bi) => {
          const p = byIndex.get(ci);
          for (let y = 0; y < inputH; y++) tensor.set(p.data.subarray(y * p.w, (y + 1) * p.w), (bi * inputH + y) * gw);
        });
        const r = await runner.run(tensor, [b, 1, inputH, gw]);
        chunk.forEach((ci, bi) => { out[ci] = decode(r.seq, r.data, bi, b, r.classes, excluded) });
      }
    }
    return out;
  }

  const api = {createOcrModel: () => ({alphabet: ALPHABET, prepLine, readLines}), gray, resize, resizedWidth, decode, excludedFromAllowed, upscale, ALPHABET, INPUT_H};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindOcrModel = api;
})(typeof window !== "undefined" ? window : globalThis);
