// node tests/launch.test.js (CI: tracker.yml build job, windows-latest). Starts the real tracker on the installed Electron
// with a throwaway profile (tests/launch-entry.js) and fails on any startup error: a main-process exception, a preload
// error, a renderer crash, a failed page load or a console error. Added for the Electron 33 -> 45 bump (#57, 2026-11-03):
// the unit tests never start the app and the UI tests use plain Chromium, so before this nothing ran the app itself
// on a new Electron. Opens the tracker's windows for ~12 s, so it is not part of `npm test`.
const {spawnSync} = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const electron = require("electron");   // the binary path
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msct-launch-")), out = path.join(dir, "result.json");
const r = spawnSync(electron, [path.join(__dirname, "launch-entry.js")], {
  cwd: path.join(__dirname, ".."), timeout: 90000, encoding: "utf8",
  env: {...process.env, MSCT_LAUNCH_USERDATA: path.join(dir, "userData"), MSCT_LAUNCH_OUT: out, ELECTRON_ENABLE_LOGGING: "0"}});
let R = null;
try { R = JSON.parse(fs.readFileSync(out, "utf8")) } catch {}
fs.rmSync(dir, {recursive: true, force: true});
const fails = [];
// the replay window (0.3.42) on the real Electron: a throwaway report folder built from four of Danny's real frames, opened with
// --replay exactly as `MS Classic Grind Tracker.exe --replay <folder>` does; its preload, IPC and page must work end to end
{
  const rdir = fs.mkdtempSync(path.join(os.tmpdir(), "msct-replay-")), rout = path.join(rdir, "result.json"), T0 = Date.UTC(2026, 10, 4, 18, 0, 0), rep = path.join(rdir, "report-2026-11-04T18-00-12");
  fs.mkdirSync(rep);
  const names = ["frame-000.png", "frame-006.png", "frame-042.png", "frame-046.png"].map((f, i) => {
    const n = `frame-${i}-${new Date(T0 + i * 3000).toISOString().slice(11, 19).replace(/:/g, "")}.png`;
    fs.copyFileSync(path.join(__dirname, "frames", f), path.join(rep, n)); return {name: n, t: T0 + i * 3000} });
  fs.writeFileSync(path.join(rep, "log.json"), JSON.stringify({version: "0.3.41", saved: new Date(T0 + 20e3).toString(), settings: {share: true, partyCode: "x"}, frames: names, log: []}));
  const rr = spawnSync(electron, [path.join(__dirname, "launch-entry.js"), "--replay", rep], {cwd: path.join(__dirname, ".."), timeout: 120000, encoding: "utf8",
    env: {...process.env, MSCT_LAUNCH_USERDATA: path.join(rdir, "userData"), MSCT_LAUNCH_OUT: rout, MSCT_LAUNCH_REPLAY: "1", MSCT_LAUNCH_MS: "45000", ELECTRON_ENABLE_LOGGING: "0"}});
  let RR = null; try { RR = JSON.parse(fs.readFileSync(rout, "utf8")) } catch {}
  fs.rmSync(rdir, {recursive: true, force: true});
  const rf = [];
  if (!RR) rf.push(`replay: no result: exit ${rr.status} ${(rr.stderr || "").slice(-800)}`);
  else {
    for (const e of RR.errors) rf.push("replay: " + e);
    const x = RR.replay;
    if (!x || x.error || !x.panel || !x.st) rf.push("replay window state: " + JSON.stringify(x));
    else {
      if (x.st.error || !x.st.done || x.st.idx !== 3) rf.push("replay did not finish: " + JSON.stringify(x.st));
      for (const exp of [18572, 18757, 19803, 19894]) if (!x.bars.includes(exp)) rf.push("replay never read EXP " + exp + ": " + JSON.stringify(x.bars));
    }
  }
  for (const f of rf) fails.push(f);
  if (!rf.length) console.log("replay window passed on the real Electron (4 pictures, EXP bars read)");
}
if (!R) fails.push(`no result: exit ${r.status} signal ${r.signal}${r.error ? " " + r.error.message : ""}\n${(r.stderr || "").slice(-1500)}`);
else {
  if (!R.windows.length) fails.push("no window finished loading");
  if (!R.sources || !(R.sources.screen > 0)) fails.push(`desktopCapturer found no screen to capture (${JSON.stringify(R.sources)})`);
  for (const e of R.errors) fails.push(e);
}
for (const f of fails) console.log("FAILED:", f);
if (fails.length) process.exit(1);
console.log(`launch test passed (Electron ${R.electron}: ${R.windows.length} page loads [${[...new Set(R.windows)].join(", ")}], ${R.open} windows open, desktopCapturer ${R.sources.screen} screen(s) + ${R.sources.window} window(s), 0 errors)`);
