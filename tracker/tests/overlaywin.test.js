// node tests/overlaywin.test.js — overlay transparency guard (Danny 10-29: 0.3.11's process-per-site merged the overlay into
// the tracker's renderer and the transparent overlay went solid black). Electron can't run in CI, so this pins the source:
// the overlay window stays transparent + frameless, its page paints nothing behind the cards, and no switch that merges
// or software-composites the windows is set.
const fs = require("fs"), path = require("path");
const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const html = fs.readFileSync(path.join(__dirname, "../app/overlay.html"), "utf8");
const fail = m => { throw new Error(m) };
for (const bad of ["process-per-site", "single-process", "in-process-gpu", "disable-gpu", "disable-software-rasterizer", "disable-gpu-compositing", "disable-direct-composition"])
  if (main.includes('"' + bad + '"')) fail("main.js sets the '" + bad + "' switch: it breaks the transparent overlay window (solid black)");
const m = main.match(/ovWin = new BrowserWindow\(\{[\s\S]*?webPreferences/);
if (!m || !/transparent:\s*true/.test(m[0]) || !/frame:\s*false/.test(m[0])) fail("overlay window must be created transparent:true, frame:false");
if (/backgroundColor/.test(m[0])) fail("overlay window must not set a backgroundColor");
if (!/html,\s*body\s*\{[^}]*background:\s*transparent/.test(html)) fail("overlay page html/body must be background:transparent");
console.log("overlaywin.test: ok");
