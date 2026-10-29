// node tests/cv.test.js — computer-vision efficiency: OCR result cache (core/ocrcache.js) and a speed guard on a real frame.
const assert = require("assert"), path = require("path"), {createOcrCache} = require("../core/ocrcache.js");
const crop = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i++) d[i] = f(i); return {w, h, d} };
(async () => {
  // same pixels -> one OCR run; different pixels (or size) -> a new run
  const c = createOcrCache(3); let runs = 0; const ocr = async x => (runs++, "text" + x.d[0]);
  const a = crop(10, 4, () => 255), a2 = crop(10, 4, () => 255), b = crop(10, 4, i => i === 7 ? 0 : 255), wide = crop(20, 2, () => 255);
  assert.strictEqual(await c.run(a, ocr), "text255"); assert.strictEqual(await c.run(a2, ocr), "text255"); assert.strictEqual(runs, 1, "identical crop: cached");
  await c.run(b, ocr); assert.strictEqual(runs, 2, "one pixel differs: read again");
  await c.run(wide, ocr); assert.strictEqual(runs, 3, "same bytes, different shape: read again");
  assert.deepStrictEqual([c.stats.hits, c.stats.misses], [1, 3]);
  // an empty answer (broken OCR worker) is never kept, so the next frame tries again
  const e = createOcrCache(); let n = 0; const flaky = async () => ++n === 1 ? "" : "Henesys";
  assert.strictEqual(await e.run(a, flaky), ""); assert.strictEqual(await e.run(a, flaky), "Henesys"); assert.strictEqual(await e.run(a, flaky), "Henesys"); assert.strictEqual(n, 2);
  // oldest entry goes first, and a hit refreshes its place
  const l = createOcrCache(2), mk = v => crop(4, 4, () => v); let r = 0; const o = async () => "t" + ++r;
  await l.run(mk(1), o); await l.run(mk(2), o); await l.run(mk(1), o); await l.run(mk(3), o);   // 2 evicted
  r = 0; await l.run(mk(1), o); assert.strictEqual(r, 0, "recent entry kept"); await l.run(mk(2), o); assert.strictEqual(r, 1, "oldest entry evicted");
  // crops that arrive as a view into a bigger buffer (a worker transfer) hash the same as a plain copy
  const big = new Uint8ClampedArray(64 + 160); big.fill(255, 64); const view = {w: 10, h: 4, d: big.subarray(64)};
  assert.strictEqual(createOcrCache().key(view), createOcrCache().key(a), "byteOffset view = copy");
  // real frames: the map title and character name crops of Danny's captures hash the same while the map is the same (the
  // job crop includes HP/EXP numbers, so it never repeats: that is why the job look is slowed down instead)
  { const R = require("../app/readers.js"), readPng = require("./cv_util.js"), k = (f, fn) => { const x = R[fn](R.native(readPng(path.join(__dirname, "frames", f)))); return x && createOcrCache().key(x) };
    assert.strictEqual(k("frame-000.png", "mapTextCrop"), k("frame-046.png", "mapTextCrop"), "same map, same crop");
    for (const f of ["frame-046.png", "frame-042.png"]) assert.strictEqual(k("frame-000.png", "nameTextCrop"), k(f, "nameTextCrop"), "name crop stable") }
  console.log("ocrcache ok");

  // speed guard: a whole 2560x1440 frame must stay far from the 500 ms budget (measured ~7 ms in 0.2.93; the limit is
  // loose so a slow CI box doesn't flake, tight enough to catch an accidental per-pixel scan of the whole frame)
  const {bench} = require("./cv_bench.js"), {rows} = bench(), ms = Object.fromEntries(rows);
  const whole = ms["whole frame read (steady state)"], shrink = ms["shrink to game pixels"];
  assert.ok(whole < 60, `whole frame read ${whole.toFixed(1)} ms (limit 60)`);
  assert.ok(shrink < 60, `shrink ${shrink.toFixed(1)} ms (limit 60)`);
  console.log(`frame read ${whole.toFixed(1)} ms, shrink ${shrink.toFixed(1)} ms ok`);
})().catch(e => { console.error(e); process.exit(1) });
