// node tests/snip.test.js — the "Show me where" box: dragging over the frozen picture gives the box as fractions of the
// picture (letterboxed: the picture is 2:1 in a 4:3 window here), Esc gives null. Needs playwright.
const path = require("path"), {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage({viewport: {width: 800, height: 600}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { window.snip = {onImage: fn => (window.give = fn), done: r => (window.got = r)} });
  await page.goto("file://" + path.join(__dirname, "../app/snip.html"));
  // a 400x200 picture: shown 800x400, with 100 px bars above and below
  await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 200; give(c.toDataURL()) });
  await page.waitForFunction(() => document.getElementById("shot").naturalWidth === 400);
  await page.mouse.move(200, 200); await page.mouse.down(); await page.mouse.move(600, 300, {steps: 4}); await page.mouse.up();
  const r = await page.evaluate(() => window.got), want = {x: 0.25, y: 0.25, w: 0.5, h: 0.25};
  for (const k in want) if (Math.abs(r[k] - want[k]) > 0.005) throw new Error("box " + JSON.stringify(r));
  await page.evaluate(() => (window.got = "x")); await page.keyboard.press("Escape");
  if (await page.evaluate(() => window.got) !== null) throw new Error("Esc should give null");
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  console.log("snip test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
