// node tests/replay.test.js — replay mode's guardrails (0.3.42). The replay window runs the real tracker over a bug report's
// pictures; it must be able to write nothing and send nothing. Same approach as winrect.test.js: read the sources and pin the
// contract, because the window itself needs Electron. The browser half is tests/replay-ui.test.js.
const fs = require("fs"), path = require("path"), assert = require("assert");
const raw = f => fs.readFileSync(path.join(__dirname, f), "utf8");
const read = f => raw(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const main = read("../app/main.js"), pre = read("../app/preload.js"), rpre = read("../app/replay-preload.js"), html = raw("../app/index.html"), rr = read("../app/renderer-replay.js");

// 1. main.js: argv parsing goes through GrindReplay.argFolder, on first launch and on a second launch (the running copy)
assert.ok(/require\("\.\.\/core\/replay\.js"\)/.test(main), "main.js loads core/replay.js");
assert.ok(/GrindReplay\.argFolder\(process\.argv\)/.test(main), "first launch: --replay is read from process.argv");
assert.ok(/second-instance",\s*\(_, argv\)\s*=>\s*\{\s*const rp = GrindReplay\.argFolder\(argv\);\s*if \(rp\) return openReplay\(rp\)/.test(main), "second launch with --replay opens the replay in the running copy");
assert.ok(/label: "Replay a bug report…", click: \(\) => pickReplay\(\)/.test(main), "Help menu entry");
assert.ok(/showOpenDialog\([^)]*\)?[^;]*properties: \["openDirectory"\]/.test(main.replace(/\n/g, " ")), "the Help item is a folder picker");

// 2. the window: its own preload, no navigation, the folder comes from main (never from the page)
const ow = main.slice(main.indexOf("function openReplay"), main.indexOf("async function pickReplay"));
assert.ok(/preload: path\.join\(__dirname, "replay-preload\.js"\)/.test(ow), "replay window uses replay-preload.js, not preload.js");
assert.ok(!/preload\.js"\)/.test(ow.replace("replay-preload.js", "")), "and nothing else");
assert.ok(/will-navigate/.test(ow) && /setWindowOpenHandler/.test(ow), "no navigation or new windows");
assert.ok(/ipcMain\.handle\("replay-load", e => \{\s*const dir = replayDirs\.get\(e\.sender\.id\)/.test(main), "replay-load answers only the folder main opened for that window");
const ld = main.slice(main.indexOf('ipcMain.handle("replay-load"'));
const ldBody = ld.slice(0, ld.indexOf("\n});") + 4);
assert.ok(!/writeFile|rmSync|unlink|rename|mkdir|shell\./.test(ldBody + ow), "opening and loading a replay writes nothing");

// 3. replay-preload.js, run against a fake Electron: every key of the real host exists, and the only IPC it can reach is the read-only set
function loadHost(file){
  const calls = [], ipc = {invoke: (c, ...a) => (calls.push(c), Promise.resolve(c === "replay-load" ? {log: {settings: {job: "Hunter", install: "x", share: true}}, frames: []} : null)), send: c => calls.push(c), on: c => calls.push("on:" + c)};
  let host; new Function("require", raw(file))(() => ({contextBridge: {exposeInMainWorld: (n, o) => host = o}, ipcRenderer: ipc}));
  return {host, calls};
}
(async () => {
  const real = loadHost("../app/preload.js").host, rp = loadHost("../app/replay-preload.js"), rh = rp.host;
  const names = h => Object.keys(h).filter(k => k !== "replay").sort();
  assert.deepStrictEqual(names(rh), names(real), "replay-preload.js must stub exactly the keys preload.js exposes (a new host call needs a safe replay stub)");
  const before = rp.calls.length;
  for (const k of names(rh)) { try { await rh[k]({}, {}, {}) } catch {} }   // call every stub with junk
  const chans = [...new Set(rp.calls)].sort();
  assert.deepStrictEqual(chans, ["ocr", "perf-main", "perf-metrics", "replay-load", "version"], "replay-preload.js reaches only these IPC channels, and listens to none: " + chans);
  const st = await rh.settings({share: true, partyCode: "abc", autoReport: true});
  assert.deepStrictEqual([st.share, st.partyCode, st.autoReport, st.job, st.guideDone], [false, "", false, "Hunter", true], "the report's settings load; sharing, the party and auto-reports stay off whatever the page asks");
  assert.strictEqual(await rh.saveReport([], {}), null); assert.strictEqual(await rh.saveSession({}), false); assert.strictEqual(await rh.shareRun({}), false);
  assert.deepStrictEqual(await rh.keys({}, false), {keys: {}, defaults: {}, failed: []}, "no global shortcuts from a replay");
  console.log("replay test passed");
})().catch(e => { console.error(e.message); process.exit(1) });

// 4. the page side: loaded last, only acts when the host has replay, no network or storage of its own
assert.ok(html.indexOf("renderer-replay.js") > html.indexOf("renderer-dummy.js"), "renderer-replay.js loads after the other renderer files");
assert.ok(html.indexOf("../core/flight.js") > 0 && html.indexOf("../core/flight.js") < html.indexOf('<script src="renderer.js">'), "core/flight.js loads before renderer.js");
assert.ok(/if \(!window\.host\?\.replay\) return/.test(rr), "renderer-replay.js is inert outside the replay window");
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|indexedDB|host\.(save|share|spot|autosave|journal|openExternal)/.test(rr), "renderer-replay.js has no way to write or send");

// 5. save-report: the state block, the auto folder name, and still nothing identifying
const sr = main.slice(main.indexOf('ipcMain.handle("save-report"'), main.indexOf("// Replay mode"));
assert.ok(/GrindFlight\.settingsDiff\(shown\)/.test(sr) && /const \{install, partyCode, nick, \.\.\.shown\} = readSettings\(\)/.test(sr), "now.settings is the diff of settings minus install/partyCode/nick");
assert.ok(/\(auto \? "-auto" : ""\)/.test(sr) && main.includes("/^report-[\\dT-]+(-auto)?(-checked)?$/.test(sub)"), "auto reports get a -auto folder name, and a hand-renamed -checked folder opens too: the Open-folder IPC accepts both");
assert.ok(main.includes("/^frame-\\d+-\\d{6}\\.(png|webp)$/.test(n)"), "the replay window accepts frame-*.png and frame-*.webp pictures");
assert.ok(!/fetch\(|https?:\/\/|net\.request|queue/i.test(sr), "save-report never uploads or queues anything");

// 6. the argument parser, with the shapes Electron really passes
const R = require("../core/replay.js");
assert.strictEqual(R.argFolder(["C:\\Program Files\\MS Classic Grind Tracker\\MS Classic Grind Tracker.exe", "--replay", "C:\\Users\\danny\\Pictures\\MS Classic Tracker frames\\report-2026-11-04T10-00-00"]), "C:\\Users\\danny\\Pictures\\MS Classic Tracker frames\\report-2026-11-04T10-00-00");
assert.strictEqual(R.argFolder(["electron.exe", ".", "--replay=report-x"]), "report-x");
