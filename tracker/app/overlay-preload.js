// Overlay window's bridge: the tracker window does all the reading and maths; this page gets data pushes and
// edit/lock/screen events, and saves its widget layout through the same settings.json (main.js holds the handlers).
const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("ovhost", {
  state: () => ipcRenderer.invoke("ov-state"),   // {edit, widgets, desk: {x, y, width, height} (the whole virtual desktop)}
  settings: s => ipcRenderer.invoke("settings", s),
  edit: on => ipcRenderer.invoke("ov-edit", on),
  done: () => ipcRenderer.invoke("ov-edit", false),
  bag: tab => ipcRenderer.send("ov-bag", tab),   // a bag icon clicked: the tracker window runs the scan
  hit: on => ipcRenderer.send("ov-hit", !!on),   // the mouse is over a clickable bit: take clicks there, pass the rest through
  protect: on => ipcRenderer.send("ov-protect", !!on),   // Chat blocker on/off: leave the overlay window out of screen capture
  close: () => ipcRenderer.invoke("ov-close"),
  onData: cb => ipcRenderer.on("ov-data", (_, d) => cb(d)),
  onMode: cb => ipcRenderer.on("ov-mode", (_, on) => cb(on)),
  showMain: () => ipcRenderer.invoke("bd-exit"),
  onBorderless: cb => ipcRenderer.on("ov-borderless", (_, b) => cb(b)),
  onScreens: cb => ipcRenderer.on("ov-screens", (_, d) => cb(d)),
});
