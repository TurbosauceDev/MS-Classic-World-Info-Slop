// Renders icon.svg (48+ px) and icon-small.svg (16-32 px) to PNGs, then make_ico.py packs app/icon.ico.
// Needs Playwright + Chromium (dev only; the .ico is committed). Usage: node tracker/icon/render.js <outdir>
const {chromium} = require("playwright"), fs = require("fs"), path = require("path");
(async () => {
  const out = process.argv[2] || __dirname, b = await chromium.launch(), p = await b.newPage();
  for (const s of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
    const svg = fs.readFileSync(path.join(__dirname, s <= 32 ? "icon-small.svg" : "icon.svg"), "utf8");
    await p.setViewportSize({width: s, height: s});
    await p.setContent(`<style>*{margin:0}svg{width:${s}px;height:${s}px;display:block}</style>${svg}`);
    await p.screenshot({path: path.join(out, `icon-${s}.png`), omitBackground: true});
  }
  await b.close();
})();
