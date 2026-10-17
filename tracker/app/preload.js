const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("host", {
  gameFound: () => ipcRenderer.invoke("game-found"),
  wholeScreen: on => ipcRenderer.invoke("whole-screen", on),
  settings: s => ipcRenderer.invoke("settings", s),
  saveSession: summary => ipcRenderer.invoke("save-session", summary),
  saveFrame: (name, bytes) => ipcRenderer.invoke("save-frame", name, bytes),
  openFolder: dir => ipcRenderer.invoke("open-folder", dir),
  ocr: png => ipcRenderer.invoke("ocr", png),
  shareRun: run => ipcRenderer.invoke("share-run", run),
  summary: () => ipcRenderer.invoke("summary"),
  sessions: () => ipcRenderer.invoke("sessions"),
  exportCsv: () => ipcRenderer.invoke("export-csv"),
  party: live => ipcRenderer.invoke("party", live),
  mini: on => ipcRenderer.invoke("mini", on),
});
