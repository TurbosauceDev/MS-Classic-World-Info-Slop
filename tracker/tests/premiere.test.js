// node tests/premiere.test.js — the Premiere marker panel (premiere/) against a fake Premiere: markers at the playhead,
// ranges, undo, and the export mapping sequence time back to each recording's own time (trimmed + multi-clip timeline),
// read back by scripts/video2fixtures.js. Premiere itself can't run in CI; the glue calls are the documented ExtendScript
// API (activeSequence, getPlayerPosition, markers.createMarker/getFirstMarker/getNextMarker/deleteMarker, trackItem
// start/end/inPoint/getSpeed, projectItem.getMediaPath, File).
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
const V = require("../scripts/video2fixtures.js"), dir = path.join(__dirname, "../premiere");
let fail = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)){ fail++; console.log("FAIL", m, "\n ", JSON.stringify(a), "\n ", JSON.stringify(b)) } };
const jsx = fs.readFileSync(path.join(dir, "markers.jsx"), "utf8");
// ExtendScript is ES3: these would be syntax errors in Premiere
eq(jsx.replace(/\/\/.*$/gm, "").match(/\blet |\bconst |=>|`|\.map\(|\.forEach\(|\.filter\(|JSON\./g), null, "markers.jsx stays ES3");
const T = s => ({seconds: s});
function fakeSeq(clips){
  const list = [];
  const markers = {
    createMarker(s){ const m = {start: T(s), _end: s, name: "", comments: "", color: null, setColorByIndex(i){ this.color = i }}; Object.defineProperty(m, "end", {get(){ return T(this._end) }, set(v){ this._end = v }}); list.push(m); list.sort((a, b) => a.start.seconds - b.start.seconds); return m },
    getFirstMarker(){ return list[0] || null }, getNextMarker(m){ return list[list.indexOf(m) + 1] || null },
    deleteMarker(m){ list.splice(list.indexOf(m), 1) }, get numMarkers(){ return list.length }};
  const tracks = clips.map(tr => { const c = tr.map(x => ({start: T(x[0]), end: T(x[1]), inPoint: T(x[2]), getSpeed: () => x[4] || 1, projectItem: {getMediaPath: () => x[3]}})); c.numItems = c.length; return {clips: c} });
  tracks.numTracks = tracks.length;
  return {pos: 0, getPlayerPosition(){ return T(this.pos) }, markers, videoTracks: tracks, list};
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ppro-")), A = path.join(tmp, "run-05.mp4"), B = path.join(tmp, "kpq.mov");
const written = {};
// V1: run-05 from its 600 s mark at sequence 0..60, then kpq from its 10 s mark at 60..120; V2: a title over 30..35 (no media path)
const seq = fakeSeq([[[0, 60, 600, A], [60, 120, 10, B]], [[30, 35, 0, null]]]);
const ctx = {app: {project: {activeSequence: seq}}, $: {global: {}},
  File: function(p){ this.p = p; this.open = () => true; this.write = s => { written[p] = (written[p] || "") + s }; this.close = () => {} }};
vm.createContext(ctx); vm.runInContext(jsx, ctx);
const run = s => vm.runInContext(s, ctx);
seq.pos = 20; eq(run('msctAdd("loot", 3, 5, "busy fight")'), "OK:loot 0:17-0:25", "loot marker around the playhead");
eq([seq.list[0].start.seconds, seq.list[0].end.seconds, seq.list[0].color, seq.list[0].comments], [17, 25, 4, "busy fight"], "marker fields + loot color");
seq.pos = 1; eq(run('msctAdd("misread", 5, 5, "")'), "OK:misread 0:00-0:06", "start clamps at 0");
eq(run("msctUndo()"), "OK:last marker removed", "undo"); eq(seq.list.length, 1, "undo removed it");
seq.pos = 70; eq(run('msctRange("kpq-stage", "stage 1")'), "RANGE:1:10", "range start");
seq.pos = 95.5; eq(run('msctRange("kpq-stage", "stage 1")'), "OK:kpq-stage 1:10-1:35.5", "range end");
seq.pos = 50; eq(run('msctAdd("levelup", 3, 15, "")'), "OK:levelup 0:47-1:05", "marker that runs past its clip");
const r = run("msctExport()");
eq(/^OK:Exported 3 markers/.test(r), true, "export summary: " + r);
fs.writeFileSync(path.join(tmp, "run-05.csv"), written[path.join(tmp, "run-05.csv")] || "");
fs.writeFileSync(path.join(tmp, "kpq.csv"), written[path.join(tmp, "kpq.csv")] || "");
const ma = V.readMarkers(path.join(tmp, "run-05.csv"), 60), mb = V.readMarkers(path.join(tmp, "kpq.csv"), 60);
eq(ma.map(m => [m.name, m.from, +m.to.toFixed(2)]), [["loot — busy fight", 617, 625], ["levelup", 647, 660]], "run-05: source times, levelup clipped at the clip's end");
eq(mb.map(m => [m.name, m.from, m.to]), [["kpq-stage — stage 1", 20, 45.5], ], "kpq: second clip, its own in point");
// video2fixtures picks up <video>.csv on its own; "none" turns it off
eq(V.args([A]).markers, path.join(tmp, "run-05.csv"), "sidecar CSV found"); eq(V.args([A, "--markers", "none"]).markers, null, "--markers none");
// speed-changed clip: approximate, with a warning
const seq2 = fakeSeq([[[0, 30, 100, A, 2]]]); ctx.app.project.activeSequence = seq2; seq2.pos = 10; run('msctAdd("loot", 0, 0, "")');
eq(/speed-changed/.test(run("msctExport()")), true, "speed warning");
eq(V.readMarkers(path.join(tmp, "run-05.csv"), 60) && written[path.join(tmp, "run-05.csv")].trim().split("\n").pop().split("\t").slice(2, 4), ["120.000", "120.000"], "2x speed: 100 + 10 x 2");
ctx.app.project.activeSequence = null; eq(run("msctExport()"), "ERR:Open a sequence first.", "no sequence");
// the panel page's script parses, and the manifest names the files that exist
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8"); new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
const man = fs.readFileSync(path.join(dir, "CSXS/manifest.xml"), "utf8");
for (const f of man.match(/<(MainPath|ScriptPath)>\.\/([^<]+)</g).map(s => s.split("./")[1].slice(0, -1))) eq(fs.existsSync(path.join(dir, f)), true, "manifest file " + f);
fs.rmSync(tmp, {recursive: true, force: true});
console.log(fail ? fail + " failed" : "premiere panel ok"); process.exit(fail ? 1 : 0);
