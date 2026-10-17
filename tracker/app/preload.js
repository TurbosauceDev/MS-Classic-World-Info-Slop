const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("host", {
  gameFound: () => ipcRenderer.invoke("game-found"),
  settings: s => ipcRenderer.invoke("settings", s),
  saveSession: summary => ipcRenderer.invoke("save-session", summary),
  saveFrame: (name, bytes) => ipcRenderer.invoke("save-frame", name, bytes),
  openFolder: dir => ipcRenderer.invoke("open-folder", dir),
});
