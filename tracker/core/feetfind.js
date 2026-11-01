/* Range finder (Danny 11-01): where the player's feet are on the screen, which way they face, and how big a game pixel is,
   so the overlay can draw the picked skill's range there. COMPUTER VISION ONLY: pixels of the captured window, nothing else.

   How: the status bar shows your character name (readers.js nameMask, UI pixels, pixel-exact). Your name tag under your
   feet is the same font, drawn by the game world at its own scale (Danny's 2560x1440: UI 2x, world 1440/768 = 1.875x, so on
   the tracker's UI-size picture the tag text is 0.9375 of the status bar's). The status bar name is turned into a template,
   scaled, and matched (normalised cross-correlation on the darkest channel: white text, dark tag) over the playfield.
   The match's scale IS the world scale; feet = the tag's centre column, FEET_OFF game px above the text's top.
   Facing: the tag moving left/right says where you walk; a turn is confirmed by the sprite above the tag matching its own
   mirror image from before the move (a knockback moves you without turning, and doesn't mirror).
   Pure (no DOM, no Node APIs): the reader worker runs it (want.feet), tests/feet.test.js checks it on Danny's screenshot. */
(function (root){
  const FEET_OFF = 12;   // game px from the feet (foothold) down to the name text's top: measured on tests/fixtures/bow-full.png (22 screen px at 1.875x)
  const PAD = 2;         // template border (game px of tag background around the text: dark on both tag styles)
  const MIN_SCORE = 0.55, LOCK_SCORE = 0.62;

  // darkest channel: white text is high on every channel, the wooden/black tag and most scenery are low on at least one
  function lum(img, x0, y0, w, h){
    const L = new Float32Array(w * h), d = img.d;
    for (let y = 0; y < h; y++){ const yy = y0 + y; if (yy < 0 || yy >= img.h) continue;
      for (let x = 0; x < w; x++){ const xx = x0 + x; if (xx < 0 || xx >= img.w) continue;
        const i = (yy * img.w + xx) * 4; L[y * w + x] = Math.min(d[i], d[i + 1], d[i + 2]) } }
    return L;
  }
  // the name mask (1 = ink, UI px) at ratio r, box-filtered (the world draws the tag smoothed), padded, zero-mean
  function scaled(mask, r, TW, TH){
    const {W, H, m} = mask, tw = TW || Math.max(1, Math.round(W * r)), th = TH || Math.max(1, Math.round(H * r)), P = Math.max(1, Math.round(PAD * r));
    const w = tw + 2 * P, h = th + 2 * P, T = new Float32Array(w * h), S = 4;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++){ let s = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++){
        const mx = Math.min(W - 1, Math.floor((x + (sx + .5) / S) / tw * W)), my = Math.min(H - 1, Math.floor((y + (sy + .5) / S) / th * H)); s += m[my * W + mx] }
      T[(y + P) * w + x + P] = s / (S * S) }
    let mean = 0; for (const v of T) mean += v; mean /= T.length;
    let nn = 0; for (let i = 0; i < T.length; i++){ T[i] -= mean; nn += T[i] * T[i] }
    let on = 0; for (let i = 0; i < m.length; i++) on += m[i];
    return {r, w, h, P, tw, th, T, norm: Math.sqrt(nn), ink: on * r * r};
  }
  // best NCC match of a scaled template inside box {x0, y0, x1, y1} (img px, template top-left positions)
  function search(img, tp, box, penal){
    const x0 = Math.max(0, box.x0 | 0), y0 = Math.max(0, box.y0 | 0), x1 = Math.min(img.w - tp.w, box.x1 | 0), y1 = Math.min(img.h - tp.h, box.y1 | 0);
    if (x1 < x0 || y1 < y0) return null;
    const W = x1 - x0 + tp.w, H = y1 - y0 + tp.h, L = lum(img, x0, y0, W, H), n = tp.w * tp.h;
    // integral images: sum, sum of squares, bright count -> window mean/variance and a cheap "is there text-like ink" gate
    const I = new Float64Array((W + 1) * (H + 1)), I2 = new Float64Array((W + 1) * (H + 1)), IB = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++){ let a = 0, b = 0, c = 0;
      for (let x = 0; x < W; x++){ const v = L[y * W + x]; a += v; b += v * v; c += v > 170 ? 1 : 0;
        const o = (y + 1) * (W + 1) + x + 1; I[o] = I[o - W - 1] + a; I2[o] = I2[o - W - 1] + b; IB[o] = IB[o - W - 1] + c } }
    const rect = (A, x, y, w, h) => A[(y + h) * (W + 1) + x + w] - A[y * (W + 1) + x + w] - A[(y + h) * (W + 1) + x] + A[y * (W + 1) + x];
    let best = null;
    const lo = tp.ink * .35, hi = tp.ink * 2.6 + 4, ring = Math.max(2, tp.ink * .12);
    for (let y = 0; y <= y1 - y0; y++) for (let x = 0; x <= x1 - x0; x++){
      const br = rect(IB, x + tp.P, y + tp.P, tp.tw, tp.th); if (br < lo || br > hi) continue;
      if (rect(IB, x, y, tp.w, tp.h) - br > ring) continue;   // the tag around the text is dark: bright pixels in the border = not a tag
      const s = rect(I, x, y, tp.w, tp.h), s2 = rect(I2, x, y, tp.w, tp.h), v = s2 - s * s / n; if (v < n * 400) continue;   // flat: no text
      let dot = 0; for (let ty = 0; ty < tp.h; ty++){ const row = (y + ty) * W + x, trow = ty * tp.w; for (let tx = 0; tx < tp.w; tx++) dot += tp.T[trow + tx] * L[row + tx] }
      let sc = dot / (tp.norm * Math.sqrt(v));
      if (penal) sc *= penal(x0 + x, y0 + y);
      if (!best || sc > best.score) best = {x: x0 + x, y: y0 + y, score: sc};
    }
    return best && {...best, r: tp.r, w: tp.w, h: tp.h, P: tp.P, tw: tp.tw, th: tp.th, tp};
  }
  // the scales to try, best guess first: the world fills the window 768 game px tall (1440 -> 1.875x; Danny's tag measured so)
  // and the status bar name is 9 UI px tall (11 with a g/j/p/q/y), so tag/name = (h / 768) / (name height / 9); then a sweep
  const guesses = (img, mask, last) => { const g = img.h / 768, out = [];
    for (const r of [last, g / (mask.H / 9), g / (mask.H / 11), g, 1]) if (r) out.push(r);
    for (let r = .5; r <= 2.2; r += .04) out.push(r);
    return out.filter((r, i) => r > .3 && r < 3 && !out.slice(0, i).some(o => Math.abs(o - r) < .02)) };
  // chat lines carry names too ("Turbow : hi"): a match in the chat box corner counts a bit less when there's no last position
  const chatPenal = img => (x, y) => x < img.w * .45 && y > img.h * .6 ? .85 : 1;
  const playH = img => Math.floor(img.h * .92);   // the status bar is below: the HUD name itself is never a candidate

  // sprite above the feet -> 16x20 grey signature (for the turn check)
  function sprite(img, fx, fy, r){
    const w = Math.round(56 * r), h = Math.round(68 * r), x0 = Math.round(fx - w / 2), y0 = Math.round(fy - h - 2 * r);
    if (w < 8 || h < 8) return null;
    const GW = 16, GH = 20, s = new Float32Array(GW * GH), d = img.d;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++){ let t = 0, n = 0;
      for (let y = Math.floor(gy * h / GH); y < Math.floor((gy + 1) * h / GH); y++) for (let x = Math.floor(gx * w / GW); x < Math.floor((gx + 1) * w / GW); x++){
        const xx = x0 + x, yy = y0 + y; if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue; const i = (yy * img.w + xx) * 4;
        t += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; n++ }
      s[gy * GW + gx] = n ? t / n : 0 }
    return {s, GW, GH};
  }
  const mirror = g => { const o = new Float32Array(g.s.length); for (let y = 0; y < g.GH; y++) for (let x = 0; x < g.GW; x++) o[y * g.GW + x] = g.s[y * g.GW + g.GW - 1 - x]; return {...g, s: o} };
  function ncc(a, b){ const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++){ ma += a[i]; mb += b[i] } ma /= n; mb /= n;
    let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++){ const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0 }
  // did the sprite turn between two looks? 1 = mirrored (turned), -1 = same way, 0 = can't tell
  function turned(before, now){
    if (!before || !now) return 0;
    const same = ncc(before.s, now.s), mir = ncc(mirror(before).s, now.s);
    return mir - same > .08 ? 1 : same - mir > .08 ? -1 : 0;
  }

  // a whole-pixel template size is a coarse scale step (a 41 px name: 2.4 % a pixel), so on a lock the sizes either side are
  // tried too and the best kept.
  function refine(img, mask, h){
    let best = {...h, tp: scaled(mask, h.r)};
    for (let dw = -1; dw <= 1; dw++) for (let dh = -1; dh <= 1; dh++){ if (!dw && !dh) continue;
      const tw = h.tw + dw, th = h.th + dh; if (tw < 4 || th < 4) continue;
      const tp = scaled(mask, h.r, tw, th), c = search(img, tp, {x0: h.x - 3, y0: h.y - 3, x1: h.x + 3, y1: h.y + 3});
      if (c && c.score > best.score) best = {...c, tp} }
    // px = img px per game px (what ranges are drawn with), not the template ratio: on a pixel-exact UI (k 2-4 found) one UI
    // px is one img px; at a smoothed UI size (1.5x...) the name's own height says it (9 UI px)
    const g = guesses(img, mask, null).slice(0, 3).find(c => Math.abs(best.tw - mask.W * c) <= 1.5 && Math.abs(best.th - mask.H * c) <= 1.5);
    const px = g ? img.h / 768 : best.tw / mask.W * (img.k > 1 ? 1 : mask.H / 9);
    best.tp = {...best.tp, px};   // tracking hits keep the same scale
    return best;
  }
  /* createTracker(): one per reader. step(img, mask, t, opt) -> {ok, x, y, r, face, score, tag} in img px
     (x, y = feet; r = img px per game px; face 1 right, -1 left, 0 not known yet). mask = readers.nameMask(img) (the
     caller caches it). opt.off = feet offset in game px (Skill range card option). */
  function createTracker(){
    let last = null, face = 0, spr = null, scaleR = null, tries = 0, lostT = 0;
    const cache = new Map();   // r -> scaled template (per mask)
    let maskKey = "";
    const tpl = (mask, r) => { const k = r.toFixed(3); if (!cache.has(k)) cache.set(k, scaled(mask, r)); return cache.get(k) };
    function step(img, mask, t, opt = {}){
      // a name is 4-12 letters: wider than tall, 6+ px tall (anything else is the wrong line of the status bar)
      if (!mask || !mask.W || mask.H < 6 || mask.H > 40 || mask.W < mask.H * 1.5){ last = null; return {ok: false, why: "noname"} }
      const key = mask.W + "x" + mask.H + ":" + mask.m.join("");
      if (key !== maskKey){ maskKey = key; cache.clear(); last = null; face = 0; spr = null; scaleR = null }
      const off = Number.isFinite(opt.off) ? opt.off : FEET_OFF, yMax = playH(img);
      let hit = null;
      if (last){   // near where it was: a small box first (standing, attacking), then one a Teleport or a run between two reads fits in
        const tp = last.tp;
        for (const [mx, my] of [[40, 30], [150, 110]]){
          const ax = Math.round(mx * last.px), ay = Math.round(my * last.px);
          const h = search(img, tp, {x0: last.tx - tp.P - ax, y0: last.ty - tp.P - ay, x1: last.tx - tp.P + ax, y1: Math.min(yMax - tp.h, last.ty - tp.P + ay)});
          if (h && h.score >= MIN_SCORE){ hit = h; break }
        }
      }
      if (!hit){   // lost (or first look): the whole playfield, one scale per read until one locks
        const G = guesses(img, mask, scaleR), n = tries++, r = scaleR && n % 2 === 0 ? scaleR : G[(scaleR ? n >> 1 : n) % G.length], tp = tpl(mask, r);   // a known scale every other look
        const h = search(img, tp, {x0: 0, y0: 0, x1: img.w, y1: yMax - tp.h}, chatPenal(img));
        if (h && h.score >= LOCK_SCORE){ hit = refine(img, mask, h); scaleR = r; tries = 0 }
      }
      if (!hit){ if (last && !lostT) lostT = t; if (last && t - lostT > 1500){ last = null; spr = null } return {ok: false, why: "lost", face} }
      lostT = 0;
      const px = hit.tp.px, tx = hit.x + hit.P, ty = hit.y + hit.P, x = tx + hit.tw / 2, y = ty - off * px;
      const now = sprite(img, x, y, px);
      if (last && Math.abs(x - last.x) >= Math.max(1.5, px * 1.5) && t - last.t < 1500){
        const dir = Math.sign(x - last.x);
        if (!face) face = dir;
        else if (dir !== face){ const tv = turned(spr, now); if (tv >= 0) face = dir }   // not a mirror of before: knocked back, still facing the same way
      }
      if (opt.face === 1 || opt.face === -1) face = opt.face;
      spr = now;
      last = {x, y, tx, ty, px, t, tp: hit.tp};
      return {ok: true, x, y, r: px, face, score: +hit.score.toFixed(3), tag: {x: tx, y: ty, w: hit.tw, h: hit.th}};
    }
    return {step, reset(){ last = null; face = 0; spr = null; scaleR = null; tries = 0; cache.clear(); maskKey = "" }};
  }
  const api = {createTracker, scaled, search, refine, sprite, mirror, turned, ncc, FEET_OFF};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindFeet = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
