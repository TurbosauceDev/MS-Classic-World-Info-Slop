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
    "t":[3,9,"25d2493"],
    // l: a full 1x9 bar, the i's shape without its gap (it read as "i" by one dot: "Biue Potion", Danny's report 2026-10-18)
    "l":[1,9,"1ff"]};
  // the message digits are the same 5x9 font as the stat window (shot.js SHOT_FONT)
  const SHOT = typeof SHOT_FONT !== "undefined" ? SHOT_FONT : root.SHOT_FONT || {};
  for (const ch of "0123456789") if (SHOT[ch]) MSG_FONT[ch] = SHOT[ch];
  const BAR = glyphs(BAR_FONT), MSG = glyphs(MSG_FONT);
  // letters learned on this PC from pickup lines whose item was certain (saved in the settings, sent back at Start)
  const LEARNED = [];   // new ones, handed to readFrame as "glyph" events (the tracker saves them)
  function addGlyphs(list){ const added = []; for (const g of list || []) if (g && g.ch && g.bits && !MSG.some(f => f.w === g.w && f.h === g.h && f.bits === g.bits)){ const f = {ch: g.ch, w: g.w, h: g.h, bits: g.bits}; MSG.push(f); added.push(f) } return added }

  // 1 game pixel per pixel: in a picture scaled up k times, (nearly) every color change between neighbors falls on a block
  // edge. Find the largest k (2-4) and offset where >= 85% of the sharp changes do. Tolerant: video capture blurs colors a little.
  // cached = true (the live tracker): the scale found is reused for 20 frames of the same size, as finding it is the slow
  // part (a pass over the whole frame) and it doesn't change while playing
  let scaleMemo = null;
  function native(img, cached = false){
    const {w, h, d} = img;
    if (cached && scaleMemo && scaleMemo.w === w && scaleMemo.h === h && scaleMemo.uses++ < 20) return shrink(img, scaleMemo.best);
    const step = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 150;
    // the status bar along the bottom first: it's always UI. With the game at native resolution (2560x1440, UI "Ideal
    // Ratio") only the UI is doubled, and the sharp scenery over the whole frame drowns the UI's grid (Danny, 2026-10-18)
    const find = (y0, y1) => {
      const hist = {x: new Array(12).fill(0), y: new Array(12).fill(0)};
      for (let y = y0; y < y1; y += 3) for (let x = 1; x < w - 1; x++){ const i = (y * w + x) * 4; if (step(i, i + 4)) hist.x[x % 12]++ }
      for (let x = 1; x < w - 1; x += 3) for (let y = y0; y < y1; y++){ const i = (y * w + x) * 4; if (step(i, i + w * 4)) hist.y[y % 12]++ }
      let best = null;
      for (const k of [2, 3, 4]){
        const fold = a => { const f = new Array(k).fill(0); a.forEach((n, p) => f[p % k] += n); return f };
        const fx = fold(hist.x), fy = fold(hist.y), sx = fx.reduce((a, b) => a + b), sy = fy.reduce((a, b) => a + b);
        const px = fx.indexOf(Math.max(...fx)), py = fy.indexOf(Math.max(...fy));
        if (sx > 200 && sy > 200 && fx[px] >= sx * 0.85 && fy[py] >= sy * 0.85) best = {k, ox: (px + 1) % k, oy: (py + 1) % k};
      }
      return best;
    };
    const best = find(Math.floor(h * 0.92), h - 1) || find(1, h - 1) || {k: 1, ox: 0, oy: 0};
    if (cached) scaleMemo = {w, h, best, uses: 0};
    return shrink(img, best);
  }
  function shrink({w, h, d}, {k, ox, oy}){
    if (k === 1) return {w, h, d, k, ox: 0, oy: 0};
    const W = Math.floor((w - ox) / k), H = Math.floor((h - oy) / k), out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = ((oy + y * k) * w + ox + x * k) * 4, o = (y * W + x) * 4;
      out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255;
    }
    return {w: W, h: H, d: out, k, ox, oy};
  }

  // ink mask of a box (rows y0..y1, cols x0..x1) -> {get(x, y), ...}; isInk(r, g, b)
  function mask(img, x0, y0, x1, y1, isInk){
    const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0), m = new Uint8Array(W * H), d = img.d;   // tiny images: empty box
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const i = ((y + y0) * img.w + x + x0) * 4; m[y * W + x] = +isInk(d[i], d[i + 1], d[i + 2]) || 0;   // ink level: true/1, or 2 for the tooltip reader's full ink
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
      // a narrow 1 leaves a wide gap before its comma ("1 ,601", Danny's KPQ frame 2026-10-18): that space isn't a break
      str = str.replace(/(\d) ,(?=\d)/g, "$1,");
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

  /* HP and MP: "HP [464/708]" and "MP [196/567]" sit left of the EXP number on the same status-bar line, in the same green
     brackets with the same white 5x7 digits as the [64.09%] (UI at 2x). Same method as readBarAny: pair the brackets, read the
     white blobs between them; a "/" (a thin diagonal blob, far fewer lit cells than a digit) splits current from max.
     Returns {hp: [cur, max], mp: [cur, max], y: the line} when both boxes read, else null. No screen pixels beyond the bar are read. */
  function readVitalsAny(img, band = null){
    const y0 = band ? Math.max(0, band.y0) : img.h < 200 ? 0 : Math.floor(img.h * 0.78), y1 = band ? Math.min(img.h, band.y1) : img.h;
    const G = blobs(img, 0, y0, img.w, y1, isGreen), W = blobs(img, 0, y0, img.w, y1, isWhite);
    const br = G.out.filter(b => b.h >= 5 && b.w <= 0.6 * b.h).sort((a, b) => a.x - b.x), pairs = [];
    for (const o of br){
      const bh = o.h, on = b => Math.abs(b.cy - o.cy) <= 0.3 * bh;
      const c = br.find(c => c.x > o.x1 && c.x - o.x <= 12 * bh && on(c) && Math.abs(c.h - bh) <= 0.25 * bh);
      if (!c) continue;
      const inside = W.out.filter(b => on(b) && b.h >= 0.1 * bh && b.x > o.x1 && b.x1 < c.x).sort((a, b) => a.x - b.x);
      const tall = inside.filter(b => b.h >= 0.6 * bh);
      if (tall.length < 3 || tall.some(b => b.h > 1.25 * bh)) continue;
      const dh = Math.max(...tall.map(b => b.h)), slash = tall.findIndex(b => b.w >= 0.25 * b.h && b.n < 0.4 * b.w * b.h && b.w < 0.95 * b.h && b.h < dh);   // the "/" is a row or two shorter than the digits
      if (slash < 1 || slash > tall.length - 2) continue;   // no "/" = not an HP/MP box ("[64.09%]")
      const num = bs => { const d = bs.map(b => readDigit(W, b)); return d.length && !d.includes(null) && d.length <= 6 ? +d.join("") : null };
      const cur = num(tall.slice(0, slash)), max = num(tall.slice(slash + 1));
      if (cur == null || max == null || cur > max || max < 1) continue;
      pairs.push({cy: o.cy, x: o.x, bh, cur, max});
    }
    if (pairs.length < 2) return null;   // HP is the left one, MP the next: one box alone could be either, so it says nothing
    const low = Math.max(...pairs.map(f => f.cy)), row = pairs.filter(f => f.cy >= low - 4).sort((a, b) => a.x - b.x);
    if (row.length < 2) return null;
    return {hp: [row[0].cur, row[0].max], mp: [row[1].cur, row[1].max], y: y0 + low, bh: row[0].bh};
  }

  // ---- pickup messages (bottom right) ----
  const msgInk = (r, g, b) => r > 215 && g > 215 && b < 150 || Math.min(r, g, b) > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 60;
  // second looks at rows that read badly (customclassic-chat port, 2026-10-31): their reader re-OCRs a row whose
  // confidence came back low, cropped on its own, and keeps the better read. Ours: a band taller than one line
  // (two messages whose rows touch) is split at its quietest row, and a line with unread glyphs is re-cut with its
  // edges trimmed one row (a neighbour line's edge pixel inside the band spoils the column it sits in). Counted so
  // the reading.jsonl telemetry shows whether it earns its keep.
  const LINE_STATS = {tries: 0, wins: 0};
  function readLines(img){
    const x0 = Math.max(0, img.w - 430), y0 = Math.floor(img.h / 3), M = mask(img, x0, y0, img.w, img.h - 60, msgInk), lines = [];
    let y = 0;
    const rowN = y => { let n = 0; for (let x = 0; x < M.W; x++) n += M.m[y * M.W + x]; return n };
    const rowInk = y => rowN(y) >= 2;
    // one band of rows -> one line, or null (too short/tall, not right-aligned, no glyphs). The body of the old loop.
    function readBand(s, y){
      if (y - s < 7 || y - s > 13) return null;
      const gl = cut(M, s, y);
      if (!gl.length || gl[gl.length - 1].x + gl[gl.length - 1].w < M.W - 12) return null;   // messages are right-aligned
      const keep = [gl[gl.length - 1]];
      for (let i = gl.length - 2; i >= 0 && keep[0].x - (gl[i].x + gl[i].w) <= 9; i--) keep.unshift(gl[i]);
      let str = "", last = null;
      const chars = keep.map(g => match(g, MSG) || "?");
      keep.forEach((g, i) => { if (last !== null && g.x - last >= 4) str += " "; str += chars[i]; last = g.x + g.w });
      return {y: s + y0, text: str.replace(/ (?=[0-9)])|(?<=[(+0-9]) /g, ""), glyphs: keep, chars};
    }
    const misses = ln => ln.chars.reduce((a, c) => a + (c === "?"), 0);
    while (y < M.H){
      if (!rowInk(y)){ y++; continue }
      const s = y; while (y < M.H && rowInk(y)) y++;
      let ln = readBand(s, y);
      if (!ln && y - s > 13 && y - s <= 27){
        // two messages whose separating gap video blur bridged: split at the most gap-like row — fewest separate
        // ink runs (a bridge is one run, a text row is many), ties toward the middle — where both halves are
        // still line-sized, and read each half alone
        LINE_STATS.tries++;
        const rowRuns = yy => { let n = 0, on = false; for (let x = 0; x < M.W; x++){ const i = !!M.m[yy * M.W + x]; if (i && !on) n++; on = i } return n };
        let q = -1, best = 1 << 30, mid = (s + y) / 2;
        for (let qy = Math.max(s + 7, y - 14); qy <= Math.min(y - 8, s + 13); qy++){
          const n = rowRuns(qy);
          if (n < best || n === best && Math.abs(qy - mid) < Math.abs(q - mid)){ best = n; q = qy }
        }
        if (q > 0){
          const halves = [readBand(s, q), readBand(q + 1, y)].filter(Boolean);
          if (halves.length){ LINE_STATS.wins += halves.length; lines.push(...halves); continue }
        }
      }
      if (ln && misses(ln)){
        // unread glyphs: often a half-scrolled line's remnant row merged into this band's edge. Re-cut with each
        // edge trimmed a row; keep the read with fewer "?" (accept only if better, like theirs)
        LINE_STATS.tries++;
        for (const [s2, y2] of [[s, y - 1], [s + 1, y], [s + 1, y - 1]]){
          const again = readBand(s2, y2);
          if (again && misses(again) < misses(ln)){ ln = again; LINE_STATS.wins++; break }
        }
      }
      if (ln) lines.push(ln);
    }
    return lines;
  }
  // any light text in a box (the scroll check's item tooltips, 54-invprice.js/57-scrollscan.js), wherever it sits: other
  // light things in the box (window frames, icons) would merge whole-row bands, so the ink is first split into blobs, blobs
  // of letter size near each other (same middle within 7 rows, under 10 px apart) make a line, and each line 7-13 rows tall
  // is cut into glyphs and matched against the message font. Returns [{x, x1, y, text, glyphs, chars}]; unread glyphs are "?"
  // opt (the tooltip font, 57-scrollscan.js): {font: [{ch, w, h, bits}] with bits as ink levels "0"/"1"/"2" (isInk returns 0-2),
  // minH/maxH line height, space: gap that makes a space}; glyphs then match with a few levels off (video capture)
  function readTextLines(img, box, isInk, opt = {}){
    const FONT = opt.font || MSG, minH = opt.minH || 7, maxH = opt.maxH || 13, SP = opt.space || 4;
    const near = (g, f) => { if (f.w !== g.w || f.h !== g.h) return Infinity; let dd = 0; for (let i = 0; i < g.bits.length; i++) if (g.bits[i] !== f.bits[i]) dd += Math.abs(g.bits.charCodeAt(i) - f.bits.charCodeAt(i)); return dd };
    const pick = g => { if (!opt.font) return match(g, MSG); let ch = null, bd = Math.max(2, g.bits.length * 0.06); for (const f of FONT){ const dd = near(g, f); if (dd < bd){ bd = dd; ch = f.ch } } return ch };
    const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0), M = mask(img, x0, y0, Math.min(img.w, box.x1), Math.min(img.h, box.y1), isInk), {W, H, m} = M;
    const lab = new Int32Array(W * H), blobs = [];
    for (let p0 = 0; p0 < W * H; p0++){
      if (!m[p0] || lab[p0]) continue;
      const b = {x: W, x1: 0, y: H, y1: 0, n: 0, full: 0}, st = [p0]; lab[p0] = blobs.length + 1;
      while (st.length){ const q = st.pop(), x = q % W, y = (q - x) / W; b.n++; if (m[q] > 1) b.full++;
        if (x < b.x) b.x = x; if (x > b.x1) b.x1 = x; if (y < b.y) b.y = y; if (y > b.y1) b.y1 = y;
        if (b.n > 400) continue;
        for (const r of [q - 1, q + 1, q - W, q + W]){ if (r < 0 || r >= W * H || !m[r] || lab[r] || (r === q - 1 && x === 0) || (r === q + 1 && x === W - 1)) continue; lab[r] = blobs.length + 1; st.push(r) } }
      blobs.push(b);
    }
    // with ink levels, a letter has full ink somewhere: faint-only blobs are a bright background showing through the tooltip
    const small = blobs.filter(b => b.n <= 400 && b.y1 - b.y < maxH && b.x1 - b.x < 16 && (!opt.font || b.full)).sort((a, b) => a.x - b.x), used = new Set(), out = [];
    for (const s0 of small){
      if (used.has(s0)) continue;
      const line = [s0]; used.add(s0); let x1 = s0.x1, cy = (s0.y + s0.y1) / 2;
      for (const b of small){ if (used.has(b) || b.x < s0.x) continue; if (b.x - x1 >= 10) continue; if (Math.abs((b.y + b.y1) / 2 - cy) > 7 || b.y < cy - maxH * 0.7 || b.y1 > cy + maxH * 0.7) continue; line.push(b); used.add(b); x1 = Math.max(x1, b.x1) }
      const ya = Math.min(...line.map(b => b.y)), yb = Math.max(...line.map(b => b.y1)) + 1;
      // not a line: its blobs stay free for a line starting further right (an icon left of a name, Danny's tooltip 2026-10-20)
      if (line.length < 3 || yb - ya < minH || yb - ya > maxH){ for (const b of line) if (b !== s0) used.delete(b); continue }
      // glyphs: column runs inside the line's box
      const gl = []; let x = s0.x;
      const colInk = x => { for (let y = ya; y < yb; y++) if (m[y * W + x]) return true; return false };
      while (x <= x1){
        if (!colInk(x)){ x++; continue }
        const s = x; while (x <= x1 && colInk(x)) x++;
        let t = yb, bt = ya; for (let y = ya; y < yb; y++) for (let xx = s; xx < x; xx++) if (m[y * W + xx]){ t = Math.min(t, y); bt = Math.max(bt, y) }
        let bits = ""; for (let y = t; y <= bt; y++) for (let xx = s; xx < x; xx++) bits += m[y * W + xx];
        gl.push({x: s, w: x - s, h: bt - t + 1, top: t - ya, bits});
      }
      let str = "", last = null; const chars = gl.map(g => pick(g) || "?");
      gl.forEach((g, i) => { if (last !== null && g.x - last >= SP) str += " "; str += chars[i]; last = g.x + g.w });
      out.push({x: x0 + gl[0].x, x1: x0 + x1 + 1, y: y0 + ya, text: str, glyphs: gl, chars});
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  /* KPQ's "Time Left" clock, top middle of the screen: cream dot-matrix digits, 5x7 dots each, one dot every 5 px (game
     pixels), laid out MM.SS as digit, digit, 4 columns, digit, digit. Read from Danny's KPQ frames (2026-10-18), where the
     dot grid sat at x = middle - 37 + 5*col, y = 44 + 5*row. 6 and 9 from his later KPQ frames (22:16, 22:19; 2026-10-21
     audit: the old guessed shapes were wrong, so every :x6/:x9 second read nothing). Returns seconds left, or null. */
  const TDIG = {".###./#..##/#.#.#/#.#.#/##..#/##..#/.###.": 0, "..#../.##../..#../..#../..#../..#../.###.": 1,
    ".###./#...#/....#/...#./..#../.#.../#####": 2, ".###./#...#/....#/..##./....#/#...#/.###.": 3,
    "..##./.#.#./.#.#./#..#./#####/...#./...#.": 4, "#####/#..../####./....#/....#/#...#/.###.": 5,
    ".###./#..../#..../####./#...#/#...#/.###.": 6, "#####/...#./...#./..#../..#../.#.../.#...": 7,
    ".###./#...#/#...#/.###./#...#/#...#/.###.": 8, ".###./#...#/#...#/.####/....#/...#./.###.": 9};
  function readKpqTimer(img){
    const {w, h, d} = img, mid = Math.round(w / 2);
    if (w < 400 || h < 100) return null;
    const ink = (x, y) => { const i = (y * w + x) * 4; return d[i] > 200 && d[i + 1] > 180 && d[i + 2] > 120 };
    const g = [];
    for (let r = 0; r < 7; r++){ const row = []; for (let c = 0; c < 30; c++) row.push(ink(mid - 37 + 5 * c, 44 + 5 * r)); g.push(row) }
    const cell = (a, i) => { const rows = []; for (let r = 0; r < 7; r++){ let x = ""; for (let c = 0; c < 5; c++) x += g[r][a + c] ? "#" : "."; rows.push(x) } return rows.join("/") };
    const digit = bm => { if (bm in TDIG) return TDIG[bm];
      let best = null, bd = 9, tie = false;
      for (const [k, v] of Object.entries(TDIG)){ let n = 0; for (let j = 0; j < k.length; j++) if (k[j] !== bm[j]) n++; if (n < bd){ bd = n; best = v; tie = false } else if (n === bd) tie = true }
      return bd <= 1 && !tie ? best : null };
    for (let a = 0; a <= 3; a++){
      // the columns between the digits are blank (a dot under the 4-column gap is the MM.SS point)
      const blank = c => g.every((row, r) => !row[c] || r === 6);
      if (![a + 5, a + 11, a + 15, a + 21].every(c => c < 30 && blank(c))) continue;
      const ds = [0, 6, 16, 22].map(o => digit(cell(a + o)));
      if (ds.some(v => v === null)) continue;
      const m = ds[0] * 10 + ds[1], sec = ds[2] * 10 + ds[3];
      if (sec < 60) return m * 60 + sec;
    }
    return null;
  }
  function readPickups(img){
    const lines = readLines(img), out = [];
    // amounts of 1,000+ may be written with a comma, which the font table hasn't seen yet ("?"): either counts as a thousands
    // mark. Every letter must still read exactly, so a faded line (letters turn "?" too) doesn't get through.
    const N = "(\\d{1,3}(?:[,?]\\d{3})+|\\d+)", num = v => +v.replace(/[,?]/g, "");
    const MESO = new RegExp(`^You have gained mesos \\(\\+${N}\\)$`), EXP = new RegExp(`^You received EXP \\(\\+${N}\\)$`), BONUS = new RegExp(`^Bonus EXP for PARTY \\(\\+${N}\\)$`);
    for (const l of lines){
      let m;
      if ((m = l.text.match(MESO))) out.push({y: l.y, text: l.text, event: {type: "meso", amount: num(m[1])}});
      else if ((m = l.text.match(EXP))) out.push({y: l.y, text: l.text, event: {type: "exp", gain: num(m[1])}});
      else if ((m = l.text.match(BONUS))) out.push({y: l.y, text: l.text, event: {type: "bonus", gain: num(m[1])}});
      else if ((m = l.text.match(/^(.+?) ?x(\d+) ?earned\. ?\((.+)\)$/))){
        // several items fit (letters not learned yet, a cut name): the session picks the one this map's monsters drop
        const ids = itemByName(m[1], m[3], true);
        // one item fits a name with unread letters: its name says what those letters are. Learned when the glyphs line up
        // one-to-one with the name's letters (spaces aside)
        if (ids.length === 1 && m[1].includes("?") && l.glyphs){
          const name = (ITEMS.find(([id]) => id === ids[0])?.[1].n || "").replace(/ /g, ""), k = m[1].replace(/ /g, "").length;
          if (name.length === k && l.chars.slice(0, k).every(c => c.length === 1)){
            const learn = [];
            l.chars.slice(0, k).forEach((c, i) => { if (c === "?"){ const g = l.glyphs[i]; learn.push({ch: name[i], w: g.w, h: g.h, bits: g.bits}) } });
            LEARNED.push(...addGlyphs(learn));
          }
        }
        out.push({y: l.y, text: l.text, event: ids.length === 1 ? {type: "item", id: ids[0], qty: +m[2]} : {type: "itemraw", text: l.text, qty: +m[2], cands: ids.length <= 40 ? ids : []}});
      }
    }
    return out;
  }

  // ---- party window: a column of HP bars (same left edge, ~17 px apart) in the top-left area. Counted by the bar's frame
  // (black outline, white border), not its red fill: a member out of range (other map, other KPQ stage) has a grey name and an
  // empty grey bar, and a member low on HP a short red run (Danny's party, 2026-10-19: "Party of 4 (was 3)" flapping)
  function readParty(img){
    const X = Math.floor(img.w * 0.25), Y = Math.floor(img.h * 0.6), d = img.d, w = img.w;
    const white = i => d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200, black = i => d[i] < 50 && d[i + 1] < 50 && d[i + 2] < 50;
    // a frame edge: a white run of 25+ px with black all along the other side (above for the top edge, below for the bottom)
    const edges = (dy) => {
      const out = [];
      for (let y = 1; y < Y - 1; y++){
        let x = 0;
        while (x < X){
          if (!white((y * w + x) * 4)){ x++; continue }
          const s = x; while (x < X && white((y * w + x) * 4)) x++;
          if (x - s < 25) continue;
          let k = 0; for (let i = s; i < x; i++) if (black(((y + dy) * w + i) * 4)) k++;
          if (k >= (x - s) * 0.8) out.push({y, x: s, n: x - s});
        }
      }
      return out;
    };
    const bottoms = edges(1);
    // a bar = a top edge with a bottom edge of the same width and left edge 5-30 rows below it
    const bars = edges(-1).filter(t => bottoms.some(b => b.y - t.y >= 5 && b.y - t.y <= 30 && Math.abs(b.x - t.x) <= 3 && Math.abs(b.n - t.n) <= 4));
    const byX = [];
    for (const r of bars){ let g = byX.find(g => Math.abs(g.x - r.x) <= 4 && Math.abs(g.n - r.n) <= 4); if (!g) byX.push(g = {x: r.x, n: r.n, k: 0}); g.k++ }
    let best = 0;
    for (const {k} of byX) if (k >= 2 && k <= 6) best = Math.max(best, k);
    return best || null;
  }

  // ---- map name: the two white lines (street, map) next to the minimap icon, top-left. The minimap font isn't in our
  // tables, so this makes a clean black-on-white crop for OCR (Tesseract, in the main process) and fuzzy-matches the result.
  // Approach borrowed from beanguri/Maple-Classic-Exp-Overlay (MIT).
  // mapTextRect finds the title's rect in the frame; mapCropAt cuts the OCR crop out of any rect. They're separate so a
  // frame whose band hunt fails can re-cut the LAST good rect (the title doesn't move while the minimap stays put) —
  // that's what keeps the name on the cards when the background under the text changes but nothing is actually covered
  // (Danny 10-29: "the tracker loses the minimap name even when it's never covered").
  function mapTextRect(img){
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
    // a band is split where its rows thin out to under a third of its fullest row: the minimap's icon next to the text can
    // bridge the two lines into one band (Danny's KPQ minimap, 2026-10-18)
    for (let i = bands.length - 1; i >= 0; i--){
      const b = bands[i]; if (!b) continue;
      let m = 0; for (let y = b[0]; y < b[1]; y++) m = Math.max(m, cnt[y]);
      const parts = []; for (let y = b[0]; y < b[1]; y++) if (cnt[y] >= m / 3){ const l = parts[parts.length - 1]; if (l && y === l[1]) l[1] = y + 1; else parts.push([y, y + 1]) }
      bands.splice(i, 1, ...parts);
    }
    for (let i = bands.length - 1; i >= 0; i--) if (!bands[i] || bands[i][1] - bands[i][0] < 5 || bands[i][1] - bands[i][0] > 30) bands.splice(i, 1);
    const two = bands.findIndex((b, i) => bands[i + 1] && bands[i + 1][0] - b[1] < (b[1] - b[0]) && Math.abs((bands[i + 1][1] - bands[i + 1][0]) - (b[1] - b[0])) <= 4);
    // the minimap folded to its title bar: one line, "Hidden Street : 1st Accompaniment <Exit>", white on a light bar from
    // the left edge at the very top (Danny's KPQ run, 2026-10-18): the bar's rows run light from x < 8 for 150+ px, except
    // where the text cuts through them; the text is the rows between the bar's top and bottom edges
    // The bar may be dragged anywhere in the top-left: the long runs' start x must agree between the bar's top and bottom
    // edges, and the fill must be the UI's light grey (a white sign or cloud isn't). Maps without a minimap show only this
    // bar (Danny 10-29, "Victoria Road : Kerning City Pharmacy" on black).
    let one = null;
    if (two < 0){
      const run = y => { let bs = -1, bn = 0; for (let x = 0; x < X;){ if (!ink((y * img.w + x) * 4)){ x++; continue } const s = x; while (x < X && ink((y * img.w + x) * 4)) x++; if (x - s > bn){ bn = x - s; bs = s } } return bn > 150 ? bs : -1 };
      const sx = []; for (let y = 0; y < Y; y++) sx.push(run(y));
      const near = (a, b) => a >= 0 && b >= 0 && Math.abs(a - b) < 8;
      for (let y = 0; y < Y - 8 && !one; y++){
        if (sx[y] < 0) continue;
        let a = y; while (a < Y && near(sx[a], sx[y])) a++;
        let b = a; while (b < Y && b - a <= 14 && !near(sx[b], sx[y])) b++;
        if (b < Y && b - a >= 6 && b - a <= 14){
          const o = (((a + b) >> 1) * img.w + sx[y] + 1) * 4, v = d[o];
          if (Math.abs(v - d[o + 1]) < 16 && Math.abs(v - d[o + 2]) < 16 && v >= 195 && v <= 246) one = [a, b];
        }
        y = a;
      }
    }
    if (two < 0 && !one) return null;
    const y0 = Math.max(0, (one || bands[two])[0] - 2), y1 = (one || bands[two + 1])[1] + 2;
    // left to right: from the first column with ink to the end of the inkiest stretch of columns (gaps under 24 px): the
    // game scene or the minimap's right border further right isn't text
    const colN = x => { let n = 0; for (let y = y0; y < y1; y++) if (ink((y * img.w + x) * 4)) n++; return n };
    const runs = []; for (let x = 0, gap = 99; x < X; x++){ const n = colN(x); if (!n){ gap++; continue } if (gap >= 24) runs.push({a: x, b: x, n: 0}); const r = runs[runs.length - 1]; r.b = x; r.n += n; gap = 0 }
    if (!runs.length) return null;
    const x0 = runs[0].a, x1 = runs.reduce((p, q) => q.n > p.n ? q : p).b;
    if (x1 <= x0) return null;
    return {x0, y0, x1, y1};
  }
  // the OCR crop for a title rect: white text made black on white (flipped when the folded bar's light rows dominate)
  function mapCropAt(img, r){
    const {x0, y0, x1, y1} = r, d = img.d, ink = i => Math.min(d[i], d[i + 1], d[i + 2]) > 190;
    const S = 2, P = 8, w = (x1 - x0 + 1) * S + 2 * P, h = (y1 - y0) * S + 2 * P, out = new Uint8ClampedArray(w * h * 4).fill(255);
    // mostly ink: white text on the light folded bar, which reads as the background: flipped so the text is the black part
    let all = 0, inked = 0; for (let y = y0; y < y1; y++) for (let x = x0; x <= x1; x++){ all++; if (ink((y * img.w + x) * 4)) inked++ }
    const flip = inked > all / 2;
    for (let y = y0; y < y1; y++) for (let x = x0; x <= x1; x++) if (ink((y * img.w + x) * 4) !== flip)
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++){ const o = ((P + (y - y0) * S + dy) * w + P + (x - x0) * S + dx) * 4; out[o] = out[o + 1] = out[o + 2] = 0 }
    return {w, h, d: out};
  }
  function mapTextCrop(img){ const r = mapTextRect(img); return r ? {...mapCropAt(img, r), rect: r} : null }
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
  // ---- character name: the lower of the two lines in the job box ("Archer" over "Turbow"). Columns of the status bar's white
  // text split into blocks at gaps of 4+ px; the first block with two separate lines of text is the job box, made 4x bigger
  // for the OCR. Only kept on this PC (History); never sent with shared runs or the party view.
  function nameTextCrop(img){
    const rows = Math.max(40, Math.round(img.h * 0.056)), y0 = img.h - rows, X = Math.floor(img.w * 0.55), d = img.d;
    // white pixels, minus long horizontal runs (the box's top edge, the bars' outlines)
    const M = new Uint8Array(rows * X);
    for (let y = y0; y < img.h; y++){ let r = 0;
      for (let x = 0; x <= X; x++){ const i = (y * img.w + x) * 4, w = x < X && Math.min(d[i], d[i + 1], d[i + 2]) > 190;
        if (w) r++; else { if (r && r < 30) for (let k = x - r; k < x; k++) M[(y - y0) * X + k] = 1; r = 0 } } }
    const on = (x, y) => M[(y - y0) * X + x] === 1;
    const col = []; for (let x = 0; x < X; x++){ let c = 0; for (let y = y0; y < img.h; y++) if (on(x, y)) c++; col.push(c) }
    const blocks = []; let a = -1, gap = 0;
    for (let x = 0; x <= X; x++){ const ink = x < X && col[x] > 0 && col[x] < rows * 0.6;   // tall lines (box edges) aren't text
      if (ink){ if (a < 0) a = x; gap = 0 } else if (a >= 0 && ++gap >= 4){ blocks.push([a, x - gap]); a = -1 } }
    for (const [x0, x1] of blocks){
      if (x1 - x0 < 12) continue;
      const band = []; for (let y = y0; y < img.h; y++){ let c = 0; for (let x = x0; x <= x1; x++) if (on(x, y)) c++; band.push(c > 0) }
      const lines = []; let s = -1;
      for (let i = 0; i <= band.length; i++){ if (i < band.length && band[i]){ if (s < 0) s = i } else if (s >= 0){ if (i - s >= 4 && i - s <= 16) lines.push([s, i - 1]); s = -1 } }
      if (lines.length !== 2) continue;
      const ly0 = lines[0][0], ly1 = lines[1][1], S = 4, P = 24, cw = x1 - x0 + 1, ch = ly1 - ly0 + 1, w = cw * S + 2 * P, h = ch * S + 2 * P, out = new Uint8ClampedArray(w * h * 4).fill(255);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (on(x0 + x, y0 + ly0 + y))
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++){ const o = ((P + y * S + dy) * w + P + x * S + dx) * 4; out[o] = out[o + 1] = out[o + 2] = 0 }
      // softened (a 5x5 blur): the OCR reads the game's thin pixel letters better smooth than blocky ("w" got dropped)
      const g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = out[i * 4];
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++){ let t = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t += g[(y + dy) * w + x + dx];
        const o = (y * w + x) * 4; out[o] = out[o + 1] = out[o + 2] = t / 25 }
      return {w, h, d: out};
    }
    return null;
  }
  // the name as read: letters, digits (MapleStory names are 4-12 of them), the longest such word
  // (the crop holds both lines, "Archer" over the name: the OCR reads the pair better than the name alone; the last line is the name)
  const nameFromText = text => { const ls = String(text || "").split("\n").map(l => l.trim()).filter(Boolean), m = ls.length >= 2 && ls.at(-1).match(/^[A-Za-z0-9]{4,12}$/); return m ? m[0] : null };
  const JOBS = ["Beginner", "Swordman", "Fighter", "Page", "Spearman", "Magician", "Cleric", "Archer", "Hunter", "Crossbowman", "Rogue", "Assassin", "Bandit"];
  /* death check: the chat box says "You have lost 4,721 EXP for dying" (grey) right after a death (Danny's screenshot,
     2026-10-18). Its font isn't learned, so it goes through the same OCR as the map name: the lower-left of the screen,
     where the chat box sits, bright text made black on white and doubled in size for the OCR. */
  function chatCrop(img){
    const {w, h, d} = img, x1 = Math.floor(w * 0.7), y0 = Math.floor(h * 0.55), y1 = Math.floor(h * 0.95), cw = x1, ch = y1 - y0;
    const out = new Uint8ClampedArray(cw * 2 * ch * 2 * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++){
      const i = ((y0 + y) * w + x) * 4, ink = d[i] + d[i + 1] + d[i + 2] > 420 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 140, v = ink ? 0 : 255;
      for (let k = 0; k < 4; k++){ const o = (((y * 2 + (k >> 1)) * cw * 2) + x * 2 + (k & 1)) * 4; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255 }
    }
    return {w: cw * 2, h: ch * 2, d: out};
  }
  // the EXP lost, from the OCR text ("lost 4,721 EXP for dying"; OCR may turn the comma into a dot or a space)
  function deathFromText(text){
    const m = /lost\s*(\d[\d,. ]*\d|\d)\s*E\s*X\s*P?\s*f\w*\s*d\s*y/i.exec(String(text || "").replace(/\n/g, " "));
    return m ? +m[1].replace(/[,. ]/g, "") : null;
  }
  /* Opening a box (Companion's Magic Box from KPQ) writes its rewards in the chat box, not as pickup lines: "[03:54] White
     Potion x15 earned. (Use)", "[03:54] Red Potion x5 earned. (Use)", then "[03:54] Companion's Magic Box x1 has been lost.
     (Use)" (Danny's frames, 2026-10-19). From the chat OCR: one group per "...Box xN has been lost" line, the "earned" lines
     just above it. key = the group's lines as read (with the minute), so a group still on screen next time isn't counted
     again. Names: exact, else the closest item of that tab (85%+ alike: OCR reads "Pation"). */
  function boxFromText(text){
    const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean), out = [];
    const EARN = /^\[(\d\d:\d\d)\]\s*(.+?)\s*x\s*(\d+)\s*earned\.?\s*\((\w+)\)/, tab = {Etc: ["Etc"], Use: ["Consumable", "Scroll"], Equip: ["Equipment"], Setup: ["Setup"]};
    lines.forEach((l, i) => {
      if (!/Box\s*x\s*\d+\s*has\s*been\s*lost/i.test(l)) return;
      const items = [], keep = [l.replace(/\)\s*\S*$/, ")")];
      for (let j = i - 1, m; j >= 0 && (m = EARN.exec(lines[j])) && !/Box$/i.test(m[2]); j--){
        keep.unshift(m[0]);
        let id = ITEMS ? itemByName(m[2], m[4]) : null;
        if (!id && ITEMS){ const cats = tab[m[4]] || []; let best = 0, tie = false;
          for (const [k, it] of ITEMS) if (!cats.length || cats.includes(it.c)){ const v = similar(m[2], it.n); if (v > best){ best = v; id = k; tie = false } else if (v === best) tie = true }
          if (best < 0.85 || tie) id = null }
        items.unshift({id, name: m[2], qty: +m[3]});
      }
      if (items.length) out.push({key: keep.join("|"), items});
    });
    return out;
  }
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
  // OCR text -> {id, name}: the closest map name to the last line (75%+ alike), else null (junk is dropped, Danny 10-29)
  function mapFromText(text, G){
    // one line "Street : Map" when the minimap is folded to its title bar: the map is after the colon
    const lines = text.split("\n").filter(l => !/mini\s*map/i.test(l)).map(l => l.replace(/^.*:/, "").replace(/(<[^<>=]*)[>=].*$/, "$1>").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9>)]+$/g, "").trim()).filter(l => l.length >= 3);
    if (!lines.length) return null;
    let best = null;
    const l = lines[lines.length - 1];   // line 1 is the street/region ("Victoria Road", "Hidden Street"), line 2 the map
    // the folded minimap's one line can lose its colon: "Hidden Street 1st Accompaniment <Exit>" is also tried without its
    // first 1-3 words (the street)
    const words = l.split(/\s+/);
    for (const a of [0, 1, 2, 3].filter(k => k < words.length).map(k => norm(words.slice(k).join(" ")))){
      for (const [id, n] of Object.entries(G.mapnames)){
        const b = norm(n), sim = 1 - lev(a, b) / Math.max(a.length, b.length, 1);
        if (!best || sim > best.sim || sim === best.sim && G.maps[id] && !G.maps[best.id]) best = {id, name: n, sim};
      }
    }
    if (best && best.sim >= 0.75) return {id: best.id, name: best.name};
    return null;   // not a map we know: OCR noise ("I i it Cr", "1 CY Ara you looking"), never an event
  }

  // item pickup: names are cut to ~13 letters ("Horny Mushroo...") and letters the font table doesn't know yet read as "?",
  // so match as a pattern against every item name, within the category in brackets (Etc, Use, Equip...)
  let ITEMS = null;
  function itemByName(name, cat, all = false){
    if (!ITEMS) return all ? [] : null;
    const cut = /\.\.\.$/.test(name), core = name.replace(/\.\.\.$/, "");
    const re = new RegExp("^" + core.split("").map(c => c === "?" ? ".{1,2}" : "ilI1".includes(c) ? "[ilI1]" : c.replace(/[.*+^${}()|[\]\\]/g, "\\$&")).join("") + (cut ? "" : "$"));
    const tab = {Etc: ["Etc"], Use: ["Consumable", "Scroll"], Equip: ["Equipment"], Setup: ["Setup"]};
    const catRe = new RegExp("^" + cat.replace(/\?/g, ".") + "$"), cats = Object.keys(tab).filter(k => catRe.test(k)).flatMap(k => tab[k]);
    // l and i look alike in the pickup font ("Biue Potion", Danny's report 2026-10-18): either matches either. An unread "?"
    // may be two letters drawn as one glyph ("Emerald Sta?" = Staff, Danny's report 2026-10-19)
    let hits = ITEMS.filter(([id, it]) => re.test(it.n) && (!cats.length || cats.includes(it.c)));
    // the same name twice in the game data (Red Potion 2000000 / 2000007): the first one, which the shops sell
    if (hits.length > 1 && hits.every(h => h[1].n === hits[0][1].n)) hits = [hits[0]];
    return all ? hits.map(h => h[0]) : hits.length === 1 ? hits[0][0] : null;
  }

  /* Item counts on inventory and quick-slot icons ("91" on Meat): white-to-blue digits, each row one exact color, with a
     black outline; glyph = the columns with ink in the lower 5 rows (learned from Danny's inventory screenshots,
     2026-10-17). The tracker's own frames are video and shift those colors (99ccff comes out a3caee), so ink is "white"
     on the top 4 rows and "light blue" below, not one exact color per row (f3ffff and f4fdfb happen). The slot
     background (f8faf9, border f4f6f6 / bfcacc) fails both tests. */
  const CDIG = {".####./#....#/#....#/#....#/#....#/#....#/#....#/#....#/.####./": 0, "#/#/#/#/#/#/#/#/#/": 1,
    ".####./#....#/.....#/.....#/....#./..##../.#..../#...../######/": 2, ".####./#....#/.....#/.....#/..###./.....#/.....#/#....#/.####./": 3,
    "....#./...##./..#.#./.#..#./#...#./######/....#./....#./....#./": 4, "######/#...../#...../#####./.....#/.....#/.....#/#....#/.####./": 5,
    "..###./.#..../#...../#####./#....#/#....#/#....#/#....#/.####./": 6, "###/.../.../.../..#/..#/.#./.#./#../": 7,
    ".####./#....#/#....#/#....#/.####./#....#/#....#/#....#/.####./": 8, ".####./#....#/#....#/#....#/#....#/.#####/.....#/.....#/.####./": 9};
  const CTPL = Object.entries(CDIG).map(([k, dg]) => { const rows = k.split("/").slice(0, 9); return {dg, rows, w: rows[0].length} });
  // every count on screen: [{x, y, n}] (x = first digit's left column, y = the digits' bottom row)
  // area (optional): {x0, y0, x1, y1} in native pixels, the part of the screen the player marked (faster, and nothing
  // else on screen can be taken for a count)
  function readCounts(img, area = null){
    // red channel per row (white fades to light blue going down); the video's blur shifts each row toward its neighbors
    const RED = [, , , , [215, 250], [185, 230], [165, 200], [150, 185], [140, 175]];
    const {w, h, d} = img, blue = (i, r) => d[i + 2] >= 225 && d[i] >= RED[r][0] && d[i] <= RED[r][1] && d[i + 1] - d[i] >= 6 && d[i + 2] - d[i] >= 4;
    // (the top rows' white may take a little of the icon's colour behind it: blue down to 235, Danny's Lemon "98" read
    // fffff1 on the 8's corner, 2026-10-18)
    const is = (x, y, r) => { const i = (y * w + x) * 4; return r < 4 ? d[i] >= 235 && d[i + 1] >= 253 && d[i + 2] >= 235 : blue(i, r) };
    const dark = (x, y) => { const i = (y * w + x) * 4; return y >= 0 && y < h && d[i] + d[i + 1] + d[i + 2] < 150 };
    const out = [];
    const keyOf = (cols, y) => { let k = ""; for (let r = 0; r <= 8; r++){ for (const x of cols) k += is(x, y - 8 + r, r) ? "#" : "."; k += "/" } return k };
    /* a run of ink columns -> digits. Usually one exact digit. A light icon under the count (white feather, pale ore) adds
       ink inside a digit or joins columns onto it (Danny's Etc tab, 2026-10-18: "131" and "100" didn't read): then each digit
       is taken from the left where all its ink is there and at most 3 extra pixels are, and what's left after a digit is the
       icon, not a digit */
    function glyphsIn(c, y){
      const key = keyOf(c, y);
      if (CDIG[key] !== undefined) return [{x0: c[0], x1: c.at(-1), key, dg: CDIG[key]}];
      const out = []; let pos = 0;
      while (pos < c.length){
        let best = null;
        for (const t of CTPL){
          if (pos + t.w > c.length) continue;
          let extra = 0, ok = true;
          for (let r = 0; r <= 8 && ok; r++) for (let i = 0; i < t.w; i++){
            const ink = is(c[pos + i], y - 8 + r, r), want = t.rows[r][i] === "#";
            if (want && !ink){ ok = false; break } if (!want && ink) extra++;
          }
          if (ok && extra <= 3 && (!best || extra < best.extra || extra === best.extra && t.w > best.t.w)) best = {t, extra};
        }
        if (!best){ if (!out.length) return [{x0: c[0], x1: c.at(-1), key}]; break }
        const cols = c.slice(pos, pos + best.t.w);
        out.push({x0: cols[0], x1: cols.at(-1), key: keyOf(cols, y), dg: best.t.dg});
        pos += best.t.w;
      }
      return out;
    }
    const X0 = area ? Math.max(0, area.x0) : 0, X1 = area ? Math.min(w, area.x1) : w;
    for (let y = area ? Math.max(8, area.y0) : 8, Y1 = area ? Math.min(h, area.y1) : h; y < Y1; y++){
      // quick test first: a row with the bottom color somewhere
      let any = false; for (let i = (y * w + X0) * 4, e = (y * w + X1) * 4; i < e; i += 4) if (blue(i, 8)){ any = true; break }
      if (!any) continue;
      const cols = [];
      for (let x = X0; x < X1; x++) for (let r = 4; r <= 8; r++) if (is(x, y - 8 + r, r)){ cols.push(x); break }
      let cl = [], cur = null;
      for (const x of cols){ if (cur && x === cur.at(-1) + 1) cur.push(x); else { cur = [x]; cl.push(cur) } }
      // digits less than 6 columns apart are one number; an unknown glyph touching a number spoils it (half covered)
      let num = null, lastEnd = -99;
      for (const c of cl) for (const g of glyphsIn(c, y)){
        const key = g.key;
        // light-blue bits with no white above them are icon edges or the selected slot's frame, not digits: skip
        // them instead of letting them spoil the count next to them
        if (g.dg === undefined && !/#/.test(key.split("/").slice(0, 4).join(""))) continue;
        if (key === "#/#/#/#/#/#/#/#/#/" && !(dark(g.x0, y - 9) && dark(g.x0, y + 1))) continue;   // a window edge, not a 1 (a 1 has its outline above and below)
        const dg = g.dg, near = g.x0 - lastEnd <= 5;
        lastEnd = g.x1;
        if (num && near){ if (dg === undefined) num.bad = true; else num.n = num.n * 10 + dg; num.end = lastEnd; continue }
        if (num) out.push(num);
        num = {x: g.x0, y, n: dg ?? 0, bad: dg === undefined, end: lastEnd};
      }
      if (num) out.push(num);
    }
    // slot: the left edge of the icon slot. Counts start 1 px in, but a leading 1 or 7 only has ink further right (3 / 2 px),
    // so the slot (not the first ink) is what stays put when 10 becomes 9 or 100 becomes 99
    return out.filter(m => !m.bad).map(({x, y, n, end}) => ({x, y, n, end, slot: x - ({1: 3, 7: 2}[String(n)[0]] ?? 1)}));
  }
  // which icon sits above a count: icons are drawn bottom-aligned 3 px under the digits and centered on the 32 px slot;
  // the best color match (digits left out) when it's clearly the best. icons: [{id, w, h, d}] (loadIcons)
  function iconAt(img, num, icons, dbg){
    let best = null, second = Infinity;
    for (const ic of icons){
      const x0 = (num.slot ?? num.x - 1) + 16 - (ic.w >> 1), y0 = num.y + 3 - ic.h;   // centered on the 32 px slot
      let sc = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        let s = 0, k = 0;
        for (let y = 0; y < ic.h; y += 1) for (let x = 0; x < ic.w; x += 1){
          const j = (y * ic.w + x) * 4; if (ic.d[j + 3] < 250) continue;
          const X = x0 + dx + x, Y = y0 + dy + y; if (Y > num.y - 10 && X <= (num.end ?? num.x + 14) + 2 || X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;   // the count itself
          const i = (Y * img.w + X) * 4;
          s += Math.abs(img.d[i] - ic.d[j]) + Math.abs(img.d[i + 1] - ic.d[j + 1]) + Math.abs(img.d[i + 2] - ic.d[j + 2]); k++;
        }
        if (k > 40) sc = Math.min(sc, s / k);
      }
      if (!best || sc < best.sc){ if (best) second = Math.min(second, best.sc); best = {id: ic.id, sc} } else second = Math.min(second, sc);
    }
    if (dbg) dbg.push([num.n, best?.id, Math.round(best?.sc), Math.round(second)]);
    return best && best.sc < 80 && second > best.sc * 1.5 ? best.id : null;
  }
  /* The meso total in the inventory window ("4,685"): black digits 8 rows tall on the white field, commas below the line.
     All ten digits learned from Danny's screenshots (4,685; 3,590; 3,571; 3,560; 3,510; 3,210; 2,700). An unknown
     glyph means it isn't a meso total, so nothing is read. Keys: rows of the glyph's columns, as in CDIG. */
  let lastMeso = null;   // where readMesoTotal last found the total (createReaders only looks there between full scans)
  const MDIG = {"...#./..##./.#.#./#..#./#####/...#./...#./...#./": 4, "..##./.#.../#..../####./#...#/#...#/#...#/.###./": 6,
    ".###./#...#/#...#/.###./#...#/#...#/#...#/.###./": 8, "#####/#..../#..../####./....#/....#/#...#/.###./": 5,
    ".###./#...#/#...#/#...#/#...#/#...#/#...#/.###./": 0, ".#./##./.#./.#./.#./.#./.#./###/": 1,
    ".###./#...#/....#/...#./..#../.#.../#..../#####/": 2, ".###./#...#/....#/..##./....#/....#/#...#/.###./": 3,
    "#####/....#/...#./...#./..#../..#../.#.../.#.../": 7, ".###./#...#/#...#/#...#/.####/....#/...#./.##../": 9};
  function readMesoTotal(img, area = null){   // area: {x0, y0, x1, y1} to look in (where it was last seen)
    const {w, h, d} = img, ink = (x, y) => { const i = (y * w + x) * 4; return d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0 };
    const white = (x, y) => { const i = (y * w + x) * 4; return d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 };
    const found = [];
    const X0 = area ? Math.max(0, area.x0) : 0, X1 = area ? Math.min(w, area.x1) : w;
    for (let y = area ? Math.max(1, area.y0) : 1, Y1 = area ? Math.min(h - 10, area.y1) : h - 10; y < Y1; y++){
      // a text line: black pixels with white above (the field), rows y..y+7
      let row = false; for (let x = X0; x < X1 && !row; x++) row = ink(x, y) && white(x, y - 1);
      if (!row) continue;
      let s = "", x = X0, last = -1, ok = true, x0 = -1;
      while (x < X1){
        let c = false; for (let yy = y; yy < y + 8 && !c; yy++) c = ink(x, yy);
        if (!c){ x++; continue }
        const gs = x; while (x < X1){ let c2 = false; for (let yy = y; yy < y + 8 && !c2; yy++) c2 = ink(x, yy); if (!c2) break; x++ }
        if (last >= 0 && gs - last > 6){ if (s) found.push({y, x0, s, ok}); s = ""; ok = true }
        let key = ""; for (let yy = y; yy < y + 8; yy++){ for (let xx = gs; xx < x; xx++) key += ink(xx, yy) ? "#" : "."; key += "/" }
        const dg = MDIG[key];
        if (/^(\.+\/){6}/.test(key)) s += ",";   // ink only at the bottom: a comma (it hangs below the line)
        else if (dg === undefined){ ok = false; s += "?" } else { if (!s) x0 = gs; s += dg }
        last = x;
      }
      if (s) found.push({y, x0, s, ok});
    }
    // a meso total: known digits only, thousands commas in the right places
    const good = found.filter(f => f.ok && /^\d{1,3}(,\d{3})*$/.test(f.s) && f.s.length >= 1);
    if (good.length === 1) lastMeso = {x0: good[0].x0, y: good[0].y};
    return good.length === 1 ? +good[0].s.replace(/,/g, "") : null;
  }

  // G.icons (base64 PNGs of potions, food, arrows, stars) -> pixels; items with the same picture share one entry
  // map: {id: base64 PNG} (default G.icons). Works in the window and in the reader worker (no document there).
  // Items drawn with the same picture are one entry: ids lists them all (id = the first)
  async function loadIcons(G, map = G.icons){
    const seen = new Map(), out = [];
    for (const [id, b64] of Object.entries(map || {})){
      if (seen.has(b64)){ seen.get(b64).ids.push(id); continue }
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], {type: "image/png"}));
      const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement("canvas"), {width: bmp.width, height: bmp.height});
      const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      const ic = {id, ids: [id], w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data};
      let n = 0; for (let j = 3; j < ic.d.length; j += 4) if (ic.d[j] >= 250) n++;
      ic.n = n; seen.set(b64, ic); out.push(ic);
    }
    return out;
  }

  /* The item inventory window (Danny's Use tab, 2026-10-18, game pixels): a red line 3 rows tall (ac0000 / c40000 /
     cb0000) about 203 px wide under the tabs, the open tab pink (ea6581) above it. Tabs start at these distances from the
     line's left end (the pink starts a pixel in). Slots: 5 columns 36 px apart from 5 px right of the line's left end,
     6 rows 34 px apart, a slot's count on y = line + 37 + 34 * row (same as readCounts' slot/y). Empty slots: (225,223,213). */
  const INV_TABS = [["equip", 4], ["use", 38], ["setup", 67], ["etc", 101], ["cash", 134], ["deco", 167]];
  function findInventory(img, box = null){
    const {w, h, d} = img, px = (x, y) => (y * w + x) * 4;
    const red = (x, y) => { const i = px(x, y); return d[i] > 125 && d[i + 1] < 45 && d[i + 2] < 45 };
    // the open tab: pink; pale pink (fddce2) when it's Etc in Danny's KPQ frames, and on a tab the mouse is over, so a
    // pink tab wins over a pale one (Danny's frames, 2026-10-18)
    const pink = (x, y) => { const i = px(x, y); return Math.abs(d[i] - 234) < 26 && Math.abs(d[i + 1] - 101) < 26 && Math.abs(d[i + 2] - 129) < 26 };
    const pale = (x, y) => { const i = px(x, y); return d[i] >= 235 && d[i + 1] >= 195 && d[i + 1] <= 228 && d[i + 2] >= 200 && d[i + 2] <= 236 && d[i] - d[i + 1] >= 18 };
    // the open tab's pink also pulses between the two (f1a4b2 halfway, Danny's Etc tab "not found", 2026-10-18): any rose in between
    const rose = (x, y) => { const i = px(x, y), r = d[i], g = d[i + 1], b = d[i + 2]; return r >= 220 && r - g >= 50 && b - g >= 6 && b - g <= 45 && r - b >= 30 };
    const X0 = box ? Math.max(0, box.x0) : 0, X1 = box ? Math.min(w, box.x1) : w;
    for (let y = Math.max(22, box ? box.y0 : 0), Y1 = Math.min(h - 3, box ? box.y1 : h); y < Y1; y++){
      for (let x = X0; x < X1; x += 8){
        if (!red(x, y)) continue;
        // the line's ends, over breaks of up to 24 px (the mouse pointer on it)
        const more = (p, dir) => { for (let k = 1; k <= 24; k++){ const q = p + dir * k; if (q < 0 || q >= w) return p; if (red(q, y)) return q } return p };
        let a = x, b = x; for (let n; (n = more(a, -1)) !== a;) a = n; for (let n; (n = more(b, 1)) !== b;) b = n;
        x = b;
        // the top row is darker and broken under a pale open tab (Danny's Etc tab): the line's full width may first show a row lower.
        // The break sits under the open tab, so look for the row above away from it too (Equip open: the left end, 2026-10-19)
        const top = [5, 100, 195].some(o => red(a + o, y - 1)) ? y - 1 : y;
        if (b - a < 190 || b - a > 215 || !red(a + 5, top + 1) || !red(a + 5, top + 2) || red(a + 5, top - 1) || a + 200 >= w) continue;
        // the tab with the most of that colour (3 in a row): a stray pinkish pixel where the open tab's edge blurs into the
        // red line (video) no longer names the tab next to it (Equip read as Use, Danny's report 2026-10-19)
        for (const is of [pink, rose, pale]){
          const n = INV_TABS.map(() => 0);
          for (let yy = top - 20; yy < top - 1; yy++) for (let xx = a; xx < a + 200; xx++) if (is(xx, yy) && is(xx + 1, yy) && is(xx + 2, yy)){
            const off = xx - a; let k = 0; while (k + 1 < INV_TABS.length && off >= INV_TABS[k + 1][1] - 2) k++; n[k]++;
          }
          const k = n.indexOf(Math.max(...n));
          if (n[k] >= 3) return {x: a, y: top, tab: INV_TABS[k][0]};
        }
        // the window, but no tab colour (the mouse pointer on the open tab, Danny's frame-014): where it is still counts
        return {x: a, y: top, tab: null};
      }
    }
    return null;
  }
  // the best icon for a slot, stopping early on any candidate already clearly worse than the best (fast enough for the
  // 1,200 equips). Same rules as iconAt: centered on the slot, bottom 3 px under the count row, count digits left out
  function slotIcon(img, sx, cy, end, cands){
    let best = null, second = Infinity;
    for (const ic of cands){
      const x0 = sx + 16 - (ic.w >> 1), y0 = cy + 3 - ic.h;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const cut = Math.min(80, best ? best.sc : 80) * 1.5 * ic.n;
        let s = 0, k = 0;
        for (let y = 0; y < ic.h && s <= cut; y++) for (let x = 0; x < ic.w; x++){
          const j = (y * ic.w + x) * 4; if (ic.d[j + 3] < 250) continue;
          const X = x0 + dx + x, Y = y0 + dy + y; if (Y > cy - 10 && X <= end + 2 || X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
          const i = (Y * img.w + X) * 4;
          s += Math.abs(img.d[i] - ic.d[j]) + Math.abs(img.d[i + 1] - ic.d[j + 1]) + Math.abs(img.d[i + 2] - ic.d[j + 2]); k++;
        }
        if (s > cut || k <= 40) continue;
        const sc = s / k;
        if (!best || sc < best.sc){ if (best && best.ic !== ic) second = Math.min(second, best.sc); best = {ic, sc} }
        else if (best.ic !== ic) second = Math.min(second, sc);
      }
    }
    return best && best.sc < 80 && second > best.sc * 1.5 ? best.ic : null;
  }
  // every slot on the open tab: [{i (slot 0-29), ids (one picture can be several items), n (null: count not read)}],
  // unknown = filled slots whose item didn't match. Equips show no count (1 each).
  function readInventory(img, inv, cands, cache = null){
    const {w, d} = img, nums = readCounts(img, {x0: inv.x, x1: inv.x + 190, y0: inv.y + 28, y1: inv.y + 37 + 34 * 5 + 2});
    const slots = [], missed = []; let unknown = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++){
      const sx = inv.x + 5 + 36 * c, cy = inv.y + 37 + 34 * r;
      if (cy + 4 >= img.h || sx + 32 >= w) continue;
      let off = 0, sig = 0;
      for (let y = cy - 28; y <= cy; y++) for (let x = sx + 1; x < sx + 31; x++){
        const i = (y * w + x) * 4; if (Math.abs(d[i] - 225) + Math.abs(d[i + 1] - 223) + Math.abs(d[i + 2] - 213) > 40){ off++; sig = (sig * 31 + (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) | 0 }
      }
      if (off < 30) continue;   // empty
      // the picture above the count, coarsely (6 patches' mean colours): "same item still there" when a read misses
      const pic = [];
      for (let py = 0; py < 2; py++) for (let px = 0; px < 3; px++){ let r0 = 0, g0 = 0, b0 = 0, k = 0;
        for (let y = cy - 28 + py * 9; y < cy - 19 + py * 9; y++) for (let x = sx + 1 + px * 10; x < sx + 11 + px * 10; x++){ const i = (y * w + x) * 4; r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; k++ }
        pic.push(r0 / k, g0 / k, b0 / k) }
      const num = nums.find(n => Math.abs(n.slot - sx) <= 2 && Math.abs(n.y - cy) <= 1);
      // the picture is matched again only when the slot changed (beyond video noise: colors in 32-shade steps)
      const key = inv.tab + "," + sx + "," + cy + "," + (num ? num.end : "") + "," + sig;
      let ic = cache?.get(key);
      if (ic === undefined){ ic = slotIcon(img, sx, cy, num ? num.end : sx - 12, cands); if (cache){ if (cache.size > 400) cache.clear(); cache.set(key, ic) } }
      if (!ic){ unknown++; missed.push({i: r * 5 + c, pic}); continue }
      slots.push({i: r * 5 + c, ids: ic.ids, n: num ? num.n : inv.tab === "equip" ? 1 : null, pic});
    }
    return {tab: inv.tab, slots, unknown, missed};
  }

  /* Dirty-region check (T-13, Danny 10-29: "every little improvement"). A reader that looks at one fixed rectangle gives the
     same answer for the same pixels, so the answer is kept under a hash of that rectangle and reused while it is unchanged
     (hash 0.05 ms vs the read's 0.5-1.5 ms). Redundancy so a stale answer can't stick: every 8th identical frame is read
     anyway, a changed size drops it, and the bar read is dropped after any change or doubtful jump (see barVerdict). */
  function regionHash(img, x0, y0, x1, y1){
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(img.w, x1 | 0); y1 = Math.min(img.h, y1 | 0);
    const d = img.d, aligned = d.byteOffset % 4 === 0 && d.byteLength % 4 === 0, p = aligned ? new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2) : null;
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let y = y0; y < y1; y++) for (let x = x0, i = y * img.w + x0; x < x1; x++, i++){
      const v = p ? p[i] : d[i * 4] | d[i * 4 + 1] << 8 | d[i * 4 + 2] << 16;
      a = Math.imul(a ^ v, 16777619); b = Math.imul(b + v, 0x85ebca6b) ^ (b >>> 13);
    }
    return (a >>> 0) + ":" + (b >>> 0);
  }
  /* A new EXP bar reading is taken when it is read the same twice running (steady), or at once when its EXP and % agree for
     the level (agrees). A jump (up more than 5 % of a level in half a second, or down at all without a level-up) is a red
     herring until proven otherwise: a misread digit can agree with itself, so a jump needs the same reading twice. */
  const JUMP_PCT = 5;
  function barJump(bar, last, level){
    if (!bar || !last) return false;
    if (level && last.level && level !== last.level) return false;   // a level-up resets the %: not a jump
    const dp = bar.pct - last.pct;
    return dp > JUMP_PCT || dp < -0.005 || bar.exp < last.exp;
  }
  function barVerdict({bar, last, level, steady, agrees, fits}){
    if (!bar) return false;
    if (!last) return !!fits;
    const changed = bar.exp !== last.exp || bar.pct !== last.pct;
    if (!changed) return false;
    return barJump(bar, last, level) ? !!(steady && fits) : !!(steady && fits || agrees);
  }
  /* Final Attack proc buff: the buff icon in the top-right row (Danny's frame, 2026-10-29). Opaque 32x32 icon at native scale;
     the centre holds the countdown digits, so only the rows above (0-4) and below (25-31) the digit plate are compared,
     columns 3-28 (the corners show the scene). Gray values of those 12 rows x 26 cols, base64. Not checked at 1x/1.5x UI. */
  const PROC_TPL = (() => { const s = typeof atob === "function" ? atob("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6uru8vb29vr6/v8DAv8DAv8C/wL/Av7+/v+Pk5OTl5ubn6Ofo6ejq6erp6unq6Oro6enp4+Tj4+Tl5ubn6Ojo6enp6ejp5+jo5+jo6OjjuLm5ubq7vLy9vr6+vr6+vr2+vb68vr2+vt3e3t7e3t/e3t/e37UM374NDQ0ODd+/Dbbg3d7d3t7f3t/e39/ftA3fvg20tba0DeC+Drbd3d7e3t7e397e3t61DN6+DLXf39+2Dd+/Dd3e3t3f3d/e3t7f3t61DAy039/f39+1Dg213d3d3t7d3d7d3t7e3960td/f3t/e4N+1td+YmJeXmJiYl5iXmJiYmJmZmJmZmZmZmJqZmgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") : Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6uru8vb29vr6/v8DAv8DAv8C/wL/Av7+/v+Pk5OTl5ubn6Ofo6ejq6erp6unq6Oro6enp4+Tj4+Tl5ubn6Ojo6enp6ejp5+jo5+jo6OjjuLm5ubq7vLy9vr6+vr6+vr2+vb68vr2+vt3e3t7e3t/e3t/e37UM374NDQ0ODd+/Dbbg3d7d3t7f3t/e39/ftA3fvg20tba0DeC+Drbd3d7e3t7e397e3t61DN6+DLXf39+2Dd+/Dd3e3t3f3d/e3t7f3t61DAy039/f39+1Dg213d3d3t7d3d7d3t7e3960td/f3t/e4N+1td+YmJeXmJiYl5iXmJiYmJmZmJmZmZmZmJqZmgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "base64").toString("binary"); return Uint8Array.from(s, c => c.charCodeAt(0)) })();
  const PROC_DARK = PROC_TPL.reduce((a, v) => a + (v < 80 ? 1 : 0), 0);
  const PROC_ROWS = [0, 1, 2, 3, 4, 25, 26, 27, 28, 29, 30, 31];
  /* the countdown digits (yellow, proportional 9-row font) learned from Danny's 60-second clip, 2026-10-29: every second of
     the buff 59..4 read off the video at the UI's native pixel grid. Per digit: the bitmap variants (rows joined with "/"). */
  const PROC_GLYPHS = {"0":["011110/100011/100001/100001/100001/100001/100001/110011/011110"],"1":["011/111/001/001/001/001/001/001/001"],"2":["11111/00001/00001/00001/00010/00110/01100/11000/11111","11111/00001/00001/00001/00011/00110/01100/11000/11111"],"3":["11110/00001/00001/00011/01110/00001/00001/00011/11110","11110/00011/00001/00011/01110/00011/00001/00011/11110","11110/00011/00001/00011/01110/00001/00001/00011/11110","11110/00001/00001/00011/01110/00011/00001/00011/11110"],"4":["000110/000110/001110/001010/010010/110110/111111/000010/000010","000110/000110/001110/001010/010010/110010/111111/000010/000010","1000110/0000110/0001110/0001010/0010010/0110010/0111111/0000010/0000010"],"5":["11111/10000/10000/10000/11110/00011/00001/00011/11110","11111/10000/10000/10000/11110/00001/00001/00011/11110"],"6":["011111/110000/100000/100000/111110/100001/100001/110011/011110","011111/110000/100000/100000/111110/100011/100001/110011/011110"],"7":["111111/000011/000010/000110/000100/001100/001000/001000/010000","111111/000011/000010/000110/000100/000100/001000/001000/010000"],"8":["011110/100001/100001/110010/011110/110011/100001/110011/011110"],"9":["011110/100011/100001/100011/011111/000001/000001/000011/111110","011110/100011/100001/100011/011111/000001/000001/000011/111100","011110/100011/100001/100001/011111/000001/000001/000011/111110","011110/100011/100001/100001/011111/000001/000001/000011/111100"]};
  function procNum(img, ix, iy){   // the number on the icon at (ix, iy), or null when a digit isn't one of the ten
    const {w, d} = img, y0 = iy + 12, rows = 9, x0 = ix + 7, wd = 20, col = [];
    const yel = (x, y) => { const i = (y * w + x) * 4; return d[i] > 170 && d[i + 1] > 150 && d[i + 2] < 120 };
    for (let c = 0; c < wd; c++){ let any = false; for (let r = 0; r < rows; r++) if (yel(x0 + c, y0 + r)){ any = true; break } col.push(any) }
    const blobs = []; for (let c = 0; c < wd;){ if (!col[c]){ c++; continue } let e = c; while (e < wd && col[e]) e++; blobs.push([c, e]); c = e }
    if (blobs.length < 1 || blobs.length > 2) return null;
    let num = 0;
    for (const [c0, c1] of blobs){
      if (c1 - c0 > 7) return null;
      const bm = []; for (let r = 0; r < rows; r++){ let s = ""; for (let c = c0; c < c0 + 7; c++) s += c < c1 && yel(x0 + c, y0 + r) ? "1" : "0"; bm.push(s) }
      let best = 99, who = null;
      for (const ch in PROC_GLYPHS) for (const v of PROC_GLYPHS[ch]){
        const g = v.split("/"); let bad = 0;
        for (let r = 0; r < rows; r++){ const row = g[r].padEnd(7, "0"); for (let c = 0; c < 7; c++) if (row[c] !== bm[r][c]) bad++ }
        if (bad < best){ best = bad; who = ch }
      }
      if (best > 5) return null;
      num = num * 10 + +who;
    }
    return num;
  }
  function readProc(img){   // -> {x, y, diff, yellow} of the proc icon in the top rows, or null
    const {w, d} = img, gray = (x, y) => { const i = (y * w + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3 };
    let best = null;
    for (let y0 = 0; y0 <= 8; y0++) for (let x0 = Math.floor(w / 2); x0 + 32 <= w; x0++){
      // cheap look first: the black icon border along the top and bottom edge
      if (gray(x0 + 8, y0) > 70 || gray(x0 + 20, y0) > 70 || gray(x0 + 8, y0 + 31) > 70 || gray(x0 + 20, y0 + 31) > 70) continue;
      // the dark outline pixels only: the icon's pale body greys out from the top as the buff runs down (a cooldown sweep)
      let bad = 0;
      for (let r = 0; r < PROC_ROWS.length; r++) for (let c = 0; c < 26; c++) if ((gray(x0 + 3 + c, y0 + PROC_ROWS[r]) < 80) !== (PROC_TPL[r * 26 + c] < 80)) bad++
      const diff = bad / PROC_DARK;   // mismatched outline pixels, as a share of the template's own
      if (diff <= 0.25 && (!best || diff < best.diff)) best = {x: x0, y: y0, diff: Math.round(diff * 1000) / 1000};
    }
    if (best){   // yellow countdown digits on the black plate: no digits = the faded icon, the buff is over
      let yel = 0;
      for (let y = best.y + 12; y <= best.y + 20; y++) for (let x = best.x + 7; x < best.x + 27; x++){ const i = (y * w + x) * 4; if (d[i] > 170 && d[i + 1] > 150 && d[i + 2] < 120) yel++ }
      best.yellow = yel; best.n = yel >= 8 ? procNum(img, best.x, best.y) : null;
    }
    return best;
  }
  function createReaders(G, icons = null){
    ITEMS = Object.entries(G.items);
    let chatPrev = null, chatArea = null, chatKey = "";
    const memos = new Map(), memoStats = {hits: 0, reads: 0, off: false};
    function memo(name, img, x0, y0, x1, y1, fn){
      if (memoStats.off){ memoStats.reads++; return fn() }
      const h = regionHash(img, x0, y0, x1, y1), m = memos.get(name);
      if (m && m.h === h && m.w === img.w && m.ht === img.h && ++m.n % 8){ memoStats.hits++; return m.v }
      const v = fn(); memos.set(name, {h, w: img.w, ht: img.h, v, n: 0}); memoStats.reads++; return v;
    }
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
    let lastLeft = null, lastLeftT = -Infinity, procSeen = 0, procGone = 0, procOn = false, procNum = null, procRead = null;
    function readFrame(raw, t, nat = null){   // nat: the native frame, when the caller already made it
      const img = nat || (raw.k ? raw : native(raw)), ev = [];
      const bar = memo("bar", img, 0, img.h - 40, img.w, img.h, () => readBar(img)) || barAny(raw, t);   // pixel-exact fast path (skipped while the bar strip is unchanged), else any scale
      // a new bar value counts when its EXP and % agree for the level (EXP / level total = %), or when it's read the same
      // twice in a row (after a level-up); one misread digit would otherwise add fake EXP
      const key = bar && bar.exp + "/" + bar.pct, steady = key && key === barNext;
      barNext = key;
      const need = lastBar?.level && G.exp[lastBar.level], agrees = bar && need && Math.abs(bar.exp / need * 100 - bar.pct) <= 0.02;
      // level: the EXP table entry that this EXP / % works out to
      let level = null;
      if (bar && bar.pct > 0.5) for (const [L, need] of Object.entries(G.exp)) if (Math.abs(bar.exp / (bar.pct / 100) - need) / need < 0.004){ level = +L; break }
      // read twice the same is only trusted when it fits some level (or the % is too small to tell): a misread EXP number
      // can repeat ("1 [68.01%]" on Danny's KPQ run, while the % kept reading right)
      const fits = level || bar && bar.pct <= 0.5;
      const take = barVerdict({bar, last: lastBar, level, steady, agrees, fits});
      if (take){
        ev.push({t, type: "bar", exp: bar.exp, pct: bar.pct, level}); lastBar = {...bar, level: level || lastBar?.level};
      }
      if (bar){
        const v = memo("vit", img, 0, img.h - 40, img.w, img.h, () => vitals(raw, t)), k = v && v.hp + "|" + v.mp;
        if (k && k === vitNext && k !== vitKey){ vitKey = k; ev.push({t, type: "vitals", hp: v.hp, mp: v.mp}) }
        vitNext = k || null;
      }
      // anything but a calm repeat of the accepted reading is looked at again from fresh pixels next frame, never from the memo
      if (!bar || !lastBar || bar.exp !== lastBar.exp || bar.pct !== lastBar.pct) memos.delete("bar");
      // KPQ clock: sent when it changes, at most every 5 s
      const left = memo("kpq", img, Math.round(img.w / 2) - 37, 44, Math.round(img.w / 2) + 110, 76, () => readKpqTimer(img));
      if (left !== null && (lastLeft === null || left !== lastLeft && t - lastLeftT >= 5000)){ ev.push({t, type: "kpqtime", left}); lastLeft = left; lastLeftT = t }
      // Final Attack proc buff: the icon with its yellow countdown on it. "proc" when it shows up (read twice running) and
      // again when the countdown jumps up while it's running (a proc during a proc refreshes the buff); gone for 3 frames re-arms it
      {
        const pr = readProc(img), on = !!pr && pr.yellow >= 8;
        if (on){ procSeen++; procGone = 0 } else { procGone++; procSeen = 0 }
        if (on && procSeen >= 2 && !procOn){ procOn = true; procNum = pr.n; procRead = pr.n; ev.push({t, type: "proc"}) }
        else if (on && procOn && pr.n !== null){
          // a new number counts after the same value is read twice running; higher than the last accepted one = refreshed
          if (pr.n === procRead){ if (procNum !== null && pr.n > procNum) ev.push({t, type: "proc", refresh: true}); procNum = pr.n }
          procRead = pr.n;
        }
        if (procOn && procGone >= 3){ procOn = false; procNum = null; procRead = null }
      }
      const picked = fresh(readPickups(img));
      if (LEARNED.length) ev.push(...LEARNED.splice(0).map(g => ({t, type: "glyph", ...g})));
      for (const p of picked){
        if (p.event.type === "bonus") bonusAt = t;
        ev.push({t, ...p.event});
      }
      // party size only changes after the same new size is read 3 frames running (a window in the way, a bar mid-blink)
      // no party window: a party while bonus lines came in the last 3 minutes (left the party = back to solo after that)
      const partyRead = readParty(img), party = partyRead || (t - bonusAt < 180e3 ? 2 : 1);
      info = {bar: !!bar, partyWindow: partyRead, counts: info.counts, inv: info.inv, invAt: info.invAt, kpqLeft: left};   // what this frame showed (self-check, auto-pause)
      if (icons?.length && t - lastCounts >= 2000){
        lastCounts = t; ev.push(...readUse(img, t));
        // the inventory's meso total, taken when read the same twice running. Only around where it was last seen, with
        // a look over the whole frame every 10 s (or when it's gone from there: window moved or closed)
        const full = !mesoBox || t - lastFullMeso >= 10e3;
        lastMeso = null;
        const m = readMesoTotal(img, full ? null : mesoBox);
        if (full){ lastFullMeso = t; mesoBox = lastMeso && {x0: lastMeso.x0 - 8, x1: lastMeso.x0 + 90, y0: lastMeso.y - 3, y1: lastMeso.y + 4} }
        else if (m === null) mesoBox = null;
        if (m !== null && m === walletNext && m !== wallet){ wallet = m; ev.push({t, type: "wallet", n: m}) }
        walletNext = m;
      }
      if (invIcons && t - lastInv >= 2000){ lastInv = t; const e = readInv(img, t); if (e) ev.push(e) }
      if (party === partyNext) partySeen++; else { partyNext = party; partySeen = 1 }
      if (party !== lastParty && (lastParty === null || partySeen >= 3)){ ev.push({t, type: "party", size: party}); lastParty = party }
      return ev;
    }
    /* items used (potions, food, arrows): counts on the quick slots and the open Use tab, every 2 s. Per spot on screen:
       a count that went down (confirmed by the next read: the same or lower still) is that many used. One item seen in two spots (quick slot =
       total, inventory = a stack) counts its biggest drop once. Going up = bought or picked up. A moved window = new spots. */
    let lastCounts = -Infinity, lastSeenEv = -Infinity, spots = new Map(), wallet = null, walletNext = null;
    // learned boxes: the counts and the meso total are looked for only where they were last found, and over the whole
    // frame every 10 s (new windows opened) or as soon as nothing is found there
    let countBox = null, lastFullCounts = -Infinity, mesoBox = null, lastFullMeso = -Infinity;
    const gone = new Map(), pend = new Map();   // item -> its total when it left the screen (pend: back, checked next read)
    const iconCache = new Map();   // spot -> [color sample, id]: icon matching only when the picture there changed
    // the player's marked area (fractions of the frame), turned into native pixels with a little room around it
    let area = null;
    const areaPx = img => area && {x0: Math.floor(area.x * img.w) - 4, y0: Math.floor(area.y * img.h) - 4, x1: Math.ceil((area.x + area.w) * img.w) + 4, y1: Math.ceil((area.y + area.h) * img.h) + 4};
    function readUse(img, t){
      const mine = areaPx(img), full = !mine && (!countBox || t - lastFullCounts >= 10e3);
      const nums = readCounts(img, mine || (full ? null : countBox)), drops = {}, now = new Map();
      if (full){
        lastFullCounts = t;
        countBox = nums.length ? {x0: Math.min(...nums.map(n => n.slot)) - 6, x1: Math.max(...nums.map(n => n.end)) + 6,
          y0: Math.min(...nums.map(n => n.y)) - 4, y1: Math.max(...nums.map(n => n.y)) + 4} : null;
      } else if (!mine && !nums.length) countBox = null;
      for (const num of nums){
        // the icon is matched again only when the 3 sample pixels above the count changed: by more than video noise (the
        // tracker's frames jitter a few shades frame to frame, which used to re-match every icon every frame)
        const key = num.slot + "," + num.y, sample = [-20, -14, -8].flatMap(dy => { const i = ((num.y + dy) * img.w + num.slot + 16) * 4; return [img.d[i], img.d[i + 1], img.d[i + 2]] });
        const hit = iconCache.get(key), same = hit && hit[0].every((v, j) => Math.abs(v - sample[j]) <= 16);
        let id = same ? hit[1] : undefined;
        if (id === undefined){ id = iconAt(img, num, icons); if (iconCache.size > 500) iconCache.clear(); iconCache.set(key, [sample, id]) }
        if (!id) continue;
        const was = spots.get(key);
        if (!was || was.id !== id){ now.set(key, {id, n: num.n, next: null}); continue }
        // a new value is taken once the next read agrees: the same again, or (arrows while shooting) lower still
        let {n, next} = was; const v = num.n;
        if (v === n) next = null;
        else if (next !== null && (v === next || next < n && v < next)){ if (next < n && n - next <= 20) drops[id] = Math.max(drops[id] || 0, n - next); n = next; next = v === n ? null : v }   // over 20 at once: sold, dropped or stored, not used
        else next = v;
        now.set(key, {id, n, next});
      }
      // an item back on screen after being hidden (arrows only show while the Use tab is open): what its total (all its
      // stacks) went down by meanwhile was used. Totals, not single spots: two arrow stacks would otherwise read as a drop
      const total = m => { const o = {}; for (const v of m.values()) o[v.id] = (o[v.id] || 0) + v.n; return o };
      const stacks = m => { const o = {}; for (const v of m.values()) (o[v.id] ||= []).push(v.n); return o };
      const before = total(spots), after = total(now), bs = stacks(spots), as = stacks(now);
      for (const [id, n] of Object.entries(before)) if (!(id in after)) gone.set(id, {n, s: bs[id]});
      // counted on the read after it's back (the bigger of the two totals), so a stack missed on one read isn't a drop
      for (const [id, g] of [...pend]){
        if (!(id in after)){ pend.delete(id); gone.set(id, g); continue }   // gone again: keep the older total
        const n = Math.max(after[id], before[id] || 0), cap = String(id).startsWith("206") ? 2000 : 20, d = g.n - n;
        // one stack fewer and the drop is exactly that stack: a count that didn't read (Danny's "215" arrows stack under the
        // slot's frame, 2026-10-18), not a stack used up while hidden
        const missed = as[id].length < g.s.length && g.s.includes(d);
        if (d > 0 && d <= cap && !missed) drops[id] = Math.max(drops[id] || 0, d);
        pend.delete(id);
      }
      for (const id of Object.keys(after)) if (!(id in before) && gone.has(id)){ pend.set(id, gone.get(id)); gone.delete(id) }
      spots = now; info.counts = nums.length; info.useSpots = now.size;
      const ev = Object.entries(drops).map(([id, n]) => ({t, type: "use", id, n}));
      // quick slots (counts outside the inventory window) show the item's total: sent when one changes
      const inInv = k => { if (!invPx) return false; const [x, y] = k.split(",").map(Number); return x >= invPx.x - 4 && x <= invPx.x + 200 && y >= invPx.y && y <= invPx.y + 240 };
      const have = {}; for (const [k, v] of now) if (!inInv(k)) have[v.id] = Math.max(have[v.id] || 0, v.n);
      const hk = JSON.stringify(have); if (hk !== lastHave && Object.keys(have).length){ lastHave = hk; ev.push({t, type: "have", items: have}) }
      // once a minute while counts are visible: the session knows "nothing used" is a real 0, not "couldn't see"
      if (now.size && t - lastSeenEv >= 60e3){ lastSeenEv = t; ev.push({t, type: "useseen"}) }
      return ev;
    }
    // any-scale EXP bar: first in the rows it was found in last time; the whole bottom of the screen at most once a second
    let barBand = null, lastFullBar = -Infinity;
    function barAny(raw, t){
      // the rows are kept as a share of the frame's height: the tracker sends game-size and full-size frames in turn
      const band = barBand && {y0: Math.floor(barBand.y0 * raw.h), y1: Math.ceil(barBand.y1 * raw.h)};
      let b = band && readBarAny(raw, band);
      if (!b && t - lastFullBar >= 1000){ lastFullBar = t; b = readBarAny(raw) }
      if (b) barBand = {y0: (b.y - 2 * b.bh) / raw.h, y1: (b.y + 2 * b.bh) / raw.h};
      return b && {exp: b.exp, pct: b.pct};
    }
    // HP / MP boxes: looked for in the rows found last time, over the whole bottom at most every 2 s, and only while the EXP bar
    // reads (the HUD is up). A change is sent once the same HP and MP read twice running ("vitals" events), like the bar
    let vitBand = null, lastFullVit = -Infinity, vitNext = null, vitKey = null;
    function vitals(raw, t){
      const band = vitBand && {y0: Math.floor(vitBand.y0 * raw.h), y1: Math.ceil(vitBand.y1 * raw.h)};
      let v = band && readVitalsAny(raw, band);
      if (!v && t - lastFullVit >= 2000){ lastFullVit = t; v = readVitalsAny(raw) }
      if (v) vitBand = {y0: (v.y - 2 * v.bh) / raw.h, y1: (v.y + 2 * v.bh) / raw.h};
      return v;
    }
    /* the open inventory tab, every 2 s: looked for where it was last seen, over the whole frame every 6 s. A tab's items
       count once the same read comes twice running; "inv" events carry {tab, items: {id: n}, unknown} (unknown: slots
       whose item or count didn't read; one picture shared by several items is listed under the first of them) */
    let invIcons = null, byTab = null, lastInv = -Infinity, invBox = null, invNext = null, invHint = null, invLast = null;
    const invSent = {}, invCache = new Map(), slotMem = {};
    let invPx = null, lastHave = "";
    function readInv(img, t){
      // where it was last seen (this session, or the last one: settings.invLast) first, then the box the player drew around
      // it, then the whole frame (a few ms: Danny's 34 frames of moving it around, 2026-10-18)
      const near = p => p && findInventory(img, {x0: Math.round(p.x * img.w) - 12, x1: Math.round(p.x * img.w) + 230, y0: Math.round(p.y * img.h) - 3, y1: Math.round(p.y * img.h) + 4});
      let inv = invBox && findInventory(img, invBox) || near(invLast);
      if (!inv && invHint) inv = findInventory(img, {x0: Math.floor(invHint.x * img.w) - 4, x1: Math.ceil((invHint.x + invHint.w) * img.w) + 4,
        y0: Math.floor(invHint.y * img.h) - 4, y1: Math.ceil((invHint.y + invHint.h) * img.h) + 4});
      if (!inv) inv = findInventory(img);
      if (inv){ invBox = {x0: inv.x - 12, x1: inv.x + 230, y0: inv.y - 3, y1: inv.y + 4}; invLast = {x: inv.x / img.w, y: inv.y / img.h}; info.invAt = invLast; invPx = {x: inv.x, y: inv.y} }
      info.inv = inv ? inv.tab : null; if (!inv) invPx = null;
      if (!inv?.tab || !byTab[inv.tab]) return null;
      const r = readInventory(img, inv, byTab[inv.tab], invCache), items = {}, alike = {}, stacks = {}, partial = {};
      /* a slot whose count (or picture) didn't read this time keeps what that slot read last time, when it was the same
         item: a stack missed on one read used to drop out of the total, so arrows jumped 2,183 -> 2,775 -> 2,767 (one
         800 stack in and out, Danny's KPQ runs, 2026-10-18). Never read at all: that item's total is marked partial */
      const mem = slotMem[inv.tab] ||= new Map(), add = (ids, n) => { items[ids[0]] = (items[ids[0]] || 0) + n; stacks[ids[0]] = (stacks[ids[0]] || 0) + 1; if (ids.length > 1) alike[ids[0]] = ids.length };
      for (const sl of r.slots){
        if (sl.n !== null){ add(sl.ids, sl.n); mem.set(sl.i, {ids: sl.ids, n: sl.n, pic: sl.pic}); continue }
        const m = mem.get(sl.i);
        if (m && m.ids[0] === sl.ids[0]) add(sl.ids, m.n); else { r.unknown++; partial[sl.ids[0]] = 1 }
      }
      // a picture that didn't match: only when the slot looks exactly as it did (not scrolled, not another item)
      for (const {i, pic} of r.missed){ const m = mem.get(i); if (m && m.pic.every((v, j) => Math.abs(v - pic[j]) <= 20)){ add(m.ids, m.n); r.unknown-- } }
      for (const i of [...mem.keys()]) if (!r.slots.some(sl => sl.i === i) && !r.missed.some(x => x.i === i)) mem.delete(i);   // emptied
      const key = inv.tab + JSON.stringify(items) + r.unknown, steady = key === invNext;
      invNext = key;
      if (!steady || invSent[inv.tab] === key) return null;
      invSent[inv.tab] = key;
      return {t, type: "inv", tab: inv.tab, items, alike, stacks, partial, unknown: r.unknown, slots: r.slots.length + r.missed.length};
    }
    let info = {bar: false, partyWindow: null, counts: 0};
    return {readFrame, get info(){ return info }, memoStats, setArea(a){ area = a && a.w > 0 && a.h > 0 ? a : null }, areaPx,
      mapRect: null,   // the last good minimap-title rect (see work(): the fallback re-cuts it when the band hunt fails)
      // all item pictures (loadIcons on G.iicons), sorted by tab: matching only looks at the open tab's kind of items
      // a tab chip was clicked: look everywhere now and send the next steady read even when it didn't change
      invNow(){ for (const k in invSent) delete invSent[k]; invNext = null; lastInv = -Infinity },
      setInvHint(a){ invHint = a && a.w > 0 && a.h > 0 ? a : null },
      // Chat windows (core/chatlines.js): the new chat messages since the last scan, each as an OCR picture. Nothing is kept but
      // last frame's line fingerprints; a scan that finds no chat box hands back nothing and forgets them.
      chatOff(){ chatPrev = null },
      chatScan(img, a){   // a: where the chat box is ({x, y, w, h} fractions of the picture) or null for the default spot
        const C = root.GrindChat; if (!C) return null;
        const key = a && a.w > 0 && a.h > 0 ? [a.x, a.y, a.w, a.h].join() : "";
        if (key !== chatKey){ chatKey = key; chatArea = key ? a : null; chatPrev = null }
        const sc = C.scan(img, chatArea), {now, out} = C.newGroups(chatPrev, sc.groups);
        const first = chatPrev === null; chatPrev = sc.groups.length ? now : null;
        if (first) return {n: now.size, items: []};   // the first look only learns what is on screen
        return {n: now.size, items: out.slice(-12).map(g => ({cls: g.cls, crop: C.cropFor(img, g, sc)}))};
      },
      setInvLast(p){ invLast = p && p.x >= 0 && p.y >= 0 ? p : null },   // where the last session saw it (settings.invLast)
      setInvIcons(list){
        const tabOf = {Equipment: "equip", Consumable: "use", Scroll: "use", Etc: "etc"};
        invIcons = list; byTab = {};
        for (const ic of list){ const tb = tabOf[G.items[ic.id]?.c]; if (tb) (byTab[tb] = byTab[tb] || []).push(ic) }
      }};
  }
  /* one frame for the tracker window (run in the reader worker, or in the window when the worker can't start).
     m: {frame: {w, h, d, k?}, t, want: {map, job, chat}}. A frame without k is full size: its scale is found and sent
     back, so the window can grab the next frames at the game's own size (k set) with no un-doubling needed.
     Returns the events, what the frame showed (info), the OCR crops asked for, and whether the minimap is on screen
     (only looked for when the EXP bar isn't: auto-pause). */
  function work(rd, {frame, t, want = {}}){
    const img = frame.k ? frame : native(frame), ev = rd.readFrame(frame, t, img), info = {...rd.info}, crops = {};
    if (want.map){
      crops.map = mapTextCrop(img);
      if (crops.map) rd.mapRect = crops.map.rect;   // where the title was: re-cut from here when a later band hunt fails
      else if (rd.mapRect){ crops.mapFb = mapCropAt(img, rd.mapRect); crops.mapFb.fb = true }
    }
    if (want.job){ crops.job = jobTextCrop(img); crops.name = nameTextCrop(img) }
    if (want.chat) crops.chat = chatCrop(img);
    const chat = want.chatScan ? rd.chatScan(img, want.chatArea) : (rd.chatOff(), null);
    return {ev, info, crops, chat, memo: {hits: rd.memoStats.hits, reads: rd.memoStats.reads, line: {tries: LINE_STATS.tries, wins: LINE_STATS.wins}}, minimap: info.bar ? null : !!(crops.map || mapTextCrop(img)), scale: frame.k ? null : {k: img.k, ox: img.ox, oy: img.oy, w: frame.w, h: frame.h}};
  }
  const api = {readProc, readVitalsAny, regionHash, barJump, barVerdict, itemByName, readTextLines, msgGlyphs: () => MSG, nameTextCrop, nameFromText, work, addGlyphs, readKpqTimer, createReaders, findInventory, readInventory, chatCrop, deathFromText, boxFromText, readCounts, readMesoTotal, iconAt, loadIcons, mapTextCrop, mapFromText, jobTextCrop, jobFromText, similar, native, readBar, readBarAny, readLines, readPickups, readParty, lineStats: () => LINE_STATS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindReaders = api;
})(typeof window !== "undefined" ? window : globalThis);
