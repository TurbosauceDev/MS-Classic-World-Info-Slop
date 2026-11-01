// MS Classic Markers: Premiere Pro side (ExtendScript = ES3: var only, no JSON, no Array.map).
// Adds typed markers at the playhead and exports them as one CSV per source recording, in the recording's own time,
// next to the recording (<video>.csv), which scripts/video2fixtures.js picks up on its own.
// Pure helpers (msctToSource, msctCsv, msctFmt) are tested in node by tests/premiere.test.js with a fake Premiere.

var MSCT_COLORS = {"misread": 1, "loot": 4, "levelup": 0, "death": 2, "potion": 7, "proc": 6, "kpq-stage": 3, "map-change": 5, "party": 5, "chat": 5};

function msctFmt(s){ var m = Math.floor(s / 60), r = Math.round((s - m * 60) * 10) / 10; return m + ":" + (r < 10 ? "0" : "") + r }

// clips: [{start, end, inPoint, speed, path}] in sequence seconds, top track first. Returns {path, t, speed} or null.
function msctToSource(clips, t){
  for (var i = 0; i < clips.length; i++){
    var c = clips[i];
    if (t >= c.start && t < c.end) return {path: c.path, t: c.inPoint + (t - c.start) * (c.speed || 1), speed: c.speed || 1, clip: i};
  }
  return null;
}

function msctCell(v){ v = String(v === undefined || v === null ? "" : v).replace(/[\t\r\n]+/g, " "); return v }
// rows: [{name, note, from, to}] in source seconds -> Premiere "Export Markers" layout (tab separated), times in seconds
function msctCsv(rows){
  var out = ["Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type"];
  for (var i = 0; i < rows.length; i++){
    var r = rows[i], d = Math.max(0, r.to - r.from);
    out.push([msctCell(r.name), msctCell(r.note), r.from.toFixed(3), r.to.toFixed(3), d.toFixed(3), "Comment"].join("\t"));
  }
  return out.join("\r\n") + "\r\n";
}

// every clip of every video track, top track first (the top clip is what's on screen)
function msctClips(seq){
  var list = [];
  for (var k = seq.videoTracks.numTracks - 1; k >= 0; k--){
    var tr = seq.videoTracks[k];
    for (var i = 0; i < tr.clips.numItems; i++){
      var c = tr.clips[i], p = c.projectItem, path = null, sp = 1;
      try { path = p && p.getMediaPath ? p.getMediaPath() : null } catch (e){}
      try { if (c.getSpeed) sp = c.getSpeed() } catch (e){}
      if (path) list.push({start: c.start.seconds, end: c.end.seconds, inPoint: c.inPoint.seconds, speed: sp, path: path});
    }
  }
  return list;
}

function msctSeq(){ return app.project ? app.project.activeSequence : null }

// a marker from playhead-pre to playhead+post (both seconds)
function msctAdd(type, pre, post, note){
  var seq = msctSeq(); if (!seq) return "ERR:Open a sequence first.";
  var t = seq.getPlayerPosition().seconds;
  return msctMake(seq, type, Math.max(0, t - pre), t + post, note);
}
function msctMake(seq, type, from, to, note){
  var m = seq.markers.createMarker(from);
  m.name = type; m.comments = note || "";
  if (to > from) m.end = to;
  try { if (MSCT_COLORS[type] !== undefined) m.setColorByIndex(MSCT_COLORS[type]) } catch (e){}
  $.global.msctLast = m;
  return "OK:" + type + " " + msctFmt(from) + (to > from ? "-" + msctFmt(to) : "");
}

// range markers: first call remembers the playhead, second makes the marker
function msctRange(type, note){
  var seq = msctSeq(); if (!seq) return "ERR:Open a sequence first.";
  var t = seq.getPlayerPosition().seconds;
  if ($.global.msctRangeAt === undefined || $.global.msctRangeAt === null){ $.global.msctRangeAt = t; return "RANGE:" + msctFmt(t) }
  var a = Math.min($.global.msctRangeAt, t), b = Math.max($.global.msctRangeAt, t);
  $.global.msctRangeAt = null;
  return msctMake(seq, type, a, b, note);
}
function msctRangeCancel(){ $.global.msctRangeAt = null; return "OK:range cancelled" }

function msctUndo(){
  var seq = msctSeq(), m = $.global.msctLast; if (!seq || !m) return "ERR:Nothing to undo.";
  seq.markers.deleteMarker(m); $.global.msctLast = null; return "OK:last marker removed";
}

// every sequence marker -> source time; one CSV per recording, written next to it. Returns a summary line.
function msctExport(){
  var seq = msctSeq(); if (!seq) return "ERR:Open a sequence first.";
  var clips = msctClips(seq), by = {}, order = [], skipped = 0, warn = "";
  var m = seq.markers.getFirstMarker(), n = 0;
  while (m){
    n++;
    var a = m.start.seconds, b = m.end.seconds, s = msctToSource(clips, a);
    if (!s){ skipped++ } else {
      var c = clips[s.clip], e = Math.min(b, c.end - 0.001), sb = c.inPoint + (e - c.start) * s.speed;
      if (s.speed !== 1) warn = " Some clips are speed-changed: timings there are approximate.";
      if (!by[s.path]){ by[s.path] = []; order.push(s.path) }
      by[s.path].push({name: m.name, note: m.comments, from: s.t, to: Math.max(s.t, sb)});
    }
    m = seq.markers.getNextMarker(m);
  }
  if (!n) return "ERR:This sequence has no markers yet.";
  var files = [];
  for (var i = 0; i < order.length; i++){
    var p = order[i], out = p.replace(/\.[^.\\\/]+$/, "") + ".csv", f = new File(out);
    f.encoding = "UTF-8";
    if (!f.open("w")) return "ERR:Couldn't write " + out;
    f.write(msctCsv(by[p])); f.close();
    files.push(by[p].length + " -> " + out);
  }
  return "OK:Exported " + (n - skipped) + " markers. " + files.join(" | ") + (skipped ? " (" + skipped + " not over a clip, skipped)" : "") + warn;
}
