// Frames-folder pruning (0.3.41): Pictures\MS Classic Tracker frames collects the #frames button's bulk captures
// (frame-000.png … and, from older builds, frame-* folders) — 2.4 GB on Danny's PC. At tracker start the entries
// older than N days (settings.pruneFramesDays, default 30; settings.pruneFrames off by unchecking) are deleted.
// 0.3.45: the snap-* snapshot pictures moved to the runs folder (Pictures\MS Classic Tracker runs) and are never
// pruned - planFrames still only names frame-* entries, and the runs folder is not pruned at all.
// Frame pruning never touches report-* (bug reports); those have their own rules below (0.3.43, Danny 11-05): a folder
// Hermes renamed with the suffix "-checked" (diagnosed, evidence moved into the repo) is deleted at start whatever its age;
// unchecked AUTO reports ("-auto") are capped at settings.autoReportCapMb (default 1024) in total, oldest first; unchecked
// MANUAL reports (typed by Danny) are never deleted. Node-only: used by main.js, planned as pure functions for the tests.
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

/* bug-report folders: which to delete, given [{name, size, dir}] (size = bytes in the folder). Names carry the UTC time, so
   sorting by name is oldest first. checked = every "-checked" folder; auto = the oldest unchecked "-auto" folders until what is
   left fits capBytes. Manual unchecked reports (and anything else) are never named. */
const CHECKED = /^report-[\dT-]+(-auto)?-checked$/, AUTO = /^report-[\dT-]+-auto$/;
function planReports(entries, capBytes){
  const dirs = (entries || []).filter(e => e && e.dir !== false && typeof e.name === "string" && Number.isFinite(e.size));
  const checked = dirs.filter(e => CHECKED.test(e.name)).map(e => e.name);
  const auto = dirs.filter(e => AUTO.test(e.name)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const cap = Number(capBytes) >= 0 ? Number(capBytes) : 1024 * 1048576;
  let total = auto.reduce((a, e) => a + e.size, 0);
  const over = [];
  for (const e of auto){ if (total <= cap) break; over.push(e.name); total -= e.size }
  return {checked, auto: over};
}
const dirBytes = p => { let n = 0; try { for (const e of fs.readdirSync(p, {withFileTypes: true})){ const q = path.join(p, e.name); try { n += e.isDirectory() ? dirBytes(q) : fs.statSync(q).size } catch {} } } catch {} return n };   // a vanished or locked entry counts 0

/* clean the folder for real: {checked, auto, bytes}. capMb: settings.autoReportCapMb (default 1024; 0 or junk = default). */
function pruneReports(dir, capMb){
  let list = [];
  try { list = fs.readdirSync(dir, {withFileTypes: true}) } catch { return {checked: 0, auto: 0, bytes: 0} }   // no frames folder yet
  const mb = Number(capMb) > 0 ? Number(capMb) : 1024;
  const ents = list.filter(e => e.isDirectory() && /^report-/.test(e.name)).map(e => ({name: e.name, size: dirBytes(path.join(dir, e.name))}));
  const plan = planReports(ents, mb * 1048576), size = new Map(ents.map(e => [e.name, e.size]));
  let bytes = 0, checked = 0, auto = 0;
  for (const [n, list2] of [["checked", plan.checked], ["auto", plan.auto]]) for (const name of list2){
    try { fs.rmSync(path.join(dir, name), {recursive: true, force: true}); bytes += size.get(name) || 0; n === "checked" ? checked++ : auto++ }
    catch {}   // locked this boot (Explorer has it open): skipped, next start tries again
  }
  return {checked, auto, bytes};
}

module.exports = {planFrames, pruneFrames, planReports, pruneReports, CHECKED, AUTO};
