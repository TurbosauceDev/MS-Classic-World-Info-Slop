/* Chat box reader (pure, Node-tested; runs in the reader worker, parse() also in the window). The game paints every chat
   channel in its own flat colour (Danny's screenshots, 2026-10-29): all chat white, party pink (255,153,204), party notices
   (255,175,175), buddy orange (255,153,0), whispers green (0,255,0), [Notice] yellow (255,255,0). Megaphones are told by the
   row's background instead: their colour starts at the box edge, left of the timestamp, where a normal line is black.
   Red errors (255,0,0) are our estimate: no red-error sample yet (docs/ai/tracker.md, Chat windows).

   scan(img) -> {groups: [{cls, hash, bands, mega}], L, pitch}: one pass over the chat region counts each class per pixel row,
   finds the text lines (bands of rows with ink), joins wrapped lines (indented, no timestamp) to the line above and drops
   megaphone rows. A line's fingerprint comes from those row counts, not from OCR, so a scrolled line keeps its hash.
   newGroups(prev, groups) -> the groups not on screen last time (multiset diff: the same text twice is two lines).
   cropFor(img, group) -> black-on-white 2x picture of one message for OCR (only the class colour is ink).
   Memory: a few typed arrays the size of the region's rows; the picture itself is never copied. */
(function (root){
  const CL = [["party", 255, 153, 204], ["partysys", 255, 175, 175], ["buddy", 255, 153, 0], ["whisper", 0, 255, 0], ["notice", 255, 255, 0], ["all", 255, 255, 255], ["error", 255, 0, 0]];
  const NC = CL.length, TOL = 14;
  const NAMES = CL.map(c => c[0]);
  const AREA = {x: 0, y: 0.35, w: 0.6, h: 0.63};   // default chat spot: lower left (fractions of the game picture)
  function cls(r, g, b){
    for (let c = 0; c < NC; c++){ const k = CL[c]; if (Math.abs(r - k[1]) <= TOL && Math.abs(g - k[2]) <= TOL && Math.abs(b - k[3]) <= TOL) return c }
    return -1;
  }
  function region(img, area){
    const a = area || AREA, x0 = Math.max(0, Math.floor(img.w * a.x)), y0 = Math.max(0, Math.floor(img.h * a.y));
    return {x0, y0, x1: Math.min(img.w, Math.ceil(img.w * (a.x + a.w))), y1: Math.min(img.h, Math.ceil(img.h * (a.y + a.h)))};
  }
  const tint = (r, g, b) => r > 190 && g > 140 && b < 90 ? "gold" : g > 170 && b > 140 && r < 130 ? "teal" : r > 170 && b > 150 && g < 175 ? "pink" : b > r + 15 && b > 140 ? "blue" : r > 110 && g < 110 && b < 110 ? "red" : "mega";
  function scan(img, area){
    const {d, w} = img, R = region(img, area), rows = R.y1 - R.y0, W = R.x1 - R.x0;
    if (rows < 8 || W < 40) return {groups: [], L: 0, pitch: 0};
    const cnt = new Uint16Array(rows * NC), sx = new Int32Array(rows * NC), tot = new Uint16Array(rows), left = new Int32Array(rows).fill(1 << 30), right = new Int32Array(rows).fill(-1);
    for (let y = 0; y < rows; y++){
      let o = ((R.y0 + y) * w + R.x0) * 4;
      for (let x = 0; x < W; x++, o += 4){
        const r = d[o], g = d[o + 1];
        if (r < 241 && g < 241) continue;   // every text colour has a 255 channel
        const c = cls(r, g, d[o + 2]);
        if (c < 0) continue;
        cnt[y * NC + c]++; sx[y * NC + c] += x; tot[y]++;
        if (x < left[y]) left[y] = x;
        if (x > right[y]) right[y] = x;
      }
    }
    // bands: runs of rows with ink (two or more pixels), at least 5 rows tall
    const bands = [];
    for (let y = 0; y < rows;){
      if (tot[y] < 2){ y++; continue }
      let y1 = y; while (y1 + 1 < rows && tot[y1 + 1] >= 2) y1++;
      let n = 0, l = 1 << 30, r = -1; const per = new Array(NC).fill(0);
      for (let k = y; k <= y1; k++){ n += tot[k]; if (left[k] < l) l = left[k]; if (right[k] > r) r = right[k]; for (let c = 0; c < NC; c++) per[c] += cnt[k * NC + c] }
      if (y1 - y + 1 >= 5 && n >= 12){
        let best = 0; for (let c = 1; c < NC; c++) if (per[c] > per[best]) best = c;
        bands.push({y0: y, y1, l, r, c: best, n});
      }
      y = y1 + 1;
    }
    if (!bands.length) return {groups: [], L: 0, pitch: 0};
    // text lines are all about one height: frame edges and half-hidden lines are shorter
    const hs = bands.map(b => b.y1 - b.y0 + 1).sort((a, b) => a - b), med = hs[hs.length >> 1];
    for (let i = bands.length - 1; i >= 0; i--) if (bands[i].y1 - bands[i].y0 + 1 < med * 0.6) bands.splice(i, 1);
    // the chat box's text edge: where most lines start (every line begins with its [HH:MM] stamp)
    const votes = new Map(); for (const b of bands) votes.set(b.l, (votes.get(b.l) || 0) + 1);
    let L = bands[0].l, top = 0; for (const [l, n] of votes) if (n > top || n === top && l < L){ L = l; top = n }
    const gaps = []; for (let i = 1; i < bands.length; i++) if (Math.abs(bands[i].l - L) <= 2 && Math.abs(bands[i - 1].l - L) <= 2) gaps.push(bands[i].y0 - bands[i - 1].y0);
    const pitch = gaps.length ? gaps.sort((a, b) => a - b)[gaps.length >> 1] : Math.round((bands[0].y1 - bands[0].y0 + 1) * 1.35);
    // megaphone rows: their colour starts left of the stamp, where a normal line is black. Tested for every band, so a
    // megaphone's icons and wrapped text never pass for a message
    const lit = b => {
      const my = R.y0 + ((b.y0 + b.y1) >> 1); let n = 0, lr = 0, lg = 0, lb = 0;
      for (let k = 1; k <= 3; k++){ const gx = R.x0 + L - k; if (gx < 0) continue; const o = (my * w + gx) * 4; if (d[o] + d[o + 1] + d[o + 2] > 120){ n++; lr = d[o]; lg = d[o + 1]; lb = d[o + 2] } }
      return n >= 2 ? tint(lr, lg, lb) : null;
    };
    const groups = []; let cur = null, prev = null;
    for (const b of bands){
      const off = b.l - L, near = prev && b.y0 - prev.y0 <= pitch * 1.5, m = lit(b);
      if (m){ if (!(cur && cur.mega && near)) groups.push(cur = {cls: "mega", bands: [], mega: m, hash: ""}); cur.bands.push(b) }
      else if (off >= Math.max(4, pitch * 0.4)){ if (cur && !cur.mega && near) cur.bands.push(b); else cur = null }   // a wrapped line joins the one above; at the top edge it's an orphan and is dropped
      else if (Math.abs(off) > 2) cur = null;   // not on the chat's text edge: scenery
      else groups.push(cur = {cls: NAMES[b.c], bands: [b], mega: null, hash: ""});
      prev = b;
    }
    for (const g of groups){
      if (g.mega) continue;
      const c = NAMES.indexOf(g.cls); let a = 0x811c9dc5, b2 = 0x9e3779b9;
      for (const b of g.bands) for (let y = b.y0; y <= b.y1; y++){
        const n = cnt[y * NC + c], s = sx[y * NC + c] - n * L;
        a = Math.imul(a ^ n, 16777619) ^ s; b2 = Math.imul(b2 + s, 0x85ebca6b) ^ (b2 >>> 13) ^ n;
      }
      g.hash = g.bands.length + ":" + (a >>> 0).toString(36) + (b2 >>> 0).toString(36);
    }
    return {groups, L, pitch, R};
  }
  // groups on screen now that weren't last time (prev: Map hash -> count of the previous frame; null = first look, nothing is new)
  function newGroups(prev, groups){
    const now = new Map(), out = [];
    for (const g of groups){
      if (g.mega || !g.hash) continue;
      const n = (now.get(g.hash) || 0) + 1; now.set(g.hash, n);
      if (prev && n > (prev.get(g.hash) || 0)) out.push(g);
    }
    return {now, out};
  }
  // one message as an OCR picture: the class colour black on white, doubled (the pixel font reads best at 2x), wrapped lines stacked
  function cropFor(img, g, scan){
    const {d, w} = img, R = scan.R, c = NAMES.indexOf(g.cls), k = CL[c];
    let x1 = 0; for (const b of g.bands) if (b.r > x1) x1 = b.r;
    const z = Math.max(1, Math.min(3, Math.round(28 / (g.bands[0].y1 - g.bands[0].y0 + 1))));   // Tesseract reads best with letters ~25 px tall: small game text is enlarged, big is left alone
    const xa = Math.max(0, scan.L - 1), cw = Math.min(R.x1 - R.x0, x1 + 3) - xa;
    let rows = 0; for (const b of g.bands) rows += b.y1 - b.y0 + 3 + 2;
    const out = new Uint8ClampedArray(cw * z * rows * z * 4).fill(255);
    let oy = 0;
    for (const b of g.bands){
      for (let y = b.y0 - 1; y <= b.y1 + 1; y++, oy++){
        const sy = R.y0 + y; if (sy < 0 || sy >= img.h) continue;
        for (let x = 0; x < cw; x++){
          const o = (sy * w + R.x0 + xa + x) * 4;
          if (Math.abs(d[o] - k[1]) > TOL || Math.abs(d[o + 1] - k[2]) > TOL || Math.abs(d[o + 2] - k[3]) > TOL) continue;
          for (let q = 0; q < z * z; q++){ const p = (((oy * z + (q / z | 0)) * cw * z) + x * z + q % z) * 4; out[p] = out[p + 1] = out[p + 2] = 0 }
        }
      }
      oy += 2;
    }
    return {w: cw * z, h: rows * z, d: out};
  }
  // OCR text -> {who, text, dir?}. "[18:49] Turbow : one moment", buddy "UncleDan() : hi", whispers "Name<< hi" (from) / "Name[Windia-39]>> hi" (to).
  // The pixel font's digits and ":" read badly ("[Ta:42]", ":" as a copyright sign), so the stamp is only cut off, never trusted:
  // the card shows the tracker's own clock. A line that doesn't parse keeps its whole text and no name.
  const STAMP = /^\W{0,3}\[[^\]]{2,7}\]\s*/, NAME = "([A-Za-z0-9]{2,13})";
  function parse(text, cls){
    const s = String(text || "").replace(/\s*\n\s*/g, " ").trim().replace(STAMP, "");
    if (cls === "whisper"){
      const m = new RegExp("^" + NAME + "(?:\\[[^\\]]*\\])?\\s*(<<|<-|\u00ab|>>|=>|==|\u00bb)\\s*(.*)$").exec(s);
      if (m) return {who: m[1], dir: /^(<<|<-|\u00ab)$/.test(m[2]) ? "from" : "to", text: m[3].trim()};
    } else if (cls !== "notice" && cls !== "error" && cls !== "partysys"){
      const m = new RegExp("^" + NAME + "\\W{0,8}?[:\u00a9;]\\s+(.*)$").exec(s);
      if (m) return {who: m[1], text: m[2].trim()};
    }
    return {who: "", text: s};
  }
  const api = {scan, newGroups, cropFor, parse, CLASSES: NAMES, AREA};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindChat = api;
})(typeof window !== "undefined" ? window : globalThis);
