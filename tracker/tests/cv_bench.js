// node tests/cv_bench.js [png] — what one captured frame costs the screen readers, per stage (ms, node, median of N).
// Default: Danny's 2560x1440 capture (tests/frames/frame-000.png, playfield blanked, so scenery cost is NOT included).
const path = require("path"), R = require("../app/readers.js"), G = require("../app/gamedata.json"), readPng = require("./cv_util.js");
const full = readPng(process.argv[2] || path.join(__dirname, "frames/frame-000.png"));
function time(fn, n = 15){
  fn(); const t = [];
  for (let i = 0; i < n; i++){ const s = process.hrtime.bigint(); fn(); t.push(Number(process.hrtime.bigint() - s) / 1e6) }
  return t.sort((a, b) => a - b)[n >> 1];
}
function bench(){
  const img = R.native(full), rd = R.createReaders(G, null), rows = [];
  const add = (name, ms) => rows.push([name, ms]);
  add("scale search (every 20th frame)", time(() => R.native(full), 5));
  add("shrink to game pixels", time(() => R.native(full, true)));
  add("EXP bar", time(() => R.readBar(img)));
  add("KPQ clock", time(() => R.readKpqTimer(img)));
  add("pickup lines", time(() => R.readPickups(img)));
  add("party bars", time(() => R.readParty(img)));
  add("potion/use counts", time(() => R.readCounts(img)));
  add("meso total, whole frame (every 10 s)", time(() => R.readMesoTotal(img)));
  add("map title crop", time(() => R.mapTextCrop(img)));
  add("chat crop (death/box checks only)", time(() => R.chatCrop(img)));
  let t = 0; const small = {...img};
  add("whole frame read (steady state)", time(() => R.work(rd, {frame: small, t: t += 500, want: {}})));
  // the pickup band alone (what runs ~10 times a second): cutting it out of the game-size picture, then reading it
  const r = R.bandRect(img.w, img.h), cutBand = () => { const d = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) d.set(img.d.subarray(((r.y0 + y) * img.w + r.x0) * 4, ((r.y0 + y) * img.w + r.x0 + r.w) * 4), y * r.w * 4);
    return {w: r.w, h: r.h, d, k: img.k, crop: {x0: r.x0, y0: r.y0}} };
  add("band: cut from the picture", time(cutBand));
  const rdb = R.createReaders(G, null), bd = cutBand(); let tb = 0;
  add("band: read, band changed", time(() => { bd.d[3] = (bd.d[3] + 1) & 255; rdb.readBand(bd, tb += 100) }, 40));
  add("band: read, band unchanged", time(() => rdb.readBand(bd, tb += 100), 40));
  const rd2 = R.createReaders(G, null); rd2.memoStats.off = true; let t2 = 0;
  add("  same, region memo off", time(() => rd2.readFrame(img, t2 += 500, img), 40));
  const rd3 = R.createReaders(G, null); let t3 = 0;
  add("  same, region memo on", time(() => rd3.readFrame(img, t3 += 500, img), 40));
  return {img, rows};
}
module.exports = {bench, full};
if (require.main === module){
  const {img, rows} = bench();
  console.log(`frame ${full.w}x${full.h} -> game pixels ${img.w}x${img.h} (x${img.k})`);
  for (const [n, ms] of rows) console.log(n.padEnd(40), ms.toFixed(2).padStart(7), "ms");
  const per = rows.find(r => r[0].startsWith("whole frame"))[1];
  const bandMs = rows.find(r => r[0].startsWith("band: read, band changed"))[1], cutMs = rows.find(r => r[0].startsWith("band: cut"))[1];
  console.log(`\nband at 10 a second: ${((bandMs + cutMs) * 10 / 10).toFixed(1)}% of one core (worst case, band changing every look); whole-frame pickup reading at 2 a second: ${(rows.find(r => r[0] === "pickup lines")[1] * 2 / 10).toFixed(1)}%`);
  console.log(`at 2 reads a second: ${(per * 2 / 10).toFixed(1)}% of one core (reading only; capture and OCR are extra)`);
}
