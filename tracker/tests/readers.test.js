// node tests/readers.test.js [frame dir] — screen readers on real captured frames (tests/frames: Danny's 2560x1440 capture,
// playfield blanked). Expected values were read off the frames by eye. Needs playwright.
const fs = require("fs"), path = require("path"), {chromium} = require("playwright");
const dir = process.argv[2] || path.join(__dirname, "frames");
const EXPECT = {   // frame -> [EXP, %, level, pickup lines on screen that are bright enough to read]
  "frame-000.png": [18572, 64.09, 22, ["meso 16", "exp 7", "bonus 2"]],
  "frame-006.png": [18757, 64.72, 22, null],
  "frame-046.png": [19894, 68.65, 22, ["meso 20", "item 4000019"]],   // Horny Mushroom Cap
  "frame-042.png": [19803, 68.33, 22, ["meso 20", "exp 7", "bonus 2"]],
};
// frame -> [map id, start of the name]: KPQ bonus stage (added from D.kpq)
const MAPS = {"frame-000.png": ["80000500", "1st Accompaniment <Bonus>"], "frame-046.png": ["80000500", "1st Accompaniment <Bonus>"]};
const G = require("../app/gamedata.json"), {mapFromText, jobFromText} = require("../app/readers.js");
// the character name: the last line of the job box OCR, letters and digits only
{ const {nameFromText} = require("../app/readers.js"), eq = (a, b) => { if (a !== b) throw new Error("nameFromText: " + a + " != " + b) };
  eq(nameFromText("Archer\nTurbow\n"), "Turbow"); eq(nameFromText("J TET\n[9\n"), null); eq(nameFromText("Turbow"), null); eq(nameFromText("Archer\nMy Name\n"), null) }
let ocr = null;
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent("<!doctype html><title>readers</title>");
  for (const f of ["gamedata.js", "shot.js", "readers.js"]) await page.addScriptTag({path: path.join(__dirname, "../app", f)});
  let fail = 0;
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort()){
    const b64 = fs.readFileSync(path.join(dir, name)).toString("base64");
    const r = await page.evaluate(async b64 => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
      const t0 = performance.now(), img = GrindReaders.native({w: d.width, h: d.height, d: d.data});
      const bar = GrindReaders.readBar(img), lines = GrindReaders.readPickups(img), party = GrindReaders.readParty(img);
      const rd = GrindReaders.createReaders(GAMEDATA), ev = rd.readFrame(img, 0), again = rd.readFrame(img, 500);
      const mc = GrindReaders.mapTextCrop(img); let crop = null;
      if (mc){ const cv = document.createElement("canvas"); cv.width = mc.w; cv.height = mc.h; cv.getContext("2d").putImageData(new ImageData(mc.d, mc.w, mc.h), 0, 0); crop = cv.toDataURL() }
      const jc = GrindReaders.jobTextCrop(img); let jobCrop = null;
      if (jc){ const cv = document.createElement("canvas"); cv.width = jc.w; cv.height = jc.h; cv.getContext("2d").putImageData(new ImageData(jc.d, jc.w, jc.h), 0, 0); jobCrop = cv.toDataURL() }
      return {k: img.k, bar, lines: lines.map(l => l.text), ev, again, party, crop, jobCrop, ms: Math.round(performance.now() - t0)};
    }, b64);
    let map = null;
    if (r.crop && MAPS[name]){
      ocr = ocr || await require("tesseract.js").createWorker("eng", 1, {langPath: path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0"), cacheMethod: "none", gzip: true});
      const text = (await ocr.recognize(Buffer.from(r.crop.split(",")[1], "base64"))).data.text;
      map = mapFromText(text, G);
      const ok = map && map.id === MAPS[name][0] && map.name.startsWith(MAPS[name][1]);
      console.log("  map", JSON.stringify(text), "->", JSON.stringify(map), ok ? "" : "FAIL"); if (!ok) fail++;
    } else if (MAPS[name]){ fail++; console.log("  FAIL: no map name crop") }
    // job from the status bar: Danny's archer in every frame
    if (!process.argv[2]){
      ocr = ocr || await require("tesseract.js").createWorker("eng", 1, {langPath: path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0"), cacheMethod: "none", gzip: true});
      const job = r.jobCrop && jobFromText((await ocr.recognize(Buffer.from(r.jobCrop.split(",")[1], "base64"))).data.text);
      console.log("  job", job, job === "Archer" ? "" : "FAIL"); if (job !== "Archer") fail++;
    }
    const ex = EXPECT[name], lvl = r.ev.find(e => e.type === "bar")?.level;
    const picks = r.ev.filter(e => /meso|exp|bonus|item/.test(e.type)).map(e => e.type + " " + (e.amount ?? e.gain ?? e.id ?? e.text));
    console.log(name, `k=${r.k}`, JSON.stringify(r.bar), "level", lvl, picks.join(", "), "party", r.party, `${r.ms} ms`);
    if (r.again.some(e => /meso|exp|bonus/.test(e.type))){ fail++; console.log("  FAIL: same frame twice counted pickups again") }
    if (ex){
      const bad = r.k !== 2 || !r.bar || r.bar.exp !== ex[0] || r.bar.pct !== ex[1] || lvl !== ex[2] || ex[3] && picks.join() !== ex[3].join();
      if (bad){ fail++; console.log("  FAIL, lines read:", r.lines) }
    }
  }
  // the tracker's fast path: the full frame tells work() the scale, then the frame drawn at that size (no smoothing, as
  // renderer.js grabFrame does) must give the same events and OCR crops as the full frame
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort()){
    const r = await page.evaluate(async b64 => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
      const want = {map: true, job: true, chat: true};
      const a = GrindReaders.work(GrindReaders.createReaders(GAMEDATA), {frame: {w: d.width, h: d.height, d: d.data}, t: 0, want}), {k, ox, oy} = a.scale;
      const W = Math.floor((im.width - ox) / k), H = Math.floor((im.height - oy) / k), c2 = document.createElement("canvas"); c2.width = W; c2.height = H;
      const g2 = c2.getContext("2d"); g2.imageSmoothingEnabled = false; g2.drawImage(im, ox, oy, W * k, H * k, 0, 0, W, H);
      const t0 = performance.now(), d2 = g2.getImageData(0, 0, W, H), b = GrindReaders.work(GrindReaders.createReaders(GAMEDATA), {frame: {w: W, h: H, d: d2.data, k}, t: 0, want});
      const sum = cr => cr && cr.w + "x" + cr.h + ":" + cr.d.reduce((s, v) => s + v, 0);
      return {k, a: JSON.stringify(a.ev), b: JSON.stringify(b.ev), ca: Object.values(a.crops).map(sum).join(), cb: Object.values(b.crops).map(sum).join(), ms: Math.round(performance.now() - t0)};
    }, fs.readFileSync(path.join(dir, name)).toString("base64"));
    const ok = r.a === r.b && r.ca === r.cb;
    console.log(name, "game-size frame", ok ? "same events and crops" : "FAIL " + r.a + " vs " + r.b, `${r.ms} ms`); if (!ok) fail++;
  }
  // any window size: beanguri's EXP-bar crops (MIT), all "68,601 [71.68%]"
  if (!process.argv[2]){
    const bdir = path.join(__dirname, "frames-beanguri");
    for (const name of fs.readdirSync(bdir).filter(f => f.endsWith(".png"))){
      const b64 = fs.readFileSync(path.join(bdir, name)).toString("base64");
      const r = await page.evaluate(async b64 => {
        const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
        return GrindReaders.readBarAny({w: d.width, h: d.height, d: d.data});
      }, b64);
      const ok = r && r.exp === 68601 && r.pct === 71.68;
      console.log(name, JSON.stringify(r), ok ? "" : "FAIL"); if (!ok) fail++;
    }
  }
  await browser.close(); if (ocr) await ocr.terminate();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (fail) throw new Error(fail + " frame(s) read wrong");
  console.log("readers test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
