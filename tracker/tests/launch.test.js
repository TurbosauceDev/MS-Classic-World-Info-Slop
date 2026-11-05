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
if (!R) fails.push(`no result: exit ${r.status} signal ${r.signal}${r.error ? " " + r.error.message : ""}\n${(r.stderr || "").slice(-1500)}`);
else {
  if (!R.windows.length) fails.push("no window finished loading");
  if (!R.sources || !(R.sources.screen > 0)) fails.push(`desktopCapturer found no screen to capture (${JSON.stringify(R.sources)})`);
  for (const e of R.errors) fails.push(e);
}
for (const f of fails) console.log("FAILED:", f);
if (fails.length) process.exit(1);
console.log(`launch test passed (Electron ${R.electron}: ${R.windows.length} page loads [${[...new Set(R.windows)].join(", ")}], ${R.open} windows open, desktopCapturer ${R.sources.screen} screen(s) + ${R.sources.window} window(s), 0 errors)`);
