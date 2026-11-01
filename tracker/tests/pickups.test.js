// Pickup log tracker (readers.js makePickupTracker / readBand): identical repeat lines are counted, a smeared digit
// is outvoted, and reading just the band gives the same lines as reading the whole frame. Lines are drawn from the
// real font, bottom-anchored 14 px apart like the game's stack; no frames needed.
const assert = require("assert");
const R = require("../app/readers.js");
const G = require("../app/gamedata.json");
const shapes = {"1": ["00100","01100","00100","00100","00100","00100","00100","00100","01110"],
  "5": ["11110","10000","10000","11110","00001","00001","00001","10001","01110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010","00010","00010"],
  "0": ["01110","10001","10011","10101","11001","10001","10001","10001","01110"]};
const trim = rows => { const h = rows.length, w = rows[0].length; let x0 = w, x1 = -1, y0 = h, y1 = -1;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "1"){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } }));
  return {w: x1 - x0 + 1, h: y1 - y0 + 1, bits: rows.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)).join("")}};
R.addGlyphs(Object.entries(shapes).map(([ch, rows]) => ({ch, ...trim(rows)})));
const gl = Object.fromEntries(R.msgGlyphs().map(g => [g.ch, g]));
const W = 640, H = 260, RIGHT = 636, Y = [108, 122, 136, 150];   // slot rows, top to bottom (the newest sits at the bottom)
const EXP = n => `You received EXP (+${n})`, MESO = "You have gained mesos (+40)";
// a frame with the given lines at the bottom slots; lum = brightness of each line (older lines are dimmer)
function frame(lines){
  const im = {w: W, h: H, d: new Uint8ClampedArray(W * H * 4), k: 1};
  lines.forEach(({text, lum = 255}, i) => {
    const sy = Y[Y.length - lines.length + i]; let x = RIGHT;
    for (let c = text.length - 1; c >= 0; c--){
      if (text[c] === " "){ x -= 5; continue }
      const g = gl[text[c]]; if (!g) throw new Error("no glyph " + text[c]);
      x -= g.w;
      for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) if (g.bits[gy * g.w + gx] === "1"){ const o = ((sy + gy) * W + x + gx) * 4; im.d[o] = im.d[o + 1] = im.d[o + 2] = lum }
      x -= 1;
    }
  });
  return im;
}
const run = looks => {   // looks: frames, 100 ms apart -> the events the tracker settles on
  const tr = R.makePickupTracker(), out = [];
  looks.forEach((im, i) => out.push(...tr.step(R.readPickups(im, null, true), 1e6 + i * 100)));
  out.push(...tr.age(1e6 + looks.length * 100 + 900));
  return out.map(p => p.event.type + ":" + (p.event.gain ?? p.event.amount));
};
const rep = (im, n) => Array(n).fill(im);

// one line, looked at four times: counted once
assert.deepStrictEqual(run(rep(frame([{text: EXP(15)}]), 4)), ["exp:15"]);
// the same line arrives twice running (the stack grows upward): both count (the old text-equality shift counted one)
assert.deepStrictEqual(run([...rep(frame([{text: EXP(15)}]), 3), ...rep(frame([{text: EXP(15)}, {text: EXP(15)}]), 4)]), ["exp:15", "exp:15"]);
// a third identical line, with an unrelated line above
assert.deepStrictEqual(run([...rep(frame([{text: MESO}, {text: EXP(15)}]), 3), ...rep(frame([{text: MESO}, {text: EXP(15)}, {text: EXP(15)}]), 4)]), ["meso:40", "exp:15", "exp:15"]);
// a full stack of identical lines whose bottom one is brand new: the stack looks the same, but only the new line is bright
{ const old = frame([{text: EXP(15), lum: 170}, {text: EXP(15), lum: 190}, {text: EXP(15), lum: 210}]);
  const now = frame([{text: EXP(15), lum: 180}, {text: EXP(15), lum: 200}, {text: EXP(15), lum: 255}]);
  assert.deepStrictEqual(run([...rep(old, 4), ...rep(now, 4)]), ["exp:15", "exp:15", "exp:15", "exp:15"], "3 on screen at first + 1 new") }
// a stack that did not change is not counted again (old lines never re-count)
assert.deepStrictEqual(run(rep(frame([{text: MESO}, {text: EXP(15)}, {text: EXP(14)}]), 8)), ["meso:40", "exp:15", "exp:14"]);
// one smeared look of a new line (+14 for +15) is outvoted by the looks after it
assert.deepStrictEqual(run([frame([{text: MESO}]), frame([{text: MESO}]), frame([{text: MESO}, {text: EXP(14)}]), ...rep(frame([{text: MESO}, {text: EXP(15)}]), 3)]), ["meso:40", "exp:15"]);
// scrolling past: a line that moved up one slot is the same line
assert.deepStrictEqual(run([...rep(frame([{text: EXP(15)}]), 3), ...rep(frame([{text: EXP(15)}, {text: MESO}]), 3)]), ["exp:15", "meso:40"]);

// reading only the band (bandRect) gives the lines the whole frame gives, at the same y
{ const im = frame([{text: MESO}, {text: EXP(15)}]), r = R.bandRect(W, H);
  assert.ok(r && r.x0 === W - 430 && r.y0 === Math.floor(H / 3) && r.y0 + r.h === H - 60, "band rect = what readLines looks at");
  const d = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++){ const i = ((r.y0 + y) * W + r.x0 + x) * 4, o = (y * r.w + x) * 4; d[o] = im.d[i]; d[o + 1] = im.d[i + 1]; d[o + 2] = im.d[i + 2]; d[o + 3] = 255 }
  const key = ps => ps.map(p => p.y + ":" + p.text);
  assert.deepStrictEqual(key(R.readPickups({w: r.w, h: r.h, d}, {x0: r.x0, y0: r.y0})), key(R.readPickups(im)), "same lines, same y");
  assert.ok(R.readPickups(im).length === 2) }

// end to end through the readers: band looks only, a burst of identical lines
{ const rd = R.createReaders(G, null), r = R.bandRect(W, H), cut = im => { const d = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++){ const i = ((r.y0 + y) * W + r.x0 + x) * 4, o = (y * r.w + x) * 4; d[o] = im.d[i]; d[o + 1] = im.d[i + 1]; d[o + 2] = im.d[i + 2]; d[o + 3] = 255 }
    return {w: r.w, h: r.h, d, k: 1, crop: {x0: r.x0, y0: r.y0}} };
  const seq = [...rep(frame([{text: EXP(15)}]), 3), ...rep(frame([{text: EXP(15)}, {text: EXP(15)}]), 3), ...rep(frame([{text: EXP(15)}, {text: EXP(15)}, {text: EXP(15)}]), 3)];
  const ev = []; seq.forEach((im, i) => ev.push(...rd.readBand(cut(im), 1e6 + i * 100))); ev.push(...rd.readBand(cut(frame([])), 1e6 + 5000));
  assert.deepStrictEqual(ev.filter(e => e.type === "exp").map(e => e.gain), [15, 15, 15], "three identical lines, read from the band alone");
  // an unchanged band only ages what waits; it never reads (or counts) anything twice
  const again = rd.readBand(cut(frame([])), 1e6 + 6000); assert.deepStrictEqual(again, []);
  // the whole-frame read with noPick leaves pickups to the band
  const rd2 = R.createReaders(G, null), im = frame([{text: EXP(15)}]);
  for (let i = 0; i < 4; i++) assert.ok(!rd2.readFrame(im, 1e6 + i * 500, im, {noPick: true}).some(e => e.type === "exp"), "noPick: no pickups from the whole frame");
}
console.log("pickups ok");
