// Crash recovery for the running session (Node side, main.js): the renderer sends the run so far every minute; it's written
// to <userData>/sessions/autosave.json through a temp file and a rename (a crash or power cut mid-write leaves the old copy
// whole, never half a file). main.js sessions() only lists <digits>.json, so History never shows it. A normal save, or
// Discard, clears it; one left over at launch means the tracker closed while tracking.
const fs = require("fs"), path = require("path");
const FILE = "autosave.json", MAX = 2e6;   // a session summary is a few KB; anything this big isn't one
const at = dir => path.join(dir, FILE);
function write(dir, summary){
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
  const text = JSON.stringify(summary); if (text.length > MAX) return false;
  try { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(at(dir) + ".tmp", text); fs.renameSync(at(dir) + ".tmp", at(dir)); return true } catch { return false }
}
function read(dir){
  try { const f = at(dir); if (fs.statSync(f).size > MAX) return null; const x = JSON.parse(fs.readFileSync(f, "utf8")); return x && typeof x === "object" && !Array.isArray(x) ? x : null } catch { return null }
}
function clear(dir){ for (const f of [at(dir), at(dir) + ".tmp"]) try { fs.unlinkSync(f) } catch {} return true }
module.exports = {write, read, clear, FILE};
