// node tests/ocr_bench.js — the P1-6 accuracy gate for the neural text reader (core/ocrmodel.js +
// onnxruntime-node + models/text-recognition.onnx, CC BY-SA 4.0, see models/NOTICE.md).
//
// Replicates the production path exactly: shopread cuts a line crop -> toPng bytes -> (main process)
// app/png.js decodes -> core/ocrmodel upscale(f) lands the line at 4x -> the model reads it. The gate
// compares against what the pixels say (the truths shop.test.js records) and against what Tesseract
// read on this same fixture (recorded there, 2026-10-31) — the engine swap must be no worse on both.
// Exit 0 = the neural reader keeps the shop rows; exit 1 = flip the routing back (app/main.js "ocr").
//
// Not part of `npm test` (it runs the 9.7 MB model, which CI should not do twice); CI wiring follows
// once this is green on the release runner. Minerva's own NEXON-frame samples are a local-only extra:
// they ship nowhere (NEXON frames), so this gate stands on our fixture alone.
const path = require("path"), fs = require("fs"), zlib = require("zlib");
const readPng = require("./cv_util.js"), decodePng = require("../app/png.js");
const S = require("../core/shopread.js"), M0 = require("../core/ocrmodel.js"), OM = M0.createOcrModel();

/* PNG encoder (RGBA, filter 0) — what the renderer's canvas toDataURL hands the ocr IPC. */
const CRC = (() => { if (zlib.crc32) return b => zlib.crc32(b);
  const T = []; for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0 }
  return b => { let c = 0xffffffff; for (const v of b) c = T[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 } })();
function toPng(c){
  const stride = c.w * 4 + 1, raw = Buffer.alloc(stride * c.h);
  for (let y = 0; y < c.h; y++){ raw[y * stride] = 0; raw.set(Buffer.from(c.d.buffer, c.d.byteOffset + y * c.w * 4, c.w * 4), y * stride + 1) }
  const w = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, "latin1"); d.copy(b, 8); b.writeUInt32BE(CRC(Buffer.concat([Buffer.from(t, "latin1"), d])), 8 + d.length); return b };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4); ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    w("IHDR", ihdr), w("IDAT", zlib.deflateSync(raw, {level: 6})), w("IEND", Buffer.alloc(0))]);
}

/* The main process's neural read of one crop: PNG bytes in, {text, conf, ms} out. */
const bench = {sess: null, ort: null};
async function neuralRead(crop){
  bench.ort = bench.ort || require("onnxruntime-node");
  bench.sess = bench.sess || await bench.ort.InferenceSession.create(path.join(__dirname, "..", "models", "text-recognition.onnx"), {executionProviders: ["cpu"], graphOptimizationLevel: "all"});
  const img = decodePng(toPng(crop));
  const f = Math.max(1, Math.round(4 / (crop.up || 4)));
  const up = f > 1 ? M0.upscale(img, f) : img;
  const t0 = process.hrtime.bigint();
  const [r] = await OM.readLines([up], {run: async (data, shape) => {
    const o = (await bench.sess.run({line_image: new bench.ort.Tensor("float32", data, shape)})).chars;
    return {data: o.data, seq: o.dims[0], classes: o.dims[2]};
  }}, {});
  return {...r, ms: Number(process.hrtime.bigint() - t0) / 1e6};
}

(async () => {
  const img = readPng(path.join(__dirname, "frames-shop", "own-shop.png"));
  const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app", "gamedata.json"), "utf8"));
  const NAMES = Object.entries(G.items).map(([id, it]) => [id, it.n]);
  const NAME = ["Vaulter 2000", "Red Viper", "Black Knucklevest", "Cutlus", "Mithril Pole Arm", "Star Earrings"];
  const PRICE = [[1, 34000], [1, 14067], [1, 9001], [1, 9001], [1, 15067], [1, 4067]];
  const REC = ["Yaulter 2000", "1 for 34,000 mesos", "1 for 34 000 mesos", "Red Viper", "1 for 14,067 mesos", "1 for 14 067 mesos",
    "Black lkknucklevest", "1 for 9,001 mesos", "1 for 9,001 mesos", "Cutlus", "1 for 9,001 mesos", "1 for 9,001 mesos",
    "Mithril Pale Arm", "1 for 15,067 mesos", "1 for 15 067 mesos", "Star Earrings", "1 for 4 067 mesos", "1 for 4 067 mesos"];

  const rows = S.findRows(img, 2);
  if (rows.length !== 6){ console.error("fixture broken: expected 6 rows"); process.exit(2) }
  const crops = [], kind = [];
  for (const r of rows){ const c = S.cut(img, r.x0, r.top + 5 * 2, r.x1, r.top + 20 * 2, 0.5, 4); c.tag = "shopName"; c.up = 4; crops.push(c); kind.push("name") }
  for (const r of rows){ const p = S.cut(img, r.x0, r.top + 22 * 2, r.x1, r.top + 37 * 2, 0.5, 4); p.tag = "shopPrice"; p.up = 4; crops.push(p); kind.push("price1") }
  for (const r of rows){ const p = S.cut(img, r.x0, r.top + 22 * 2, r.x1, r.top + 37 * 2, 0.6, 4); p.tag = "shopPrice"; p.up = 4; crops.push(p); kind.push("price2") }

  // neural reads through the production path (the title crop is deliberately absent: it stays on Tesseract)
  const t0 = Date.now();
  const reads = [];
  for (const c of crops) reads.push(await neuralRead(c));
  const wall = Date.now() - t0;

  // what the downstream parsers do with each engine's text — the only thing that matters
  const who = t => { const m = S.matchName(t, NAMES); return m.items[0] ? m.items[0].name : null };
  const priceOf = t => { const p = S.parseOffer(t); return p ? [p.qty, p.price] : null };
  const nameHits = texts => texts.reduce((a, t, i) => a + (kind[i] === "name" && who(t) === NAME[i] ? 1 : 0), 0);
  const priceHits = (texts, k) => texts.reduce((a, t, i) => { const p = priceOf(t); return a + (kind[i] === k && p && p[0] === PRICE[i % 6][0] && p[1] === PRICE[i % 6][1] ? 1 : 0) }, 0);

  // Tesseract reference: its recorded readings of these very crops, through the same parsers
  const recNames = NAME.map((_, i) => REC[i * 3]);
  const recP1 = NAME.map((_, i) => REC[i * 3 + 1]), recP2 = NAME.map((_, i) => REC[i * 3 + 2]);
  const tNames = nameHits(recNames);
  const tP1 = recP1.reduce((a, t, i) => { const p = priceOf(t); return a + (p && p[0] === PRICE[i][0] && p[1] === PRICE[i][1] ? 1 : 0) }, 0);
  const tP2 = recP2.reduce((a, t, i) => { const p = priceOf(t); return a + (p && p[0] === PRICE[i][0] && p[1] === PRICE[i][1] ? 1 : 0) }, 0);

  const nNames = nameHits(reads.map(r => r.text));
  const nP1 = priceHits(reads.map(r => r.text), "price1"), nP2 = priceHits(reads.map(r => r.text), "price2");
  const sure = PRICE.filter((_, i) => { const a = priceOf(reads[6 + i].text), b = priceOf(reads[12 + i].text); return a && b && a[0] === b[0] && a[1] === b[1] }).length;
  const nms = reads.map(r => r.ms).sort((a, b) => a - b), med = nms[nms.length >> 1];

  console.log("neural reader (production path, own-shop fixture)");
  NAME.forEach((n, i) => console.log(`  name ${i + 1}: ${JSON.stringify(reads[i].text)} -> ${who(reads[i].text) || "MISS"} (want ${n})`));
  PRICE.forEach((p, i) => console.log(`  price ${i + 1}: ${JSON.stringify(reads[6 + i].text)} -> ${JSON.stringify(priceOf(reads[6 + i].text))} | cut2 ${JSON.stringify(priceOf(reads[12 + i].text))} (want ${p[1]})`));
  console.log(`\n  names via matchName:        neural ${nNames}/6 | tesseract(recorded) ${tNames}/6`);
  console.log(`  prices via parseOffer:      neural cut1 ${nP1}/6, cut2 ${nP2}/6, two-cut agreement ${sure}/6 | tesseract(recorded) ${tP1}/6 and ${tP2}/6`);
  console.log(`  speed:                      neural median ${med.toFixed(1)} ms/line (${(wall / crops.length).toFixed(0)} ms/crop wall) | tesseract ~90 ms/line (recorded)`);
  console.log(`  title bar:                  unchanged — Tesseract reads it (seller IGN must not be wrong)`);

  const gate = nNames >= tNames && nP1 === 6 && nP2 === 6 && sure === 6 && med < 45;
  console.log(`\ngate: ${gate ? "PASS — the neural reader keeps the shop rows" : "FAIL — flip the routing in app/main.js back to Tesseract"}`);
  process.exit(gate ? 0 : 1);
})().catch(e => { console.error("FAIL", e); process.exit(1) });
