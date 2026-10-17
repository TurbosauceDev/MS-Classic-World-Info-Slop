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
      return {k: img.k, bar, lines: lines.map(l => l.text), ev, again, party, ms: Math.round(performance.now() - t0)};
    }, b64);
    const ex = EXPECT[name], lvl = r.ev.find(e => e.type === "bar")?.level;
    const picks = r.ev.filter(e => /meso|exp|bonus|item/.test(e.type)).map(e => e.type + " " + (e.amount ?? e.gain ?? e.id ?? e.text));
    console.log(name, `k=${r.k}`, JSON.stringify(r.bar), "level", lvl, picks.join(", "), "party", r.party, `${r.ms} ms`);
    if (r.again.some(e => /meso|exp|bonus/.test(e.type))){ fail++; console.log("  FAIL: same frame twice counted pickups again") }
    if (ex){
      const bad = r.k !== 2 || !r.bar || r.bar.exp !== ex[0] || r.bar.pct !== ex[1] || lvl !== ex[2] || ex[3] && picks.join() !== ex[3].join();
      if (bad){ fail++; console.log("  FAIL, lines read:", r.lines) }
    }
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
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (fail) throw new Error(fail + " frame(s) read wrong");
  console.log("readers test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
