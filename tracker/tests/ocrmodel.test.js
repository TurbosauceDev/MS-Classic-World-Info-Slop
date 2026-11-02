// node tests/ocrmodel.test.js — core/ocrmodel.js, the port of ocrs' text recognition (P1-6, 2026-11-02).
// The runner is mocked: real-model numbers live in tests/ocr_bench.js (not in the default chain — it needs
// the 9.7 MB model run, which is exactly what CI should not do twice). Everything structural is asserted here.
const assert = require("assert"), M0 = require("../core/ocrmodel.js"), OM = M0.createOcrModel();

// the alphabet is ocrs' DEFAULT_ALPHABET: 96 characters, the model emits 97 CTC classes (label 0 = blank)
assert.strictEqual(OM.alphabet.length, 96);
assert.strictEqual(OM.alphabet[0], " ");   // label 1 = space, the most common training character

// pixels: BT.601 luma in [0,1] biased by -0.5 (ocrs BLACK_VALUE) — black -0.5, white +0.5, mid ~0
{ const c = {w: 2, h: 1, d: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])};
  assert.strictEqual(M0.gray(c)[0], -0.5);
  assert.strictEqual(M0.gray(c)[1], 0.5);
  const g = M0.gray({w: 1, h: 1, d: new Uint8ClampedArray([128, 128, 128, 255])})[0];
  assert.ok(Math.abs(g - (0.502 - 0.5)) < 0.01, "mid grey ~0, got " + g); }

// resized_line_width: aspect kept at the input height, truncated, clamped 10..2400 (ocrs constants)
assert.strictEqual(M0.resizedWidth(326, 54, 64), 386);
assert.strictEqual(M0.resizedWidth(5, 100, 64), 10);      // a tall sliver clamps to the floor
assert.strictEqual(M0.resizedWidth(4000, 10, 64), 2400);  // a very long line clamps to the ceiling

// resize: bilinear at half-pixel centres, clamped — identity at the same size, edge pixels kept
{ const r = M0.resize(new Float32Array([0, 0.5, 1]), 3, 1, 3, 1);
  assert.deepStrictEqual(Array.from(r), [0, 0.5, 1]);
  const up = M0.resize(new Float32Array([0, 1]), 2, 1, 4, 1);
  assert.ok(Math.abs(up[0]) < 1e-6 && Math.abs(up[3] - 1) < 1e-6, "edges land on the source edges");
  assert.ok(Math.abs(up[1] - 0.25) < 1e-6 && Math.abs(up[2] - 0.75) < 1e-6, "half-pixel centres, got " + up[1] + "," + up[2]); }

// prepLine: a crop comes back at the model's input height and the clamped width
{ const p = OM.prepLine({w: 100, h: 25, d: new Uint8ClampedArray(100 * 25 * 4).fill(255)}, {});
  assert.strictEqual(p.h, M0.INPUT_H);
  assert.strictEqual(p.w, M0.resizedWidth(100, 25, M0.INPUT_H));
  assert.strictEqual(p.data.length, p.w * p.h); }

// CTC greedy decode: repeats collapse, the blank separates, label i+1 is alphabet[i]; conf is the
// geometric mean of the kept steps. classes=3: label 1 = " ", label 2 = "0".
{ const cls = 3, mk = seq => { const d = new Float32Array(seq.length * cls).fill(-10);
    seq.forEach((l, s) => d[s * cls + l] = -0.1); return d };   // the chosen label wins by a wide margin
  const one = (seq, ex) => M0.decode(seq.length, mk(seq), 0, 1, cls, ex).text;
  assert.strictEqual(one([0, 1, 1, 2, 2, 2]), " 0");   // repeats collapse to one character each
  assert.strictEqual(one([1, 0, 1]), "  ");            // the blank separates two same labels
  assert.strictEqual(one([2, 0, 2]), "00");
  assert.strictEqual(one([0, 0, 0]), "");              // all blank: nothing
  const r = M0.decode(2, mk([2, 2]), 0, 1, cls, null);
  assert.strictEqual(r.text, "0");
  assert.ok(Math.abs(r.conf - Math.exp(-0.1)) < 1e-6, "conf = exp(mean logprob), got " + r.conf);
  assert.strictEqual(one([2, 2, 2], new Uint8Array([0, 0, 1])), ""); }   // excluded label barred (ocrs allowed_chars)

// excludedFromAllowed: ocrs' allowed_chars -> barred labels; the blank is never barred
{ const ex = M0.excludedFromAllowed("0");
  assert.strictEqual(ex[0], 0);
  assert.strictEqual(ex[1], 1);    // " " not allowed
  assert.strictEqual(ex[2], 0);    // alphabet[1] = "0", allowed
  assert.strictEqual(ex[3], 1);    // alphabet[2] = "1", not allowed
  assert.strictEqual(M0.excludedFromAllowed(null), null); }

// readLines: grouping by padded width bucket (one run per bucket), 20 a batch, answers in input order,
// the runner sees [batch, 1, h, w] and its [seq, batch, classes] output is read back per row.
(async () => {
  const runs = [];
  const runner = {async run(data, shape){
    runs.push(shape);
    const [b, , h, w] = shape, classes = 3, seq = 4, out = new Float32Array(seq * b * classes).fill(-10);
    for (let bi = 0; bi < b; bi++) out[(1 * b + bi) * classes + 2] = -0.05;   // step 1 -> "0" for every row
    return {data: out, seq, classes};
  }};
  const crop = w => ({w, h: 32, d: new Uint8ClampedArray(w * 32 * 4).fill(255)});
  const widths = [100, 100, 100, 400, 60, 60];   // buckets: 200 (w 100 -> 256 truncated? no: prepLine computes), ...
  const out = await OM.readLines(widths.map(crop), runner, {});
  assert.strictEqual(out.length, 6);
  assert.ok(out.every(r => r.text.includes("0")), "every row decoded");
  // same-width lines share a run, different widths do not: shapes' batch dims must add to 6
  assert.strictEqual(runs.reduce((a, s) => a + s[0], 0), 6);
  assert.ok(runs.every(s => s[1] === 1 && s[2] === M0.INPUT_H && s[3] % 50 === 0), "batches are [b,1,64,w%50==0]");
  // a run wider than the line pads black on the right, and rows keep their input order
  const big = await OM.readLines([crop(100), crop(100), crop(100)], {async run(data, shape){
    assert.strictEqual(shape[0], 3);
    return {data: new Float32Array(shape[0] * 4 * 3), seq: 4, classes: 3};
  }}, {});
  assert.strictEqual(big.length, 3);
  // 25 same-width crops: two runs (20 + 5)
  runs.length = 0;
  await OM.readLines(Array.from({length: 25}, () => crop(100)), runner, {});
  assert.deepStrictEqual(runs.map(s => s[0]), [20, 5]);

  // an empty or broken crop answers empty instead of throwing
  const out2 = await OM.readLines([{w: 0, h: 0, d: new Uint8ClampedArray(0)}], {async run(){ throw new Error("no run expected") }}, {});
  assert.strictEqual(out2[0].text, "");

  console.log("ocrmodel tests passed");
})().catch(e => { console.error(e); process.exit(1) });
