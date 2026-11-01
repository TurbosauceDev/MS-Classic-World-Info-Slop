// node tests/video.test.js — scripts/video2fixtures.js: Premiere marker CSV parsing, and (if ffmpeg is on PATH) a
// 6 s H.264 clip made from two of Danny's real frames must read the same EXP bar as the PNGs (codec blur check).
const fs = require("fs"), os = require("os"), path = require("path"), {execFileSync} = require("child_process");
const V = require("../scripts/video2fixtures.js");
let fail = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)){ fail++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)) } };
eq(V.tc("00:01:02:30", 60), 62.5, "timecode HH:MM:SS:FF"); eq(V.tc("00:00:10;15", 29.97), 10.5, "drop-frame timecode"); eq(V.tc("12.5", 60), 12.5, "seconds");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v2f-"));
// Premiere writes UTF-16LE with a BOM, tab separated
fs.writeFileSync(path.join(tmp, "m.csv"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type\nloot\tcap\t00:00:04:00\t00:00:05:00\t00:00:01:00\tComment\nlvl\t\t00:00:01:00\t00:00:01:00\t00:00:00:00\tComment\n", "utf16le")]));
eq(V.readMarkers(path.join(tmp, "m.csv"), 60), [{name: "loot — cap", from: 4, to: 5}, {name: "lvl", from: 1, to: 1}], "Premiere marker CSV");
let ff = true; try { execFileSync("ffmpeg", ["-version"], {stdio: "ignore"}); execFileSync("ffprobe", ["-version"], {stdio: "ignore"}) } catch { ff = false }
(async () => {
  if (ff){
    const fr = path.join(__dirname, "frames"), mp4 = path.join(tmp, "t.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-t", "3", "-i", path.join(fr, "frame-000.png"), "-loop", "1", "-t", "3", "-i", path.join(fr, "frame-046.png"),
      "-filter_complex", "[0][1]concat=n=2:v=1,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "23", mp4]);
    const s = await V.run({video: mp4, out: path.join(tmp, "o"), fps: 2, every: 30, max: 150, pad: 2, from: 0, to: null, markers: null, crop: null});
    eq([s.frames, s.barHitRate, s.scale], [12, 1, 2], "all 12 frames read at UI x2");
    const rows = fs.readFileSync(path.join(tmp, "o", "labels.csv"), "utf8").trim().split("\n");
    eq(rows[1].split(",").slice(4, 7), ["18572", "64.09", "22"], "frame-000 through H.264 reads like the PNG");
    const m = await V.run({video: mp4, out: path.join(tmp, "o2"), fps: 2, every: 30, max: 150, pad: 1, from: 0, to: null, markers: path.join(tmp, "m.csv"), crop: null});
    eq(m.ranges, 2, "two marker ranges");
    const r2 = fs.readFileSync(path.join(tmp, "o2", "labels.csv"), "utf8").trim().split("\n")[1].split(",");
    eq([r2[3], r2[4], r2[5]], ["loot — cap", "19894", "68.65"], "marker range starts at In - pad and reads frame-046");
  } else console.log("skip: no ffmpeg on PATH (marker parsing still tested)");
  fs.rmSync(tmp, {recursive: true, force: true});
  console.log(fail ? fail + " failed" : "video2fixtures ok"); process.exit(fail ? 1 : 0);
})();
