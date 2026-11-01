// node tests/feet.test.js — Skill range overlay's range finder (core/feetfind.js): your name tag found from the status bar's
// name on Danny's own screenshot (tests/fixtures/bow-full.png: Lv 30 Hunter Turbow, 2560x1440, UI 2x, world 1.875x), the
// same frame resized to 1080p (smoothed UI), facing from movement + the sprite mirror check, and the skill range core.
const assert = require("assert"), path = require("path");
globalThis.GrindFeet = require("../core/feetfind.js");
const R = require("../app/readers.js"), F = globalThis.GrindFeet, S = require("../core/skillrange.js"), readPng = require("./cv_util.js");
let pass = 0; const ok = (c, m) => { assert(c, m); pass++ };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (±${tol})`);

const full = readPng(path.join(__dirname, "../../tests/fixtures/bow-full.png"));
const img = R.native(full);
ok(img.k === 2, "status bar found at 2x");
const mask = R.nameMask(img);
ok(mask && mask.W === 41 && mask.H === 9, "status bar name cut as a 41x9 mask (Turbow)");

// 1. lock on Danny's screen: feet measured by hand on the frame at (1230, 977.5) = (615, 488.8) on the 2x-shrunk picture
{ const T = F.createTracker(), r = T.step(img, mask, 0);
  ok(r.ok, "locks on the first look");
  near(r.x, 615.5, 1.5, "feet x (the tag's centre)"); near(r.y, 488.8, 1.5, "feet y (12 game px over the text)");
  near(r.r, 1440 / 768 / 2, .01, "scale = world 1.875x over the 2x picture");
  ok(r.score > .8, "clear match " + r.score);
  ok(r.face === 0, "facing unknown until you move");
  // tracking the same frame stays put and is cheap
  const t0 = Date.now(); let r2; for (let i = 1; i <= 10; i++) r2 = T.step(img, mask, i * 250);
  ok(r2.ok && Math.abs(r2.x - r.x) < .6 && Math.abs(r2.y - r.y) < .6, "steady while standing");
  ok((Date.now() - t0) / 10 < 40, "tracking read is cheap: " + (Date.now() - t0) / 10 + " ms");
  // other players' and NPC tags (dadsnewbf, Menor) score well under the lock bar at this scale
  const tp = F.scaled(mask, r.r), right = F.search(img, tp, {x0: 700, y0: 0, x1: img.w, y1: 640}), left = F.search(img, tp, {x0: 0, y0: 0, x1: 540, y1: 640});
  ok(right.score < .55 && left.score < .55, `decoys stay low (${right.score.toFixed(2)}, ${left.score.toFixed(2)})`);
}

// 2. the same screen at 1918x1079, bilinear (a smoothed 1.5x UI, k not found): the sweep still locks, scale from the name's height
const resize = (src, W, H) => { const d = new Uint8ClampedArray(W * H * 4), sx = src.w / W, sy = src.h / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const fx = Math.max(0, (x + .5) * sx - .5), fy = Math.max(0, (y + .5) * sy - .5), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < 4; c++){ const g = (X, Y) => src.d[(Y * src.w + X) * 4 + c]; d[(y * W + x) * 4 + c] = (g(x0, y0) * (1 - ax) + g(x1, y0) * ax) * (1 - ay) + (g(x0, y1) * (1 - ax) + g(x1, y1) * ax) * ay } }
  return {w: W, h: H, d} };
{ const small = R.native(resize(full, 1918, 1079)), m = R.nameMask(small), T = F.createTracker();
  ok(m, "1080p: name cut"); let r = null;
  for (let i = 0; i < 60 && !(r && r.ok); i++) r = T.step(small, m, i * 250);
  ok(r.ok, "1080p: locks within the sweep");
  near(r.x, 1230 * .75, 2, "1080p feet x"); near(r.y, 977.5 * .75, 2.5, "1080p feet y"); near(r.r, 1.875 * .75, .03, "1080p scale");
}

// 3. facing: Turbow's sprite + tag cut out and pasted at other spots over the cleared spot (mushroom grass copied over him)
const SX0 = 560, SX1 = 672, SY0 = 420, TAGY = 494, SY1 = 516;
const blankBg = () => { const o = {...img, d: new Uint8ClampedArray(img.d)};
  for (let y = SY0; y < SY1; y++) for (let x = SX0; x < SX1; x++){ const i = (y * img.w + x) * 4, j = (y * img.w + x + 260) * 4; for (let c = 0; c < 4; c++) o.d[i + c] = img.d[j + c] }
  return o };
const at = (dx, mirrored) => { const o = blankBg();
  for (let y = SY0; y < SY1; y++) for (let x = SX0; x < SX1; x++){
    const sx = mirrored && y < TAGY ? SX1 - 1 - (x - SX0) : x, i = (y * img.w + x + dx) * 4, j = (y * img.w + sx) * 4;
    for (let c = 0; c < 4; c++) o.d[i + c] = img.d[j + c] }
  return o };
{ const T = F.createTracker(); let t = 0;
  let r = T.step(at(0, false), mask, t += 250); ok(r.ok && r.face === 0, "start: facing unknown");
  r = T.step(at(20, false), mask, t += 250); ok(r.ok && r.face === 1, "walks right: facing right");
  near(r.x, 635.5, 1.5, "followed 20 px right");
  r = T.step(at(-10, true), mask, t += 250); ok(r.ok && r.face === -1, "turns and walks left (sprite mirrored): facing left");
  r = T.step(at(-2, true), mask, t += 250); ok(r.ok && r.face === -1, "knocked back 8 px to the right, sprite not mirrored: still facing left");
  r = T.step(at(-2, true), mask, t += 250, {face: 1}); ok(r.face === 1, "the card's fixed facing wins");
  // the tag gone (a portal, a cutscene): lost, then forgotten after 1.5 s
  const none = blankBg(); r = T.step(none, mask, t += 250); ok(!r.ok, "tag gone: not found");
  T.step(none, mask, t += 2000); r = T.step(at(0, false), mask, t += 250); ok(r.ok, "found again with a full look");
}
// 4. no name in the status bar (hidden UI): nothing guessed
{ const T = F.createTracker(); ok(T.step(img, null, 0).why === "noname", "no name: no guess"); ok(T.step(img, {W: 8, H: 6, m: new Uint8Array(48)}, 0).why === "noname", "a too-small cut is not a name") }

// 5. the reader worker's path: want.feet on work() returns the feet (mask cached inside the readers)
{ const rd = R.createReaders({mobs: {}, maps: {}, mapnames: {}, items: {}, exp: [], drops: {}, kpq: [], timed: {}}), out = R.work(rd, {frame: img, t: 1, want: {feet: {}}});
  ok(out.feet && out.feet.ok && Math.abs(out.feet.x - 615.5) < 1.5, "work() want.feet finds the feet");
  ok(R.work(rd, {frame: img, t: 2, want: {}}).feet === null, "no want: no look") }

// 6. skill range core (shared with the site's skill pages): Arrow Bomb is a corridor, Power Strike a swing box in front
{ const D = require("../app/skilldata.json");
  const ab = D.skills.Archer.concat(D.skills.Hunter).find(s => s.n === "Arrow Bomb"), r = S.skRange(D, "Hunter", ab, 30, 0);
  ok(r && r.poly && r.poly[1][0] === 300, "Arrow Bomb: corridor to 300 px");
  const ps = D.skills.Warrior.find(s => s.n === "Power Strike"), w = S.skRange(D, "Fighter", ps, 20, 0);
  ok(w && w.boxes.length === 1 && w.boxes[0].r > 0, "Power Strike: one swing box in front");
  ok(Object.values(D.skills).flat().every(s => s.rv && S.skRange(D, Object.keys(D.skills).find(j => D.skills[j].includes(s)), s, s.max, 0)), "every exported skill has a range");
}
console.log(`feet.test: ${pass} passed`);
