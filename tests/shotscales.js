// Builder "Import from screenshots" at every game size (Danny 10-31: a tester's 1.875x shot read "Nothing recognized").
// Danny's Turbow (tests/fixtures/bow-turbow.png, pixel-exact 2x) is redrawn in the page at other sizes, smoothed (how
// the game and most resizers draw) and blocky (nearest pixel), and each one must read Level 41 Hunter with his AP.
const {chromium} = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++ };
const B64 = fs.readFileSync(path.join(__dirname, "fixtures/bow-turbow.png")).toString("base64");
const CASES = [[1, 0], [1.25, 1], [1.5, 1], [1.5, 0], [1.6, 1], [1.75, 1], [1.875, 1], [1.875, 0], [2.1, 1], [2.25, 1], [2.5, 1], [2.5, 0], [3, 1], [3, 0]];
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await b.newPage({viewport: {width: 1300, height: 900}});
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.join(ROOT, "dist/index.html"));
  await p.click("#t-plan"); await p.waitForTimeout(300);
  await p.setInputFiles("#pimpfile", path.join(__dirname, "fixtures/bow-turbow.png"));
  const one = () => p.waitForFunction(() => document.querySelectorAll("#pimpshots .pishot").length === 1 && !/Reading/.test(document.querySelector("#pimpst").textContent), null, {timeout: 120000});
  await one();
  const want = await p.$$eval("#pSTR,#pDEX,#pINT,#pLUK", l => l.map(x => x.value).join(" "));
  ok(want === "39 177 4 4" && (await p.textContent("#psummary")).startsWith("Level 41 Hunter"), `2x original (AP ${want})`);
  for (const [s, smooth] of CASES){
    // the 2x shot's game pixels start at x = 1 (its labels sit on odd columns)
    const buf = Buffer.from(await p.evaluate(async ([s, smooth, b64]) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], {type: "image/png"}));
      const sw = bmp.width - 1, sh = bmp.height, c = document.createElement("canvas");
      c.width = Math.round(sw * s / 2); c.height = Math.round(sh * s / 2);
      const g = c.getContext("2d"); g.imageSmoothingEnabled = !!smooth; g.imageSmoothingQuality = "high";
      g.drawImage(bmp, 1, 0, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL("image/png").split(",")[1];
    }, [s, smooth, B64]), "base64");
    await p.click("#preset"); await p.waitForFunction(() => !document.querySelectorAll("#pimpshots .pishot").length);
    const t0 = Date.now();
    await p.setInputFiles("#pimpfile", {name: `turbow-${s}.png`, mimeType: "image/png", buffer: buf}); await one();
    const ap = await p.$$eval("#pSTR,#pDEX,#pINT,#pLUK", l => l.map(x => x.value).join(" ")), sum = await p.textContent("#psummary");
    const gear = await p.evaluate(() => Object.keys(BLD.S.gear || {}).length);
    ok(ap === want && sum.startsWith("Level 41 Hunter") && gear >= 6, `${s}x ${smooth ? "smoothed" : "blocky"}: AP ${ap}, ${sum.split(" · ")[0]}, ${gear} armor (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  ok(!errs.length, "no page errors " + errs.join("; "));
  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
