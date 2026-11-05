// Launch entry for tests/launch.test.js (Hermes 2026-11-03, #57 Electron 33 -> 45): runs the real app/main.js with a
// throwaway userData folder (never the player's settings), records what the windows and preloads report, and quits.
// Nothing here reads the game: it only checks that the app starts on this Electron and its pages load without errors.
const {app, BrowserWindow} = require("electron");
const out = process.env.MSCT_LAUNCH_OUT;
app.setPath("userData", process.env.MSCT_LAUNCH_USERDATA);
const R = {electron: process.versions.electron, windows: [], errors: []};
process.on("uncaughtException", e => R.errors.push("main: " + (e && e.stack || e)));
app.on("web-contents-created", (_, wc) => {
  wc.on("console-message", (...a) => {   // Electron 45: (event) with fields; older: (event, level, message)
    const e = a[0], level = e && e.level !== undefined ? e.level : a[1], msg = e && e.message !== undefined ? e.message : a[2];
    if (level === 3 || level === "error") R.errors.push("console: " + String(msg).slice(0, 300));
  });
  wc.on("preload-error", (_, p, err) => R.errors.push("preload " + p + ": " + String(err).slice(0, 300)));
  wc.on("render-process-gone", (_, d) => R.errors.push("renderer gone: " + d.reason));
  wc.on("did-fail-load", (_, code, desc, url) => { if (code !== -3) R.errors.push(`load failed ${code} ${desc}: ${url}`) });
  wc.on("did-finish-load", () => R.windows.push(wc.getURL().replace(/^.*[\\/]/, "")));
});
// the capture API the tracker reads the game through (main.js windowSource/screenSource): counts only, no titles
app.whenReady().then(() => setTimeout(async () => {
  const {desktopCapturer} = require("electron");
  try {
    R.sources = {};
    for (const t of ["screen", "window"]) R.sources[t] = (await desktopCapturer.getSources({types: [t], thumbnailSize: {width: 0, height: 0}})).length;
  } catch (e) { R.errors.push("desktopCapturer: " + String(e).slice(0, 300)) }
}, 3000));
// MSCT_LAUNCH_REPLAY (set by launch.test.js, which also passes --replay <folder>): the replay window opened on the real Electron;
// at 6 s it is sped up, and at the end its state is read back (did it finish, which EXP bars did the real readers see)
const replayWin = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /[?]replay=1/.test(w.webContents.getURL()));
if (process.env.MSCT_LAUNCH_REPLAY) setTimeout(() => replayWin()?.webContents.executeJavaScript("window.__replaySpeed && window.__replaySpeed(16)").catch(() => {}), 6000);
setTimeout(async () => {
  R.open = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).length;
  if (process.env.MSCT_LAUNCH_REPLAY){
    const w = replayWin();
    R.replay = w ? await w.webContents.executeJavaScript(`({st: window.__replay, bars: LOG.filter(l => l.kind === "event" && l.type === "bar").map(l => l.exp), panel: !!document.querySelector("#replayPanel"), keys: Object.keys(window.host).length})`).catch(e => ({error: String(e)})) : null;
  }
  require("fs").writeFileSync(out, JSON.stringify(R, null, 1));
  app.exit(0);
}, Number(process.env.MSCT_LAUNCH_MS || 12000));
require("../app/main.js");
