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
  console.log(`frame read ${whole.toFixed(1)} ms, shrink ${shrink.toFixed(1)} ms ok`)

  // tolerance change gate (core/framegate.js, the customclassic-chat port): identical and jitter frames skip, real
  // content does not. Their measured pair: any of R,G,B moved more than 60/255 on over 1% of pixels
  { const gate = require("../core/framegate.js"), u32 = (w, h, f) => { const d = new Uint32Array(w * h); for (let i = 0; i < d.length; i++) d[i] = f(i); return d };
    const A = u32(100, 100, () => 0xff808080);
    assert.strictEqual(gate.share(A, A.slice()), 0, "identical: nothing moved");
    const jit = A.slice(); jit[1234] = 0xff8080d0;   // one pixel's red +80: the encoder shimmers
    assert.ok(gate.share(A, jit) < 0.01 && !gate.changed(A, jit), "one jitter pixel: under the gate");
    const busy = A.slice(); for (let i = 0; i < 1500; i++) busy[i * 3] = 0xff808000;   // 1.5% of pixels move hard
    assert.ok(gate.changed(A, busy), "a real change: over the gate");
    const soft = A.slice(); for (let i = 0; i < 9000; i++) soft[i * 2] = 0xff8080b0;   // 4.5% moved by 48
    assert.ok(!gate.changed(A, soft), "a small nudge on many pixels is still idle (under the step)");
    assert.strictEqual(gate.share(A, u32(50, 50, () => 0)), 1, "a shape mismatch never gates");
    console.log("framegate ok") }

  // tolerant OCR cache: one shimmering pixel is no longer a ~90 ms Tesseract run for the same words
  { const {createTolCache} = require("../core/ocrcache.js"), gate = require("../core/framegate.js");
    const t = createTolCache(gate); let runs = 0; const oc = async () => (runs++, "Henesys");
    const cc = v => ({w: 40, h: 12, d: new Uint8ClampedArray(new Uint32Array(40 * 12).fill(v).buffer)});
    const A = cc(0xff808080), jit = cc(0xff808080); jit.d[8] = 0xd0;   // one pixel shimmers
    assert.strictEqual(await t.run("map", A, oc), "Henesys"); assert.strictEqual(runs, 1);
    assert.strictEqual(await t.run("map", jit, oc), "Henesys"); assert.strictEqual(runs, 1, "jitter answers from the slot");
    assert.strictEqual(t.stats.tolHits, 1);
    assert.strictEqual(await t.run("map", cc(0xff808020), oc), "Henesys"); assert.strictEqual(runs, 2, "a real change reads again");
    let bad = true; const fl = async () => (runs++, bad ? (bad = false, "") : "ok");   // "" = a broken worker: not kept
    const D = cc(0xff202020);   // a fresh real change, so the flaky OCR is actually asked
    assert.strictEqual(await t.run("map", D, fl), ""); assert.strictEqual(await t.run("map", D, fl), "ok");
    assert.strictEqual(await t.run("map", cc(0xff808020), fl), "ok", "the good text is kept after the broken read");
    assert.strictEqual(await t.run("map", cc(0xff808020), fl), "ok"); assert.strictEqual(t.stats.tolHits, 2, "jitter hits counted");
    console.log("tolcache ok") }

  // read pacing from observed content (the customclassic-chat port): busy chat lines raise the floor, a missed box hurries
  { const {create} = require("../core/readpace.js"), p = create(); const t = 1e6;
    assert.strictEqual(p.floor(t), 0, "nothing seen: no floor");
    for (let i = 0; i < 90; i++) p.note(t + i * 333, 2, 12, false);   // 6 new lines a second arriving 2 at a time, 12 shown
    const f = p.floor(t + 30e3);
    assert.ok(Math.abs(f - 0.975) < 0.02, "floor = rate x1.5 x1.3 / shown, got " + f);
    p.note(t + 31e3, 6, 6, true);   // the whole box turned over: lines went by unread
    assert.strictEqual(p.floor(t + 32e3), 4, "gap: full speed");
    assert.strictEqual(p.floor(t + 90e3), 4, "the hurry holds 60 s");
    assert.ok(p.floor(t + 92e3) < 4, "then it lets go");
    p.note(t + 94e3, 4, 6, false);   // over half the box new at once: a shorter hurry
    assert.strictEqual(p.floor(t + 95e3), 4, "half the box new: hurry too");
    assert.ok(p.floor(t + 105e3) < 4, "short hurry over");
    p.reset(); assert.strictEqual(p.floor(t + 106e3), 0, "reset clears everything");
    console.log("readpace ok") }

  // per-minute telemetry (the customclassic-chat reading.jsonl): deltas only, counters that reset never go negative
  { const rs = require("../core/readstats.js");
    const prev = {looks: 10, reads: 8, skipExact: 40, skipTol: 5, readMs: 900, tickMs: 1200, ocrRuns: 3, ocrMs: 270, cacheHits: 12, tolHits: 4, memoHits: 30, chatLooks: 8, chatNew: 5, chatGaps: 1, chatOcrMs: 80, evExp: 20, evMeso: 10, evBonus: 2, evItems: 3, reTries: 2, reWins: 1};
    const cur = {...prev, looks: 70, reads: 65, skipTol: 45, readMs: 6000, ocrRuns: 4, evMeso: 14, reWins: 2, fps: 2};
    const line = rs.record(1e12, cur, prev);
    assert.strictEqual(line.looks, 60); assert.strictEqual(line.reads, 57); assert.strictEqual(line.skipTol, 40);
    assert.strictEqual(line.readMs, 5100); assert.strictEqual(line.evMeso, 4); assert.strictEqual(line.fps, 2);
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(line.at), "at is a stamp");
    assert.ok(!("skipExact" in line) && !("ocrMs" in line), "zero deltas are left out");
    assert.strictEqual(rs.record(1e12, cur, null).looks, 70, "no prev: absolute counts");
    console.log("readstats ok") }

  // pickup lines that read badly get a second look on their own (the customclassic-chat re-read, on our rows):
  // two messages whose rows touch used to be lost whole, and one stray pixel from a neighbour line used to turn
  // its column's glyph "?" and kill the whole line. Drawn from the real font, no frames needed.
  { const R = require("../app/readers.js");
    // the game's digit glyphs are learned at runtime (settings.glyphs): seed the ones these sentences need
    const shapes = {"1": ["00100","01100","00100","00100","00100","00100","00100","00100","01110"],
      "5": ["11110","10000","10000","11110","00001","00001","00001","10001","01110"],
      "4": ["00010","00110","01010","10010","11111","00010","00010","00010","00010"],
      "0": ["01110","10001","10011","10101","11001","10001","10001","10001","01110"]};
    // registered trimmed, the way the game's learned glyphs arrive (cut() trims each glyph to its ink)
    const trim = rows => { const h = rows.length, w = rows[0].length; let x0 = w, x1 = -1, y0 = h, y1 = -1;
      rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "1"){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } }));
      return {w: x1 - x0 + 1, h: y1 - y0 + 1, bits: rows.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1)).join("")}};
    R.addGlyphs(Object.entries(shapes).map(([ch, rows]) => ({ch, ...trim(rows)})));
    const FONT = R.msgGlyphs(), gl = Object.fromEntries(FONT.map(g => [g.ch, g]));
    const W = 640, H = 200, frame = () => { const d = new Uint8ClampedArray(W * H * 4); return {w: W, h: H, d} };
    const ink = (im, x, y) => { const o = (y * im.w + x) * 4; im.d[o] = im.d[o + 1] = im.d[o + 2] = 255 };
    const draw = (im, text, sy, xEnd) => {   // right-aligned, like the game paints them; 1 px between glyphs, 5 px for a space
      let x = xEnd;
      for (let i = text.length - 1; i >= 0; i--){
        const ch = text[i];
        if (ch === " "){ x -= 5; continue }
        const g = gl[ch];
        if (!g) throw new Error("no glyph for " + JSON.stringify(ch));
        x -= g.w;
        for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) if (g.bits[gy * g.w + gx] === "1") ink(im, x + gx, sy + gy);
        x -= 1;
      }
      return x;
    };
    const EXP = "You received EXP (+15)", MESO = "You have gained mesos (+40)", RIGHT = 636;   // the strip ends at 430 from the right edge; 12 px of slack
    // a clean line reads as before (nothing regressed)
    { const im = frame(); draw(im, EXP, 100, RIGHT);
      const ev = R.readPickups(im).map(p => p.event);
      assert.strictEqual(ev.length, 1, "clean line: one event"); assert.strictEqual(ev[0].type + ":" + ev[0].gain, "exp:15") }
    // a half-scrolled line's remnant row merged into the band's edge used to turn its column's glyph "?" (line
    // lost); the edge-trim re-read recovers it
    { const im = frame(); const x0 = draw(im, EXP, 100, RIGHT);
      ink(im, x0 + 60, 111); ink(im, x0 + 61, 111);   // two pixels one row under the line: enough to join the band
      const ev = R.readPickups(im).map(p => p.event);
      assert.strictEqual(ev.length, 1, "edge remnant: recovered"); assert.strictEqual(ev[0].type + ":" + ev[0].gain, "exp:15");
      assert.ok(R.lineStats().wins >= 1, "counted as a re-read win") }
    // two messages whose separating gap video blur bridged (one 2-pixel row between them) used to be dropped
    // whole (band 23 rows); the split at the quietest row recovers both
    { const im = frame(); draw(im, EXP, 100, RIGHT); draw(im, MESO, 112, RIGHT);
      ink(im, 530, 111); ink(im, 531, 111);   // the bridged gap row
      const ev = R.readPickups(im).map(p => p.event);
      assert.strictEqual(ev.length, 2, "bridged gap: both lines recovered, got " + ev.length);
      assert.deepStrictEqual(ev.map(e => e.type).sort(), ["exp", "meso"], "each recovered line reads once");
      console.log("    (split wins " + R.lineStats().wins + " of " + R.lineStats().tries + " tries)") }
    console.log("line reread ok (wins " + R.lineStats().wins + " of " + R.lineStats().tries + " tries)") }
})().catch(e => { console.error(e); process.exit(1) });
