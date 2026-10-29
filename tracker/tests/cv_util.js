// Minimal PNG -> RGBA decoder for the CV tests and benchmark (8-bit RGB/RGBA, not interlaced; no dependencies).
const zlib = require("zlib"), fs = require("fs");
module.exports = function readPng(file){
  const b = fs.readFileSync(file); let o = 8, w, h, ct, idat = [];
  while (o < b.length){ const n = b.readUInt32BE(o), t = b.toString("latin1", o + 4, o + 8), d = b.subarray(o + 8, o + 8 + n);
    if (t === "IHDR"){ w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error("8-bit non-interlaced PNG only") }
    else if (t === "IDAT") idat.push(d); o += 12 + n }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error("RGB/RGBA only");
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, out = Buffer.alloc(w * h * 4), cur = Buffer.alloc(st), prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++){
    const f = raw[y * (st + 1)]; raw.copy(cur, 0, y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++){
      const a = i >= bpp ? cur[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      cur[i] = (cur[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? u : c)) & 255;
    }
    for (let x = 0; x < w; x++){ const q = (y * w + x) * 4; out[q] = cur[x * bpp]; out[q + 1] = cur[x * bpp + 1]; out[q + 2] = cur[x * bpp + 2]; out[q + 3] = bpp === 4 ? cur[x * bpp + 3] : 255 }
    cur.copy(prev);
  }
  return {w, h, d: new Uint8ClampedArray(out.buffer, out.byteOffset, out.length)};
};
