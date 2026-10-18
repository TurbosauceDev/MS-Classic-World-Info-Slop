/* ---------------- EXP bar reader ---------------- */
// Reads "18,572[64.09%]" off the status bar of a game screenshot, in the page (no server, no OCR library). Copied from the
// grind tracker's readers (tracker/app/readers.js on branch claude/project-thread-5h55q0; keep the two in step): white 5x7
// digit templates for pixel-exact screenshots, else the any-scale reader (green [ ] brackets, blobs fitted to the 5x7 grid;
// idea from beanguri's Maple Classic Exp Overlay, MIT). expBarRead(img {w, h, d}) -> {exp, pct, level} or null.
const expBarRead = (() => {
const decode = ([w, h, hex]) => [...hex].map(c => parseInt(c, 16).toString(2).padStart(4, "0")).join("").slice(-w * h).padStart(w * h, "0");
const glyphs = font => Object.entries(font).map(([ch, f]) => ({ch, w: f[0], h: f[1], bits: decode(f)}));
const BAR_FONT = {"0":[5,7,"3a318c62e"],"1":[2,7,"1d55"],"2":[5,7,"3a211111f"],"3":[5,7,"3a213062e"],"4":[5,7,"08ca97c42"],
  "5":[5,7,"7e107062e"],"6":[5,7,"3a30f462e"],"7":[5,7,"7c2108884"],"8":[5,7,"3a317462e"],"9":[5,7,"3a317862e"],
  ",":[2,2,"6"],".":[1,1,"1"],"%":[7,7,"08692410492c2"]};
const BAR = glyphs(BAR_FONT);
// 1 game pixel per pixel: in a picture scaled up k times, (nearly) every color change between neighbors falls on a block
// edge. Find the largest k (2-4) and offset where >= 85% of the sharp changes do. Tolerant: video capture blurs colors a little.
// cached = true (the live tracker): the scale found is reused for 20 frames of the same size, as finding it is the slow
// part (a pass over the whole frame) and it doesn't change while playing
let scaleMemo = null;
function native(img, cached = false){
  const {w, h, d} = img;
  if (cached && scaleMemo && scaleMemo.w === w && scaleMemo.h === h && scaleMemo.uses++ < 20) return shrink(img, scaleMemo.best);
  const step = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 150;
  const hist = {x: new Array(12).fill(0), y: new Array(12).fill(0)};
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x++){ const i = (y * w + x) * 4; if (step(i, i + 4)) hist.x[x % 12]++ }
  for (let x = 1; x < w - 1; x += 3) for (let y = 1; y < h - 1; y++){ const i = (y * w + x) * 4; if (step(i, i + w * 4)) hist.y[y % 12]++ }
  let best = {k: 1, ox: 0, oy: 0};
  for (const k of [2, 3, 4]){
    const fold = a => { const f = new Array(k).fill(0); a.forEach((n, p) => f[p % k] += n); return f };
    const fx = fold(hist.x), fy = fold(hist.y), sx = fx.reduce((a, b) => a + b), sy = fy.reduce((a, b) => a + b);
    const px = fx.indexOf(Math.max(...fx)), py = fy.indexOf(Math.max(...fy));
    if (sx > 200 && sy > 200 && fx[px] >= sx * 0.85 && fy[py] >= sy * 0.85) best = {k, ox: (px + 1) % k, oy: (py + 1) % k};
  }
  if (cached) scaleMemo = {w, h, best, uses: 0};
  return shrink(img, best);
}
function shrink({w, h, d}, {k, ox, oy}){
  if (k === 1) return {w, h, d, k};
  const W = Math.floor((w - ox) / k), H = Math.floor((h - oy) / k), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = ((oy + y * k) * w + ox + x * k) * 4, o = (y * W + x) * 4;
    out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255;
  }
  return {w: W, h: H, d: out, k};
}

// ink mask of a box (rows y0..y1, cols x0..x1) -> {get(x, y), ...}; isInk(r, g, b)
function mask(img, x0, y0, x1, y1, isInk){
  const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0), m = new Uint8Array(W * H), d = img.d;   // tiny images: empty box
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = ((y + y0) * img.w + x + x0) * 4; m[y * W + x] = isInk(d[i], d[i + 1], d[i + 2]) ? 1 : 0;
  }
  return {W, H, m, x0, y0};
}
// glyphs of one text band: column runs split by empty columns, trimmed to their ink rows
function cut(M, ya, yb){
  const out = []; let x = 0;
  const colInk = x => { for (let y = ya; y < yb; y++) if (M.m[y * M.W + x]) return true; return false };
  while (x < M.W){
    if (!colInk(x)){ x++; continue }
    const s = x; while (x < M.W && colInk(x)) x++;
    let t = yb, b = ya;
    for (let y = ya; y < yb; y++) for (let xx = s; xx < x; xx++) if (M.m[y * M.W + xx]){ t = Math.min(t, y); b = Math.max(b, y) }
    let bits = ""; for (let y = t; y <= b; y++) for (let xx = s; xx < x; xx++) bits += M.m[y * M.W + xx] ? "1" : "0";
    out.push({x: s, w: x - s, h: b - t + 1, top: t, bits});
  }
  return out;
}
function match(g, font){
  let ch = null, bd = 2;
  for (const f of font){ if (f.w !== g.w || f.h !== g.h) continue; let dd = 0; for (let i = 0; i < g.bits.length && dd <= bd; i++) if (g.bits[i] !== f.bits[i]) dd++; if (dd < bd){ bd = dd; ch = f.ch } }
  return ch;
}

// ---- status bar: "18,572[64.09%]" ----
const white = (r, g, b) => Math.min(r, g, b) > 190;
function readBar(img){
  const y0 = Math.max(0, img.h - 40), M = mask(img, 0, y0, img.w, img.h, white);
  for (let y = 0; y < M.H; y++){   // wipe long horizontal lines (window borders, gauge edges)
    let x = 0;
    while (x < M.W){ if (!M.m[y * M.W + x]){ x++; continue } const s = x; while (x < M.W && M.m[y * M.W + x]) x++; if (x - s > 12) M.m.fill(0, y * M.W + s, y * M.W + x) }
  }
  // the number line is 7 rows tall (digits and %): slide a 7-row band down the bar and parse each
  for (let s = 0; s + 7 <= M.H; s++){
    let str = "", last = -9;
    for (const g of cut(M, s, s + 7)){ const ch = match(g, BAR); if (g.x - last > 3) str += " "; str += ch || "?"; last = g.x + g.w }
    const m = str.match(/(\d{1,3}(?:,\d{3})*) +(\d{1,3}\.\d\d)%/);
    if (m) return {exp: +m[1].replace(/,/g, ""), pct: +m[2]};
  }
  return null;
}
// Any window size (the game scales its UI by odd amounts too, e.g. 1.5x at 1080p, which blurs the pixel font). Idea from
// beanguri's Maple Classic Exp Overlay (MIT): find the green [ ] brackets around the %, take the white blobs inside and
// the number to their left, and read each blob by shrinking it onto the 5x7 digit grid.
function blobs(img, x0, y0, x1, y1, isInk){
  const M = mask(img, x0, y0, x1, y1, isInk), lab = new Int32Array(M.W * M.H), out = [], st = [];
  for (let i = 0; i < M.m.length; i++){
    if (!M.m[i] || lab[i]) continue;
    const b = {x: 1e9, y: 1e9, x1: -1, y1: -1, n: 0, id: out.length + 1}; lab[i] = b.id; st.push(i);
    while (st.length){
      const j = st.pop(), x = j % M.W, y = (j - x) / M.W; b.n++;
      if (x < b.x) b.x = x; if (x > b.x1) b.x1 = x; if (y < b.y) b.y = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= M.W || yy >= M.H) continue;
        const k = yy * M.W + xx; if (M.m[k] && !lab[k]){ lab[k] = b.id; st.push(k) }
      }
    }
    b.w = b.x1 - b.x + 1; b.h = b.y1 - b.y + 1; b.cy = b.y + b.h / 2; out.push(b);
  }
  return {M, lab, out};
}
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx * 255 : 0, mx] };
const isGreen = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return s >= 90 && v >= 110 && h >= 52 && h <= 100 };
const isWhite = (r, g, b) => { const [, s, v] = hsv(r, g, b); return s < 70 && v >= 140 };
const DIG = BAR.filter(f => /[02-9]/.test(f.ch));
function readDigit(W, b){   // blob -> best 5x7 digit by sampling cell centers
  if (b.w < 0.55 * b.h) return "1";
  let best = null, bd = 1e9;
  let bits = "";
  for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++){
    const x = Math.min(b.x1, Math.floor(b.x + (c + 0.5) * b.w / 5)), y = Math.min(b.y1, Math.floor(b.y + (r + 0.5) * b.h / 7));
    bits += W.lab[y * W.M.W + x] === b.id ? "1" : "0";
  }
  for (const f of DIG){ let d = 0; for (let i = 0; i < 35; i++) if (bits[i] !== f.bits[i]) d++; if (d < bd){ bd = d; best = f.ch } }
  return bd <= 7 ? best : null;
}
// band: {y0, y1} rows to search (the live tracker passes the rows where it found the bar last time: about 5x faster)
function readBarAny(img, band = null){
  const y0 = band ? Math.max(0, band.y0) : img.h < 200 ? 0 : Math.floor(img.h * 0.78), y1 = band ? Math.min(img.h, band.y1) : img.h;
  const G = blobs(img, 0, y0, img.w, y1, isGreen), W = blobs(img, 0, y0, img.w, y1, isWhite);
  const br = G.out.filter(b => b.h >= 5 && b.w <= 0.6 * b.h).sort((a, b) => a.x - b.x);
  const found = [];
  for (const o of br){
    const bh = o.h, on = b => Math.abs(b.cy - o.cy) <= 0.3 * bh;
    const c = br.find(c => c.x > o.x1 && c.x - o.x <= 9 * bh && on(c) && Math.abs(c.h - bh) <= 0.25 * bh);
    if (!c) continue;
    const line = W.out.filter(b => on(b) && b.h >= 0.1 * bh);
    const inside = line.filter(b => b.x > o.x1 && b.x1 < c.x).sort((a, b) => a.x - b.x);
    const tall = inside.filter(b => b.h >= 0.6 * bh);
    if (tall.length < 3 || tall.some(b => b.h > 1.25 * bh)) continue;
    const dh = tall.map(b => b.h).sort((a, b) => a - b)[tall.length >> 1];
    const run = []; let edge = o.x;
    for (const b of line.filter(b => b.x1 < o.x).sort((a, b) => b.x - a.x)){
      if (edge - b.x1 > 2 * bh || b.h > 1.15 * dh) break;
      run.unshift(b); edge = b.x;
    }
    const digits = bs => bs.filter(b => b.h >= 0.6 * dh && b.w < 0.95 * b.h).map(b => readDigit(W, b));
    const expD = digits(run);
    // % part: always two decimals, so its digits are enough (the dot is often too faint to see once scaled)
    const pd = digits(inside), ps = pd.includes(null) || pd.length < 3 ? "" : pd.slice(0, -2).join("") + "." + pd.slice(-2).join("");
    if (!expD.length || expD.includes(null) || !ps) continue;
    found.push({cy: o.cy, x: o.x, bh, exp: +expD.join(""), pct: +ps});
  }
  if (!found.length) return null;
  const low = Math.max(...found.map(f => f.cy));   // the status bar is the lowest line; EXP is the right-most value on it
  const f = found.filter(f => f.cy >= low - 4).sort((a, b) => b.x - a.x)[0];
  return {exp: f.exp, pct: f.pct, y: y0 + f.cy, bh: f.bh};
}
// level = the EXP table entry that EXP / % works out to (null when the % is too small to tell)
const levelOf = (exp, pct) => { if (!(pct > 0.5)) return null;
  for (let L = 1; L < MAX_LEVEL; L++) if (D.exp[L] && Math.abs(exp / (pct / 100) - D.exp[L]) / D.exp[L] < 0.004) return L; return null };
return img => { const b = readBar(native(img)) || readBarAny(img); return b && {exp: b.exp, pct: b.pct, level: levelOf(b.exp, b.pct)} };
})();
