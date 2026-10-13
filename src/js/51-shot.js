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
  if (k === 1) return Object.assign({k}, img);
  const W = Math.floor((w - ox) / k), H = Math.floor((h - oy) / k), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = ((oy + y * k) * w + ox + x * k) * 4, o = (y * W + x) * 4;
    out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255;
  }
  return {w: W, h: H, d: out, k};
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
  const r = {w: c.width, h: c.height, px}; SHOT_ICONS.set(b64, r); return r;
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
// text in a box, read with the game's digit font (black ink). Returns one string per line, top to bottom; unknown glyphs are "?"
function shotText(img, x0, y0, x1, y1){
  const {w, d} = img; x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(img.w, x1); y1 = Math.min(img.h, y1);
  const ink = (x, y) => { const i = (y * w + x) * 4; return d[i] + d[i + 1] + d[i + 2] < 150 };
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
