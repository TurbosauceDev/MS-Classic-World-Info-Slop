// Electron main process: one small always-on-top window. Captures only the MapleStory window's pixels (the same API OBS
// and Discord use); it never opens the game's files or memory and never sends input to it.
const {app, BrowserWindow, desktopCapturer, session, ipcMain, shell, Menu, globalShortcut, nativeTheme} = require("electron");
const fs = require("fs"), path = require("path");
const {autoUpdater} = require("electron-updater");

const SETTINGS = path.join(app.getPath("userData"), "settings.json");
const readSettings = () => { try { const s = JSON.parse(fs.readFileSync(SETTINGS, "utf8")); if (s && typeof s === "object" && !Array.isArray(s)) return s } catch {} return {share: false, idleSec: 60} };   // sharing: the first-run guide asks
// shared runs go to our server (server/ in the repo); runs wait in the queue file until it answers
// every request gives up after 10-20 s: a hung connection would otherwise keep the run queue busy until a restart
const SERVER = "https://ms-classic-tracker.maplestoryclassic.workers.dev";
const QUEUE = path.join(app.getPath("userData"), "run-queue.json");
// written to a temp file first, then swapped in: a crash or power cut mid-write can't leave a half file (that lost every
// setting and the install ID)
const writeAtomic = (file, text) => { fs.writeFileSync(file + ".tmp", text); fs.renameSync(file + ".tmp", file) };
const writeSettings = s => writeAtomic(SETTINGS, JSON.stringify(s, null, 1));
const SESSIONS = path.join(app.getPath("userData"), "sessions");   // finished sessions, kept locally either way

// Windows Graphics Capture (what OBS uses) instead of the old GDI window grab, which gives black frames for DirectX games
app.commandLine.appendSwitch("enable-features", "WebRtcAllowWgcWindowCapturer,WebRtcAllowWgcScreenCapturer,AllowWgcWindowCapturer,AllowWgcScreenCapturer");

let themeBar = null, setBar = () => {};   // the theme's title bar colours {color, symbolColor, bg}, from the page
// the page's theme (Settings > Theme): the Windows-drawn title bar buttons and the window's background follow it
ipcMain.handle("theme-bar", (_, c) => {
  const hex = x => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);
  themeBar = c && hex(c.color) && hex(c.symbolColor) && hex(c.bg) ? {color: c.color, symbolColor: c.symbolColor, bg: c.bg} : null;
  setBar(); return !!themeBar;
});
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

// one copy at a time: a second one would read the same screen and send every run twice. Starting it again shows the first.
const firstCopy = app.requestSingleInstanceLock();
if (!firstCopy) app.quit();
app.on("second-instance", () => { if (win){ if (win.isMinimized()) win.restore(); win.focus() } });

app.whenReady().then(() => {
  if (!firstCopy) return;   // quitting: no window
  // our own title bar in the app's colours (the page draws it, see #titlebar); Windows still draws the minimize, maximize and
  // close buttons, in the same colours, light or dark like the page (Danny, 2026-10-18)
  // (a theme picked in Settings sends its own two colours: themeBar)
  const bar = () => themeBar ? {...themeBar, height: 32} : nativeTheme.shouldUseDarkColors ? {color: "#2a2243", symbolColor: "#f0eafd", height: 32} : {color: "#f7f1ff", symbolColor: "#2a2142", height: 32};
  setBar = () => { if (win && !win.isDestroyed()) try { win.setTitleBarOverlay(bar()); if (themeBar) win.setBackgroundColor(themeBar.bg) } catch {} };
  win = new BrowserWindow({...lastBounds(), title: "MS Classic Grind Tracker", titleBarStyle: "hidden", titleBarOverlay: bar(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1931" : "#e7ddf9",
    // backgroundThrottling off: behind the game or minimized, Chromium would slow the frame timer to once a second and,
    // after 5 minutes, once a minute, so pickup lines would scroll away unread
    webPreferences: {preload: path.join(__dirname, "preload.js"), contextIsolation: true, backgroundThrottling: false}});
  // getDisplayMedia() in the page gets the game window, chosen here (no picker)
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    const src = await captureSource();
    cb(src ? {video: src} : {});
  });
  // the window only ever shows our own page: no new windows, no navigating away
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
  nativeTheme.on("updated", () => setBar());
  // with the title bar hidden, the menu's zoom keys are handled here (F1 is the page's own)
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown" || !i.control || i.alt) return;
    const z = win.webContents, k = i.key;
    if (k === "=" || k === "+") z.setZoomLevel(Math.min(z.getZoomLevel() + 0.5, 5)); else if (k === "-") z.setZoomLevel(Math.max(z.getZoomLevel() - 0.5, -3)); else if (k === "0") z.setZoomLevel(0); else return;
    e.preventDefault();
  });
  // where the window was: saved half a second after a move or resize, and on close
  let saveT = null;
  const keep = () => { clearTimeout(saveT); saveT = setTimeout(saveBounds, 500) };
  win.on("moved", keep); win.on("resized", keep); win.on("close", () => { clearTimeout(saveT); saveBounds() });
  // our own menu instead of Electron's default (its Help menu only linked to Electron's site)
  const show = what => () => win && !win.isDestroyed() && win.webContents.send("menu", what);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: "File", submenu: [{label: "Settings", accelerator: "CmdOrCtrl+,", click: show("settings")}, {type: "separator"}, {label: "Open frames and bug reports folder", click: () => shell.openPath(FRAMES())}, {type: "separator"}, {role: "quit"}]},
    {label: "View", submenu: [{label: "Modules toolbox", click: show("toolbox")}, {label: "Mini bar", click: show("mini")}, {label: "Dummy data on/off (try layouts)", click: show("dummy")}, {label: "Fit every box to its content", click: show("fit")}, {label: "Line up every box", accelerator: "CmdOrCtrl+Shift+L", click: show("align")}, {type: "separator"}, {role: "zoomIn"}, {role: "zoomOut"}, {role: "resetZoom"}]},
    {label: "Help", submenu: [{label: "How to use the tracker", accelerator: "F1", click: show("help")}, {label: "Check for updates", click: show("update")},
      {label: "Report a bug", click: show("report")}, {type: "separator"}, {label: "About (version " + app.getVersion() + ")", click: show("help")}]},
  ]));
  pinOnTop(); applyOpacity();
  // keyboard shortcuts that work while the game has focus (Settings > Keyboard shortcuts)
  registerKeys();
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // other programs that clicked to the front or made themselves topmost (the game, overlays) could still cover it: take
  // the top back when this window loses focus, and every few seconds
  win.on("blur", pinOnTop);
  setInterval(pinOnTop, 5000);
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  flushRuns().catch(() => {});
  setInterval(() => flushRuns().catch(() => {}), 10 * 60e3);   // runs queued while a send was going, or while offline
  setInterval(() => app.isPackaged && autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 3600e3);
});
app.on("window-all-closed", () => app.quit());
// updates: checked at launch and every 6 h, downloaded in the background and installed when the app closes. The window
// can also check now ("Check for updates") and restart into a downloaded one right away; it's told each step.
let upd = {state: "idle"};
const sendUpd = p => { upd = {...upd, ...p}; if (win && !win.isDestroyed()) win.webContents.send("update", upd); return upd };
autoUpdater.on("checking-for-update", () => sendUpd({state: "checking"}));
autoUpdater.on("update-available", i => sendUpd({state: "downloading", version: i.version, pct: 0}));
autoUpdater.on("update-not-available", () => sendUpd({state: "latest"}));
autoUpdater.on("download-progress", p => sendUpd({state: "downloading", pct: Math.round(p.percent || 0)}));
autoUpdater.on("update-downloaded", i => sendUpd({state: "ready", version: i.version}));
autoUpdater.on("error", e => sendUpd({state: "error", why: String(e?.message || e).split("\n")[0].slice(0, 160)}));
ipcMain.handle("version", () => app.getVersion());
ipcMain.handle("update-state", () => upd);   // the window asks once loaded: events sent before that were missed
ipcMain.handle("update-check", async () => {
  if (!app.isPackaged) return sendUpd({state: "dev"});   // running from source: nothing to update
  if (upd.state === "ready" || upd.state === "downloading" || upd.state === "checking") return upd;
  try { await autoUpdater.checkForUpdates() } catch (e){ sendUpd({state: "error", why: String(e?.message || e).split("\n")[0].slice(0, 160)}) }
  return upd;
});
// silent install, then the app starts again by itself
ipcMain.handle("update-install", () => { if (upd.state !== "ready") return false; setImmediate(() => autoUpdater.quitAndInstall(true, true)); return true });
/* keyboard shortcuts, working from anywhere (the game too): settings.keys {action: accelerator, "" = off}, else these.
   Each one takes its keys away from every other program while the tracker runs, so all can be changed or turned off.
   Always on top was Danny's ask (2026-10-18); the others are the buttons players reach for mid-grind */
const KEYS = {onTop: "CommandOrControl+Shift+T", startStop: "CommandOrControl+Shift+S", pause: "CommandOrControl+Shift+P", mini: "CommandOrControl+Shift+M", toolbox: "CommandOrControl+Shift+K",
  show: "CommandOrControl+Shift+H", invNow: "CommandOrControl+Shift+I", report: "CommandOrControl+Shift+B",
  clickThrough: "CommandOrControl+Shift+X", mark: "CommandOrControl+Shift+N", saveImage: "CommandOrControl+Shift+G", mute: "CommandOrControl+Shift+U"};
// modifiers + one key; a key with no modifier only for F1-F24 (a plain letter would be taken from the game's own keys)
const ACCEL = /^(?:(?:(?:CommandOrControl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|-|=|,|\.|\/|;|'|\[|\]|\\|`|num[0-9])|F(?:[1-9]|1\d|2[0-4]))$/;
// Shift alone isn't enough on a letter (Shift+A is typing a capital A in chat); Alt+F4 stays Windows' close
const okKey = k => k === "" || ACCEL.test(k) && (/(^|\+)F\d+$/.test(k) || /(CommandOrControl|Alt|Super)\+/.test(k)) && k !== "Alt+F4";
const keysNow = () => { const k = readSettings().keys || {}; return Object.fromEntries(Object.entries(KEYS).map(([a, d]) => [a, typeof k[a] === "string" && okKey(k[a]) ? k[a] : d])) };
let keyFailed = [], clickThrough = false;
function registerKeys(){
  globalShortcut.unregisterAll(); keyFailed = [];
  for (const [a, k] of Object.entries(keysNow())){ if (!k) continue; let ok = false; try { ok = globalShortcut.register(k, () => keyAction(a)) } catch {} if (!ok) keyFailed.push(a) }
  if (clickThrough && (!keysNow().clickThrough || keyFailed.includes("clickThrough"))) keyAction("clickThrough");   // no way back otherwise
  return keyFailed;
}
function keyAction(a){
  if (!win || win.isDestroyed()) return;
  if (a === "onTop"){ const on = readSettings().onTop === false; writeSettings({...readSettings(), onTop: on}); pinOnTop(); win.webContents.send("menu", "onTop:" + on); return }
  // click-through: the mouse goes to the game under the window (an overlay); only its shortcut turns it back off, so it
  // starts off every launch and can't be turned on while that shortcut is off
  if (a === "clickThrough"){ clickThrough = !clickThrough; win.setIgnoreMouseEvents(clickThrough, {forward: true}); win.webContents.send("menu", "clickThrough:" + clickThrough); return }
  if (a === "show"){ if (win.isVisible() && !win.isMinimized()) win.minimize(); else { win.restore(); win.show(); pinOnTop() } return }
  if (a === "report"){ win.show(); win.focus() }
  win.webContents.send("menu", a);
}
// the Settings list: what each action is set to, the defaults, and which couldn't be had (another program holds them).
// keys: {action: accelerator | ""} to change; pause: true while a box waits for the new keys (so pressing one in use reaches it)
ipcMain.handle("keys", (_, keys, pause) => {
  if (pause){ globalShortcut.unregisterAll(); if (clickThrough) keyAction("clickThrough"); return {keys: keysNow(), defaults: KEYS, failed: []} }
  if (keys && typeof keys === "object"){
    const cur = {...(readSettings().keys || {})};
    for (const [a, k] of Object.entries(keys)) if (a in KEYS && typeof k === "string" && okKey(k)) cur[a] = k;
    for (const a of Object.keys(cur)) if (cur[a] === KEYS[a]) delete cur[a];   // back to the default: not stored
    writeSettings({...readSettings(), keys: cur});
  }
  return {keys: keysNow(), defaults: KEYS, failed: registerKeys()};
});
// see-through window (Settings): 40-100 %
function applyOpacity(){ if (win && !win.isDestroyed()){ const o = +readSettings().opacity; win.setOpacity(o >= 0.4 && o <= 1 ? o : 1) } }
// on top of everything: the "screen-saver" level beats plain always-on-top windows (Danny: it kept going under other programs)
function pinOnTop(){
  if (!win || win.isDestroyed()) return;
  if (readSettings().onTop === false){ win.setAlwaysOnTop(false); return }
  win.setAlwaysOnTop(true, "screen-saver"); win.moveTop();
}

// "Show me where": a full-screen window with the frozen game picture; the player drags a box (snipping-tool style)
// It opens on the game's monitor (Danny: it opened on his second monitor, where the tracker and the mouse were): the game
// window's spot from Windows (GetWindowRect on the captured window), else the captured screen, else the main monitor.
function winRect(hwnd){
  return new Promise(resolve => {
    const ps = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public struct R{public int L,T,Rt,B;}public static class W{[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out R r);}';`
      + `$r=New-Object R; if([W]::GetWindowRect([IntPtr][long]${hwnd},[ref]$r)){"$($r.L),$($r.T),$($r.Rt),$($r.B)"}`;
    require("child_process").execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {timeout: 5000, windowsHide: true}, (err, out) => {
      const n = String(out || "").trim().split(",").map(Number);
      resolve(!err && n.length === 4 && n.every(Number.isFinite) && n[2] > n[0] && n[3] > n[1] ? {x: n[0], y: n[1], width: n[2] - n[0], height: n[3] - n[1]} : null);
    });
  });
}
async function gameDisplay(){
  const {screen} = require("electron");
  try {
    const src = await captureSource();
    if (src?.display_id){ const d = screen.getAllDisplays().find(d => String(d.id) === String(src.display_id)); if (d) return d }   // whole-screen capture
    const hwnd = /^window:(\d+):/.exec(src?.id || "")?.[1];   // digits only: safe to put in the command
    if (hwnd && process.platform === "win32"){ const r = await winRect(hwnd); if (r) return screen.getDisplayMatching(screen.screenToDipRect(null, r)) }
  } catch {}
  return screen.getPrimaryDisplay();
}
let snipWin = null;
ipcMain.handle("snip", async (_, url) => { const d = await gameDisplay(); return new Promise(resolve => {
  if (snipWin && !snipWin.isDestroyed()) snipWin.close();
  snipWin = new BrowserWindow({...d.bounds, frame: false, fullscreen: true, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: {preload: path.join(__dirname, "snip-preload.js"), contextIsolation: true}});
  snipWin.setAlwaysOnTop(true, "screen-saver");
  let done = false;
  const finish = rect => { if (done) return; done = true; ipcMain.removeListener("snip-done", onDone); if (snipWin && !snipWin.isDestroyed()) snipWin.close(); snipWin = null; resolve(rect || null) };
  const onDone = (e, rect) => { if (e.sender === snipWin?.webContents) finish(rect) };
  ipcMain.on("snip-done", onDone);
  snipWin.on("closed", () => finish(null));
  snipWin.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  snipWin.webContents.on("will-navigate", e => e.preventDefault());
  snipWin.loadFile(path.join(__dirname, "snip.html")).then(() => { snipWin.webContents.send("snip-image", url); snipWin.show(); snipWin.focus() });
}) });
ipcMain.handle("whole-screen", (_, on) => { wholeScreen = !!on; return wholeScreen });
ipcMain.handle("game-found", async () => !!(await gameSource()));
ipcMain.handle("settings", (_, s) => {
  const cur = readSettings();
  if (!cur.install) cur.install = require("crypto").randomUUID();   // random ID of this copy: one vote per player
  writeSettings({...cur, ...(s || {})});
  if (s && "onTop" in s) pinOnTop();
  if (s && "opacity" in s) applyOpacity();
  if (s && s.share === false) writeAtomic(QUEUE, "[]");   // sharing turned off: runs still waiting to go up are dropped, not sent later
  return readSettings();
});
// a finished 15-minute run (sharing on): queue it, then send everything queued. Kept until the server answers.
const readQueue = () => { try { const q = JSON.parse(fs.readFileSync(QUEUE, "utf8")); return Array.isArray(q) ? q.filter(r => r && typeof r === "object") : [] } catch { return [] } };   // a broken file (null, {}) = nothing queued
let flushing = false;
async function flushRuns(){
  if (!SERVER || flushing || !readSettings().share) return;
  flushing = true;
  try {
    const q = readQueue(), left = [];
    for (const run of q){
      try {
        const r = await fetch(SERVER + (run.kpq ? "/api/kpq" : "/api/runs"), {signal: AbortSignal.timeout(20e3), method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(run)});
        if (r.status === 429 || r.status >= 500) left.push(run);   // try again later; other answers are final
      } catch { left.push(run) }
    }
    // runs queued while this was sending stay queued
    const sent = new Set(q.map(r => JSON.stringify(r))), added = readQueue().filter(r => !sent.has(JSON.stringify(r)));
    writeAtomic(QUEUE, JSON.stringify([...left, ...added].slice(-200)));   // capped: a long offline spell (or a server that keeps saying "too many") can't grow the file forever
  } finally { flushing = false }
}
// shared data for the speed check, fetched at most every 30 minutes
let summary = null, summaryAt = 0;
ipcMain.handle("summary", async () => {
  if (SERVER && Date.now() - summaryAt > 30 * 60e3){
    try { const r = await fetch(SERVER + "/api/summary", {signal: AbortSignal.timeout(20e3)}); if (r.ok){ summary = await r.json(); summaryAt = Date.now() } } catch {}
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
// History's delete: one saved session, by its file's time stamp (digits only: never a path)
ipcMain.handle("delete-session", (_, saved) => {
  if (!/^\d{10,16}$/.test(String(saved))) return false;
  try { fs.unlinkSync(path.join(SESSIONS, saved + ".json")); return true } catch { return false }
});
// History's rename/note: only name and note change (trimmed, the same caps as the Start box and the note field; empty = none)
ipcMain.handle("update-session", (_, saved, patch) => {
  if (!/^\d{10,16}$/.test(String(saved)) || !patch || typeof patch !== "object") return false;
  const file = path.join(SESSIONS, saved + ".json"), cut = (v, n) => typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
  try { const x = JSON.parse(fs.readFileSync(file, "utf8"));
    if ("name" in patch) x.name = cut(patch.name, 60); if ("note" in patch) x.note = cut(patch.note, 1000);
    writeAtomic(file, JSON.stringify(x)); return true } catch { return false }
});
ipcMain.handle("export-csv", () => {
  // text starting with = + - @ would run as a formula in Excel (map names come from OCR): prefixed with '
  const q = v => { let t = String(v ?? ""); if (typeof v === "string" && /^[=+\-@]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t };
  const head = ["saved", "date", "name", "player", "start_level", "end_level", "clock_min", "exp_total", "exp_per_active_min", "best_drop", "best_drop_each", "map", "level", "job", "party", "active_min", "kills", "exp", "mesos", "exp_hr", "mesos_hr", "deaths", "used_cost", "note"];
  const rows = sessions().map(x => { const h = (x.activeMin || 0) / 60;
    return [new Date(x.saved).toISOString(), x.date, x.name || "", x.player || "", x.startLevel ?? "", x.endLevel ?? "", x.clockMin ?? "", x.expTotal ?? x.snap?.exp ?? x.exp ?? "", x.expPerActiveMin ?? "", x.bestDrop?.name || "", x.bestDrop?.each ?? "", x.mapName || x.map, x.level, x.job, x.party, x.activeMin, x.kills, x.exp, x.mesos,
      h ? Math.round(x.exp / h) : "", h ? Math.round(x.mesos / h) : "", x.deaths ?? "", x.usedCost ?? "", x.note || ""] });
  const file = path.join(app.getPath("documents"), "MS Classic Tracker sessions.csv");
  // Excel locks a CSV it has open: say so instead of failing silently
  try { fs.writeFileSync(file, [head, ...rows].map(r => r.map(q).join(",")).join("\r\n")) }
  catch (e){ return {error: e.code === "EBUSY" || e.code === "EPERM" ? "The CSV is open in another program (Excel?). Close it and try again." : "Couldn't save the CSV: " + e.message} }
  shell.showItemInFolder(file);
  return {file};
});
// Mini view: the numbers and lists that matter while farming, the window sized to fit
// back from the mini bar: the size the window had before, not the default (a player who made it bigger keeps that)
let fullSize = null;
// the window opens where it was last time (same monitor, spot and size) when that spot is still on a monitor, else the default
function lastBounds(){
  const b = readSettings().winBounds, {screen} = require("electron");
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 200 || b.height < 100) return {width: 360, height: 600};
  // its title bar has to be on a monitor, at least 80 px of it, or it couldn't be dragged back
  const onScreen = screen.getAllDisplays().some(({workArea: w}) => Math.min(b.x + b.width, w.x + w.width) - Math.max(b.x, w.x) >= 80 && b.y >= w.y - 10 && b.y < w.y + w.height - 30);
  return onScreen ? {x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height)} : {width: 360, height: 600};
}
function saveBounds(){
  if (!win || win.isDestroyed() || win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
  const b = win.getBounds();
  if (fullSize) b.height = fullSize[1];   // mini bar: keep the full height, it opens full size
  writeSettings({...readSettings(), winBounds: b});
}
// the page's title bar buttons (File, View, Help) open the same menus the old menu bar had, under the button
ipcMain.handle("menu-popup", (_, label, x, y) => {
  const m = Menu.getApplicationMenu()?.items.find(i => i.label === label)?.submenu;
  if (m && win && !win.isDestroyed()) m.popup({window: win, x: Math.round(+x || 0), y: Math.round(+y || 0)});
});
ipcMain.handle("mini", (_, on, h) => {
  // on: h = the Mini view's height in page pixels (it changes as lists fill); the width stays
  // (fitted heights stop at the bottom of the monitor the window is on, so a long list never pushes it off screen)
  if (win){ if (on){ fullSize ||= win.getSize(); const z = win.webContents.getZoomFactor() || 1, b = win.getBounds(), c = win.getContentSize();
      const wa = require("electron").screen.getDisplayMatching(b).workArea, room = wa.y + wa.height - b.y - (b.height - c[1]);
      win.setContentSize(c[0], Math.max(140, Math.min(1400, room, Math.round((+h || 128) * z)))) }
    else { win.setSize(...(fullSize || [360, 600])); fullSize = null } }
  return !!on;
});
ipcMain.handle("share-run", async (_, run) => {
  const q = readQueue(); q.push({...run, install: readSettings().install}); writeAtomic(QUEUE, JSON.stringify(q.slice(-200)));
  await flushRuns(); return true;
});
ipcMain.handle("save-session", (_, summary) => {   // kept on this PC only (shared numbers go up as 15-minute runs)
  fs.mkdirSync(SESSIONS, {recursive: true});
  fs.writeFileSync(path.join(SESSIONS, Date.now() + ".json"), JSON.stringify(summary));
  return true;
});
// party view: post this tracker's live numbers with the party code, get everyone with the same code (server keeps them an hour)
ipcMain.handle("party", async (_, live) => {
  const st = readSettings();
  if (!SERVER || !st.partyCode) return null;
  try {
    const r = await fetch(SERVER + "/api/party", {signal: AbortSignal.timeout(10e3), method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({...live, install: st.install, partyCode: st.partyCode, nick: st.nick || ""})});
    return r.ok ? await r.json() : {error: r.status, why: (await r.json().catch(() => ({}))).error || ""};
  } catch { return null }
});
// "Save sample frames": raw captures for building and testing the screen readers
const FRAMES = () => path.join(app.getPath("pictures"), "MS Classic Tracker frames");
// run summary picture: Pictures\MS Classic Tracker runs, also copied to the clipboard for pasting into Discord
ipcMain.handle("save-image", (_, name, pngBytes, quiet) => {   // quiet: from a shortcut mid-game, no Explorer window
  const {nativeImage, clipboard} = require("electron"), dir = path.join(app.getPath("pictures"), "MS Classic Tracker runs");
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, path.basename(String(name))), buf = Buffer.from(pngBytes);
  fs.writeFileSync(file, buf); clipboard.writeImage(nativeImage.createFromBuffer(buf)); if (!quiet) shell.showItemInFolder(file);
  return file;
});
ipcMain.handle("save-frame", (_, name, pngBytes) => {
  const dir = FRAMES();
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, path.basename(String(name))), Buffer.from(pngBytes));   // a file name only, never a path
  return dir;
});
// bug report: frames + log.json in a new folder under the frames folder; returns the folder's name
ipcMain.handle("save-report", (_, frames, info) => {
  const name = "report-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19), dir = path.join(FRAMES(), name);
  fs.mkdirSync(dir, {recursive: true});
  for (const f of (Array.isArray(frames) ? frames : []).slice(0, 20)) fs.writeFileSync(path.join(dir, path.basename(String(f.name))), Buffer.from(f.bytes));
  const {install, partyCode, nick, ...shown} = readSettings();   // nothing that identifies the player
  fs.writeFileSync(path.join(dir, "log.json"), JSON.stringify({version: app.getVersion(), os: process.platform + " " + require("os").release(), saved: new Date().toString(), settings: shown, ...info}, null, 1));
  return name;
});
// only ever the frames folder, or a report folder inside it
ipcMain.handle("open-folder", (_, sub) => shell.openPath(typeof sub === "string" && /^report-[\dT-]+$/.test(sub) ? path.join(FRAMES(), sub) : FRAMES()));

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
// a fresh worker every 500 reads (about 40 minutes): Tesseract's memory creeps up over thousands of reads in one worker
let ocrReads = 0;
ipcMain.handle("ocr", async (_, pngBytes) => {
  try {
    const w = await ocrWorker(), text = (await w.recognize(Buffer.from(pngBytes))).data.text;
    if (++ocrReads >= 500){ ocrReads = 0; ocr = null; w.terminate().catch(() => {}) }
    return text;
  } catch { const o = ocr; ocr = null; o?.then(w => w.terminate()).catch(() => {}); return "" }   // broken worker: a new one next time
});
