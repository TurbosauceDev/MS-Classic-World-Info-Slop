/* Screen readers: one captured game frame (RGBA) -> tracker events. No OCR library: the game draws its UI text pixel-exact
   with bitmap fonts, so glyphs are matched against templates copied from real frames (Danny's 2560x1440 capture of a
   1280x720 game, 2026-10-17).
   - status bar EXP "18,572[64.09%]": white 5x7 digits (BAR_FONT); level = the EXP table level whose total fits EXP / %
   - pickup messages (bottom right, yellow or white): "You have gained mesos (+N)", "You received EXP (+N)",
     "Bonus EXP for PARTY (+N)", "<item> xN earned. (Etc)" (MSG_FONT letters + the game's 5x9 digits from shot.js)
   - party size: rows of the party window's HP bars, else 2+ while party bonus lines keep showing up
   - map name: minimap title, OCR'd in the main process (mapTextCrop + mapFromText)
   Capture goes through a video track, so colors wobble a little: every test uses color ranges, never exact pixels.
   - job: status-bar text next to the level, OCR'd the same way (jobTextCrop + jobFromText) */
(function (root){
  const decode = ([w, h, hex]) => [...hex].map(c => parseInt(c, 16).toString(2).padStart(4, "0")).join("").slice(-w * h).padStart(w * h, "0");
  const glyphs = font => Object.entries(font).map(([ch, f]) => ({ch, w: f[0], h: f[1], bits: decode(f)}));
  const BAR_FONT = {"0":[5,7,"3a318c62e"],"1":[2,7,"1d55"],"2":[5,7,"3a211111f"],"3":[5,7,"3a213062e"],"4":[5,7,"08ca97c42"],
    "5":[5,7,"7e107062e"],"6":[5,7,"3a30f462e"],"7":[5,7,"7c2108884"],"8":[5,7,"3a317462e"],"9":[5,7,"3a317862e"],
    ",":[2,2,"6"],".":[1,1,"1"],"%":[7,7,"08692410492c2"]};
  const MSG_FONT = {"Y":[7,9,"414488a081020408"],"o":[5,7,"3a318c62e"],"u":[5,7,"46318c62f"],"h":[5,9,"1085b318c631"],
    "a":[5,7,"3a217c66d"],"v":[5,7,"462a52884"],"e":[5,7,"3a31fc22e"],"g":[5,9,"0d9c6319b43e"],"i":[1,9,"17f"],
    "n":[5,7,"5b318c631"],"d":[5,9,"010b6718c62f"],"m":[9,7,"59b331188c462311"],"s":[5,7,"3a307062e"],"r":[3,7,"174924"],
    "c":[4,7,"6988896"],"E":[6,9,"3f82083f82083f"],"X":[7,9,"414488a082889141"],"P":[6,9,"3e86187e820820"],
    "B":[6,9,"3e86187f86187e"],"f":[3,9,"15d2492"],"A":[7,9,"082850a227c8a0c1"],"R":[7,9,"7e83060fe890a141"],
    "TY":[14,9,"3fc11088422105040810204081020408"],"(":[3,11,"052924891"],"+":[5,5,"0427c84"],")":[3,11,"112249294"],
    "H":[7,9,"4183060ff83060c1"],"y":[5,9,"118a94a21088"],"M":[7,9,"41c78ead5ab564c9"],".":[1,1,"1"],"x":[5,7,"454a22951"],
    "t":[3,9,"25d2493"]};
  // the message digits are the same 5x9 font as the stat window (shot.js SHOT_FONT)
  const SHOT = typeof SHOT_FONT !== "undefined" ? SHOT_FONT : root.SHOT_FONT || {};
  for (const ch of "0123456789") if (SHOT[ch]) MSG_FONT[ch] = SHOT[ch];
  const BAR = glyphs(BAR_FONT), MSG = glyphs(MSG_FONT);

  // 1 game pixel per pixel: in a picture scaled up k times, (nearly) every color change between neighbors falls on a block
  // edge. Find the largest k (2-4) and offset where >= 85% of the sharp changes do. Tolerant: video capture blurs colors a little.
  function native(img){
    const {w, h, d} = img, step = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 150;
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
    const {k, ox, oy} = best;
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
  function readBarAny(img){
    const y0 = img.h < 200 ? 0 : Math.floor(img.h * 0.78), G = blobs(img, 0, y0, img.w, img.h, isGreen), W = blobs(img, 0, y0, img.w, img.h, isWhite);
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
      found.push({cy: o.cy, x: o.x, exp: +expD.join(""), pct: +ps});
    }
    if (!found.length) return null;
    const low = Math.max(...found.map(f => f.cy));   // the status bar is the lowest line; EXP is the right-most value on it
    const f = found.filter(f => f.cy >= low - 4).sort((a, b) => b.x - a.x)[0];
    return {exp: f.exp, pct: f.pct};
  }

  // ---- pickup messages (bottom right) ----
  const msgInk = (r, g, b) => r > 215 && g > 215 && b < 150 || Math.min(r, g, b) > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 60;
  function readLines(img){
    const x0 = Math.max(0, img.w - 430), y0 = Math.floor(img.h / 3), M = mask(img, x0, y0, img.w, img.h - 60, msgInk), lines = [];
    let y = 0;
    const rowInk = y => { let n = 0; for (let x = 0; x < M.W; x++) n += M.m[y * M.W + x]; return n >= 2 };
    while (y < M.H){
      if (!rowInk(y)){ y++; continue }
      const s = y; while (y < M.H && rowInk(y)) y++;
      if (y - s < 7 || y - s > 13) continue;
      const gl = cut(M, s, y);
      if (!gl.length || gl[gl.length - 1].x + gl[gl.length - 1].w < M.W - 12) continue;   // messages are right-aligned
      const keep = [gl[gl.length - 1]];
      for (let i = gl.length - 2; i >= 0 && keep[0].x - (gl[i].x + gl[i].w) <= 9; i--) keep.unshift(gl[i]);
      let str = "", last = null;
      for (const g of keep){ if (last !== null && g.x - last >= 4) str += " "; str += match(g, MSG) || "?"; last = g.x + g.w }
      lines.push({y: s + y0, text: str.replace(/ (?=[0-9)])|(?<=[(+0-9]) /g, "")});
    }
    return lines;
  }
  function readPickups(img){
    const lines = readLines(img), out = [];
    for (const l of lines){
      let m;
      if ((m = l.text.match(/^You have gained mesos \(\+(\d+)\)$/))) out.push({y: l.y, text: l.text, event: {type: "meso", amount: +m[1]}});
      else if ((m = l.text.match(/^You received EXP \(\+(\d+)\)$/))) out.push({y: l.y, text: l.text, event: {type: "exp", gain: +m[1]}});
      else if ((m = l.text.match(/^Bonus EXP for PARTY \(\+(\d+)\)$/))) out.push({y: l.y, text: l.text, event: {type: "bonus", gain: +m[1]}});
      else if ((m = l.text.match(/^(.+?) ?x(\d+) ?earned\. ?\((.+)\)$/))){
        const id = itemByName(m[1], m[3]);
        out.push({y: l.y, text: l.text, event: id ? {type: "item", id, qty: +m[2]} : {type: "itemraw", text: l.text}});
      }
    }
    return out;
  }

  // ---- party window: a column of HP bars (red runs with the same left edge, ~17 px apart) in the top-left area ----
  function readParty(img){
    const X = Math.floor(img.w * 0.25), Y = Math.floor(img.h * 0.6), d = img.d, rows = [];
    const red = i => d[i] > 170 && d[i + 1] < 70 && d[i + 2] < 70;
    for (let y = 0; y < Y; y++){
      let x = 0;
      while (x < X){ if (!red((y * img.w + x) * 4)){ x++; continue } const s = x; while (x < X && red((y * img.w + x) * 4)) x++; if (x - s >= 25) rows.push({y, x: s}) }
    }
    const byX = {};
    for (const r of rows){ const k = r.x; (byX[k] = byX[k] || []).push(r.y) }
    let best = 0;
    for (const ys of Object.values(byX)){
      const starts = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 2);   // one bar = a few rows
      if (starts.length >= 2 && starts.length <= 6) best = Math.max(best, starts.length);
    }
    return best || null;
  }

  // ---- map name: the two white lines (street, map) next to the minimap icon, top-left. The minimap font isn't in our
  // tables, so this makes a clean black-on-white crop for OCR (Tesseract, in the main process) and fuzzy-matches the result.
  // Approach borrowed from beanguri/Maple-Classic-Exp-Overlay (MIT).
  function mapTextCrop(img){
    const X = Math.floor(img.w * 0.4), Y = Math.floor(img.h * 0.3), d = img.d, ink = i => Math.min(d[i], d[i + 1], d[i + 2]) > 190;
    // per row, white in short runs only (letters); long runs are bars and frames (the "MINI MAP" title, the map's border)
    const cnt = [];
    for (let y = 0; y < Y; y++){
      let n = 0, long = 0;
      for (let x = 0; x < X;){ if (!ink((y * img.w + x) * 4)){ x++; continue } const s = x; while (x < X && ink((y * img.w + x) * 4)) x++; if (x - s <= 30) n += x - s; else long = Math.max(long, x - s) }
      cnt.push(long > 60 ? -1 : n);   // a row inside a white bar
    }
    // text lines: rows with 12+ such pixels, bridging gaps of up to 3 rows (thin parts of letters)
    const bands = [];
    for (let y = 0; y < Y; y++){
      if (cnt[y] < 0){ bands.push(null); continue }
      if (cnt[y] < 12) continue;
      const last = bands[bands.length - 1];
      if (last && y - last[1] <= 3) last[1] = y + 1; else bands.push([y, y + 1]);
    }
    for (let i = bands.length - 1; i >= 0; i--) if (!bands[i] || bands[i][1] - bands[i][0] < 5 || bands[i][1] - bands[i][0] > 30) bands.splice(i, 1);
    const two = bands.findIndex((b, i) => bands[i + 1] && bands[i + 1][0] - b[1] < (b[1] - b[0]) && Math.abs((bands[i + 1][1] - bands[i + 1][0]) - (b[1] - b[0])) <= 4);
    if (two < 0) return null;
    const y0 = bands[two][0] - 2, y1 = bands[two + 1][1] + 2;
    let x0 = X, x1 = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < X; x++) if (ink((y * img.w + x) * 4)){ x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
    const S = 2, P = 8, w = (x1 - x0 + 1) * S + 2 * P, h = (y1 - y0) * S + 2 * P, out = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = y0; y < y1; y++) for (let x = x0; x <= x1; x++) if (ink((y * img.w + x) * 4))
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++){ const o = ((P + (y - y0) * S + dy) * w + P + (x - x0) * S + dx) * 4; out[o] = out[o + 1] = out[o + 2] = 0 }
    return {w, h, d: out};
  }
  // ---- job: the status bar shows "LV. 22 | Archer / <name>" bottom-left. Same idea as the map name: white text -> black on
  // white for OCR; jobFromText keeps only a job name (the character name in the same box is never kept or sent).
  function jobTextCrop(img){
    const rows = Math.max(40, Math.round(img.h * 0.056)), y0 = img.h - rows, X = Math.floor(img.w * 0.55), d = img.d, S = 2, P = 8;
    const w = X * S + 2 * P, h = rows * S + 2 * P, out = new Uint8ClampedArray(w * h * 4).fill(255);
    let n = 0;
    for (let y = y0; y < img.h; y++) for (let x = 0; x < X; x++){
      const i = (y * img.w + x) * 4; if (Math.min(d[i], d[i + 1], d[i + 2]) <= 190) continue;
      n++;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++){ const o = ((P + (y - y0) * S + dy) * w + P + x * S + dx) * 4; out[o] = out[o + 1] = out[o + 2] = 0 }
    }
    return n >= 30 ? {w, h, d: out} : null;   // no white text there: status bar not on screen
  }
  const JOBS = ["Beginner", "Swordman", "Fighter", "Page", "Spearman", "Magician", "Cleric", "Archer", "Hunter", "Crossbowman", "Rogue", "Assassin", "Bandit"];
  function jobFromText(text){
    const words = text.split(/[^A-Za-z]+/).filter(w => w.length >= 4);
    for (let i = 0; i < words.length; i++){
      if (similar(words[i], "Wizard") >= 0.8){   // "Wizard (Fire,Poison)" / "Wizard (Ice,Lightning)": the element words say which
        const at = text.indexOf(words[i]), rest = text.slice(at + words[i].length, at + words[i].length + 24).toLowerCase();   // also "(F/P)", "(I/L)"
        if (/fire|poison|f\s*\/\s*p/.test(rest)) return "Wizard (Fire,Poison)";
        if (/ice|light|[il1|]\s*\/\s*[l1i|]/.test(rest)) return "Wizard (Ice,Lightning)";
        continue;
      }
      const best = JOBS.map(j => [j, similar(words[i], j)]).sort((a, b) => b[1] - a[1])[0];
      if (best[1] >= 0.8) return best[0];
    }
    return null;
  }
  const norm = s => s.toLowerCase().replace(/[l1|!]/g, "i").replace(/0/g, "o").replace(/[^a-z0-9<>]/g, "");   // OCR mixes up I/l/1, O/0
  function lev(a, b){
    let p = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++){
      const c = [i];
      for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = c;
    }
    return p[b.length];
  }
  const similar = (a, b) => { a = norm(a); b = norm(b); return 1 - lev(a, b) / Math.max(a.length, b.length, 1) };
  // OCR text -> {id, name}: the closest map name to the last line (75%+ alike), else the map line as read (maps our data doesn't have)
  function mapFromText(text, G){
    const lines = text.split("\n").map(l => l.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9>)]+$/g, "").trim()).filter(l => l.length >= 3);
    if (!lines.length) return null;
    let best = null;
    const l = lines[lines.length - 1];   // line 1 is the street/region ("Victoria Road", "Hidden Street"), line 2 the map
    {
      const a = norm(l);
      for (const [id, n] of Object.entries(G.mapnames)){
        const b = norm(n), sim = 1 - lev(a, b) / Math.max(a.length, b.length, 1);
        if (!best || sim > best.sim || sim === best.sim && G.maps[id] && !G.maps[best.id]) best = {id, name: n, sim};
      }
    }
    if (best && best.sim >= 0.75) return {id: best.id, name: best.name};
    return {id: null, name: l};
  }

  // item pickup: names are cut to ~13 letters ("Horny Mushroo...") and letters the font table doesn't know yet read as "?",
  // so match as a pattern against every item name, within the category in brackets (Etc, Use, Equip...)
  let ITEMS = null;
  function itemByName(name, cat){
    if (!ITEMS) return null;
    const cut = /\.\.\.$/.test(name), core = name.replace(/\.\.\.$/, "");
    const re = new RegExp("^" + core.split("").map(c => c === "?" ? "." : c.replace(/[.*+^${}()|[\]\\]/g, "\\$&")).join("") + (cut ? "" : "$"));
    const tab = {Etc: ["Etc"], Use: ["Consumable", "Scroll"], Equip: ["Equipment"], Setup: ["Setup"]};
    const catRe = new RegExp("^" + cat.replace(/\?/g, ".") + "$"), cats = Object.keys(tab).filter(k => catRe.test(k)).flatMap(k => tab[k]);
    const hits = ITEMS.filter(([id, it]) => re.test(it.n) && (!cats.length || cats.includes(it.c)));
    return hits.length === 1 ? hits[0][0] : null;
  }

  function createReaders(G){
    ITEMS = Object.entries(G.items);
    let prev = [], lastBar = null, lastParty = null, bonusAt = -Infinity, partyNext = null, partySeen = 0, barNext = null;
    // new pickup lines since the previous frame. Each new message pushes the stack up one line, so the smallest shift n
    // (in lines) where every older line in this frame sits n lines above the same text in the last frame says how many
    // at the bottom are new. Lines that faded too far to read are just skipped.
    let pitch = 14;
    function fresh(cur){
      for (let i = 1; i < cur.length; i++){ const g = cur[i].y - cur[i - 1].y; if (g >= 10 && g <= 20) pitch = g }
      const at = new Map(prev.map(l => [l.y, l.text])), find = y => at.get(y) ?? at.get(y - 1) ?? at.get(y + 1);
      let n = 0;
      for (; n < cur.length; n++){
        let ok = true, seen = 0;
        for (let i = 0; i < cur.length - n && ok; i++){
          const p = find(cur[i].y + n * pitch);
          // a line fading out reads partly as "?": it says nothing either way (comparing it would count old lines again)
          if (p !== undefined && !p.includes("?") && !cur[i].text.includes("?")){ seen++; ok = p === cur[i].text }
        }
        if (ok && (seen || !prev.length)) break;
      }
      if (!prev.length) n = cur.length;   // first frame: everything on screen counts once
      prev = cur;
      return cur.slice(cur.length - n);
    }
    function readFrame(raw, t){
      const img = raw.k ? raw : native(raw), ev = [];
      const bar = readBar(img) || readBarAny(raw);   // pixel-exact fast path, else any scale
      // a new bar value counts when its EXP and % agree for the level (EXP / level total = %), or when it's read the same
      // twice in a row (after a level-up); one misread digit would otherwise add fake EXP
      const key = bar && bar.exp + "/" + bar.pct, steady = key && key === barNext;
      barNext = key;
      const need = lastBar?.level && G.exp[lastBar.level], agrees = bar && need && Math.abs(bar.exp / need * 100 - bar.pct) <= 0.02;
      if (bar && (!lastBar || (steady || agrees) && (bar.exp !== lastBar.exp || bar.pct !== lastBar.pct))){
        // level: the EXP table entry that this EXP / % works out to
        let level = null;
        if (bar.pct > 0.5) for (const [L, need] of Object.entries(G.exp)) if (Math.abs(bar.exp / (bar.pct / 100) - need) / need < 0.004){ level = +L; break }
        ev.push({t, type: "bar", exp: bar.exp, pct: bar.pct, level}); lastBar = {...bar, level: level || lastBar?.level};
      }
      for (const p of fresh(readPickups(img))){
        if (p.event.type === "bonus") bonusAt = t;
        ev.push({t, ...p.event});
      }
      // party size only changes after the same new size is read 3 frames running (a window in the way, a bar mid-blink)
      // no party window: a party while bonus lines came in the last 3 minutes (left the party = back to solo after that)
      const party = readParty(img) || (t - bonusAt < 180e3 ? 2 : 1);
      if (party === partyNext) partySeen++; else { partyNext = party; partySeen = 1 }
      if (party !== lastParty && (lastParty === null || partySeen >= 3)){ ev.push({t, type: "party", size: party}); lastParty = party }
      return ev;
    }
    return {readFrame};
  }
  const api = {createReaders, mapTextCrop, mapFromText, jobTextCrop, jobFromText, similar, native, readBar, readBarAny, readLines, readPickups, readParty};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindReaders = api;
})(typeof window !== "undefined" ? window : globalThis);
