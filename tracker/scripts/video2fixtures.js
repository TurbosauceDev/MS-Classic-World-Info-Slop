#!/usr/bin/env node
// node scripts/video2fixtures.js <video> [options] — turn a gameplay recording into labeled tracker fixtures.
// Computer vision only: it reads the recorded pixels with the tracker's own readers (app/readers.js), exactly as the
// app reads a live capture. Nothing touches the game.
//
//   1. ffmpeg decodes the video at --fps (default 2, the app's own read rate) straight into RGBA buffers (no temp files).
//      With --markers (a Premiere "Export Markers" CSV) only each marker's In..Out range (plus --pad seconds) is read.
//   2. Every frame goes through readers.readFrame (stateful, like the app) and readBar (stateless, per frame).
//   3. Frames worth a human look are saved as PNG: the first one, one every --every seconds, any frame where the EXP bar
//      stops reading, goes backwards or jumps more than a level's worth, and frames with pickup / KPQ / proc / vitals
//      events. --max caps how many (default 150).
//   4. out/labels.csv lists the saved frames with what the readers saw. Fix only the rows that are wrong
//      (fill the fix_* columns), then promote the good ones into tracker/tests/frames-video/ (see docs/ai/video-pipeline.md).
//   5. out/summary.json: frames read, EXP bar hit rate, events per type: a per-video CV score to compare across versions.
//
// Options: --out <dir> (default <video name>-frames next to the video)  --fps 2  --every 30  --max 150
//          --markers <csv>  --pad 2  --from <s>  --to <s>  --crop x,y,w,h (only if the video isn't the whole game window)
// Needs ffmpeg + ffprobe on PATH (Windows: `winget install Gyan.FFmpeg`), or FFMPEG / FFPROBE env vars.
const fs = require("fs"), path = require("path"), zlib = require("zlib"), {spawn, execFileSync} = require("child_process");
const R = require("../app/readers.js"), G = require("../app/gamedata.json");
const FFMPEG = process.env.FFMPEG || "ffmpeg", FFPROBE = process.env.FFPROBE || "ffprobe";

function args(argv){
  const o = {fps: 2, every: 30, max: 150, pad: 2, from: 0, to: null, markers: null, out: null, crop: null, video: null};
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (a.startsWith("--")){ const k = a.slice(2), v = argv[++i]; o[k] = ["fps", "every", "max", "pad", "from", "to"].includes(k) ? +v : v }
    else o.video = a;
  }
  if (!o.video) throw new Error("usage: node scripts/video2fixtures.js <video> [--out dir] [--fps 2] [--markers markers.csv]");
  o.out = o.out || path.join(path.dirname(o.video), path.basename(o.video, path.extname(o.video)) + "-frames");
  return o;
}

function probe(file){
  const j = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height,r_frame_rate:format=duration", "-of", "json", file]).toString());
  const s = j.streams[0], [a, b] = s.r_frame_rate.split("/").map(Number);
  return {w: s.width, h: s.height, fps: a / (b || 1), dur: +j.format.duration};
}

// Premiere Pro "Export Markers" CSV: Marker Name, Description, In, Out, Duration, Marker Type (tab or comma separated,
// UTF-16 or UTF-8). Timecodes HH:MM:SS:FF (frames) or HH:MM:SS;FF (drop frame) or plain seconds.
function tc(s, fps){
  s = String(s || "").trim(); if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  const p = s.split(/[:;.]/).map(Number); if (p.some(isNaN)) return null;
  while (p.length < 4) p.unshift(0);
  return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / Math.round(fps);
}
function readMarkers(file, fps){
  let txt = fs.readFileSync(file); txt = txt[0] === 0xff && txt[1] === 0xfe ? txt.toString("utf16le") : txt.toString("utf8");
  const lines = txt.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim()), sep = lines[0].includes("\t") ? "\t" : ",";
  const split = l => l.split(sep).map(c => c.replace(/^"|"$/g, "").trim());
  const head = split(lines[0]).map(h => h.toLowerCase()), col = n => head.findIndex(h => h.startsWith(n));
  const ni = col("marker name"), di = col("description"), ii = col("in"), oi = col("out");
  return lines.slice(1).map(split).map(c => {
    const at = tc(c[ii], fps), end = tc(c[oi], fps);
    return {name: (c[ni] || "") + (c[di] ? " — " + c[di] : ""), from: at, to: end !== null && end > at ? end : at};
  }).filter(m => m.from !== null);
}

// tiny PNG writer (RGB, no dependencies), the counterpart of tests/cv_util.js
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c });
function crc(buf){ let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data){ const len = Buffer.alloc(4), t = Buffer.from(type), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]) }
function writePng(file, {w, h, d}){
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const i = (y * w + x) * 4, o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = d[i]; raw[o + 1] = d[i + 1]; raw[o + 2] = d[i + 2] }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, {level: 6})), chunk("IEND", Buffer.alloc(0))]));
}

// decode [from, to) at fps; calls onFrame({w,h,d}, seconds) for each frame, in order
function decode(file, info, o, from, to, onFrame){
  const [cx, cy, cw, ch] = o.crop ? o.crop.split(",").map(Number) : [0, 0, info.w, info.h];
  const vf = [`fps=${o.fps}`]; if (o.crop) vf.push(`crop=${cw}:${ch}:${cx}:${cy}`);
  const a = ["-v", "error", "-ss", String(from)]; if (to !== null) a.push("-t", String(Math.max(0.01, to - from)));
  a.push("-i", file, "-vf", vf.join(","), "-f", "rawvideo", "-pix_fmt", "rgba", "-");
  const size = cw * ch * 4;
  return new Promise((ok, bad) => {
    const p = spawn(FFMPEG, a), err = [];
    let buf = Buffer.alloc(0), n = 0;
    p.stdout.on("data", c => {
      buf = buf.length ? Buffer.concat([buf, c]) : c;
      while (buf.length >= size){
        const d = new Uint8ClampedArray(buf.subarray(0, size)); buf = buf.subarray(size);   // copy: the slice is reused
        onFrame({w: cw, h: ch, d}, from + n++ / o.fps);
      }
    });
    p.stderr.on("data", c => err.push(c));
    p.on("error", bad);
    p.on("close", code => code ? bad(new Error("ffmpeg failed: " + Buffer.concat(err).toString().slice(0, 400))) : ok(n));
  });
}

const hms = s => { const m = Math.floor(s / 60); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}` };
const csv = v => { v = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };

async function run(o){
  const info = probe(o.video);
  fs.mkdirSync(o.out, {recursive: true});
  const ranges = o.markers ? readMarkers(o.markers, info.fps).map(m => ({...m, from: Math.max(0, m.from - o.pad), to: Math.min(info.dur, m.to + o.pad)}))
    : [{name: "", from: o.from, to: o.to}];
  const rows = [], tally = {}, sum = {video: path.basename(o.video), size: `${info.w}x${info.h}`, fps: o.fps, frames: 0, barRead: 0, scale: null, saved: 0, ranges: ranges.length};
  for (const rg of ranges){
    const rd = R.createReaders(G, null);   // fresh reader state per range, like pressing Start
    let last = null, lastKeep = -Infinity, first = true;
    await decode(o.video, info, o, rg.from, rg.to, (raw, s) => {
      const img = R.native(raw, true), bar = R.readBar(img) || R.readBarAny(raw);
      const ev = rd.readFrame(raw, Math.round(s * 1000), img);
      sum.frames++; if (bar) sum.barRead++; sum.scale = sum.scale || img.k;
      for (const e of ev) tally[e.type] = (tally[e.type] || 0) + 1;
      const why = [];
      if (first) why.push("first");
      if (s - lastKeep >= o.every) why.push("every");
      if (!bar && last) why.push("bar-lost");
      if (bar && last && bar.exp < last.exp && bar.pct >= last.pct - 0.01) why.push("bar-backwards");
      const need = bar && last && G.exp[last.level || 0];
      if (bar && last && need && bar.exp - last.exp > need) why.push("bar-jump");
      for (const t of ["item", "itemraw", "meso", "exp", "kpqtime", "proc", "party"]) if (ev.some(e => e.type === t)) why.push(t);
      const lvl = ev.find(e => e.type === "bar")?.level;
      if (bar) last = {...bar, level: lvl || last?.level};
      first = false;
      if (!why.length || sum.saved >= o.max) return;
      if (why.length === 1 && why[0] !== "every" && why[0] !== "first" && s - lastKeep < 1) return;   // one per second for routine events
      lastKeep = s;
      const file = `f-${String(Math.round(s * 10)).padStart(6, "0")}.png`;
      writePng(path.join(o.out, file), raw); sum.saved++;
      rows.push([file, s.toFixed(1), hms(s), rg.name, bar?.exp, bar?.pct, lvl || last?.level, why.join(" "),
        ev.filter(e => e.type !== "bar").map(e => e.type + (e.n !== undefined ? ":" + e.n : e.id ? ":" + e.id : "")).join(" "), "", "", "", ""]);
    });
  }
  const head = ["file", "seconds", "timecode", "marker", "bar_exp", "bar_pct", "level", "why_saved", "events", "fix_exp", "fix_pct", "fix_level", "notes"];
  fs.writeFileSync(path.join(o.out, "labels.csv"), [head, ...rows].map(r => r.map(csv).join(",")).join("\n") + "\n");
  sum.barHitRate = sum.frames ? +(sum.barRead / sum.frames).toFixed(3) : 0; sum.events = tally;
  fs.writeFileSync(path.join(o.out, "summary.json"), JSON.stringify(sum, null, 2) + "\n");
  return sum;
}

module.exports = {run, readMarkers, tc, writePng};
if (require.main === module) run(args(process.argv.slice(2))).then(s => {
  console.log(`${s.frames} frames read (${s.size}, UI x${s.scale}), EXP bar read on ${(s.barHitRate * 100).toFixed(1)}%, ${s.saved} saved`);
  console.log("events:", JSON.stringify(s.events));
}, e => { console.error(e.message); process.exit(1) });
