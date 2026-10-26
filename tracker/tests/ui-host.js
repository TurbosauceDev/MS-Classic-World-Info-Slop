// the Electron host API stubbed and a canvas standing in for the game window: page.addInitScript(require("./ui-host"))
// (shared by ui.test.js and layout.test.js)
module.exports = () => {
    window.host = {gameFound: async () => true, wholeScreen: async on => on, settings: async x => (window.st = {...(window.st || {share: false, idleSec: 60, partyCode: "snails"}), ...(x || {})}),
      party: async live => (window.sentParty = live, {expHr: 9000, members: [{you: true, level: 22, expHr: 4000}, {nick: "Bo<b>", job: "Hunter", level: 25, expHr: 5000, expHr5: 6000}]}),
      saveSession: async s => (window.saved = s, true), autosave: async s => (window.autosaved = s, true), autosaveGet: async () => window.autoRec || null, saveFrame: async () => "x", saveImage: async (n, b) => (window.img = {n, b: [...b]}, "x"), openFolder: async d => (window.opened = d), saveReport: async (f, info) => (window.report = {frames: f.length, info}, "report-2026-10-17T20-00-00"), ocr: async () => "Victoria Road\nSnail Hunting Ground III", shareRun: async r => ((window.shared ||= []).push(r), true), summary: async () => ({rows: [], times: {"42": [[0, 0.9, 3], [18, 1.2, 4]]}}), sessions: async () => [{saved: Date.now() - 3600e3, date: "2026-10-17", mapName: "Snail Hunting Ground III", level: 22, activeMin: 30, exp: 6000, mesos: 900, deaths: 1, player: "Turbow", job: "Archer", startLevel: 21, endLevel: 22, items: {"4000019": 3, "4000000": 9},
          levelUps: [{level: 22, activeMin: 41, mapName: "Snail Hunting Ground III"}, {level: 21, activeMin: null}]},
        {saved: Date.now() - 7200e3, date: "2026-10-17", mapName: "Pig Beach", level: 21, activeMin: 20, exp: 2000, mesos: 300, deaths: 0},
        {saved: Date.now() - 9 * 864e5, date: "2026-10-08", mapName: "Old", level: 10, activeMin: 60, exp: 1, mesos: 1}], updateSession: async (saved, p) => (window.updated = {saved, ...p}, true), exportCsv: async () => "", mini: async () => true, winSize: async (w, h) => (window.winSized = [w, h], true), snip: async () => null,
      version: async () => "0.2.17", updateState: async () => ({state: "idle"}), updateCheck: async () => (window.upd?.({state: "downloading", version: "0.2.18", pct: 40}), {state: "ready", version: "0.2.18"}),
      updateInstall: async () => (window.installed = true), onUpdate: cb => window.upd = cb, onMenu: cb => window.menu = cb, onShare: cb => window.shareReply = cb, themeBar: async c => (window.bar = c, true),
      keys: async (k, pause) => { const D = {onTop: "CommandOrControl+Shift+T", startStop: "CommandOrControl+Shift+S", pause: "CommandOrControl+Shift+P", mini: "CommandOrControl+Shift+M", show: "CommandOrControl+Shift+H", invNow: "CommandOrControl+Shift+I", report: "CommandOrControl+Shift+B"};
        D.clickThrough = "CommandOrControl+Shift+X"; D.mark = "CommandOrControl+Shift+N"; D.saveImage = "CommandOrControl+Shift+G"; D.mute = "CommandOrControl+Shift+U";
        window.keysPaused = !!pause; if (k) window.keysSt = {...(window.keysSt || {}), ...k}; return {keys: {...D, ...(window.keysSt || {})}, defaults: D, failed: []} }};
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement("canvas"); c.width = 800; c.height = 600;
      const x = c.getContext("2d"); setInterval(() => { x.fillStyle = "#" + Math.floor(Math.random() * 4095).toString(16); x.fillRect(0, 0, 800, 600) }, 100);
      return c.captureStream(4);
    };
};
