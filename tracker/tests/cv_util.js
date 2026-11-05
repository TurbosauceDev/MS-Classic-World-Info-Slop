// Minimal PNG -> RGBA decoder for the CV tests and benchmark (8-bit RGB/RGBA/gray+alpha, 4/8-bit palette, not interlaced; no dependencies).
// file: a path, or a Buffer (the item icons in gamedata.json are palette PNGs in base64).
const zlib = require("zlib"), fs = require("fs");
module.exports = function readPng(file){
  const b = Buffer.isBuffer(file) ? file : fs.readFileSync(file); let o = 8, w, h, ct, bd, idat = [], plte = null, trns = null;
  while (o < b.length){ const n = b.readUInt32BE(o), t = b.toString("latin1", o + 4, o + 8), d = b.subarray(o + 8, o + 8 + n);
    if (t === "IHDR"){ w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12] || !(bd === 8 || bd === 4 && ct === 3)) throw new Error("8-bit non-interlaced PNG only (4-bit palette too)") }
    else if (t === "PLTE") plte = d; else if (t === "tRNS") trns = d;
    else if (t === "IDAT") idat.push(d); o += 12 + n }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : ct === 3 ? 1 : 0; if (!bpp) throw new Error("RGB/RGBA only");
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = bd === 4 ? Math.ceil(w / 2) : w * bpp, out = Buffer.alloc(w * h * 4), cur = Buffer.alloc(st), prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++){
    const f = raw[y * (st + 1)]; raw.copy(cur, 0, y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++){
      const a = i >= bpp ? cur[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      cur[i] = (cur[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? u : c)) & 255;
    }
    for (let x = 0; x < w; x++){ const q = (y * w + x) * 4;
      if (ct === 3){ const k = bd === 4 ? (cur[x >> 1] >> (x & 1 ? 0 : 4)) & 15 : cur[x]; out[q] = plte[k * 3]; out[q + 1] = plte[k * 3 + 1]; out[q + 2] = plte[k * 3 + 2]; out[q + 3] = trns && k < trns.length ? trns[k] : 255 }
      else if (ct === 4){ out[q] = out[q + 1] = out[q + 2] = cur[x * 2]; out[q + 3] = cur[x * 2 + 1] }
      else { out[q] = cur[x * bpp]; out[q + 1] = cur[x * bpp + 1]; out[q + 2] = cur[x * bpp + 2]; out[q + 3] = bpp === 4 ? cur[x * bpp + 3] : 255 }
    }
    cur.copy(prev);
  }
  return {w, h, d: new Uint8ClampedArray(out.buffer, out.byteOffset, out.length)};
};
// the item pictures of gamedata.json (G.iicons, base64 palette PNGs) as readers.js loadIcons makes them in the window, sorted
// into the tabs the way setInvIcons does: {use: [...], etc: [...], equip: [...]}. Pictures drawn the same share one entry (ids).
module.exports.invIcons = function(G){
  const seen = new Map(), tabOf = {Equipment: "equip", Consumable: "use", Scroll: "use", Etc: "etc"}, byTab = {};
  for (const [id, b64] of Object.entries(G.iicons || {})){
    if (seen.has(b64)){ seen.get(b64).ids.push(id); continue }
    const p = module.exports(Buffer.from(b64, "base64")), ic = {id, ids: [id], w: p.w, h: p.h, d: p.d};
    let n = 0; for (let j = 3; j < ic.d.length; j += 4) if (ic.d[j] >= 250) n++;
    ic.n = n; seen.set(b64, ic);
    const tb = tabOf[G.items[id]?.c]; if (tb) (byTab[tb] ||= []).push(ic);
  }
  return byTab;
};
