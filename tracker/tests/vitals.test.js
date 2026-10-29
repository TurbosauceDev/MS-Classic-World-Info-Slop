// node tests/vitals.test.js — HP / MP boxes of the status bar ("HP [464/708]  MP [196/567]") read from real frames (Danny's
// captures), the two-reading rule, and that the EXP "[64.09%]" box or a lone box is never taken for them.
const assert = require("assert"), path = require("path"), R = require("../app/readers.js"), png = require("./cv_util.js");
const G = require("../app/gamedata.json");
const dir = f => path.join(__dirname, f);
const WANT = [   // [file, hp, mp] read off the frames by eye (frame-000: 464/708 196/567 checked against the picture)
  ["frames/frame-000.png", [464, 708], [196, 567]], ["frames/frame-006.png", [368, 708], [303, 567]],
  ["frames/frame-042.png", [485, 708], [282, 567]], ["frames/frame-046.png", [485, 708], [213, 567]],
  ["frames-inv/statusbar-native-1440.png", [549, 823], [618, 652]],
];
for (const [f, hp, mp] of WANT){ const v = R.readVitalsAny(png(dir(f))); assert(v, f + " read"); assert.deepStrictEqual([v.hp, v.mp], [hp, mp], f) }
// not HP/MP: the EXP bar crops (a "[2.51%]" box has no slash), and a crop with only one of the two boxes (could be either)
for (const f of ["frames-kpq/bar-1601.png", "frames-beanguri/exp_full-1920x1080.png", "frames-beanguri/exp_win-1280x720.png"]) assert.strictEqual(R.readVitalsAny(png(dir(f))), null, f + " is no HP/MP");
// through readFrame: a "vitals" event after the same reading twice, none before, none for a repeat, one for a change
{ const img = R.native(png(dir("frames/frame-000.png"))), rd = R.createReaders(G), ev = [];
  for (const t of [0, 500, 1000, 1500]) ev.push(...rd.readFrame(img, t).filter(e => e.type === "vitals"));
  assert.strictEqual(ev.length, 1, "one event for a steady reading, got " + ev.length); assert.deepStrictEqual([ev[0].hp, ev[0].mp, ev[0].t], [[464, 708], [196, 567], 500]);
  const img2 = R.native(png(dir("frames/frame-006.png")));
  const e2 = [2000, 2500, 3000].flatMap(t => rd.readFrame(img2, t).filter(e => e.type === "vitals")); assert.strictEqual(e2.length, 1); assert.deepStrictEqual(e2[0].hp, [368, 708]); }
console.log("vitals tests ok");
