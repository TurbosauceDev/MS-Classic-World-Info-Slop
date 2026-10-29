// node tests/proc.test.js — the Final Attack proc buff icon reader on a native-scale strip cut from Danny's frame (2026-10-29,
// buff "58" top-right): tests/frames-proc/proc-strip-native.png (160x44 = frame x 1119..1278, y 0..43 after the 2x UI shrink).
const fs = require("fs"), path = require("path"), zlib = require("zlib"), assert = require("assert");
const R = require("../app/readers.js"), S = require("../core/session.js"), A = require("../core/alerts.js");
function png(file){   // 8-bit RGB / RGBA, no interlace: all the strip needs
  const b = fs.readFileSync(file); let p = 8, w, h, ct, idat = [];
  while (p < b.length){ const n = b.readUInt32BE(p), t = b.toString("latin1", p + 4, p + 8), body = b.subarray(p + 8, p + 8 + n);
    if (t === "IHDR"){ w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; assert.strictEqual(body[8], 8) } if (t === "IDAT") idat.push(body); p += 12 + n }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), out = new Uint8ClampedArray(w * h * 4), prev = Buffer.alloc(w * bpp), row = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++){
    const f = raw[y * (w * bpp + 1)], src = raw.subarray(y * (w * bpp + 1) + 1, (y + 1) * (w * bpp + 1));
    for (let i = 0; i < w * bpp; i++){
      const a = i >= bpp ? row[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
      row[i] = (src[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? u : c))) & 255;
    }
    for (let x = 0; x < w; x++){ const o = (y * w + x) * 4; out[o] = row[x * bpp]; out[o + 1] = row[x * bpp + 1]; out[o + 2] = row[x * bpp + 2]; out[o + 3] = 255 }
    row.copy(prev);
  }
  return {w, h, d: out, k: 2, ox: 0, oy: 0};
}
const img = png(path.join(__dirname, "frames-proc/proc-strip-native.png"));
const clone = () => ({...img, d: Uint8ClampedArray.from(img.d)});
// the shown strip is only 160 wide, so the search starts at half of it: icon (x 126) is found
let r = R.readProc(img); assert(r && r.x === 126 && r.y === 3, "icon found at 126,3: " + JSON.stringify(r)); assert(r.diff < 0.05, "close match: " + r.diff); assert.strictEqual(r.n, 58, "countdown 58 read off Danny's frame");
// icon painted over with the scene's purple: nothing
const blank = clone(); for (let y = 0; y < 40; y++) for (let x = 120; x < 160; x++){ const o = (y * 160 + x) * 4; blank.d[o] = 90; blank.d[o + 1] = 50; blank.d[o + 2] = 100 }
assert.strictEqual(R.readProc(blank), null, "no icon -> null");
// a different buff icon (all pale, black border): its art isn't the same
const other = clone(); for (let y = 3; y < 35; y++) for (let x = 126; x < 158; x++){ const o = (y * 160 + x) * 4, edge = y === 3 || y === 34 || x === 126 || x === 157, v = edge ? 0 : 225; other.d[o] = other.d[o + 1] = other.d[o + 2] = v }
assert.strictEqual(R.readProc(other), null, "another buff icon -> null");
// the same icon one slot to the left (a newer buff pushed it): still found
const moved = clone(); for (let y = 0; y < 40; y++) for (let x = 0; x < 34; x++){ const s = (y * 160 + 125 + x) * 4, o = (y * 160 + 85 + x) * 4; for (let c = 0; c < 4; c++) moved.d[o + c] = img.d[s + c] }
const rm = R.readProc(moved); assert(rm && rm.x >= 85 && rm.x <= 86 || rm && rm.x === 126, "moved copy found: " + JSON.stringify(rm));
// readFrame: one "proc" event after it reads twice, none while it stays; gone 3 frames and back = a second one
const rd = R.createReaders({exp: {}, items: {}, mobs: {}, maps: {}}), ev = [];
const frame = bg => ({...bg, w: bg.w, h: bg.h});
for (let i = 0; i < 4; i++) ev.push(...rd.readFrame(frame(img), i * 500, img).filter(e => e.type === "proc"));
assert.strictEqual(ev.length, 1, "one proc event while the buff stays: " + ev.length);
for (let i = 0; i < 4; i++) rd.readFrame(blank, 3000 + i * 500, blank);
for (let i = 0; i < 3; i++) ev.push(...rd.readFrame(img, 6000 + i * 500, img).filter(e => e.type === "proc"));
assert.strictEqual(ev.length, 2, "second proc after it went away: " + ev.length);
// session counts them, the alert fires once per new proc (baseline on first sight)
const ses = S.createSession({exp: {}, items: {}, mobs: {}, maps: {}}); ses.add({t: 0, type: "proc"}); ses.add({t: 500, type: "proc"}); assert.strictEqual(ses.stats(1000).procs, 2);
const alerts = A.normalize([{id: "a", kind: "finalAttack", on: true, act: {sound: "high", toast: true, log: true}}]), st = {};
let fired = A.evaluate(alerts, {st: {procs: 3}}, st, 0); assert.strictEqual(fired.length, 0, "baseline");
fired = A.evaluate(alerts, {st: {procs: 4}}, st, 5000); assert.strictEqual(fired.length, 1, "new proc fires");
fired = A.evaluate(alerts, {st: {procs: 4}}, st, 10000); assert.strictEqual(fired.length, 0, "same count: quiet");
// the two more frames Danny sent (no proc / 2nd proc, same strip, right-aligned to the frame edge): icon sits at x 126 again in the proc one
const none = png(path.join(__dirname, "frames-proc/noproc-strip-native.png")), again = png(path.join(__dirname, "frames-proc/proc2-strip-native.png"));
assert.strictEqual(R.readProc(none), null, "frame without the buff -> null");
r = R.readProc(again); assert(r && r.y === 3 && r.diff < 10, "2nd proc frame found: " + JSON.stringify(r));
// the countdown: eight native 32x32 icons cut from Danny's 60-second clip (59 -> 5): 57, 42, 32, 20, 9, 7, 5 and the faded icon (no digits)
const strip = png(path.join(__dirname, "frames-proc/countdown-icons-native.png")), icon = k => {
  const c = {w: 200, h: 44, d: new Uint8ClampedArray(200 * 44 * 4), k: 2};
  for (let i = 0; i < c.d.length; i += 4){ c.d[i] = 90; c.d[i + 1] = 50; c.d[i + 2] = 100; c.d[i + 3] = 255 }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++){ const s = (y * strip.w + k * 32 + x) * 4, o = ((3 + y) * 200 + 150 + x) * 4; for (let q = 0; q < 4; q++) c.d[o + q] = strip.d[s + q] }
  return c;
};
const want = [57, 42, 32, 20, 9, 7, 5];
want.forEach((n, k) => { const p = R.readProc(icon(k)); assert(p && p.yellow >= 8 && p.n === n, "countdown " + n + ": " + JSON.stringify(p)) });
const faded = R.readProc(icon(7)); assert(faded && faded.yellow < 8 && faded.n === null, "faded icon has no digits: " + JSON.stringify(faded));
// events over a clip: proc, ticking down, a refresh (the number jumps up), ticking down again, faded for a while, a new proc
const rd2 = R.createReaders({exp: {}, items: {}, mobs: {}, maps: {}}), got = [];
const feed = (k, times, t0) => { for (let i = 0; i < times; i++) got.push(...rd2.readFrame(icon(k), t0 + i * 250, icon(k)).filter(e => e.type === "proc")) };
feed(1, 3, 0);      // 42: proc
feed(2, 3, 1000);   // 32: ticking, nothing
feed(0, 3, 2000);   // 57: higher than 32 = refreshed
feed(3, 3, 3000);   // 20: ticking
assert.deepStrictEqual(got.map(e => !!e.refresh), [false, true], "proc then refresh: " + JSON.stringify(got));
feed(7, 5, 4000);   // faded: over
feed(1, 3, 6000);   // 42 again: a new proc
assert.deepStrictEqual(got.map(e => !!e.refresh), [false, true, false], "new proc after the fade: " + JSON.stringify(got));
console.log("proc: ok");
