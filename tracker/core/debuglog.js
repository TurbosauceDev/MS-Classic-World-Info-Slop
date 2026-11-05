// Debug log line format (0.3.43, Danny 11-05: "like WoW's combat log, thousands of lines without worry"). One text line per entry:
//   2026-11-05T16:30:00.123Z  KIND  key=value key="a string" ...
// Pure (no files, no DOM): loaded by the window (renderer.js log()) and by Node (main.js, core/debugfile.js, the tests).
// Names stay out: format() blanks every string in `hide` (the character name, nick, party code) wherever it appears, and the
// callers log decisions and numbers, not chat or name boxes. The file stays on this PC; a bug report copies its last 30 minutes.
(function (root){
  const MAX_VAL = 160, MAX_LINE = 600;
  const ts = t => new Date(Number.isFinite(+t) ? +t : Date.now()).toISOString();
  const val = (v, whole) => {
    if (typeof v === "number") return Number.isFinite(v) ? String(Number.isInteger(v) ? v : Math.round(v * 1e4) / 1e4) : null;
    if (typeof v === "boolean") return v ? "1" : "0";
    let s = typeof v === "string" ? v : JSON.stringify(v);
    if (s == null) return null;
    s = s.replace(/\s+/g, " ");
    if (!whole && s.length > MAX_VAL) s = s.slice(0, MAX_VAL) + "...";
    return /^[\w.:\/+-]+$/.test(s) ? s : '"' + s.replace(/"/g, '""') + '"';
  };
  /* hide: strings that must not appear (case-insensitive, 2+ chars). A hit becomes <hidden>. */
  function scrub(s, hide){
    s = s.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"|]+/gi, "$1<user>");   // stack traces carry the Windows account name
    for (const h of hide || []){
      if (typeof h !== "string" || h.trim().length < 2) continue;
      s = s.replace(new RegExp(h.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<hidden>");
    }
    return s;
  }
  /* data: a plain object ({text: "...", n: 3}); t and kind keys are skipped (they are the line's own).
     kind "perf" (0.3.46) is never truncated: the per-minute performance line is the lag diagnostic, cutting it hid
     the numbers at the end (ring encode, heap, main process, loop lag) — exactly the ones "it lags" needs. */
  function format(t, kind, data, hide){
    const whole = String(kind || "").toLowerCase() === "perf";
    const parts = [];
    for (const [k, v] of Object.entries(data && typeof data === "object" ? data : {})){
      if (k === "t" || k === "kind" || v == null || typeof v === "function") continue;
      const s = val(v, whole); if (s == null) continue;
      parts.push(k.replace(/\W+/g, "_") + "=" + s);
    }
    let line = ts(t) + "  " + String(kind || "LOG").toUpperCase().replace(/\W+/g, "_") + (parts.length ? "  " + parts.join(" ") : "");
    line = scrub(line.replace(/[\r\n]+/g, " "), hide);
    return !whole && line.length > MAX_LINE ? line.slice(0, MAX_LINE) + "..." : line;
  }
  // the time at the front of a line, in ms; NaN for anything else
  const parseTime = s => { const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)  /.exec(String(s)); return m ? Date.parse(m[1]) : NaN };
  const D = {format, parseTime, scrub, MAX_LINE};
  root.GrindDebugLog = D;
  if (typeof module !== "undefined") module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
