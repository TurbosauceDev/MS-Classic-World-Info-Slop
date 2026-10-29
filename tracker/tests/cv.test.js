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

  // EXP bar verdicts: a jump is a red herring until the same reading comes twice (Danny 10-29)
  { const {barVerdict, barJump} = require("../app/readers.js"), last = {exp: 18572, pct: 64.09, level: 22};
    const v = (bar, o = {}) => barVerdict({bar, last, level: 22, steady: false, agrees: true, fits: true, ...o});
    assert.strictEqual(barVerdict({bar: {exp: 5, pct: 1}, last: null, level: 22, fits: true}), true, "first reading");
    assert.strictEqual(v({exp: 18757, pct: 64.72}), true, "a normal gain agreeing with the level is taken at once");
    assert.strictEqual(v({exp: 18572, pct: 64.09}), false, "no change: no event");
    assert.strictEqual(v({exp: 20000, pct: 76}), false, "+12 % in one read: wait for the repeat");
    assert.strictEqual(v({exp: 20000, pct: 76}, {steady: true}), true, "the same jump read twice is real");
    assert.strictEqual(v({exp: 20000, pct: 76}, {steady: true, fits: false}), false, "a repeat that fits no level is still a misread");
    assert.strictEqual(v({exp: 18000, pct: 62.1}), false, "EXP going down (misread digit) is a jump too");
    assert.strictEqual(v({exp: 18000, pct: 62.1}, {steady: true}), true, "a death loss shows twice and is taken");
    assert.strictEqual(barJump({exp: 30, pct: 0.4}, last, 23), false, "a level-up resets the bar: not a jump");
    assert.strictEqual(barJump({exp: 18757, pct: 68}, last, 22), false, "+3.9 % is under the 5 % line") }

  // dirty-region memo: same events with it on or off over a run of real frames (repeats, changes, back again), and a stale
  // answer can't stick: every 8th identical frame is read anyway
  { const R = require("../app/readers.js"), G = require("../app/gamedata.json"), readPng = require("./cv_util.js");
    const imgs = Object.fromEntries(["frame-000", "frame-006", "frame-046", "frame-042"].map(n => [n, R.native(readPng(path.join(__dirname, "frames", n + ".png")))]));
    const seq = [..."0000600066604626004444"].map(c => ({0: "frame-000", 6: "frame-006", 4: "frame-046", 2: "frame-042"})[c] || "frame-042");
    const run = off => { const rd = R.createReaders(G, null); rd.memoStats.off = off; const out = []; let t = 1e6;
      for (const n of seq){ t += 500; out.push(JSON.stringify(rd.readFrame(imgs[n], t, imgs[n]))) } return {out, st: rd.memoStats} };
    const on = run(false), off = run(true);
    assert.deepStrictEqual(on.out, off.out, "memo on = memo off, frame by frame");
    assert.ok(on.st.hits > 0 && on.st.hits > on.st.reads / 2, `memo used (${on.st.hits} skipped, ${on.st.reads} read)`);
    const rd = R.createReaders(G, null); let n = 0; for (let i = 0; i < 24; i++) rd.readFrame(imgs["frame-000"], 1e6 + i * 500, imgs["frame-000"]);
    assert.ok(rd.memoStats.reads >= 2 + 2 * 2, "identical frames are still re-read every 8th: " + rd.memoStats.reads);
    console.log(`memo ok (${on.st.hits} skipped, ${on.st.reads} read over ${seq.length} frames)`) }

  // speed guard: a whole 2560x1440 frame must stay far from the 500 ms budget (measured ~7 ms in 0.2.93; the limit is
  // loose so a slow CI box doesn't flake, tight enough to catch an accidental per-pixel scan of the whole frame)
  const {bench} = require("./cv_bench.js"), {rows} = bench(), ms = Object.fromEntries(rows);
  const whole = ms["whole frame read (steady state)"], shrink = ms["shrink to game pixels"];
  assert.ok(whole < 60, `whole frame read ${whole.toFixed(1)} ms (limit 60)`);
  assert.ok(shrink < 60, `shrink ${shrink.toFixed(1)} ms (limit 60)`);
  console.log(`frame read ${whole.toFixed(1)} ms, shrink ${shrink.toFixed(1)} ms ok`);
})().catch(e => { console.error(e); process.exit(1) });
