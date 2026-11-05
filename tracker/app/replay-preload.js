// Replay window preload (0.3.42). Same `host` surface as preload.js so the real tracker page runs unchanged, but it can write
// nothing and send nothing: the only IPC channels here are replay-load (the one report folder this window was opened for, read
// only), ocr (the local map-name reader), version and the two read-only perf probes. Everything else is an in-memory no-op.
// tests/replay.test.js checks that every key of preload.js exists here and that no other channel is ever invoked.
const {contextBridge, ipcRenderer} = require("electron");
const none = async () => null, nope = async () => false, zero = () => {};
const loaded = ipcRenderer.invoke("replay-load");
let mem = null;
// the settings the report was saved with (identity keys already stripped), with sharing, the party and auto-reports off;
// changes stay in this window's memory
const settingsNow = async () => mem ||= {...((await loaded)?.log?.settings || {}), share: false, partyCode: "", nick: "", guideDone: true, autoReport: false, pruneFrames: false};
contextBridge.exposeInMainWorld("host", {
  replay: {load: () => loaded},
  soundsList: async () => [], soundsAdd: async () => [], soundsRemove: async () => [], soundsRead: none,
  gameFound: nope, wholeScreen: async on => !!on,
  settings: async s => { await settingsNow(); if (s) mem = {...mem, ...s, share: false, partyCode: "", autoReport: false}; return mem },
  saveSession: nope, autosave: nope, journalWrite: async () => 0, journalInfo: async () => ({files: 0, bytes: 0}), journalOpen: nope,
  openExternal: nope, autosaveGet: none, saveFrame: none, saveImage: none, saveReport: none, pruneFrames: async () => ({removed: 0, bytes: 0, days: 30}),
  openFolder: nope,
  ocr: (png, opt) => ipcRenderer.invoke("ocr", png, opt),
  shareRun: nope, shareShop: nope, spotShare: nope, spotsGet: async () => ({spots: []}), forgetShared: async () => ({ok: true, removed: 0}),
  summary: none, sessions: async () => [], deleteSession: nope, updateSession: nope, exportCsv: async () => "",
  party: none, mini: nope, winSize: nope,
  overlay: nope, borderless: nope, overlayEdit: nope, overlayPush: zero, feetPush: zero, onOverlay: zero, onBag: zero,
  menu: none, snip: none, themeBar: nope,
  keys: async () => ({keys: {}, defaults: {}, failed: []}),   // no global shortcuts from a replay window
  version: () => ipcRenderer.invoke("version"),
  perfMetrics: () => ipcRenderer.invoke("perf-metrics"), perfMain: () => ipcRenderer.invoke("perf-main"),
  readStats: zero,
  updateState: async () => ({state: "idle"}), updateCheck: async () => ({state: "idle"}), updateInstall: nope,
  siteMarket: async () => [null, 0, null], siteMarketRefresh: async () => [null, 0, null], siteMarketReady: zero, onSiteMarket: zero,
  onMenu: zero, onUpdate: zero, onShare: zero,
});
