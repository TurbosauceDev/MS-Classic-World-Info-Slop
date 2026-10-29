// Frame buffer pool (pure, Node-tested; loaded by the tracker window). Screen frames are big (a 2560x1440 picture is
// 14.7 MB, its 2x-shrunk read 3.7 MB) and one used to be allocated for every read and thrown away by the reader
// worker a moment later — 2-4 reads a second meant 30-60 MB/s of pure allocator churn that kept both processes'
// working sets inflated. Now buffers circle: take() lends one out, the worker sends it back with its reply (see
// reader-worker.js), a frame dropped as unchanged comes straight back, and take() hands the same memory out again.
(function (root){
  function createBufPool(max = 4){
    const free = [];
    return {
      take(n){ const i = free.findIndex(b => b.byteLength === n); return i < 0 ? null : free.splice(i, 1)[0] },   // exact size only: a wrong-sized view would read garbage
      give(b){
        if (!(b instanceof ArrayBuffer) || b.byteLength === 0 || free.some(x => x === b)) return false;
        free.push(b);
        if (free.length > max) free.shift();   // a buffer that never comes back (a crashed worker) just isn't pooled; the cap keeps a burst from parking memory
        return true;
      },
      get size(){ return free.length },
      clear(){ free.length = 0 }
    };
  }
  const api = {createBufPool};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindBufPool = api;
})(typeof window !== "undefined" ? window : globalThis);
