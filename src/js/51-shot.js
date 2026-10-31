/* screenshot reader: runs in the page, no server. The game draws its UI pixel-exact (often doubled on big screens), so a
   screenshot is first shrunk back to 1 screen pixel per game pixel; then icons are found by exact pixel match against the
   embedded skill/item icons, and numbers are read with the game's digit font (glyphs copied from a real stat window).
   Used by the Character Builder import (52-shotimport.js); shotText() is generic for any black game-font number. */
const SHOT_FONT = {"0":[5,9,"e8c6318c62e"],"1":[3,9,"1749249"],"2":[5,9,"e884221111f"],"3":[5,9,"e884260862e"],"4":[5,9,"23194a97c42"],
  "5":[5,9,"f443d10862e"],"6":[5,9,"e8c2d98c62e"],"7":[5,9,"1f1088422108"],"8":[5,9,"e8c62e8c62e"],"9":[5,9,"e8c6336862e"],
  "/":[3,9,"12924a4"],"%":[9,9,"c4944a260d60c8a45246"],"(":[3,11,"52924891"],")":[3,11,"112249294"],"-":[3,1,"7"]};
const SHOT_GLYPHS = Object.entries(SHOT_FONT).map(([ch, [w, h, hex]]) =>
  ({ch, w, h, bits: [...hex].map(c => parseInt(c, 16).toString(2).padStart(4, "0")).join("").slice(-w * h).padStart(w * h, "0")}));

// file / blob -> {w, h, d: RGBA bytes}
async function shotLoad(blob){
  const bmp = await createImageBitmap(blob), c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(bmp, 0, 0);
  return {w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data};
}
// find the pixel-doubling factor k (1-4) and block offset; returns the image shrunk to 1 game pixel per pixel.
// Each 48 px tile votes: in k-times content every color change falls on one column phase and one row phase (mod k).
// Tiles of smooth or noisy content (game world, photos) vote for nothing.
function shotNative(img){
  const {w, h, d} = img, T = 48, diff = (i, j) => d[i] !== d[j] || d[i + 1] !== d[j + 1] || d[i + 2] !== d[j + 2];
  const votes = {2: new Map(), 3: new Map(), 4: new Map()};
  for (let ty = 0; ty + T <= h; ty += T) for (let tx = 0; tx + T <= w; tx += T){
    const cx = new Array(12).fill(0), cy = new Array(12).fill(0);
    for (let y = ty; y < ty + T; y++) for (let x = tx; x < tx + T; x++){
      const i = (y * w + x) * 4;
      if (x + 1 < w && diff(i, i + 4)) cx[x % 12]++;
      if (y + 1 < h && diff(i, i + w * 4)) cy[y % 12]++;
    }
    for (const k of [2, 3, 4]){
      const fx = new Array(k).fill(0), fy = new Array(k).fill(0);
      cx.forEach((n, p) => fx[p % k] += n); cy.forEach((n, p) => fy[p % k] += n);
      const sx = fx.reduce((a, b) => a + b), sy = fy.reduce((a, b) => a + b), bx = fx.indexOf(Math.max(...fx)), by = fy.indexOf(Math.max(...fy));
      if (sx < 8 || sy < 8 || fx[bx] < sx * 0.98 || fy[by] < sy * 0.98) continue;
      const key = (bx + 1) % k + "," + (by + 1) % k; votes[k].set(key, (votes[k].get(key) || 0) + 1);
    }
  }
  const tot = k => [...votes[k].values()].reduce((a, b) => a + b, 0);
  let best = {k: 1, ox: 0, oy: 0};
  for (const k of [2, 3, 4]) if (tot(k) >= Math.max(3, tot(2) * 0.5)){
    const [key] = [...votes[k]].sort((a, b) => b[1] - a[1])[0]; const [ox, oy] = key.split(",").map(Number); best = {k, ox, oy};
  }
  const {k, ox, oy} = best;
  if (k === 1) return shotFuzzy(img) || Object.assign({k}, img);
  const W = Math.floor((w - ox) / k), H = Math.floor((h - oy) / k), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = ((oy + y * k) * w + ox + x * k) * 4, o = (y * W + x) * 4;
    out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255;
  }
  return {w: W, h: H, d: out, k};
}

/* Smoothed screenshots: the game UI drawn at a non-whole scale (1.5x on 1080p, 1.875x...) or a resized image has no
   exact pixels, so the doubling vote above finds nothing (a tester's 1.875x Hunter, 2026-10-31, read as "Nothing
   recognized"). The stat window's labels give the scale (one row per 18 game pixels); the scale and grid offset that read
   the most digits win. The image is then resampled to 1 game pixel per pixel (fuzzy: digits read with a looser ink
   test, icons with shotFindIconsFuzzy). Without a stat window in the shot, a scale from an earlier one (hint) is used. */
const SHOT_INK_FUZZY = (r, g, b) => r + g + b < 350;
let SHOT_LAST_SCALE = 0;
// game pixel (x, y) of a s-times image with grid offset (ox, oy) = the raw image sampled (bilinear) at that pixel's center
function shotResample(img, s, ox, oy, X0 = 0, Y0 = 0, X1 = Infinity, Y1 = Infinity){
  const {w, h, d} = img; X1 = Math.min(X1, Math.floor((w - ox) / s)); Y1 = Math.min(Y1, Math.floor((h - oy) / s)); X0 = Math.max(0, X0); Y0 = Math.max(0, Y0);
  const W = Math.max(0, X1 - X0), H = Math.max(0, Y1 - Y0), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++){
    const fy = oy + (Y0 + y + 0.5) * s - 0.5, y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < W; x++){
      const fx = ox + (X0 + x + 0.5) * s - 0.5, x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), ax = fx - x0;
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, e = (y1 * w + x1) * 4, o = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = (d[a + ch] * (1 - ax) + d[b + ch] * ax) * (1 - ay) + (d[c + ch] * (1 - ax) + d[e + ch] * ax) * ay;
      out[o + 3] = 255;
    }
  }
  return {w: W, h: H, d: out};
}
function shotFuzzy(img, hint = SHOT_LAST_SCALE){
  const PINK = [203, 79, 130], GREEN = [184, 199, 77];
  const labs = shotLabels(img, PINK).concat(shotLabels(img, GREEN)).sort((a, b) => a.y0 - b.y0);
  let s0 = 0;
  if (labs.length >= 4){
    const gaps = labs.slice(1).map((b, i) => b.y0 - labs[i].y0).sort((a, b) => a - b), pitch = gaps[Math.floor(gaps.length / 3)];
    s0 = pitch / 18;   // most gaps are one row; JOB (2 rows) and the gap before STR are longer
  }
  if (labs.length >= 4 && !(s0 > 1.1 && s0 < 4.5)) return null;   // 100% game size: pixel-exact already
  if (!s0) s0 = hint;
  if (!s0) return null;
  let best = {n: -1, s: s0, ox: 0, oy: 0};
  if (labs.length >= 4){
    // read the label values over a grid of scales and offsets, on just the labels' part of the screenshot
    const X0 = Math.min(...labs.map(b => b.x0)) - 4, X1 = Math.max(...labs.map(b => b.x1)) + 140 * s0, Y0 = labs[0].y0 - 6, Y1 = labs[labs.length - 1].y1 + 6;
    const score = (s, ox, oy) => {
      const im = shotResample(img, s, ox, oy, Math.floor(X0 / s), Math.floor(Y0 / s), Math.ceil(X1 / s), Math.ceil(Y1 / s));
      let n = 0;
      for (const rgb of [PINK, GREEN]) for (const b of shotLabels(im, rgb)){   // a label with a number on it: +3, +1 a digit, -1 a "?"
        const t = shotText(im, b.x1 + 2, b.y0 - 2, b.x1 + 130, b.y1 + 3, SHOT_INK_FUZZY)[0]?.s || "", dg = t.replace(/\D/g, "").length;
        if (dg) n += 3 + dg - t.replace(/[^?]/g, "").length;
      }
      return n;
    };
    const P = 4;
    for (let s = s0 * 0.97; s <= s0 * 1.03; s += 0.005) for (let i = 0; i < P; i++) for (let j = 0; j < P; j++){
      const n = score(s, i * s / P, j * s / P); if (n > best.n) best = {n, s, ox: i * s / P, oy: j * s / P};
    }
    if (best.n < 8) return null;
    for (const st of [0.0025, 0.00125]){   // finer around the best
      const b = best;
      for (const s of [b.s - st, b.s, b.s + st]) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){
        const ox = b.ox + i * b.s / 8, oy = b.oy + j * b.s / 8, n = score(s, ox, oy); if (n > best.n) best = {n, s, ox, oy};
      }
    }
    SHOT_LAST_SCALE = best.s;
  }
  const {s, ox, oy} = best;
  return Object.assign(shotResample(img, s, ox, oy), {k: s, ox, oy, fuzzy: true, raw: img});
}
// shotFindIcons for a fuzzy image: candidates from the resampled image by correlation (colors shift with smoothing, so no
// exact pixels), each checked on the original screenshot with the icon scaled up the same way, at small shifts.
const JIT = []; for (let jy = -1; jy <= 1; jy += 0.5) for (let jx = -1; jx <= 1; jx += 0.5) if (jx || jy) JIT.push([jx, jy]);
async function shotFindIconsFuzzy(img, icons, minScore = 0.9){
  const {w, h, d} = img, Q = c => c >> 5, B = new Map();
  for (let i = 0; i < w * h; i++){ const k = Q(d[i * 4]) << 6 | Q(d[i * 4 + 1]) << 3 | Q(d[i * 4 + 2]); (B.get(k) || B.set(k, []).get(k)).push(i) }
  const ncc = (A, Bv) => { const n = A.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++){ ma += A[i]; mb += Bv[i] } ma /= n; mb /= n;
    let cv = 0, va = 0, vb = 0; for (let i = 0; i < n; i++){ const a = A[i] - ma, b = Bv[i] - mb; cv += a * b; va += a * a; vb += b * b } return cv / Math.sqrt(va * vb + 1e-9) };
  const {raw, k: s, ox, oy} = img, hits = [];
  // the icon drawn at s over the original screenshot at game pixel (X, Y), shifted (jx, jy) raw pixels; opaque part only
  const check = (ic, X, Y) => {
    let best = -1;
    for (const [jx, jy] of [[0, 0]].concat(JIT)){
      if (best < 0.6 && (jx || jy)) break;
      const A = [], Bv = [], rx0 = Math.floor(ox + X * s + jx), ry0 = Math.floor(oy + Y * s + jy), RW = Math.ceil(ic.w * s), RH = Math.ceil(ic.h * s);
      for (let ry = 0; ry < RH; ry++) for (let rx = 0; rx < RW; rx++){
        const fx = (rx0 + rx + 0.5 - ox - jx) / s - X - 0.5, fy = (ry0 + ry + 0.5 - oy - jy) / s - Y - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        if (x0 < 0 || y0 < 0 || x0 + 1 >= ic.w || y0 + 1 >= ic.h || rx0 + rx < 0 || ry0 + ry < 0 || rx0 + rx >= raw.w || ry0 + ry >= raw.h) continue;
        const q = [(y0 * ic.w + x0) * 4, (y0 * ic.w + x0 + 1) * 4, ((y0 + 1) * ic.w + x0) * 4, ((y0 + 1) * ic.w + x0 + 1) * 4], wt = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay];
        let al = 0; for (let t = 0; t < 4; t++) al += ic.rgba[q[t] + 3] * wt[t];
        if (al < 250) continue;
        const j = ((ry0 + ry) * raw.w + rx0 + rx) * 4;
        for (let c = 0; c < 3; c++){ let v = 0; for (let t = 0; t < 4; t++) v += ic.rgba[q[t] + c] * wt[t]; A.push(v); Bv.push(raw.d[j + c]) }
      }
      if (A.length > 60) best = Math.max(best, ncc(A, Bv));
    }
    return best;
  };
  for (const [key, b64] of icons){
    const ic = await shotIcon(b64), px = ic.px;
    if (px.length < 40) continue;
    // smoothing keeps a pixel's color only where its neighbours share it: anchor on the most even, most colorful such pixel
    const at = new Map(px.map(p => [p[0] + "," + p[1], p])), sat = p => Math.max(p[2], p[3], p[4]) - Math.min(p[2], p[3], p[4]);
    const even = p => { let u = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const q = at.get((p[0] + dx) + "," + (p[1] + dy)); u += q ? Math.abs(q[2] - p[2]) + Math.abs(q[3] - p[3]) + Math.abs(q[4] - p[4]) : 255 } return u };
    const ranked = px.map(p => [p, even(p) - sat(p) * 2]).sort((p, q) => p[1] - q[1]).map(r => r[0]);
    const a = ranked[0], src = ranked.slice(0, Math.max(12, ranked.length >> 2)), pre = Array.from({length: 12}, (_, t) => src[Math.floor((t + 0.5) * src.length / 12)]);
    const sub = px.length > 96 ? Array.from({length: 96}, (_, t) => px[Math.floor((t + 0.5) * px.length / 96)]) : px;
    const iv = Float32Array.from(sub.flatMap(p => [p[2], p[3], p[4]])), sv = new Float32Array(iv.length), cand = [];
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++){
      const r = Q(a[2]) + dr, g = Q(a[3]) + dg, bb = Q(a[4]) + db;
      if (r < 0 || g < 0 || bb < 0 || r > 7 || g > 7 || bb > 7) continue;
      for (const i of B.get(r << 6 | g << 3 | bb) || []){
        const x0 = i % w - a[0], y0 = Math.floor(i / w) - a[1];
        if (x0 < 0 || y0 < 0 || x0 + ic.w > w || y0 + ic.h > h) continue;
        let miss = 0;
        for (const p of pre){ const j = ((y0 + p[1]) * w + x0 + p[0]) * 4; if (Math.abs(d[j] - p[2]) + Math.abs(d[j + 1] - p[3]) + Math.abs(d[j + 2] - p[4]) > 80 && ++miss > 3) break }
        if (miss > 3) continue;
        for (let t = 0; t < sub.length; t++){ const p = sub[t], j = ((y0 + p[1]) * w + x0 + p[0]) * 4; sv[t * 3] = d[j]; sv[t * 3 + 1] = d[j + 1]; sv[t * 3 + 2] = d[j + 2] }
        const c = ncc(iv, sv);
        if (c >= 0.4) cand.push({x0, y0, c});
      }
    }
    // the best few spots (one per place) get the slow check
    cand.sort((p, q) => q.c - p.c);
    const done = [];
    for (const {x0, y0, c} of cand){
      if (done.length >= 6 && (c < 0.55 || done.length >= 30)) break;
      if (done.some(([x, y]) => Math.abs(x - x0) < ic.w / 2 && Math.abs(y - y0) < ic.h / 2)) continue;
      done.push([x0, y0]);
      const score = check(ic, x0, y0);
      if (score >= minScore) hits.push({key, x: x0, y: y0, w: ic.w, h: ic.h, score, n: px.length});
    }
  }
  hits.sort((p, q) => q.score - p.score || q.n - p.n);
  const keep = [];
  for (const m of hits){
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2, over = keep.find(k => cx > k.x && cx < k.x + k.w && cy > k.y && cy < k.y + k.h);
    if (!over) keep.push(m);
    else if (over.key !== m.key && over.score - m.score < 0.005 && !(over.alt || []).includes(m.key)) (over.alt || (over.alt = [])).push(m.key);
  }
  return keep;
}
// decoded icon pixels, cached: base64 PNG -> {w, h, px: [[x, y, r, g, b], ...] opaque pixels only}
const SHOT_ICONS = new Map();
async function shotIcon(b64){
  if (SHOT_ICONS.has(b64)) return SHOT_ICONS.get(b64);
  const bmp = new Image(); bmp.src = "data:image/png;base64," + b64; await bmp.decode();
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++){ const i = (y * c.width + x) * 4; if (d[i + 3] === 255) px.push([x, y, d[i], d[i + 1], d[i + 2]]) }
  const r = {w: c.width, h: c.height, px, rgba: d}; SHOT_ICONS.set(b64, r); return r;
}
// where each icon appears. icons: [[key, base64]]. Returns [{key, x, y, w, h, score}], best first, overlaps removed
// (identical icons at one spot all stay, so the caller can offer them as alternatives).
async function shotFindIcons(img, icons, minScore = 0.85){
  const {w, h, d} = img, col = new Uint32Array(w * h), count = new Map();
  for (let i = 0; i < w * h; i++){ const c = d[i * 4] << 16 | d[i * 4 + 1] << 8 | d[i * 4 + 2]; col[i] = c; count.set(c, (count.get(c) || 0) + 1) }
  const start = new Map(); let n = 0; for (const [c, k] of count){ start.set(c, n); n += k }
  const pos = new Uint32Array(w * h), fill = new Map(start);
  for (let i = 0; i < w * h; i++){ const c = col[i], f = fill.get(c); pos[f] = i; fill.set(c, f + 1) }
  const hits = [];
  for (const [key, b64] of icons){
    const ic = await shotIcon(b64), px = ic.px;
    if (px.length < 40) continue;   // too few solid pixels to tell apart
    // anchor on the rarest of a few solid pixels, so few spots need checking
    let a = null, ac = Infinity;
    for (let s = 0; s < 12; s++){ const p = px[Math.floor((s + 0.5) * px.length / 12)], c = count.get(p[2] << 16 | p[3] << 8 | p[4]); if (c && c < ac){ a = p; ac = c } }
    if (!a) continue;
    const s0 = start.get(a[2] << 16 | a[3] << 8 | a[4]), allow = px.length * (1 - minScore);
    for (let q = s0; q < s0 + ac; q++){
      const x0 = pos[q] % w - a[0], y0 = Math.floor(pos[q] / w) - a[1];
      if (x0 < 0 || y0 < 0 || x0 + ic.w > w || y0 + ic.h > h) continue;
      // spread order so misses show early; a real match misses at most 2 of the first 16
      let miss = 0, s = 0;
      for (; s < px.length && miss <= allow; s++){
        if (s === 16 && miss > 2){ miss = Infinity; break }
        const p = px[(s * 7919) % px.length], i = ((y0 + p[1]) * w + x0 + p[0]) * 4;
        if (Math.abs(d[i] - p[2]) + Math.abs(d[i + 1] - p[3]) + Math.abs(d[i + 2] - p[4]) > 24) miss++;
      }
      if (miss <= allow) hits.push({key, x: x0, y: y0, w: ic.w, h: ic.h, score: 1 - miss / px.length, n: px.length});
    }
  }
  hits.sort((p, q) => q.score - p.score || q.n - p.n);
  const keep = [];
  for (const m of hits){
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const over = keep.find(k => cx > k.x && cx < k.x + k.w && cy > k.y && cy < k.y + k.h);
    if (!over) keep.push(m);
    else if (over.score === m.score && over.n === m.n && over.key !== m.key) (over.alt || (over.alt = [])).push(m.key);
  }
  return keep;
}
// text in a box, read with the game's digit font (black ink unless isInk(r, g, b) says otherwise, e.g. white chat text).
// Returns one string per line, top to bottom; unknown glyphs are "?"
function shotText(img, x0, y0, x1, y1, isInk = (r, g, b) => r + g + b < 150){
  const {w, d} = img; x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(img.w, x1); y1 = Math.min(img.h, y1);
  const ink = (x, y) => { const i = (y * w + x) * 4; return isInk(d[i], d[i + 1], d[i + 2]) };
  const lines = [];
  for (let y = y0; y < y1; y++){
    let any = false; for (let x = x0; x < x1 && !any; x++) any = ink(x, y);
    if (!any) continue;
    let e = y; while (e < y1){ let a = false; for (let x = x0; x < x1 && !a; x++) a = ink(x, e); if (!a) break; e++ }
    let s = "", last = -1;
    for (let x = x0; x < x1; x++){
      let c = false; for (let yy = y; yy < e && !c; yy++) c = ink(x, yy);
      if (!c) continue;
      const gs = x; while (x < x1){ let c2 = false; for (let yy = y; yy < e && !c2; yy++) c2 = ink(x, yy); if (!c2) break; x++ }
      let t = e, b = y; for (let yy = y; yy < e; yy++) for (let xx = gs; xx < x; xx++) if (ink(xx, yy)){ t = Math.min(t, yy); b = Math.max(b, yy) }
      const gw = x - gs, gh = b - t + 1; let bits = "";
      for (let yy = t; yy <= b; yy++) for (let xx = gs; xx < x; xx++) bits += ink(xx, yy) ? "1" : "0";
      let ch = "?", bd = 3;
      for (const g of SHOT_GLYPHS){ if (g.w !== gw || g.h !== gh) continue; let dd = 0; for (let i = 0; i < bits.length; i++) if (bits[i] !== g.bits[i]) dd++; if (dd < bd){ bd = dd; ch = g.ch } }
      if (last >= 0 && gs - last > 12) break;   // a far-off mark (a button) isn't part of this value
      if (last >= 0 && gs - last > 5) s += " ";   // digits sit 2-4 pixels apart ("1" is narrow)
      s += ch; last = x;
    }
    lines.push({y, s}); y = e;
  }
  return lines;
}
// columns of solid label boxes of one color (e.g. the stat window's pink and green labels): [{x0, x1, y0, y1}] top to bottom
function shotLabels(img, rgb, tol = 30){
  const {w, h, d} = img, is = (x, y) => { const i = (y * w + x) * 4; return Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]) <= tol };
  let bx = -1, bn = 0;
  for (let x = 0; x < w; x++){ let n = 0; for (let y = 0; y < h; y++) if (is(x, y)) n++; if (n > bn){ bn = n; bx = x } }
  if (bn < 20) return [];
  const out = [];
  for (let y = 0; y < h; y++){
    if (!is(bx, y)) continue;
    let e = y; while (e < h && is(bx, e)) e++;
    if (e - y >= 6){ const m = y; /* top row: above the label's own text */ let x0 = bx, x1 = bx; while (x0 > 0 && is(x0 - 1, m)) x0--; while (x1 < w - 1 && is(x1 + 1, m)) x1++;
      if (x1 - x0 >= 12) out.push({x0, x1, y0: y, y1: e - 1}) }
    y = e;
  }
  return out;
}
