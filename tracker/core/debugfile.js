// Debug log writer (Node side, main.js): appends lines from core/debuglog.js to <userData>/debug/debug-<time>.log. A new file starts
// at launch and whenever the current one reaches maxFile bytes; the oldest files go first so the folder stays under maxBytes.
// tail() hands a bug report the lines of the last N minutes. Never throws: a full disk or a locked folder just drops lines.
const fs = require("fs"), path = require("path");
const D = require("./debuglog.js");
const fileName = t => "debug-" + new Date(t).toISOString().slice(0, 19).replace(/:/g, "-") + ".log";
function createWriter(dir, {maxFile = 5e6, maxBytes = 50e6, now = Date.now} = {}){
  let cur = null, size = 0;
  const list = () => { try { return fs.readdirSync(dir).filter(n => /^debug-[\d-]+T[\d-]+(-\d+)?\.log$/.test(n)).sort().map(n => { const s = fs.statSync(path.join(dir, n)); return {name: n, size: s.size, mtime: s.mtimeMs} }) } catch { return [] } };   // missing folder = no files
  function prune(){
    const f = list(); let total = f.reduce((a, x) => a + x.size, 0);
    for (const x of f){ if (total <= maxBytes || x.name === (cur && path.basename(cur))) break; try { fs.unlinkSync(path.join(dir, x.name)); total -= x.size } catch { break } }   // locked: try again next roll
  }
  function open(t){
    fs.mkdirSync(dir, {recursive: true});
    let name = fileName(t); for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = fileName(t).replace(".log", "-" + i + ".log");   // two files in one second
    cur = path.join(dir, name); size = 0; fs.writeFileSync(cur, ""); prune();
  }
  // lines: strings already formatted by GrindDebugLog.format (anything else is dropped); returns how many were written
  function append(lines){
    try {
      const ok = (Array.isArray(lines) ? lines : []).filter(l => typeof l === "string" && l && l.length <= D.MAX_LINE + 8 && !/[\r\n]/.test(l) && Number.isFinite(D.parseTime(l)));
      if (!ok.length) return 0;
      if (!cur || size >= maxFile) open(now());
      const text = ok.join("\n") + "\n"; fs.appendFileSync(cur, text); size += Buffer.byteLength(text);
      return ok.length;
    } catch { return 0 }   // disk full / folder locked: the log is best effort
  }
  /* the lines at or after sinceMs, oldest first, as one string. If everything on disk is under smallBytes the whole set comes
     back (a short session reads better with its beginning). */
  function tail(sinceMs, smallBytes = 2e6){
    try {
      const f = list(), total = f.reduce((a, x) => a + x.size, 0), out = [];
      for (const x of f){
        if (total > smallBytes && x.mtime < sinceMs) continue;   // the whole file is older than the window
        for (const l of fs.readFileSync(path.join(dir, x.name), "utf8").split("\n")) if (l && (total <= smallBytes || D.parseTime(l) >= sinceMs)) out.push(l);
      }
      return out.length ? out.join("\n") + "\n" : "";
    } catch { return "" }   // unreadable folder: the report just has no debug text
  }
  // a bug report's copy: the last `minutes` of lines (or the whole set while it is small) as <reportDir>/debug.log; returns the line count
  function saveTail(reportDir, minutes = 30, nowMs = Date.now(), smallBytes = 2e6){
    const txt = tail(nowMs - minutes * 60e3, smallBytes);
    if (txt) fs.writeFileSync(path.join(reportDir, "debug.log"), txt);   // a failure throws to the caller, which logs it
    return txt ? txt.split("\n").length - 1 : 0;
  }
  function info(){ const f = list(); return {dir, files: f.length, bytes: f.reduce((a, x) => a + x.size, 0), current: cur ? path.basename(cur) : null} }
  return {append, tail, saveTail, info, list, dir};
}
module.exports = {createWriter, fileName};
