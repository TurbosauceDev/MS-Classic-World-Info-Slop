// Journey log writer (Node side, main.js): appends lines from core/combatlog.js to <userData>/journal/journal-<time>.log.
// A new file starts when the current one reaches maxFile bytes or at launch; old files are deleted (oldest first) so the folder
// stays under maxFiles / maxBytes (GrindJournal.prune). Every file begins with a JOURNAL_START line. Never throws: a full disk or
// a locked folder just drops lines (the tracker keeps running).
const fs = require("fs"), path = require("path");
const J = require("./combatlog.js");
function createWriter(dir, {app = "", maxFile = 4e6, maxFiles = 10, maxBytes = 40e6, now = Date.now} = {}){
  let cur = null, size = 0;
  const list = () => { try { return fs.readdirSync(dir).filter(n => /^journal-[\d-]+\.log$/.test(n)).map(n => { const s = fs.statSync(path.join(dir, n)); return {name: n, size: s.size, mtime: s.mtimeMs} }) } catch { return [] } };
  function open(t){
    fs.mkdirSync(dir, {recursive: true});
    let name = J.fileName(t); for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = J.fileName(t).replace(".log", "-" + i + ".log");   // two files in one second
    cur = path.join(dir, name); size = 0;
    const head = J.line(t, "JOURNAL_START", J.VERSION, app, "screen") + "\n";
    fs.appendFileSync(cur, head); size += Buffer.byteLength(head);
    for (const n of J.prune(list(), {maxFiles, maxBytes})) try { fs.unlinkSync(path.join(dir, n)) } catch {}
  }
  // lines: strings already formatted by GrindJournal.line (a non-string or one that doesn't parse is dropped)
  function append(lines){
    try {
      const ok = (Array.isArray(lines) ? lines : []).filter(l => typeof l === "string" && l.length < 2000 && J.parse(l));
      if (!ok.length) return 0;
      if (!cur || size >= maxFile) open(now());
      const text = ok.join("\n") + "\n"; fs.appendFileSync(cur, text); size += Buffer.byteLength(text);
      return ok.length;
    } catch { return 0 }
  }
  function info(){ const f = list(); return {dir, files: f.length, bytes: f.reduce((a, x) => a + x.size, 0), current: cur ? path.basename(cur) : null} }
  return {append, info, list, dir};
}
module.exports = {createWriter};
