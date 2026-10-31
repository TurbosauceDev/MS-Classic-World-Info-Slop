/* core/shopread.js — the merchant shop window as a price list (Shop price overlay, 2026-10-31). Pure: no DOM, no Electron,
   no OCR of its own. Pixels only, like every other reader.

   readShop(img, ocr, opt) -> [{row, top, sold, name, text, qty, price, unit, sure}]
     img: {w, h, d: RGBA bytes} of a frame or a crop that holds the shop's item list, at game-pixel size (what readers.native returns: it carries .k, the shrink factor) or raw with opt.k = the UI scale (2 = Ideal Ratio)
     ocr: async ({w, h, d}) -> text. The caller encodes the pixels for Tesseract (tracker/app/main.js "ocr" handler).
   Each row is the list's 40 px (native) cell: icon, name on the first line, "<qty> for <price> mesos" on the second.
   Geometry measured on Danny's own-shop screenshot (2026-10-31, tests/frames-shop/own-shop.png), 2x UI:
     rows are 80 px apart, split by a 2 px (1 native px) (147,167,189) line; the name line sits 14..35 px below the line and the price line
     48..69 px below it; the text starts 144 px from the frame's left edge of the shop, the icon is left of that.
   Prices are read twice from two different black-and-white cuts of the pixels and only count when both reads agree
   ("sure"): one cut read 9,001 as 8,001 on the fixture, the other read it right.
   Name matching (matchName) is our own: ideas from cpan1995/maplepricechecker (score floors, prefix match for "..." names). */
(function (root){
  const SEP = [147, 167, 189], TOL = 10;
  const near = (d, i, c, t = TOL) => Math.abs(d[i] - c[0]) <= t && Math.abs(d[i + 1] - c[1]) <= t && Math.abs(d[i + 2] - c[2]) <= t;

  // y of every row separator: a horizontal run of the separator colour at least `minRun` px long. -> [{y, x0, x1}]
  function separators(img, k = 2){
    const {w, h, d} = img, minRun = 150 * k, out = [];
    for (let y = 0; y < h; y++){
      let best = {n: 0, x0: 0}, run = 0, s = 0;
      for (let x = 0; x < w; x++){
        if (near(d, (y * w + x) * 4, SEP)){ if (!run) s = x; run++; if (run > best.n) best = {n: run, x0: s} } else run = 0;
      }
      if (best.n >= minRun){
        const last = out[out.length - 1];
        if (last && y - last.y <= k) continue;   // the 2nd pixel row of the same 2 px line
        out.push({y, x0: best.x0, x1: best.x0 + best.n});
      }
    }
    return out;
  }
  // The list's row cells. Window borders have the separator's colour too, so the list is the longest chain of lines that sit
  // exactly one pitch apart. The first row has no separator above it (the frame's edge is), so it comes from the pitch.
  function findRows(img, k = 2){
    const sep = separators(img, k), pitch = 40 * k;
    let list = [];
    for (const s0 of sep){
      const chain = [s0];
      for (const s of sep) if (Math.abs(s.y - chain[chain.length - 1].y - pitch) <= k) chain.push(s);
      if (chain.length > list.length) list = chain;
    }
    if (list.length < 2) return [];
    const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
    const x0 = med(list.map(s => s.x0)), x1 = med(list.map(s => s.x1));
    const tops = list.map(s => s.y + k), d = img.d, bg = y => { const i = y * img.w * 4 + (x0 + 20 * k) * 4; return d[i] > 190 && d[i + 1] > 190 && d[i + 2] > 190 };
    // one row above the first separator when the cell there is list background (not the dark frame), and one more below the last
    if (tops[0] - pitch >= 0 && bg(tops[0] - pitch + 8 * k)) tops.unshift(tops[0] - pitch);
    const dn = tops[tops.length - 1] + pitch;
    if (dn + 37 * k <= img.h && bg(dn + 8 * k)) tops.push(dn);
    return tops.map((top, row) => ({row, top, x0: x0 + 40 * k, x1: x1 - 8 * k}));   // text spans x0..x1 (icon and scrollbar excluded)
  }

  const lum = (d, i) => (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
  // darkest pixel of a box: dark text = on sale, grey text = sold out (the whole row is greyed)
  function darkest(img, x0, y0, x1, y1){
    let m = 255; const {w, d} = img;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ const v = lum(d, (y * w + x) * 4); if (v < m) m = v }
    return m;
  }
  // black text on white, upscaled for Tesseract: `th` places the cut between the box's darkest and lightest pixel
  function cut(img, x0, y0, x1, y1, th, up, margin = 12){
    const {w, d} = img, W = x1 - x0, H = y1 - y0;
    let lo = 255, hi = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ const v = lum(d, (y * w + x) * 4); if (v < lo) lo = v; if (v > hi) hi = v }
    const cutAt = lo + (hi - lo) * th, OW = W * up + margin * 2, OH = H * up + margin * 2, o = new Uint8ClampedArray(OW * OH * 4).fill(255);
    for (let y = 0; y < H * up; y++) for (let x = 0; x < W * up; x++){
      const v = lum(d, ((y0 + (y / up | 0)) * w + x0 + (x / up | 0)) * 4);
      if (v <= cutAt){ const q = ((y + margin) * OW + x + margin) * 4; o[q] = o[q + 1] = o[q + 2] = 0 }
    }
    return {w: OW, h: OH, d: o};
  }
  const CUTS = [{th: 0.5, up: 2}, {th: 0.6, up: 4}];

  // "1 for 14,067 mesos" (and OCR slips around it) -> {qty, price} or null. price is for the whole bundle.
  function parseOffer(text){
    const t = String(text || "").replace(/[|\\]/g, " ").replace(/[Oo](?=[\d,])|(?<=[\d,])[Oo]/g, "0").replace(/(?<=\d)[Il](?=[\d,])/g, "1");
    const m = /(\d[\d,.]*)\s*f[o0]r\s*(\d[\d,. ]*\d|\d)\s*m[e3]s/i.exec(t);
    if (!m) return null;
    const n = s => parseInt(s.replace(/[,.\s]/g, ""), 10);
    const qty = n(m[1]), price = n(m[2]);
    return qty > 0 && price > 0 && qty <= 9999 && price <= 1e10 ? {qty, price} : null;
  }

  function lev(a, b){
    let p = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++){
      const c = [i];
      for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = c;
    }
    return p[b.length];
  }
  const squash = s => String(s).replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
  const ratio = (a, b) => 100 * (1 - lev(a, b) / Math.max(a.length, b.length, 1));
  /* matchName(ocrText, names) -> {truncated, items: [{id, name, score}]}; items = every name within TIE points of the best,
     best first; [] when nothing reaches MIN. names: [[id, name], ...]. A name cut with "..." matches as a prefix (only when
     8+ letters are left, so "Red..." matches nothing), and a whole-name match of EXACT or better beats any prefix match. */
  const MIN = 85, EXACT = 95, TIE = 3, MIN_PREFIX = 8;
  function matchName(ocrText, names){
    let q = squash(String(ocrText).replace(/[|]+\s*$/, "")); const cut = /(\.{2,}|…)\s*$/.test(q);
    q = q.replace(/\s*(\.{2,}|…)\s*$/, "").replace(/^[^a-z0-9]+|[^a-z0-9)']+$/g, "");
    if (q.length < 3) return {truncated: cut, items: []};
    const full = [], pre = [];
    for (const [id, name] of names){
      const n = squash(name), f = ratio(q, n);
      if (f >= MIN) full.push({id, name, score: f});
      if (cut && q.length >= MIN_PREFIX && n.length > q.length){ const p = ratio(q, n.slice(0, q.length)); if (p >= MIN) pre.push({id, name, score: p}) }
    }
    let pool = full.some(c => c.score >= EXACT) || !pre.length ? full : [...full, ...pre];
    pool.sort((a, b) => b.score - a.score);
    if (!pool.length) return {truncated: cut, items: []};
    const top = pool[0].score, seen = new Set(), items = [];
    for (const c of pool){ if (c.score < top - TIE || seen.has(c.name)) continue; seen.add(c.name); items.push(c) }   // the same name twice in the game data: the first id
    return {truncated: cut, items};
  }

  async function readShop(img, ocr, opt = {}){
    const k = img.k ? 1 : opt.k || 2, out = [], m = 2 / k;   // m: a native-size frame (k 1) is upscaled twice as much so Tesseract sees the same size
    for (const r of findRows(img, k)){
      const nameBox = [r.x0, r.top + 5 * k, r.x1, r.top + 20 * k], priceBox = [r.x0, r.top + 22 * k, r.x1, r.top + 37 * k];
      if (r.top + 37 * k > img.h) continue;
      const sold = darkest(img, ...nameBox) > 110;
      const nameText = (await ocr(cut(img, ...nameBox, 0.5, 2 * m))).trim();
      const offers = [];
      for (const c of CUTS) offers.push(parseOffer(await ocr(cut(img, ...priceBox, c.th, c.up * m))));
      const a = offers[0], same = a && offers.every(o => o && o.qty === a.qty && o.price === a.price);
      out.push({row: r.row, top: r.top, sold, text: nameText, name: nameText.replace(/[|\s]+$/, ""), qty: a ? a.qty : null, price: a ? a.price : null,
        unit: a ? a.price / a.qty : null, sure: !!same});
    }
    return out;
  }

  const api = {separators, findRows, cut, parseOffer, matchName, readShop, MIN, EXACT, TIE, MIN_PREFIX};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindShopRead = api;
})(typeof self !== "undefined" ? self : this);
