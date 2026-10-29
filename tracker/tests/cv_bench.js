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
  return {img, rows};
}
module.exports = {bench, full};
if (require.main === module){
  const {img, rows} = bench();
  console.log(`frame ${full.w}x${full.h} -> game pixels ${img.w}x${img.h} (x${img.k})`);
  for (const [n, ms] of rows) console.log(n.padEnd(40), ms.toFixed(2).padStart(7), "ms");
  const per = rows.find(r => r[0].startsWith("whole frame"))[1];
  console.log(`\nat 2 reads a second: ${(per * 2 / 10).toFixed(1)}% of one core (reading only; capture and OCR are extra)`);
}
