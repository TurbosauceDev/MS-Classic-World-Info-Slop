// The game picture without a <video> element: frames come off the capture track as VideoFrames and are copied straight
// into two reused RGBA buffers, so there's no video-to-canvas draw and no canvas read-back (that path grew the window's
// memory by ~600 MB on a 2560x1440 capture, measured 2026-10-29; this one stays flat). Same shape as the video element where
// renderer*.js reads it: srcObject, videoWidth, videoHeight. open() returns null where VideoFrame isn't there, and the
// caller falls back to the old video element.
const FrameSrc = (() => {
  const gone = () => { throw new Error("the capture has ended") };
  function open(stream){
    if (typeof MediaStreamTrackProcessor !== "function" || typeof VideoFrame !== "function") return null;
    const tr = stream.getVideoTracks()[0];
    if (!tr) return null;
    const rd = new MediaStreamTrackProcessor({track: tr}).readable.getReader();
    const s = {pump: true, srcObject: stream, videoWidth: 0, videoHeight: 0, cur: null, failed: false};
    let first, spare = null; s.ready = new Promise(r => first = r);
    (async () => {
      try {
        for (;;){
          const {value: f, done} = await rd.read();
          if (done) break;
          try {
            const w = f.visibleRect.width, h = f.visibleRect.height, n = w * h * 4;
            if (!spare || spare.length !== n) spare = new Uint8ClampedArray(n);
            await f.copyTo(spare, {format: "RGBA", layout: [{offset: 0, stride: w * 4}]});
            if (spare[3] !== 255 || spare[n - 1] !== 255) for (let i = 3; i < n; i += 4) spare[i] = 255;   // opaque, like getImageData gave
            [s.cur, spare] = [spare, s.cur];   // swap after the copy lands: a grab never sees half a frame
            s.videoWidth = w; s.videoHeight = h; first(true);
          } finally { f.close() }
        }
      } catch { s.failed = true }
      s.cur = spare = null;   // capture over: the two frame buffers go with it
      first(false);
    })();
    // a fresh copy of the whole frame (the caller may hand its buffer to the worker)
    s.full = () => !s.cur ? gone() : ({w: s.videoWidth, h: s.videoHeight, d: s.cur.slice()});
    // the game at its own size: one pixel per k x k block starting at (ox, oy), same pick as GrindReaders.shrink
    s.shrunk = ({k, ox, oy}) => {
      if (!s.cur) gone();
      const w = s.videoWidth, h = s.videoHeight, d = s.cur, W = Math.floor((w - ox) / k), H = Math.floor((h - oy) / k), out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0, i = ((oy + y * k) * w + ox) * 4, o = y * W * 4; x < W; x++, i += k * 4, o += 4){ out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255 }
      return {w: W, h: H, d: out, k};
    };
    s.drop = () => { rd.cancel().catch(() => {}); s.cur = spare = null };   // stop reading, leave the capture running (for a <video> to take over)
    return s;
  }
  return {open};
})();
