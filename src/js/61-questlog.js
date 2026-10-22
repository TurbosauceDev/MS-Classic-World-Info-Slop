// Quest log (Danny 10-21, Training › Quest log): read the in-game QUEST window from a recording (scroll slowly through
// the Completed tab, then In Progress) or screenshots, list what's done / on / open, and plan the picked quests.
// Reading: category bars by colour (tan groups, blue-grey regions), the open tab by its pink highlight, each row's text by
// width + ink shape against the quest-log names (`ln`: questline name, else the quest's own) of the bar it sits under,
// rendered in Arial (the game's UI font; Liberation Sans/Arimo have the same widths). Names cut with "..." match by prefix.
// Planning: one route for every picked quest (and the earlier quests they need): accept, hunt each monster once for all
// quests that want it (kill counts count for every accepted quest at once; drops add up), buy shop items, turn in, in the
// order with the least travel + kill time (greedy nearest task, two starting rules, the faster kept). Travel, kill spots
// and your character come from the Path Planner (60-planner.js: travel, killSpot, charAt, X). window.QLOG for tests.
const QLOG = (() => {
  const {charAt, killSpot, tripSec, routeText, npcSpot, okMob, mapName, hm, OPENMAP, JOBTOWN, QUEST_SEC} = PLANNER, X = () => PLANNER.X;
  const ALLQ = [...D.quests.map(r => ["q", r]), ...D.citq.map(r => ["cit", r])].filter(([, r]) => !["El Nath", "Orbis", "Forgotten Hollow"].includes(r.region));
  const BYID = new Map(ALLQ.map(x => [String(x[1].id), x]));
  const regionOf = r => r.region;
  const lnOf = r => r.ln || r.chain || r.name;
  // quest-log name -> quests, per category (the bar a row sits under)
  const CAT = new Map();
  for (const x of ALLQ){ const c = regionOf(x[1]); if (!CAT.has(c)) CAT.set(c, new Map()); const m = CAT.get(c), n = lnOf(x[1]); if (!m.has(n)) m.set(n, []); m.get(n).push(x) }
  const CATS = [...CAT.keys()], BYLN = new Map(ALLQ.map(x => [lnOf(x[1]), x]));

  // ---------- reading ----------
  // text drawn at the capture's own size (px), ink = more than half covered, compared in 3 height bands (top, middle,
  // bottom of the ink box) so ascenders/descenders and digits count, not just how much ink a column has
  const FONTS = 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif';
  const cv = document.createElement("canvas"), cx = cv.getContext("2d", {willReadFrequently: true});
  const REND = new Map();
  // the game draws its UI text at 12px with whole-pixel letter widths, then scales the UI (2x for "Ideal Ratio" at 1440p):
  // so each letter is placed at round(its 12px width) x scale, drawn at 12 x scale. px = the capture's text size.
  const ADV = new Map(), adv = ch => { if (!ADV.has(ch)){ cx.font = "12px " + FONTS; ADV.set(ch, Math.round(cx.measureText(ch).width)) } return ADV.get(ch) };
  function rend(t, px){
    const sc = Math.round(px / 12.1 * 8) / 8, key = t + "|" + sc; if (REND.has(key)) return REND.get(key);
    const f = (12 * sc) + "px " + FONTS, chars = [...t], w = Math.ceil(chars.reduce((a, ch) => a + adv(ch), 0) * sc) + 8, h = Math.ceil(12 * sc * 1.6);
    cv.width = w; cv.height = h; cx.font = f; cx.fillStyle = "#000";
    let x = 4; for (const ch of chars){ cx.fillText(ch, x, Math.round(12 * sc * 1.15)); x += adv(ch) * sc }
    const a = cx.getImageData(0, 0, w, h).data, r = zprof((x, y) => a[(y * w + x) * 4 + 3] > 128, 0, w - 1, 0, h - 1);
    REND.set(key, r); return r;
  }
  // ink box of get() inside x0..x1 / y0..y1 -> {w, h, x0, x1, cols: ink per column in the top, middle, bottom third}
  function zprof(get, x0, x1, y0, y1, gap = 0){
    if (gap){   // text ends at the first gap wider than `gap` (the mouse pointer sits past it)
      let first = -1, last = -1;
      for (let x = x0; x <= x1; x++){ let ink = false; for (let y = y0; y <= y1 && !ink; y++) ink = get(x, y);
        if (ink){ if (first < 0) first = x; else if (x - last > gap) break; last = x } }
      if (first < 0) return {w: 0, h: 0, cols: [[], [], []]};
      x0 = first; x1 = last;
    }
    let a = 1e9, b = -1, c = 1e9, d = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y)){ if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y }
    if (b < 0) return {w: 0, h: 0, cols: [[], [], []]};
    const W = b - a + 1, H = d - c + 1, cols = [new Array(W).fill(0), new Array(W).fill(0), new Array(W).fill(0)];
    for (let y = c; y <= d; y++){ const z = Math.min(2, Math.floor((y - c) * 3 / H)); for (let x = a; x <= b; x++) if (get(x, y)) cols[z][x - a]++ }
    return {w: W, h: H, x0: a, x1: b, cols};
  }
  // both texts squeezed to the same N columns (about one per 2px, so single letters count), 3 bands, ink share per cell
  function cmp(m, r){
    const N = Math.max(12, Math.min(240, Math.round(Math.min(m.w, r.w) / 2)));
    const res = t => { const out = new Float32Array(3 * N); for (let z = 0; z < 3; z++){ const c = t.cols[z], n = c.length; for (let i = 0; i < n; i++) out[z * N + Math.min(N - 1, Math.floor(i * N / n))] += c[i] } let mx = 0; for (const v of out) if (v > mx) mx = v; if (mx) for (let i = 0; i < out.length; i++) out[i] /= mx; return out };
    const a = res(m), b = res(r); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length;
  }
  const l1 = cmp;
  // letter-by-letter alignment (DTW in a ±band): the game's letter widths drift from Arial's, which squeezing both to N
  // columns smears over a long name ("Asking After Maya, the Tow..." read as "Nella"); used to rank the closest few
  function dtw(m, r){
    const n = m.w, k = r.w; if (!n || !k) return 9;
    const col = (t, i) => [t.cols[0][i] / t.h * 3, t.cols[1][i] / t.h * 3, t.cols[2][i] / t.h * 3];
    const A = Array.from({length: n}, (_, i) => col(m, i)), B = Array.from({length: k}, (_, j) => col(r, j));
    const band = Math.max(8, Math.round(0.06 * Math.max(n, k))), INF = 1e9;
    let prev = new Float64Array(k + 1).fill(INF), cur = new Float64Array(k + 1); prev[0] = 0;
    for (let i = 1; i <= n; i++){
      cur.fill(INF); const jc = Math.round(i * k / n), lo = Math.max(1, jc - band), hi = Math.min(k, jc + band);
      for (let j = lo; j <= hi; j++){ const a = A[i - 1], b = B[j - 1], d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        cur[j] = d + Math.min(prev[j - 1], prev[j], cur[j - 1]) }
      [prev, cur] = [cur, prev];
    }
    return prev[k] / (n + k);
  }
  const score = (m, r) => !m.w || !r.w ? 9 : 2 * Math.abs(m.w - r.w) / Math.max(1, m.w) + cmp(m, r);   // shape is the surer half: the game draws Arial a touch wider in places
  const TANCATS = ["Event", "Warrior", "Magician", "Bowman", "Thief", "Citizenship", "Crafting"];

  // colours (video-compressed, so ranges): bars, pink open tab, text
  const isTan = (r, g, b) => r > 150 && r < 200 && g > 125 && g < 172 && b > 85 && b < 135 && r - b > 40;
  const isBlue = (r, g, b) => r > 138 && r < 180 && g > 156 && g < 186 && b > 182 && b < 216 && b - r > 25;
  const isPink = (r, g, b) => r > 200 && g < 150 && b > 90 && b < 190 && r - g > 70;
  const lum = (r, g, b) => (r * 3 + g * 6 + b) / 10;
  const dark = (r, g, b) => lum(r, g, b) < 125 && Math.max(r, g, b) - Math.min(r, g, b) < 45;   // text, not the blue arrow icons
  const light = (r, g, b) => lum(r, g, b) > 222 && Math.max(r, g, b) - Math.min(r, g, b) < 40;   // white bar text
  // the clicked row: white text on a (51,102,153) box (Danny's 10-22 shot, "Icarus's Dream"); read as if it were dark on white
  const isSel = (r, g, b) => Math.abs(r - 51) < 28 && Math.abs(g - 102) < 28 && Math.abs(b - 153) < 28;
  const selInk = (r, g, b) => lum(r, g, b) > 160 && Math.max(r, g, b) - Math.min(r, g, b) < 60;

  // one frame -> {tab, bars: [{y0, y1, cat, n}], lines: [{y0, y1, x0, x1, prof, trunc, cat}]} in frame pixels, or null
  function readFrame(img){
    const {width: W, height: H, data: p} = img, at = (x, y) => (y * W + x) * 4;
    // 1. bar rows: the longest run of one bar colour per row
    const rows = [];
    for (let y = 0; y < H; y++){
      let best = null, s = -1, kind = 0;
      for (let x = 0; x <= W; x++){
        const i = at(Math.min(x, W - 1), y), k = x === W ? 0 : isTan(p[i], p[i + 1], p[i + 2]) ? 1 : isBlue(p[i], p[i + 1], p[i + 2]) ? 2 : 0;
        // text and the +/- box inside a bar break the colour: allow gaps up to 30px of non-bar inside a run of one kind
        if (k && s < 0){ s = x; kind = k }
        else if (s >= 0 && k !== kind){
          let gap = 0; while (x + gap < W && gap < 30){ const j = at(x + gap, y); if ((kind === 1 ? isTan : isBlue)(p[j], p[j + 1], p[j + 2])) break; gap++ }
          if (gap < 30 && x + gap < W){ x += gap; continue }
          if (!best || x - s > best[1] - best[0]) best = [s, x, kind]; s = -1;
          if (k){ s = x; kind = k }
        }
      }
      rows.push(best && best[1] - best[0] >= 100 ? best : null);
    }
    let bars = [];
    for (let y = 0; y < H; y++){ const r = rows[y]; if (!r) continue;
      // rows join on the bar's right edge (the left one moves where the +/- box breaks the colour)
      const b = bars.at(-1); if (b && b.y1 === y - 1 && b.kind === r[2] && Math.abs(b.x1 - r[1]) < 8) { b.y1 = y; b.x0 = Math.min(b.x0, r[0]) } else bars.push({y0: y, y1: y, x0: r[0], x1: r[1], kind: r[2]}) }
    bars = bars.filter(b => b.y1 - b.y0 >= 8);
    if (!bars.length) return null;
    // the quest window's bars share a left edge and a width: keep the biggest such group
    const groups = []; for (const b of bars){ const g = groups.find(g => Math.abs(g[0].x1 - b.x1) < 8 && Math.abs((g[0].x1 - g[0].x0) - (b.x1 - b.x0)) < 40); g ? g.push(b) : groups.push([b]) }
    bars = groups.sort((a, b) => b.length - a.length)[0];
    const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
    const L = med(bars.map(b => b.x0)), R = med(bars.map(b => b.x1)), hb = med(bars.map(b => b.y1 - b.y0 + 1)), P = hb / 0.857;
    // 2. the open tab: pink above the list
    let tab = null, py = -1;
    { let sx = 0, n = 0; const top = Math.max(0, bars[0].y0 - Math.round(4 * P));
      for (let y = top; y < bars[0].y0; y++) for (let x = Math.max(0, L - 20); x < Math.min(W, R + 40); x += 2){ const i = at(x, y); if (isPink(p[i], p[i + 1], p[i + 2])){ sx += x; n++; py = Math.max(py, y) } }
      if (n > 20){ const f = (sx / n - L) / (R - L); tab = f < 0.33 ? "avail" : f < 0.66 ? "prog" : "done" } }
    // 3. text lines: dark text in the list (left of the icon column excluded), outside the bars
    const tx0 = L + Math.round(0.09 * (R - L)), tx1 = R - 2, inBar = y => bars.some(b => y >= b.y0 - 1 && y <= b.y1 + 1);
    // rows inside the selection box (most of the text column is that blue): ink there is the light text
    const sel = new Uint8Array(H + 1); for (let y = 0; y < H; y++){ let n = 0, k = 0; for (let x = tx0; x < tx1; x += 4){ k++; const i = at(x, y); if (isSel(p[i], p[i + 1], p[i + 2])) n++ } if (n > k * 0.5) sel[y] = 1 }
    for (let y = 1; y < H; y++) if (!sel[y] && sel[y - 1] && sel[y + 1]) sel[y] = 1;   // a line of text right across it
    // the box's left edge: where a run of 12 box pixels starts (the quest icon left of it has a few such pixels too)
    const selAt = (x, y) => { const i = at(x, y); return isSel(p[i], p[i + 1], p[i + 2]) };
    let sx0 = W; for (let y = 0; y < H; y++) if (sel[y]) for (let x = tx0; x < sx0; x++){ let r = 0; while (r < 12 && selAt(x + r, y)) r++; if (r === 12){ sx0 = x; break } }
    const dk = (i, y) => sel[y] ? (i >> 2) % W >= sx0 + 2 && selInk(p[i], p[i + 1], p[i + 2]) : dark(p[i], p[i + 1], p[i + 2]);
    // lines are found from the left half (every name starts there; the mouse pointer sits by the bars' right end)
    const hx1 = tx0 + Math.round(0.5 * (tx1 - tx0));
    const yTop = py >= 0 ? py + 3 : bars[0].y0, lines = [];
    let cur = null;
    for (let y = yTop; y <= H; y++){
      let ink = false;
      if (y < H && !inBar(y)) for (let x = tx0; x < hx1; x++){ const i = at(x, y); if (dk(i, y)){ ink = true; break } }
      if (ink && !cur) cur = {y0: y, y1: y}; else if (ink) cur.y1 = y;
      else if (cur){ if (cur.y1 - cur.y0 >= 0.25 * P && cur.y1 - cur.y0 <= 0.8 * P) lines.push(cur); cur = null }
    }
    const out = [];
    for (const ln of lines){
      // a row's background is white (not the footer or the scroll bar)
      const my = Math.round((ln.y0 + ln.y1) / 2), bgi = at(Math.min(W - 1, R - 4), my); if (!sel[my] && lum(p[bgi], p[bgi + 1], p[bgi + 2]) < 200) continue;
      // the line with room for ascenders/descenders the left half lacked; a column with ink just outside that band belongs to
      // something taller (the pointer) and is left out
      const m = Math.round(0.12 * P), Y0 = Math.max(0, ln.y0 - m), Y1 = Math.min(H - 1, ln.y1 + m), isd = (x, y) => { if (y < 0 || y >= H || inBar(y)) return false; const i = at(x, y); return dk(i, y) };
      const bad = new Uint8Array(tx1 - tx0 + 1); for (let x = tx0; x < tx1; x++) if (isd(x, Y0 - 1) || isd(x, Y0 - 2) || isd(x, Y1 + 1) || isd(x, Y1 + 2)) bad[x - tx0] = 1;
      // ink joined to something reaching outside the band (the mouse pointer's outline, Danny's recording 16.5 s: its tip sits
      // on "Vicious in Need of an Apprentice" and made it read as the wider "Francois...") is left out with all its pixels
      const bw = tx1 - tx0, by0 = Math.max(0, Y0 - 8), by1 = Math.min(H - 1, Y1 + 8), bh = by1 - by0 + 1, lab = new Uint8Array(bw * bh), stack = [];
      for (let y = by0; y <= by1; y++) for (let x = tx0; x < tx1; x++){ if ((y >= Y0 && y <= Y1) || !isd(x, y) || lab[(y - by0) * bw + x - tx0]) continue;
        stack.push(x, y); lab[(y - by0) * bw + x - tx0] = 1;
        while (stack.length){ const yy = stack.pop(), xx = stack.pop();
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const nx = xx + dx, ny = yy + dy; if (nx < tx0 || nx >= tx1 || ny < by0 || ny > by1) continue; const j = (ny - by0) * bw + nx - tx0; if (!lab[j] && isd(nx, ny)){ lab[j] = 1; stack.push(nx, ny) } } } }
      const z = zprof((x, y) => !bad[x - tx0] && !lab[(y - by0) * bw + x - tx0] && isd(x, y), tx0, tx1 - 1, Y0, Y1, Math.round(0.7 * P)); if (!z.w) continue;
      // near the right edge a cut name is likely even when the dots blur: matchLine tries it both ways (edge)
      out.push({y0: ln.y0, y1: ln.y1, ...z, trunc: ellipsis(dk, at, z.x0, z.x1, ln, P), edge: z.x1 > R - 0.12 * (R - L)});   // z.x0/x1: ink box in frame x
    }
    // 4. bar text (white): which category, and its count
    for (const b of bars){
      const mx0 = L + Math.round(0.07 * (R - L)), mx1 = b.x1 - 1, my0 = b.y0 + 2, my1 = b.y1 - 2, mw = mx1 - mx0 + 1, mask = new Uint8Array(mw * (my1 - my0 + 1));
      for (let y = my0; y <= my1; y++) for (let x = mx0; x <= mx1; x++){ const i = at(x, y); if (light(p[i], p[i + 1], p[i + 2])) mask[(y - my0) * mw + x - mx0] = 1 }
      const get = (x, y) => mask[y * mw + x] === 1;
      b.t = zprof(get, 0, mw - 1, 0, my1 - my0, Math.round(0.7 * P)); b.get = get; b.mh = my1 - my0;
    }
    return {tab, bars, lines: out, P, L, R};
  }
  // "..." at the right end: the last ~3 dots are ink only in the bottom third of the line
  function ellipsis(dk, at, x0, x1, ln, P){
    const w = Math.round(P * 0.32), mid = ln.y0 + (ln.y1 - ln.y0) * 0.6; if (x1 - x0 < 3 * w) return false;
    let hi = 0, lo = 0;
    for (let x = x1 - w; x <= x1; x++) for (let y = ln.y0; y <= ln.y1; y++){ if (dk(at(x, y), y)) y < mid ? hi++ : lo++ }
    return lo > 4 && hi <= 2;   // a pixel or two of video blur above the dots
  }
  // best category for a bar ("Henesys (6)"): tan bars hold the groups, blue ones the regions; then its count
  function matchBar(b, px){
    if (!b.t?.w) return null;
    const all = [];
    for (const c of CATS.filter(c => TANCATS.includes(c) === (b.kind === 1))) for (const d of [1, 2]) all.push({cat: c, d, s: score(b.t, rend(c + " (" + "0".repeat(d) + ")", px))});
    all.sort((a, b) => a.s - b.s); const best = all[0];
    if (!best || best.s > 0.5) return null;
    // near-ties ("Bowman (1)" / "Magician (1)" on a blurry video): the rows under the bar decide (reader())
    const alts = [...new Set(all.filter(x => x.s - best.s < 0.03).map(x => x.cat))];
    // the count: only the "(n)" at the end of the text, against each number
    const tw = rend("(" + "0".repeat(best.d) + ")", px).w, tail = zprof(b.get, Math.max(b.t.x0, b.t.x1 - tw - 1), b.t.x1, 0, b.mh);
    const ns = []; for (let i = best.d === 1 ? 0 : 10; i < (best.d === 1 ? 10 : 100); i++) { const r = rend("(" + i + ")", px); ns.push([i, r.w && tail.w ? score(tail, r) + dtw(tail, r) + Math.abs(tail.w - r.w) / tail.w : 9]) }   // + letter-aligned: "2" and "3" differ in a few columns
    ns.sort((a, b) => a[1] - b[1]);
    return {cat: best.cat, alts, n: ns[1] && ns[1][1] - ns[0][1] < 0.025 ? null : ns[0][0], s: best.s};   // an unsure count stays blank
  }
  // best quest-log name for a text line among a category's names; cut names ("...") by their best-fitting prefix
  function matchLine(t, cat, px){
    const cats = Array.isArray(cat) ? cat : cat ? [cat] : [], names = cats.length ? [...new Set(cats.flatMap(c => [...(CAT.get(c)?.keys() || [])]))] : [...new Set(ALLQ.map(x => lnOf(x[1])))], sc = [];
    for (const n of names){
      // cut: each of the name's cuts near the row's width, the one that lines up letter by letter (dtw) kept
      let s = 9, br = null, bt = "", bd = 9;
      const dd = r => dtw(t, r) + 0.5 * Math.abs(t.w - r.w) / t.w;
      if (t.trunc || t.edge){ for (let i = 4; i < n.length; i++){ const tx = n.slice(0, i).trimEnd() + "..."; if (tx === bt) continue; const r = rend(tx, px); if (Math.abs(t.w - r.w) / t.w < 0.08){ s = Math.min(s, score(t, r)); const d = dd(r); if (d < bd){ bd = d; br = r; bt = tx } } } }
      if (!t.trunc){ const r = rend(n, px), v = score(t, r); if (v < s){ s = v; if (!(t.edge && bd < dd(r))){ br = r; bt = n; bd = 9 } } }
      sc.push([n, s, br, bt, bd]);
    }
    sc.sort((a, b) => a[1] - b[1]);
    // the closest few, re-ranked letter by letter; the old score stays as the match's quality (thresholds below)
    // (cut names: every name's best cut is re-ranked, so "First Greeting with Mrs. Ming Min..." vs "...Maya, the Tow..." is
    // decided on the letters that differ)
    const top = (t.trunc ? [...sc].sort((a, b) => a[4] - b[4]).slice(0, 6) : sc.slice(0, 6).filter(x => x[2] && x[1] < sc[0][1] + 0.12).map(x => [...x.slice(0, 4), x[4] < 9 ? x[4] : dtw(t, x[2]) + 0.5 * Math.abs(t.w - x[2].w) / t.w])).filter(x => x[2]).sort((a, b) => a[4] - b[4]);
    // near-ties only count against a different visible text: two names cut to the same letters are one row, not a doubt
    const rival = top.find(x => x[3] !== top[0]?.[3]), dGap = top[0] && rival ? rival[4] - top[0][4] : 1;
    const riv = top.filter(x => x[3] !== top[0]?.[3] && x[4] - top[0][4] < 0.02).map(x => x[0]);   // the names it nearly was
    if (top.length > 1){ const s0 = sc[0][1], tn = new Set(top.map(x => x[0])), rest = sc.filter(x => !tn.has(x[0])); sc.length = 0; sc.push(...top.map((x, i) => [x[0], i ? Math.max(x[1], s0 + 1e-6) : s0, x[2], x[3]]), ...rest) }
    // a cut name two quests share ("[Forest of Patience] Sabitra..."): keep both, the state decides later
    // a cut name two quests share ("[Forest of Patience] Sabitra..."): the same visible letters
    const amb = t.trunc && sc[0] ? sc.filter(x => x[3] && x[3] === sc[0][3]).map(x => x[0]) : [];
    return {ln: sc[0]?.[0], s: sc[0]?.[1] ?? 9, alt: sc.slice(1, 3), amb: amb.length > 1 ? amb : null,
      sure: !!sc[0] && sc[0][1] < 0.32 && (amb.length > 1 || dGap > 0.008), dGap, riv};
  }

  // a run of frames -> per tab: {cats: {cat: n}, names: Map(ln -> {cat, s, seen})}
  function reader(){
    let k = null, order = [];   // order: categories in the log, top to bottom (rows above the first bar belong to the one before it)
    const tabs = {done: {cats: {}, names: new Map(), slots: new Map()}, prog: {cats: {}, names: new Map(), slots: new Map()}, avail: {cats: {}, names: new Map(), slots: new Map()}};
    let lastTab = null, last = [], noTab = 0;
    function add(fr){
      if (!fr) return false;
      // the state (done / in progress) comes only from the tab the frame shows, or the one the last frames showed; a frame
      // before any tab was seen is skipped rather than guessed
      if (!fr.tab && !lastTab){ noTab++; return false }
      const tab = fr.tab || lastTab; lastTab = tab;
      const kk = k || fr.P * 0.576;   // the text's font size in px (42px rows ~ 24.2px Arial; refined from sure matches below)
      const bars = fr.bars.map(b => ({...b, m: matchBar(b, kk)}));
      const regionOfName = (ln, cats) => cats.find(c => CAT.get(c)?.has(ln));
      // a near-tie bar takes the category its rows match; with no rows open, your Path Planner class, else the best read
      for (const b of bars) if (b.m && b.m.alts.length > 1){
        const rows = fr.lines.filter(t => t.y0 > b.y1 && t.y1 < (bars.find(x => x.y0 > b.y1)?.y0 ?? 1e9));
        const hit = rows.map(t => matchLine(t, b.m.alts, kk)).filter(m => m.s < 0.3).sort((a, b) => a.s - b.s)[0];
        b.m.cat = hit ? regionOfName(hit.ln, b.m.alts) : b.m.alts.includes(X().cls) ? X().cls : b.m.cat;
      }
      for (const b of bars) if (b.m){ if (b.m.n != null || !(b.m.cat in tabs[tab].cats)) tabs[tab].cats[b.m.cat] = b.m.n; if (!order.includes(b.m.cat)){ const i = bars.indexOf(b), prev = bars.slice(0, i).reverse().find(x => x.m && order.includes(x.m.cat)); order.splice(prev ? order.indexOf(prev.m.cat) + 1 : order.length, 0, b.m.cat) } }
      const firstBar = bars.find(b => b.m), before = firstBar ? order[order.indexOf(firstBar.m.cat) - 1] : null;
      const got = [], T = tabs[tab];
      for (const t of fr.lines){
        const ai = bars.findLastIndex(b => b.y1 < t.y0), above = bars[ai];
        // under an unread bar (a pointer over it, a half-drawn frame): every name, and the match says the category
        const cat = above ? (above.m ? (above.m.alts.length > 1 ? above.m.alts : above.m.cat) : null) : before ?? null;
        let m = matchLine(t, cat, kk);
        if (cat && !m.sure){ const w = matchLine(t, null, kk); if (w.sure && w.s < m.s - 0.02) m = w }   // the bar was misread (or the row isn't its category's)
        m.cat = (m.ln && (Array.isArray(cat) ? cat : [cat]).find(c => CAT.get(c)?.has(m.ln))) || regionOf(BYLN.get(m.ln)?.[1] || {}); got.push([t, m]);
        if (!m.cat || m.s > 0.32) continue;
        const key = m.amb ? m.amb.join("\u0000") : m.ln;
        // a row under a visible bar is a slot ("Event", 3rd row) that every frame of a slow scroll sees again: votes per
        // slot, settled in readFiles (one name per slot, no name in two slots). Close names ("[Event] The First Mark" /
        // "The Fifth Mark") then go to the slot that reads them best instead of both rows taking one name.
        if (above?.m){
          const i = Math.max(0, Math.round((t.y0 - above.y1) / fr.P - 0.4)), sk = m.cat + "|" + i;   // by distance, so a missed row above doesn't shift it
          const sl = T.slots.get(sk) || new Map(), o = sl.get(key) || {v: 0, sv: 0, s: 9, amb: m.amb, cat: m.cat, alt: new Set()};
          o.v += m.sure ? 1 : 0.3; if (m.sure) o.sv++; o.s = Math.min(o.s, m.s); for (const n of m.riv || []) o.alt.add(n); sl.set(key, o); T.slots.set(sk, sl);
        } else if (m.sure){ const o = T.names.get(key) || {cat: m.cat, s: 9, amb: m.amb}; o.s = Math.min(o.s, m.s); T.names.set(key, o) }   // above the first bar: sure reads only
      }
      // the text size from sure, uncut matches
      const ks = got.filter(([t, m]) => m.sure && !t.trunc).map(([t, m]) => kk * t.w / rend(m.ln, kk).w);
      if (ks.length >= 2 && !k) k = ks.sort((a, b) => a - b)[ks.length >> 1];
      last = got; return true;
    }
    return {add, tabs, get k(){ return k }, get last(){ return last }, get noTab(){ return noTab }, get tab(){ return lastTab }};
  }

  async function readFiles(files, onProg = () => {}){
    const rd = reader(); let frames = 0, used = 0;
    const take = c => { const fr = readFrame(c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, c.width, c.height)); frames++; if (rd.add(fr)) used++ };
    const list = [...files].sort((a, b) => (a.type.startsWith("video") ? 1 : 0) - (b.type.startsWith("video") ? 1 : 0));
    for (let fi = 0; fi < list.length; fi++){
      const f = list[fi], c = document.createElement("canvas");
      if (f.type.startsWith("image")){
        const bm = await createImageBitmap(f); c.width = bm.width; c.height = bm.height; c.getContext("2d").drawImage(bm, 0, 0); take(c); onProg((fi + 1) / list.length);
      } else if (f.type.startsWith("video")){
        const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = URL.createObjectURL(f);
        await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error("video")) });
        c.width = v.videoWidth; c.height = v.videoHeight; const cc = c.getContext("2d", {willReadFrequently: true});
        for (let t = 0; t < v.duration; t += 0.25){   // 4 frames a second: a slow scroll moves under one row between them
          v.currentTime = t; await new Promise(ok => { v.onseeked = ok });
          cc.drawImage(v, 0, 0); take(c); onProg((fi + Math.min(1, t / v.duration)) / list.length);
        }
        URL.revokeObjectURL(v.src);
      }
    }
    return settle(rd, frames, used);
  }
  // a reader's votes -> quests (a file read at the end, the live reader every second)
  function settle(rd, frames, used){
    // unsure: rows read only narrowly, or more rows than the bar counts; shown to the player to confirm, never applied
    const res = {at: new Date().toISOString(), frames, used, cats: {}, done: [], prog: {}, unsure: [], noTab: rd.noTab || 0};
    const unsure = (tab, cat, names, why) => { const opts = [...new Set(names.flatMap(n => n.split("\u0000")))].filter(n => CAT.get(cat)?.has(n)).slice(0, 4);
      if (opts.length && !res.unsure.some(u => u.tab === tab && u.opts[0] === opts[0])) res.unsure.push({tab, cat, opts, why}) };
    for (const tab of ["done", "prog"]){
      res.cats[tab] = {};
      for (const [c, n] of Object.entries(rd.tabs[tab].cats)) res.cats[tab][c] = {n, found: 0};
      // slots: strongest first, each takes its best name not already taken in its category (and only with a sure read or
      // several narrow ones behind it); rows past the bar's own count are ignored
      // (best read first: on cut, blurry rows a wrong name can win many frames narrowly, the right one wins its clear frames)
      const T = {names: new Map(rd.tabs[tab].names), slots: rd.tabs[tab].slots}, taken = new Map(), slots = [...T.slots.entries()].map(([sk, m]) => { const [c, i] = [sk.slice(0, sk.lastIndexOf("|")), +sk.slice(sk.lastIndexOf("|") + 1)]; return {c, i, cands: [...m.entries()].filter(([, o]) => o.v >= 0.9).sort((a, b) => a[1].s - b[1].s || b[1].v - a[1].v)} })
        .filter(x => x.cands.length).sort((a, b) => (b.cands[0][1].sv ? 1 : 0) - (a.cands[0][1].sv ? 1 : 0) || a.cands[0][1].s - b.cands[0][1].s);   // clear reads first
      for (const sl of slots){ const used = taken.get(sl.c) || new Set(); const pick = sl.cands.find(([k]) => !used.has(k)); if (!pick) continue; used.add(pick[0]); taken.set(sl.c, used);
        // never once a clear read (only narrow ones, or a near-tie every time): ask instead of applying
        // ...unless every close rival is already another row's clear read in this category (a quest shows once per tab):
        // "[Event] The Final Mark" near-ties "The First Mark" / "The Fifth Mark", which sit in their own rows
        const rivals = [...pick[1].alt].filter(n => n !== pick[0]);
        if (!pick[1].sv && !(rivals.length && rivals.every(n => T.names.has(n)))){ if (!T.names.has(pick[0])) unsure(tab, sl.c, [pick[0], ...pick[1].alt], "narrow"); continue }
        if (!T.names.has(pick[0])) T.names.set(pick[0], {...pick[1], cat: sl.c}) }
      // rows seen only faintly (no name won enough frames): ask too
      for (const [sk, m] of T.slots){ const c = sk.slice(0, sk.lastIndexOf("|")), best = [...m.entries()].sort((a, b) => b[1].v - a[1].v)[0];
        if (best && best[1].v < 0.9 && best[1].v >= 0.6 && !taken.get(c)?.has(best[0]) && !T.names.has(best[0])) unsure(tab, c, [best[0], ...best[1].alt], "faint") }
      // more rows than the bar's own count: the weakest extra reads are doubtful
      const byCat = new Map(); for (const [key, o] of T.names){ if (!byCat.has(o.cat)) byCat.set(o.cat, []); byCat.get(o.cat).push([key, o]) }
      for (const [c, list] of byCat){ const n = rd.tabs[tab].cats[c]; if (n == null || list.length <= n) continue;
        for (const [key, o] of list.sort((a, b) => b[1].s - a[1].s).slice(0, list.length - n)){ T.names.delete(key); unsure(tab, c, [key, ...(o.alt || [])], "count") } }
      // a shared cut name in the Completed tab can't say which quest: ask
      if (tab === "done") for (const [key, o] of T.names) if (o.amb){ unsure(tab, o.cat, o.amb, "cut") }
      for (const [key, o] of T.names){
        // a shared cut name: in progress = the first of them not done; done = can't tell, so none (tick it by hand)
        let ln = key;
        if (o.amb){ if (tab === "done") continue; const d = new Set(res.done), c = o.amb.flatMap(n => CAT.get(o.cat)?.get(n) || []).map(x => x[1]).sort((a, b) => a.lvl - b.lvl || +a.id - +b.id).find(r => !d.has(String(r.id))); if (!c) continue; ln = lnOf(c) }
        const qs = CAT.get(o.cat)?.get(ln) || []; if (!qs.length) continue;
        if (res.cats[tab][o.cat]) res.cats[tab][o.cat].found++; else res.cats[tab][o.cat] = {n: null, found: 1};
        if (tab === "done") qs.forEach(([, r]) => res.done.push(String(r.id)));
        else { const step = curStep(qs.map(x => x[1]), new Set(res.done)); if (step) res.prog[String(step.id)] = ln }
      }
    }
    return res;
  }
  // the step of an in-progress questline you're on: the first not done (in line order)
  const curStep = (rs, done) => [...rs].sort((a, b) => (a.cpos || 0) - (b.cpos || 0) || a.lvl - b.lvl || +a.id - +b.id).find(r => !done.has(String(r.id))) || rs[0];

  // ---------- state ----------
  const S = {done: [], prog: {}, pick: [], lv: 30, from: "", cats: null, at: ""};
  try { const o = JSON.parse(localStorage.getItem("qlog") || "null");
    if (o && typeof o === "object"){
      if (Array.isArray(o.done)) S.done = o.done.filter(i => BYID.has(String(i))).map(String);
      if (o.prog && typeof o.prog === "object") for (const [i, n] of Object.entries(o.prog)) if (BYID.has(i) && typeof n === "string") S.prog[i] = n;
      if (Array.isArray(o.pick)) S.pick = o.pick.filter(i => BYID.has(String(i))).map(String);
      if (Number.isInteger(o.lv) && o.lv >= 1 && o.lv <= MAX_LEVEL) S.lv = o.lv;
      if (typeof o.from === "string" && (o.from === "" || D.maps[o.from])) S.from = o.from;
      if (typeof o.at === "string") S.at = o.at.slice(0, 30);
      if (o.cats && typeof o.cats === "object") S.cats = o.cats;
    } } catch(e) {}
  const save = () => { try { localStorage.setItem("qlog", JSON.stringify(S)) } catch(e) {}
    // Keep or sell and the Path Planner read done quests from pathdone ("q<id>", non-Citizenship)
    try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); for (const i of S.done) if (BYID.get(i)?.[0] === "q") pd.add("q" + i); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {} };

  // ---------- which quests ----------
  // done = read/ticked + everything a quest you're on needed first (its earlier quests, earlier steps of its questline)
  const DONE = () => { const d = new Set(S.done), up = id => { const r = BYID.get(id)?.[1]; if (!r) return;
      for (const p of r.pre || []) if (!d.has(String(p))){ d.add(String(p)); up(String(p)) }
      if (r.chain) for (const [, q] of CAT.get(r.region)?.get(r.chain) || []) if ((q.cpos || 0) < (r.cpos || 0) && !d.has(String(q.id))){ d.add(String(q.id)); up(String(q.id)) } };
    for (const id of Object.keys(S.prog)) up(id); return d };
  const classOK = r => !["Warrior", "Magician", "Bowman", "Thief"].includes(r.region) || r.region === X().cls;
  function status(r, done = DONE()){
    const id = String(r.id);
    if (done.has(id)) return "done";
    if (S.prog[id]) return "prog";
    if (!classOK(r)) return "other";
    if ((r.pre || []).some(p => BYID.has(String(p)) && !done.has(String(p)))) return "locked";
    return r.lvl <= S.lv ? "open" : r.lvl <= S.lv + 5 ? "soon" : "later";
  }

  // ---------- planning ----------
  const isQuestItem = id => +id >= 4031000 && +id < 4033000;   // quest items only drop while the quest is on
  const shopFor = id => (D.ishop?.[id] || []).filter(s => s[4] !== "COT2").sort((a, b) => a[3] - b[3])[0] || null;
  function plan(ids, opt = {}){
    const done = DONE(), L = opt.lv || S.lv, ch = charAt(L), notes = [];
    // the picked quests and the earlier ones they need, in need order
    const want = new Map(), add = (id, why) => { id = String(id); if (done.has(id) || want.has(id) || !BYID.has(id)) return; const r = BYID.get(id)[1];
      for (const p of r.pre || []) add(p, r); want.set(id, {r, added: why}); };
    ids.forEach(i => add(i, null));
    const Q = [...want.values()];
    for (const q of Q) if (q.added) notes.push(`${q.r.name} added: ${q.added.name} needs it first.`);
    // tasks
    const T = [];
    for (const q of Q){
      const r = q.r, spot = npcSpot(r.npc), on = !!S.prog[String(r.id)];
      q.acc = on ? null : {kind: "accept", q, map: spot, dep: (r.pre || []).map(String).filter(p => want.has(p)).map(p => want.get(p))};
      q.turn = {kind: "turn", q, map: spot, dep: []};
      if (q.acc) T.push(q.acc); T.push(q.turn);
      if (!spot) notes.push(`${r.name}: ${r.npc || "its NPC"} has no known map spot, so its walks aren't counted.`);
    }
    // hunts: one per monster and "wave" (a later quest in a chain needs its own visit), kills = max(kill counts, drops wanted / drop rate)
    const depth = q => q._d ?? (q._d = Math.max(0, ...(q.r.pre || []).map(String).filter(p => want.has(p)).map(p => depth(want.get(p)) + 1)));
    const H = new Map(), CR = new Map(), rate = opt.drop || X().drop;
    const have = opt.have || {};
    for (const q of Q){
      for (const [mob, n] of q.r.kl || []){ if (!D.mobs[mob]) continue; const key = mob + "|" + depth(q); const h = H.get(key) || {kind: "hunt", mob: String(mob), kills: 0, items: [], qs: new Set(), dep: [], for: new Set()}; h.kills = Math.max(h.kills, n); h.qs.add(q); H.set(key, h) }
      for (const [name, n, src, iid] of q.r.il || []){ const need = n - Math.min(n, have[iid] || 0); if (need) get(iid, name, need, q, q.turn, src, 0) }
    }
    // an item for quest q, needed before task `forT` (its turn-in, or a craft): the quest's own monster, else the one players
    // report dropping it most (meowdb, D.drops), else an NPC shop, else a recipe (its materials the same way, 2 levels deep)
    function get(iid, name, need, q, forT, src, lvl){
      if (!(src && D.mobs[src] && okMob(String(src)))) src = (D.drops?.[iid] || []).filter(([m]) => D.mobs[m] && okMob(String(m))).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (src){ src = String(src); const key = src + "|" + depth(q); const h = H.get(key) || {kind: "hunt", mob: src, kills: 0, items: [], qs: new Set(), dep: [], for: new Set()};
        h.items.push([name, need, iid, q]); h.qs.add(q); h.for.add(forT); H.set(key, h); return }
      const sh = shopFor(iid);
      if (sh){ const b = {kind: "buy", q, item: [name, need, iid], shop: sh, map: sh[1], dep: []}; T.push(b); forT.dep.push(b); return }
      const rc = lvl < 2 && (D.craft?.rec || []).filter(c => String(c[3]) === String(iid) && c[2] <= CRAFT_CAP).sort((a, b) => a[2] - b[2])[0];
      if (rc){ const disc = D.craft.disc[rc[0]], times = Math.ceil(need / (rc[4] || 1));
        // one craft step per item: a second quest wanting it adds to the count (and to its materials)
        let c = CR.get(iid);
        if (c){ c.item[1] += need; c.times += times; c.fee += (rc[6] || 0) * times; c.qs.add(q) }
        else { c = {kind: "craft", q, qs: new Set([q]), item: [name, need, iid], times, disc: disc[0], lv: rc[2], fee: (rc[6] || 0) * times, npc: disc[2], map: npcSpot(disc[2]), dep: []}; CR.set(iid, c); T.push(c) }
        if (!forT.dep.includes(c)) forT.dep.push(c);
        for (const [m, k] of rc[7]) get(String(m), D.items[m]?.n || m, k * times, q, c, null, lvl + 1);
        return }
      notes.push(`${name} × ${need} for ${q.r.name}: no monster, shop or recipe source in our data (another quest, or an NPC hands it over).`);
    }
    for (const h of H.values()){
      const drops = h.items.reduce((a, [, n]) => a + n, 0);
      h.kills = Math.max(h.kills, Math.ceil(drops / rate));
      // kills count only for accepted quests; quest items only drop while their quest is on
      h.dep = [...h.qs].filter(q => q.acc && ((q.r.kl || []).some(([m]) => String(m) === h.mob) || h.items.some(([, , iid, iq]) => iq === q && isQuestItem(iid)))).map(q => q.acc);
      for (const q of h.qs) if ((q.r.kl || []).some(([m]) => String(m) === h.mob)) q.turn.dep.push(h);
      for (const f of h.for || []) f.dep.push(h);
      T.push(h);
    }
    for (const q of Q){ if (q.acc) q.turn.dep.push(q.acc); for (const p of q.acc?.dep || []) { /* a later step: its giver only offers it once the earlier one is turned in */ } }
    for (const q of Q) if (q.acc) q.acc.dep = q.acc.dep.map(p => p.turn);

    // greedy: from where you are, the available task with the least travel + time; two rules for ties/order, keep the faster
    const run = rule => {
      const doneT = new Set(), steps = []; let pos = opt.from || S.from || T.find(t => t.map)?.map || null, sec = 0, exp = 0, mesos = 0;
      for (let guard = 0; doneT.size < T.length && guard < 2000; guard++){
        const ready = T.filter(t => !doneT.has(t) && t.dep.every(d => doneT.has(d)));
        if (!ready.length) break;
        let best = null;
        for (const t of ready){
          let c;
          if (t.kind === "hunt"){ const s = killSpot(t.mob, t.kills, pos, L, ch, false); c = s ? {map: s.map[0], tr: s.tr, work: s.kill} : {map: pos, tr: 0, work: Infinity, none: true} }
          else { const tr = t.map && pos ? tripSec(pos, t.map) : 0; c = {map: t.map || pos, tr, work: t.kind === "buy" ? 20 : t.kind === "craft" ? 10 + 3 * t.times : QUEST_SEC / 2} }
          const pri = rule === "accept-first" && t.kind === "accept" ? -1e6 : 0, v = c.tr + (isFinite(c.work) ? c.work : 1e7) + pri;
          if (!best || v < best.v) best = {t, c, v};
        }
        const {t, c} = best; doneT.add(t);
        const st = {kind: t.kind, map: c.map, travel: c.tr, route: pos && c.map && pos !== c.map ? routeText(pos, c.map) : "", sec: isFinite(c.work) ? c.work : null, none: c.none};
        if (t.kind === "hunt"){ st.mob = t.mob; st.kills = t.kills; st.items = t.items.map(([n, k]) => [n, k]); st.qs = [...t.qs].map(q => q.r); if (isFinite(c.work)) exp += D.mobs[t.mob][3] * t.kills }
        else if (t.kind === "buy"){ st.item = t.item; st.shop = t.shop; st.q = t.q.r }
        else if (t.kind === "craft"){ Object.assign(st, {item: t.item, times: t.times, disc: t.disc, lv: t.lv, fee: t.fee, npc: t.npc, q: t.q.r, qs: [...t.qs].map(q => q.r)}); mesos -= t.fee }
        else { st.q = t.q.r; if (t.kind === "turn"){ exp += t.q.r.exp || 0; mesos += t.q.r.mesos || 0 } }
        sec += c.tr + (isFinite(c.work) ? c.work : 0); if (c.map) pos = c.map; steps.push(st);
      }
      return {steps, sec, exp, mesos, left: T.length - doneT.size};
    };
    const a = run("nearest"), b = run("accept-first"), best = b.sec < a.sec ? b : a;
    return {...best, notes, quests: Q.map(q => q.r), rate, L, est: ch.est};
  }

  // ---------- page ----------
  const page = $("#qlog"); if (!page) return {readFrame, reader, settle, matchLine, matchBar, readFiles, plan, status, S};
  let view = "prog", lastPlan = null;
  const qname = r => qref(BYID.get(String(r.id))?.[0] || "q", r);
  const lvIn = $("#qllv"); lvIn.value = S.lv;
  function fillFrom(){ const towns = [...new Set(Object.values(JOBTOWN).concat(["Lith Harbor", "Sleepywood"]))];
    $("#qlfrom").innerHTML = `<option value="">Where the first quest is</option>` + towns.map(t => { const id = OPENMAP[t]; return id ? `<option value="${id}"${S.from === id ? " selected" : ""}>${esc(t)}</option>` : "" }).join("") }
  // rows the reader wasn't sure of (settle(): narrow, faint, over the bar's count, a shared cut name): the player picks
  let U = []; const skip = new Set();   // answered rows don't come back while a share keeps reading
  const tabTxt = t => t === "prog" ? "In Progress" : "Completed";
  function setUnsure(list){ const d = DONE(); U = (list || []).filter(u => !skip.has(u.tab + "|" + u.opts[0]) && !u.opts.some(n => (CAT.get(u.cat)?.get(n) || []).some(([, r]) => u.tab === "done" ? d.has(String(r.id)) : String(r.id) in S.prog))) }
  function drawUnsure(){
    $("#qlunsure").innerHTML = U.length ? `<p class="sub">Not sure about ${U.length === 1 ? "this row" : "these rows"}, so ${U.length === 1 ? "it wasn't" : "they weren't"} added. Pick what the game shows:</p>` + U.map((u, i) =>
      `<div class="qlu"><span class="sub">${esc(u.cat)} · ${tabTxt(u.tab)}${u.why === "count" ? " (more rows than the bar's count)" : ""}:</span> ${u.opts.map(n => `<button class="btn sm" type="button" data-u="${i}" data-n="${esc(n)}">${esc(n)}</button>`).join("")}<button class="btn sm" type="button" data-u="${i}" data-n="">None of these</button></div>`).join("") : "";
  }
  // add a quest-log name in a tab to a state (S, or a live share's base so the next second's re-apply keeps it)
  function addName(o, tab, cat, n){ const qs = (CAT.get(cat)?.get(n) || []).map(x => x[1]); if (!qs.length) return;
    if (tab === "done"){ for (const r of qs){ o.done = [...new Set([...o.done, String(r.id)])] } }
    else { const st = curStep(qs, new Set(o.done)); if (st) o.prog = {...o.prog, [String(st.id)]: n} } }
  function drawRead(){
    const n = S.done.length, p = Object.keys(S.prog).length;
    $("#qlsum").innerHTML = !n && !p ? `<p class="sub">Nothing read yet. Your quests below use what you tick by hand.</p>`
      : `<p><b>${fmt(n)}</b> quests done · <b>${fmt(p)}</b> in progress${S.at ? ` <span class="sub">(read ${esc(new Date(S.at).toLocaleString())})</span>` : ""}</p>` + (S.cats ? `<div class="qlcats">${["done", "prog"].map(tab => Object.entries(S.cats[tab] || {}).filter(([, o]) => o.found).map(([c, o]) => (o.n != null && o.n < o.found ? {...o, n: null} : o, [c, o.n != null && o.n < o.found ? {...o, n: null} : o])).map(([c, o]) =>
        `<span class="pill ${o.n == null || o.found === o.n ? "p-ok" : "p-warn"}" title="${tab === "done" ? "Completed" : "In Progress"} tab: ${o.found} read${o.n != null ? " of the " + o.n + " the bar counts" : ""}">${tab === "done" ? "✓" : "▸"} ${esc(c)} ${o.found}${o.n != null ? "/" + o.n : ""}</span>`).join("")).join("")}</div><p class="sub">A count under the bar's own number means some rows weren't read: open that category and scroll past it again, or tick them below.</p>` : "");
  }
  function rowsFor(v){
    const done = DONE();
    return ALLQ.filter(([, r]) => { const s = status(r, done); return v === "all" ? s !== "other" : v === "open" ? s === "open" : s === v })
      .sort((a, b) => a[1].lvl - b[1].lvl || a[1].name.localeCompare(b[1].name));
  }
  // the reader sees a questline's name, not its step: you pick the step you're on (earlier steps then count as done)
  const stepPick = r => { const steps = [...(CAT.get(r.region)?.get(r.chain) || [])].map(x => x[1]).sort((a, b) => (a.cpos || 0) - (b.cpos || 0));
    return `<div class="sub">${esc(r.chain)}: <select class="qlstep" aria-label="Step of ${esc(r.chain)}">${steps.map(q => `<option value="${q.id}"${String(q.id) === String(r.id) ? " selected" : ""}>${q.cpos}. ${esc(q.name)}</option>`).join("")}</select></div>` };
  function drawList(){
    const done = DONE(), counts = {prog: 0, open: 0, soon: 0, done: 0}; for (const [, r] of ALLQ){ const s = status(r, done); if (s in counts) counts[s]++ }
    $("#qlview").querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", b.dataset.v === view); const c = counts[b.dataset.v]; b.querySelector("span").textContent = c == null ? "" : ` (${fmt(c)})` });
    const pick = new Set(S.pick), rows = rowsFor(view);
    lazyRows($("#qlrows"), rows.map(([, r]) => { const id = String(r.id), s = status(r, done);
      return `<tr data-id="${id}"><td><input type="checkbox" class="qlpick" aria-label="Plan ${esc(r.name)}"${pick.has(id) ? " checked" : ""}${s === "done" ? " disabled" : ""}></td>
        <td class="num">${r.lvl}</td><td>${qname(r)}${s === "prog" && r.chain ? stepPick(r) : r.chain ? `<div class="sub">${esc(r.chain)} · ${r.cpos} of ${r.cn}</div>` : ""}</td>
        <td>${esc(r.region)}</td><td>${npcLink(r.npc)}</td><td class="sub">${reqHTML(r, true)}</td><td class="num">${r.exp ? fmt(r.exp) : "–"}</td>
        <td><button class="btn sm qlmark" data-m="${s === "done" ? "undo" : "done"}">${s === "done" ? "Not done" : "Done"}</button>${s !== "done" ? ` <button class="btn sm qlmark" data-m="${s === "prog" ? "unprog" : "prog"}">${s === "prog" ? "Not on it" : "On it"}</button>` : ""}</td></tr>` }),
      `<tr><td colspan="8" class="empty">${view === "prog" ? "No quests in progress: read your In Progress tab or press On it on a quest." : view === "open" ? "Nothing open at this level that you haven't done." : "None."}</td></tr>`);
    $("#qlpicked").textContent = S.pick.length ? `${S.pick.length} picked` : "Pick quests to plan";
  }
  const kindTxt = {accept: "Accept", turn: "Turn in", hunt: "Hunt", buy: "Buy", craft: "Craft"};
  function drawPlan(){
    const box = $("#qlplan");
    if (!S.pick.length){ box.innerHTML = `<p class="sub">Tick quests above (or press <b>Pick all in progress</b>) and the route shows here.</p>`; lastPlan = null; return }
    const P = lastPlan = plan(S.pick);
    box.innerHTML = `<div class="qltiles"><div class="sntile"><b>${hm(P.sec)}</b><span>about, start to finish</span></div><div class="sntile"><b>${fmt(P.exp)}</b><span>EXP (quests + kills)</span></div><div class="sntile"><b>${fmt(P.mesos)}</b><span>mesos from quests${P.steps.some(x => x.fee) ? ", less craft fees" : ""}</span></div><div class="sntile"><b>${P.steps.length}</b><span>steps for ${P.quests.length} quest${P.quests.length === 1 ? "" : "s"}</span></div></div>
      <div class="tblwrap"><table class="qlsteps"><thead><tr><th class="num">#</th><th>Do</th><th>Where</th><th>What</th><th class="num">Time</th></tr></thead><tbody>${P.steps.map((s, i) => `<tr class="k-${s.kind}">
        <td class="num">${i + 1}</td><td><b>${kindTxt[s.kind]}</b></td><td>${s.map ? mapLink(s.map, mapName(s.map)) : "<span class='sub'>–</span>"}${s.route ? `<div class="sub">${esc(s.route)}</div>` : ""}</td>
        <td>${s.kind === "hunt" ? `${fmt(s.kills)} ${mobLink(s.mob)}${s.items.length ? ` <span class="sub">for ${s.items.map(([n, k]) => `${fmt(k)} ${esc(n)}`).join(", ")}</span>` : ""}<div class="sub">${s.qs.map(r => esc(r.name)).join(" · ")}</div>${s.none ? `<div class="bad">Too strong for your Path Planner character at Lv ${P.L} (or nowhere to hunt it at launch).</div>` : ""}`
          : s.kind === "buy" ? `${fmt(s.item[1])} ${esc(s.item[0])} from ${npcLink(s.shop[0])} (${fmt(s.shop[3])} each) <span class="sub">for ${esc(s.q.name)}</span>`
          : s.kind === "craft" ? `${fmt(s.item[1])} ${esc(s.item[0])} (${fmt(s.times)} craft${s.times === 1 ? "" : "s"}, ${esc(s.disc)} Lv ${s.lv}${s.fee ? `, ${fmt(s.fee)} mesos` : ""}) at ${npcLink(s.npc)} <span class="sub">for ${s.qs.map(r => esc(r.name)).join(" · ")}; needs that profession</span>` : `${qname(s.q)} <span class="sub">${npcLink(s.q.npc)}</span>`}</td>
        <td class="num">${s.sec == null ? "?" : hm((s.travel || 0) + s.sec)}</td></tr>`).join("")}</tbody></table></div>
      ${P.left ? `<p class="bad">${P.left} step${P.left === 1 ? "" : "s"} couldn't be placed (a quest waits on one that isn't open).</p>` : ""}
      ${P.notes.length ? `<ul class="sub">${P.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="sub">Estimates: kill times use your Path Planner character (${esc(X().cls)}${P.est ? ", rough damage" : ""}) at Lv ${P.L}; item drops assume ${Math.round(P.rate * 100)}% per kill (no drop rates exist in the files; change it in the Path Planner). Turn-ins are at the quest's NPC.</p>`;
  }
  const redraw = () => { drawRead(); drawUnsure(); drawList(); drawPlan(); histUi() };
  // Undo / Redo over what was read and marked (a read, a live share, a Done / On it, Forget = one step each)
  const hist = [], fut = [], snap = () => JSON.parse(JSON.stringify({done: S.done, prog: S.prog, cats: S.cats, at: S.at}));
  const step = () => { hist.push(snap()); if (hist.length > 40) hist.shift(); fut.length = 0 };
  function restore(o){ const gone = S.done.filter(i => !o.done.includes(i)); Object.assign(S, o); save();
    try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); for (const i of gone) pd.delete("q" + i); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {}
    $("#qlseen").innerHTML = ""; redraw() }
  const undo = () => { if (LV) endLive(); if (!hist.length) return; fut.push(snap()); restore(hist.pop()) };
  const redo = () => { if (!fut.length) return; hist.push(snap()); restore(fut.pop()) };
  function histUi(){ $("#qlundo").disabled = !hist.length; $("#qlredo").disabled = !fut.length; $("#qlforget").disabled = !S.done.length && !Object.keys(S.prog).length }
  // a read on top of what you had (base): in progress beats done, since a repeatable ("Donating to Henesys") sits in both tabs
  function apply(base, r){
    S.done = [...new Set([...base.done, ...r.done])].filter(i => !(i in r.prog)); S.prog = {...base.prog, ...r.prog};
    S.cats = r.cats; S.at = r.at; setUnsure(r.unsure); save(); redraw();
  }
  // what a read added, by name (shown under the status so a wrong one is easy to spot and Undo)
  function seen(base, label){
    const d = new Set(base.done), add = S.done.filter(i => !d.has(i)).map(i => BYID.get(i)?.[1]).filter(Boolean),
      on = Object.keys(S.prog).filter(i => !(i in base.prog)).map(i => BYID.get(i)?.[1]).filter(Boolean);
    const names = (rs, cls) => [...new Set(rs.map(lnOf))].slice(0, 60).map(n => `<span class="pill ${cls}">${esc(n)}</span>`).join("");
    $("#qlseen").innerHTML = add.length || on.length ? `<div class="qlcats"><span class="sub">${label}</span>${names(on, "p-warn")}${names(add, "p-ok")}</div>` : "";
  }
  $("#qlview").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; view = b.dataset.v; drawList() });
  $("#qlrows").addEventListener("change", e => {
    const st = e.target.closest(".qlstep");
    if (st){ const old = st.closest("tr").dataset.id, nu = st.value, ln = S.prog[old]; delete S.prog[old]; S.prog[nu] = ln || BYID.get(nu)[1].chain;
      S.pick = S.pick.map(x => x === old ? nu : x); save(); redraw(); return }
    const c = e.target.closest(".qlpick"); if (!c) return; const id = c.closest("tr").dataset.id;
    S.pick = c.checked ? [...new Set([...S.pick, id])] : S.pick.filter(x => x !== id); save(); drawList(); drawPlan() });
  $("#qlrows").addEventListener("click", e => { const b = e.target.closest(".qlmark"); if (!b) return; const id = b.closest("tr").dataset.id, m = b.dataset.m; step();
    if (m === "done"){ S.done = [...new Set([...S.done, id])]; delete S.prog[id]; S.pick = S.pick.filter(x => x !== id) }
    else if (m === "undo"){ S.done = S.done.filter(x => x !== id); try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); pd.delete("q" + id); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {} }
    else if (m === "prog") S.prog[id] = BYID.get(id)[1].name; else delete S.prog[id];
    hist.length && JSON.stringify(hist.at(-1)) === JSON.stringify(snap()) && hist.pop();
    save(); redraw() });
  lvIn.addEventListener("change", () => { const v = Math.round(+lvIn.value); S.lv = v >= 1 && v <= MAX_LEVEL ? v : S.lv; lvIn.value = S.lv; save(); redraw() });
  $("#qlfrom").addEventListener("change", e => { S.from = e.target.value; save(); drawPlan() });
  $("#qlpickprog").addEventListener("click", () => { S.pick = [...new Set([...S.pick, ...Object.keys(S.prog)])]; save(); drawList(); drawPlan() });
  $("#qlclearpick").addEventListener("click", () => { S.pick = []; save(); drawList(); drawPlan() });
  $("#qlforget").addEventListener("click", () => { if (LV) endLive(); step(); skip.clear(); U = []; restore({done: [], prog: {}, cats: null, at: ""}); $("#qlstat").textContent = "Forgot what was read (Undo brings it back)." });
  $("#qlunsure").addEventListener("click", e => { const b = e.target.closest("button[data-u]"); if (!b) return; const u = U[+b.dataset.u]; if (!u) return;
    if (b.dataset.n){ step(); addName(S, u.tab, u.cat, b.dataset.n); if (LV) addName(LV.base, u.tab, u.cat, b.dataset.n); save() }
    skip.add(u.tab + "|" + u.opts[0]); U = U.filter(x => x !== u); redraw() });
  $("#qlundo").addEventListener("click", undo); $("#qlredo").addEventListener("click", redo);
  document.addEventListener("keydown", e => { if (page.hidden || !(e.ctrlKey || e.metaKey) || e.target.closest?.("input, select, textarea")) return; const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey){ e.preventDefault(); undo() } else if (k === "y" || (k === "z" && e.shiftKey)){ e.preventDefault(); redo() } });
  async function handle(files){
    files = [...files].filter(f => /^(image|video)\//.test(f.type)); if (!files.length) return;
    const st = $("#qlstat"); st.textContent = "Reading…"; $("#qlbar").hidden = false;
    try {
      const r = await readFiles(files, f => { $("#qlbar").value = f; st.textContent = `Reading… ${Math.round(f * 100)}%` });
      if (!r.done.length && !Object.keys(r.prog).length && r.noTab && !r.used){ st.textContent = "Found the quest list but not its tabs (Available / In Progress / Completed): keep the tab row in the shot so it knows which state the quests are in."; return }
      if (!r.done.length && !Object.keys(r.prog).length && !r.unsure.length){ st.textContent = "No quest window found. Record or capture the QUEST window with a category open (see How the Quest log works)."; return }
      const base = snap(); step(); if (!Object.keys(r.prog).length && view === "prog") view = "open";
      apply(base, r); seen(base, "Read:"); st.textContent = `Read ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in-progress quests from ${fmt(r.used)} frame${r.used === 1 ? "" : "s"}.${U.length ? ` ${U.length} row${U.length === 1 ? "" : "s"} not sure: pick below.` : ""}`;
    } catch(e){ st.textContent = "Couldn't read that file" + (e.message === "video" ? ": this browser can't play that video format (try Chrome or Edge, or an .mp4/.webm)." : ".") }
    finally { $("#qlbar").hidden = true }
  }
  // live: the QUEST window read straight off a shared screen (02-screen.js), 4 frames a second like a recording; what's
  // read is applied every second (no Apply step), the names seen in the latest frame shown as you scroll
  let LV = null;
  async function live(){
    if (LV) return endLive();
    const st = $("#qlstat"), base = snap();
    LV = {rd: reader(), frames: 0, used: 0, base, t: 0, n: 0};
    $("#qllive").textContent = "Stop reading";
    const scr = await shareScreen({ms: 250, fps: 10, onFrame: liveFrame, onEnd: endLive});
    if (typeof scr === "string"){ LV = null; $("#qllive").textContent = "Read my screen"; st.textContent = scr; return }
    if (!LV){ scr.stop(); return }
    LV.scr = scr; step();
    st.textContent = "Sharing. Open the QUEST window on Completed, open each category and scroll slowly to its end, then the same on In Progress.";
  }
  function liveFrame(f){
    const L = LV; if (!L) return;
    const fr = readFrame({width: f.w, height: f.h, data: f.d}); L.frames++;
    if (fr && !fr.tab && !L.rd.tab){ $("#qlnow").innerHTML = `<span class="sub">Quest list found, but not its tabs: keep Available / In Progress / Completed in view so it knows which state the quests are in.</span>`; L.rd.add(fr); return }
    if (!L.rd.add(fr)) return; L.used++;
    const tab = fr.tab || L.tab || "done"; L.tab = tab;
    const now = L.rd.last.filter(([, m]) => m.sure && m.ln).map(([, m]) => m.ln);
    $("#qlnow").innerHTML = `<span class="sub">${tab === "prog" ? "In Progress" : tab === "avail" ? "Available (not needed)" : "Completed"} tab, this frame:</span> ${now.length ? [...new Set(now)].map(n => `<span class="pill">${esc(n)}</span>`).join("") : "<span class='sub'>no rows read</span>"}`;
    if (Date.now() - L.t < 1000) return; L.t = Date.now();
    liveApply();
  }
  function liveApply(){
    const L = LV, r = settle(L.rd, L.frames, L.used), n = r.done.length + Object.keys(r.prog).length;
    if (n === L.n && r.unsure.length === L.u) return; L.n = n; L.u = r.unsure.length;
    apply(L.base, r); seen(L.base, "Read so far:");
    $("#qlstat").textContent = `Reading… ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in progress so far.`;
  }
  function endLive(){
    const L = LV; if (!L) return; LV = null; L.scr?.stop();
    $("#qllive").textContent = "Read my screen"; $("#qlnow").innerHTML = "";
    if (!L.scr) return;
    LV = L; L.n = -1; liveApply(); LV = null;
    const r = settle(L.rd, L.frames, L.used);
    if (!r.done.length && !Object.keys(r.prog).length && !U.length){ if (hist.length) hist.pop(); $("#qlstat").textContent = L.frames ? "Stopped. No quest window was seen: share the game window and open QUEST with a category open." : "Stopped."; return }
    if (!Object.keys(r.prog).length && view === "prog"){ view = "open"; drawList() }
    $("#qlstat").textContent = `Read ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in-progress quests from ${fmt(r.used)} frame${r.used === 1 ? "" : "s"}.${U.length ? ` ${U.length} row${U.length === 1 ? "" : "s"} not sure: pick below.` : ""} Wrong one? Undo, or Not done on its row.`;
  }
  $("#qllive").addEventListener("click", live);
  addEventListener("pagehide", () => LV && endLive());
  const dz = $("#qldrop");
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over") });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("over"); handle(e.dataTransfer.files) });
  $("#qlfile").addEventListener("change", e => { handle(e.target.files); e.target.value = "" });
  document.addEventListener("paste", e => { if (page.hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); handle(f) } });
  let shown = false; const show = () => { if (!shown && !page.hidden){ shown = true; fillFrom(); redraw() } };
  new MutationObserver(show).observe(page, {attributes: true, attributeFilter: ["hidden"]}); show();
  return {readFrame, reader, settle, matchLine, matchBar, readFiles, plan, status, S, handle, redraw, rend, l1, dtw, setUnsure: l => { setUnsure(l); redraw() }, get unsure(){ return U }, liveFrame: f => { if (!LV){ LV = {rd: reader(), frames: 0, used: 0, base: snap(), t: 0, n: 0, scr: {stop(){}}}; step() } liveFrame(f) }, endLive, undo, redo};
})();
window.QLOG = QLOG;
