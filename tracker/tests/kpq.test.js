// node tests/kpq.test.js — KPQ "Time Left" clock (tests/frames-kpq: top-middle crops of Danny's KPQ frames, 2026-10-18,
// 2560x1440 at 2x, pasted back at their spot on a blank frame) and the EXP bar's "1,601" (a 1 before a comma). Needs playwright.
const fs = require("fs"), path = require("path"), {chromium} = require("playwright");
const dir = path.join(__dirname, "frames-kpq");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent("<!doctype html><title>kpq</title>");
  for (const f of ["gamedata.js", "shot.js", "readers.js"]) await page.addScriptTag({path: path.join(__dirname, "../app", f)});
  let fail = 0;
  for (const name of fs.readdirSync(dir).filter(f => /^timer-\d{4}\.png$/.test(f)).sort()){
    const want = +name.slice(6, 8) * 60 + +name.slice(8, 10);
    const got = await page.evaluate(async b64 => {
      const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
      const c = document.createElement("canvas"); c.width = 2560; c.height = 1440; const g = c.getContext("2d"); g.drawImage(im, 1100, 0);
      const d = g.getImageData(0, 0, 2560, 1440), img = GrindReaders.native({w: 2560, h: 1440, d: d.data});
      // native() needs a 2x frame to see its scale: the crop alone has no status bar, so un-double by hand if it didn't
      const nat = img.k === 2 ? img : (() => { const w = 1280, h = 720, o = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) o[(y * w + x) * 4 + k] = d.data[((2 * y + 1) * 2560 + 2 * x + 1) * 4 + k]; return {w, h, d: o, k: 2} })();
      return GrindReaders.readKpqTimer(nat);
    }, fs.readFileSync(path.join(dir, name)).toString("base64"));
    if (got !== want){ fail++; console.log(name, "read", got, "want", want) }
  }
  // the EXP bar's "1,601 [2.51%]": the narrow 1 used to be cut off its comma (read 601)
  const bar = await page.evaluate(async b64 => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = 2560; c.height = 1440; const g = c.getContext("2d"); g.drawImage(im, 1100, 1360);
    const d = g.getImageData(0, 0, 2560, 1440), w = 1280, h = 720, o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) o[(y * w + x) * 4 + k] = d.data[((2 * y + 1) * 2560 + 2 * x + 1) * 4 + k];
    return GrindReaders.readBar({w, h, d: o, k: 2});
  }, fs.readFileSync(path.join(dir, "bar-1601.png")).toString("base64"));
  if (bar?.exp !== 1601 || bar?.pct !== 2.51){ fail++; console.log("bar read", bar) }
  // nothing on screen: no clock
  if (await page.evaluate(() => GrindReaders.readKpqTimer({w: 1280, h: 720, d: new Uint8ClampedArray(1280 * 720 * 4)})) !== null){ fail++; console.log("blank frame read a clock") }
  await browser.close();
  if (errors.length || fail){ console.log(errors); process.exit(1) }
  console.log("kpq test passed");
})();
