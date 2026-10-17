// Electron main process: one small always-on-top window. Captures only the MapleStory window's pixels (the same API OBS
// and Discord use); it never opens the game's files or memory and never sends input to it.
const {app, BrowserWindow, desktopCapturer, session, ipcMain, shell} = require("electron");
const fs = require("fs"), path = require("path");
const {autoUpdater} = require("electron-updater");

const SETTINGS = path.join(app.getPath("userData"), "settings.json");
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, "utf8")) } catch { return {share: true, idleSec: 60} } };
// shared runs go to our server (server/ in the repo); runs wait in the queue file until it answers
const SERVER = "https://ms-classic-tracker.maplestoryclassic.workers.dev";
const QUEUE = path.join(app.getPath("userData"), "run-queue.json");
const writeSettings = s => fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 1));
const SESSIONS = path.join(app.getPath("userData"), "sessions");   // finished sessions, kept locally either way

// Windows Graphics Capture (what OBS uses) instead of the old GDI window grab, which gives black frames for DirectX games
app.commandLine.appendSwitch("enable-features", "WebRtcAllowWgcWindowCapturer,WebRtcAllowWgcScreenCapturer,AllowWgcWindowCapturer,AllowWgcScreenCapturer");

let win, wholeScreen = false;   // fallback when the game window still comes back black: the readers find the UI anywhere on screen
async function gameSource(){
  const srcs = await desktopCapturer.getSources({types: ["window"], thumbnailSize: {width: 0, height: 0}});
  return srcs.find(s => /^maplestory$/i.test(s.name)) || srcs.find(s => /maplestory/i.test(s.name) && !/chrome|launcher|tracker/i.test(s.name)) || null;
}
async function captureSource(){
  if (!wholeScreen) return gameSource();
  const [screen] = await desktopCapturer.getSources({types: ["screen"], thumbnailSize: {width: 0, height: 0}});
  return screen || null;
}

app.whenReady().then(() => {
  win = new BrowserWindow({width: 360, height: 600, alwaysOnTop: readSettings().onTop !== false, title: "MS Classic Grind Tracker",
    webPreferences: {preload: path.join(__dirname, "preload.js"), contextIsolation: true}});
  // getDisplayMedia() in the page gets the game window, chosen here (no picker)
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    const src = await captureSource();
    cb(src ? {video: src} : {});
  });
  // the window only ever shows our own page: no new windows, no navigating away
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  flushRuns().catch(() => {});
  setInterval(() => app.isPackaged && autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 3600e3);
});
app.on("window-all-closed", () => app.quit());

ipcMain.handle("whole-screen", (_, on) => { wholeScreen = !!on; return wholeScreen });
ipcMain.handle("game-found", async () => !!(await gameSource()));
ipcMain.handle("settings", (_, s) => {
  const cur = readSettings();
  if (!cur.install) cur.install = require("crypto").randomUUID();   // random ID of this copy: one vote per player
  writeSettings({...cur, ...(s || {})});
  if (s && "onTop" in s) win?.setAlwaysOnTop(!!s.onTop);
  return readSettings();
});
// a finished 15-minute run (sharing on): queue it, then send everything queued. Kept until the server answers.
const readQueue = () => { try { return JSON.parse(fs.readFileSync(QUEUE, "utf8")) } catch { return [] } };
let flushing = false;
async function flushRuns(){
  if (!SERVER || flushing) return;
  flushing = true;
  try {
    const q = readQueue(), left = [];
    for (const run of q){
      try {
        const r = await fetch(SERVER + "/api/runs", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(run)});
        if (r.status === 429 || r.status >= 500) left.push(run);   // try again later; other answers are final
      } catch { left.push(run) }
    }
    // runs queued while this was sending stay queued
    const sent = new Set(q.map(r => JSON.stringify(r))), added = readQueue().filter(r => !sent.has(JSON.stringify(r)));
    fs.writeFileSync(QUEUE, JSON.stringify([...left, ...added]));
  } finally { flushing = false }
}
// shared data for the speed check, fetched at most every 30 minutes
let summary = null, summaryAt = 0;
ipcMain.handle("summary", async () => {
  if (SERVER && Date.now() - summaryAt > 30 * 60e3){
    try { const r = await fetch(SERVER + "/api/summary"); if (r.ok){ summary = await r.json(); summaryAt = Date.now() } } catch {}
  }
  return summary;
});
// session history: the saved session summaries, newest first, and a CSV of them in Documents
function sessions(){
  try {
    return fs.readdirSync(SESSIONS).filter(f => /^\d+\.json$/.test(f)).sort((a, b) => b.localeCompare(a, undefined, {numeric: true})).slice(0, 200)
      .map(f => { try { return {saved: +f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(SESSIONS, f), "utf8"))} } catch { return null } }).filter(Boolean);
  } catch { return [] }
}
ipcMain.handle("sessions", () => sessions());
ipcMain.handle("export-csv", () => {
  const q = v => /[",\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? "");
  const head = ["saved", "date", "map", "level", "job", "party", "active_min", "kills", "exp", "mesos", "exp_hr", "mesos_hr"];
  const rows = sessions().map(x => { const h = (x.activeMin || 0) / 60;
    return [new Date(x.saved).toISOString(), x.date, x.mapName || x.map, x.level, x.job, x.party, x.activeMin, x.kills, x.exp, x.mesos,
      h ? Math.round(x.exp / h) : "", h ? Math.round(x.mesos / h) : ""] });
  const file = path.join(app.getPath("documents"), "MS Classic Tracker sessions.csv");
  fs.writeFileSync(file, [head, ...rows].map(r => r.map(q).join(",")).join("\r\n"));
  shell.showItemInFolder(file);
  return file;
});
// mini bar: a small strip with just EXP/hr and time to level
ipcMain.handle("mini", (_, on) => { if (win){ win.setSize(360, on ? 92 : 600) } return !!on });
ipcMain.handle("share-run", async (_, run) => {
  const q = readQueue(); q.push({...run, install: readSettings().install}); fs.writeFileSync(QUEUE, JSON.stringify(q.slice(-200)));
  await flushRuns(); return true;
});
ipcMain.handle("save-session", (_, summary) => {
  fs.mkdirSync(SESSIONS, {recursive: true});
  fs.writeFileSync(path.join(SESSIONS, Date.now() + ".json"), JSON.stringify(summary));
  // upload goes here once the shared backend exists; until then sessions stay on this PC
  return true;
});
// "Save sample frames": raw captures for building and testing the screen readers
const FRAMES = () => path.join(app.getPath("pictures"), "MS Classic Tracker frames");
ipcMain.handle("save-frame", (_, name, pngBytes) => {
  const dir = FRAMES();
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, path.basename(String(name))), Buffer.from(pngBytes));   // a file name only, never a path
  return dir;
});
ipcMain.handle("open-folder", () => shell.openPath(FRAMES()));   // only ever the frames folder

// map name: OCR of the minimap title (a black-on-white PNG the renderer cuts out). Tesseract runs here, offline, with the
// English model shipped in the installer; files are unpacked from the asar because its worker thread loads them from disk.
let ocr = null;
const unpacked = p => p.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
function ocrWorker(){
  if (!ocr){
    const {createWorker} = require("tesseract.js");
    const langPath = unpacked(path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0"));
    const workerPath = unpacked(path.join(path.dirname(require.resolve("tesseract.js/package.json")), "src/worker-script/node/index.js"));
    ocr = createWorker("eng", 1, {langPath, workerPath, cacheMethod: "none", gzip: true});
    ocr.catch(() => ocr = null);
  }
  return ocr;
}
ipcMain.handle("ocr", async (_, pngBytes) => {
  try { return (await (await ocrWorker()).recognize(Buffer.from(pngBytes))).data.text } catch { return "" }
});
