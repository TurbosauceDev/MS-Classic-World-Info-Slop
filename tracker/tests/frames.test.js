// node tests/frames.test.js — the frame copy circle (app/framesrc.js on a mocked capture): a buffer the reader worker
// sends back is the exact memory the next grab fills, so steady-state reading stops allocating 3.7-14.7 MB frames.
// Node 24 refuses a file with both require and top-level await, so this lives in its own async suite.
const assert = require("assert"), vm = require("vm"), fs = require("fs"), path = require("path"), BP = require("../core/bufpool.js");
const code = fs.readFileSync(path.join(__dirname, "../app/framesrc.js"), "utf8");

async function main(){
  const frames = [];
  class VF { constructor(w, h, fill){ this.visibleRect = {width: w, height: h}; this.fill = fill }
    async copyTo(buf){ buf.fill(this.fill) } close(){} }
  class Reader { constructor(){ this.over = false }
    async read(){ for(;;){ if (this.over || frames.length) return this.over ? {done: true} : {value: frames.shift(), done: false}; await new Promise(r => setTimeout(r, 5)) } }
    cancel(){ this.over = true; return Promise.resolve() } }
  const sandbox = {MediaStreamTrackProcessor: class { constructor({track}){ this.readable = track.readable } }, VideoFrame: VF,
    Promise, setTimeout, Uint8ClampedArray, Math, Error, console};
  const FrameSrc = vm.runInNewContext(code + "\n;FrameSrc", sandbox);
  const mkTrack = () => ({readable: {getReader: () => new Reader()}});
  const pool = BP.createBufPool(4), s = FrameSrc.open({getVideoTracks: () => [mkTrack()]}, pool);
  assert(s && s.pump, "framesrc opens on a capture track");
  frames.push(new VF(8, 4, 7));
  assert.strictEqual(await s.ready, true, "the first frame readies the source");
  assert.strictEqual(s.videoWidth, 8); assert.strictEqual(s.videoHeight, 4);
  const f1 = s.full();
  assert.strictEqual(f1.d.length, 128); assert.strictEqual(f1.d[0], 7, "pixels copied out of the VideoFrame");
  const f2 = s.full();
  assert.notStrictEqual(f2.d.buffer, f1.d.buffer, "cold pool: a second grab still allocates");
  assert.strictEqual(pool.give(f1.d.buffer), true, "the worker's reply put the first buffer back");
  const f3 = s.full();
  assert.strictEqual(f3.d.buffer, f1.d.buffer, "the returned buffer is the one the next grab fills");
  assert.strictEqual(f3.d[0], 7, "refilled with the newest frame");
  const sh = s.shrunk({k: 2, ox: 0, oy: 0});
  assert.strictEqual(sh.w, 4); assert.strictEqual(sh.h, 2); assert.strictEqual(sh.k, 2, "the 2x shrink reads game pixels");
  // the worker replies with each buffer it was lent, one read at a time; sizes differ between the full and shrunk path
  assert.strictEqual(pool.give(sh.d.buffer), true, "the shrunk read's buffer returns too");
  const f4 = s.full();
  assert.notStrictEqual(f4.d.buffer, f1.d.buffer, "no same-size buffer parked: allocate rather than misread a smaller one");
  assert.strictEqual(pool.give(f3.d.buffer), true, "the in-flight read's buffer returns with its reply");
  const f5 = s.full();
  assert.strictEqual(f5.d.buffer, f3.d.buffer, "the circle keeps spinning on returned buffers only");
  s.drop();
  await new Promise(r => setTimeout(r, 40));
  let threw = false; try { s.full() } catch { threw = true }
  assert(threw, "grabbing after the capture ended throws");
  // no pool passed (the old call shape, or the video-element fallback path): everything still works, just no reuse
  const s2 = FrameSrc.open({getVideoTracks: () => [mkTrack()]});
  frames.push(new VF(4, 2, 3));
  assert.strictEqual(await s2.ready, true, "open without a pool works");
  assert.strictEqual(s2.full().d[0], 3, "pixels fine without a pool");
  s2.drop();   // end the mock capture so this suite exits
  await new Promise(r => setTimeout(r, 20));
  console.log("frames: the buffer circle holds");
}
main().catch(e => { console.error(e); process.exit(1) });
