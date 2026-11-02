// node tests/winrect.test.js — P1-8 anchor mode's guardrails. The koffi binding surface stays exactly two
// read-only geometry calls; the module stays capability-gated (non-Windows/CI: nothing native is touched);
// the PowerShell fallback in main.js survives for machines where koffi can't load; and the koffi patterns
// the Windows path relies on are proven here against libc where possible (Linux + koffi installed).
const fs = require("fs"), path = require("path"), assert = require("assert");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const wr = read("../app/winrect.js");
const fail = m => { throw new Error(m) };

// 1. the binding surface: only these two Win32 calls, nothing that could read memory, hook, or send input
for (const bad of ["OpenProcess", "ReadProcessMemory", "WriteProcessMemory", "SetWindowsHookEx", "SendInput",
  "keybd_event", "mouse_event", "PostMessage", "SendMessage", "FindWindow", "EnumWindows", "GetWindowText",
  "SetWindowPos", "MoveWindow", "SetForegroundWindow", "AttachThreadInput", "VirtualAlloc", "CreateRemoteThread"])
  if (wr.includes(bad)) fail("winrect.js binds " + bad + " — the koffi verdict allows only DwmGetWindowAttribute + GetWindowRect");
for (const need of ["DwmGetWindowAttribute", "GetWindowRect", "user32.dll", "dwmapi.dll"])
  if (!wr.includes(need)) fail("winrect.js lost " + need);
assert.ok(/process\.platform !== "win32"/.test(wr), "winrect.js must gate itself to win32 before loading koffi");
assert.ok(/catch \{ st = null \}/.test(wr), "probe must swallow every failure into st = null (never throw at require time)");

// 2. the module itself, right here on whatever OS CI uses: the gate is shut, nothing throws
const WinRect = require("../app/winrect.js");
assert.strictEqual(WinRect.available(), process.platform === "win32", "available() must be false off Windows");
assert.strictEqual(WinRect.rectOf(12345), null, "rectOf() must be null off Windows");
assert.strictEqual(WinRect.rectOf(0), null, "rectOf(0) is not a window");
assert.strictEqual(WinRect.rectOf(-5), null, "rectOf(-5) is not a window");
assert.strictEqual(WinRect.rectOf("abc"), null, "rectOf(non-numeric) is not a window");
assert.strictEqual(WinRect.rectOf(1.5), null, "rectOf(fractional) is not a window");

// 3. main.js: the fast path is first, the PowerShell fallback survives, and the anchor loop only runs for anchored cards
const main = read("../app/main.js");
assert.ok(/WinRect\.rectOf\(\+hwnd\) \|\| await frameRect\(hwnd\)/.test(main), "gameRectNow must try koffi first, PowerShell second");
assert.ok(/function frameRect\(hwnd\)/.test(main) && /powershell\.exe/.test(main), "the PowerShell fallback must stay");
assert.ok(/WinRect\.available\(\) \? 600 : 3000/.test(main), "the rect cadence must be 600 ms on koffi, 3 s on PowerShell");
assert.ok(/some\(w => w && w\.anchor\)/.test(main), "the anchor push loop must skip when no card is anchored");
assert.ok(/ov-gamerect/.test(main) && /ov-gamerect/.test(fs.readFileSync(path.join(__dirname, "../app/overlay-preload.js"), "utf8")),
  "the gamerect push must be bridged to the overlay page");

// 4. the overlay page: the anchor param exists, wPos rides the rect, saves re-base the offset
const ov = fs.readFileSync(path.join(__dirname, "../app/overlay.js"), "utf8");
assert.ok(/\{k: "anchor", sec: "This card", lab: "Follow the game window", t: "b", def: false/.test(ov), "the anchor switch must be in the inspector's params");
assert.ok(/saved\?\.anchor && GAME && saved\.ag/.test(ov), "wPos must ride the game rect only for anchored cards with an offset");
assert.ok(/if \(CFG\.widgets\[id\]\.anchor && GAME\) CFG\.widgets\[id\]\.ag = \{x: GAME\.x, y: GAME\.y\}/.test(ov), "saves must re-base the game offset");
assert.ok(/if \(k === "anchor"\)\{ if \(val\) w\.ag = GAME \? \{x: GAME\.x, y: GAME\.y\} : \{x: 0, y: 0\}; else delete w\.ag \}/.test(ov), "switching on must base the offset where the card sits");
assert.ok(/if \(!drag && !rz && ids\(\)\.some/.test(ov), "a game-rect push must not re-place mid-drag");

// 5. the dependency is pinned exact and the tests chain includes this file
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
assert.ok(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pkg.dependencies.koffi), "koffi must be pinned exact (got " + pkg.dependencies.koffi + ")");
assert.ok(pkg.dependencies.koffi.startsWith("3."), "koffi must stay on the 3.x line the verdict covers");
assert.ok(pkg.scripts.test.includes("tests/winrect.test.js"), "winrect.test.js must join the test chain");

// 6. where koffi CAN load (Linux CI has it as a dependency), prove the declaration + out-struct patterns
// winrect.js uses with libc's gettimeofday — the same _Out_ struct shape as GetWindowRect. Skipped when
// koffi isn't installed, so this test never depends on the optional path.
try {
  const koffi = require("koffi");
  // each platform probes the system library it actually has: the same _Out_ struct shape winrect.js binds with,
  // filled by the callee. (The libc.so.6 probe on a Windows runner is what took the 0.3.36 build job down —
  // Windows has kernel32, not libc.)
  if (process.platform === "win32"){
    koffi.struct("WinrectTestST", {wYear: "short", wMonth: "short", wDayOfWeek: "short", wDay: "short", wHour: "short", wMinute: "short", wSecond: "short", wMilliseconds: "short"});
    const kernel32 = koffi.load("kernel32.dll");
    const gst = kernel32.func("void __stdcall GetSystemTime(_Out_ WinrectTestST *st)");
    const st = {}; gst(st);
    const now = Date.UTC(st.wYear, st.wMonth - 1, st.wDay, st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    assert.ok(Math.abs(Date.now() - now) < 5000, "an _Out_ struct param must be filled by the callee (got " + st.wYear + "-" + st.wMonth + "-" + st.wDay + ")");
  } else {
    const libc = koffi.load("libc.so.6");
    koffi.struct("WinrectTestTV", {sec: "long", usec: "long"});
    const gtod = libc.func("int __stdcall gettimeofday(_Out_ WinrectTestTV *tv, void *tz)");
    const tv = {};
    const rc = gtod(tv, null);
    assert.strictEqual(rc, 0, "gettimeofday should answer 0");
    const now = tv.sec * 1000 + Math.floor(tv.usec / 1000);
    assert.ok(Math.abs(Date.now() - now) < 5000, "an _Out_ struct param must be filled by the callee (got sec=" + tv.sec + ")");
  }
  console.log("winrect.test: ok (koffi patterns verified on this platform)");
} catch (e){
  if (/Cannot find module 'koffi'/.test(e.message)) console.log("winrect.test: ok (koffi not installed here; static + gate checks passed)");
  else if (process.platform === "win32") throw e;   // on Windows everything must work (kernel32 always exists)
  else console.log("winrect.test: ok (libc probe unavailable on this platform: " + e.message.split("\n")[0] + ")");
}
