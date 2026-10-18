// the snip window: gets the frozen game picture, sends back the box the player drew (or null)
const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("snip", {
  onImage: fn => ipcRenderer.once("snip-image", (_, url) => fn(url)),
  done: rect => ipcRenderer.send("snip-done", rect),
});
