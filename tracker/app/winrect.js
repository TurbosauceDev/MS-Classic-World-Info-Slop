/* app/winrect.js — P1-8 anchor mode: read-only Win32 window-geometry queries through koffi.
   Why: main.js gets the game window's rect today by spawning powershell.exe with an Add-Type DllImport
   (frameRect/winRect there) and caching it for 3 s. A native query costs microseconds instead of a process
   spawn, so the overlay's anchored cards can track the game window at 600 ms, and the whole path stops
   depending on PowerShell being allowed to JIT (AppLocker/constrained-language setups break Add-Type).

   Guardrails (the koffi verdict in docs/ai/roadmap-p0-p1-execution.md, and tests/winrect.test.js enforces
   them on this file): user32 + dwmapi only, TWO functions, both pure geometry reads with an hwnd we already
   got from Electron's own capture source. NO OpenProcess, no ReadProcessMemory, no hooks, no input, no
   writes of any kind, no enumeration of other windows. Non-Windows, CI, or a machine where koffi won't
   load: probe() fails exactly once, available() stays false, rectOf() returns null, nothing native is
   touched — main.js falls back to the PowerShell path it always had. */

(function (root){
  "use strict";
  const DWMWA_EXTENDED_FRAME_BOUNDS = 9;   // DwmGetWindowAttribute: the visible frame, no invisible borders —
                                           // exactly the region Windows Graphics Capture records
  // a rect that could be a real window: positive area, inside any plausible desktop (Windows allows up to
  // 32767 px per axis; the bound exists so garbage from a bad read can never reach the overlay maths).
  // The minimized "iconic" rect (-32000,-32000, 160x28) passes a plain size check but slammed every anchored
  // card to the virtual desktop's top-left until the game was restored (round 2) — its signature is rejected.
  const ok = r => r.r > r.l && r.b > r.t && r.r - r.l <= 32767 && r.b - r.t <= 32767 && Math.abs(r.l) <= 32768 && Math.abs(r.t) <= 32768
    && !(r.l <= -30000 && r.t <= -30000 && r.r - r.l <= 200 && r.b - r.t <= 200);

  let st;   // undefined = not probed yet · null = unavailable (probed, failed) · object = the bound functions
  function probe(){
    if (st !== undefined) return st;
    try {
      if (process.platform !== "win32") throw new Error("win32 only");
      const koffi = require("koffi");
      const user32 = koffi.load("user32.dll"), dwm = koffi.load("dwmapi.dll");
      koffi.struct("TrackerRECT", {l: "long", t: "long", r: "long", b: "long"});
      // HWND values are 32-bit-significant; long long matches the register width on x64 without ever
      // being dereferenced (these two calls only read the value, like passing a handle in C).
      // Out-params take a plain {} (validated against libc's gettimeofday, same _Out_ struct shape:
      // koffi fills the JS object from the C struct the callee wrote).
      st = {
        dwa: dwm.func("long __stdcall DwmGetWindowAttribute(long long hwnd, unsigned long attr, _Out_ TrackerRECT *rect, unsigned long size)"),
        gwr: user32.func("bool __stdcall GetWindowRect(long long hwnd, _Out_ TrackerRECT *rect)")
      };
    } catch { st = null }
    return st;
  }

  /* rectOf(hwnd) -> {x, y, width, height} in physical px, or null.
     DWM extended frame bounds first (what the capture records, invisible borders excluded);
     GetWindowRect answers when DWM is unavailable (basic UI-less sessions, old servers). */
  function rectOf(hwnd){
    const b = probe(); if (!b) return null;
    const h = +hwnd;
    if (!Number.isInteger(h) || h <= 0 || h > 0xffffffff) return null;   // an hwnd, never a pointer-sized write target
    try {
      const r = {};
      if (b.dwa(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) === 0 && ok(r)) return {x: r.l, y: r.t, width: r.r - r.l, height: r.b - r.t};
      if (b.gwr(h, r) && ok(r)) return {x: r.l, y: r.t, width: r.r - r.l, height: r.b - r.t};
    } catch {}
    return null;
  }

  const available = () => !!probe();
  const api = {available, rectOf, ok};   // ok exported for the rect sanity tests (it is the overlay maths' only gate)
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindWinRect = api;
})(typeof self !== "undefined" ? self : globalThis);
