// Frames-folder pruning (0.3.41): Pictures\MS Classic Tracker frames collects the #frames button's bulk captures
// (frame-000.png … and, from older builds, frame-* folders) — 2.4 GB on Danny's PC. At tracker start the entries
// older than N days (settings.pruneFramesDays, default 30; settings.pruneFrames off by unchecking) are deleted.
// Bug reports (report-*) are NEVER deleted. Node-only: used by main.js, planned as a pure function for the tests.
"use strict";
const fs = require("fs"), path = require("path");

/* which entry names to delete, given [{name, mtimeMs}]: only frame-* samples past the cutoff. Anything else —
   report-* bug reports, the top-level log.json, anything unknown — is never touched. */
function planFrames(entries, now, days){
  const d = Number(days) > 0 ? Number(days) : 30, cut = now - d * 86400e3;
  return entries.filter(e => /^frame-/.test(e.name) && Number.isFinite(e.mtimeMs) && e.mtimeMs < cut).map(e => e.name);
}

/* prune the folder for real; returns {removed, bytes}. Missing folder = nothing to do. */
function pruneFrames(dir, days, now){
  let list = [];
  try { list = fs.readdirSync(dir, {withFileTypes: true}) } catch { return {removed: 0, bytes: 0} }
  const ents = list.map(e => { let m = NaN; try { m = fs.statSync(path.join(dir, e.name)).mtimeMs } catch {}   // entry vanished mid-listing: no mtime, the planner skips it
  return {name: e.name, mtimeMs: m} });
  const names = planFrames(ents, Number.isFinite(now) ? now : Date.now(), days);
  let bytes = 0;
  for (const n of names){
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) fs.rmSync(p, {recursive: true, force: true});
      else { bytes += st.size; fs.rmSync(p, {force: true}) }
    } catch {}   // gone already, or locked this boot: skipped, next start tries again
  }
  return {removed: names.length, bytes};
}

module.exports = {planFrames, pruneFrames};
