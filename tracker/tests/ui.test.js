// node tests/ui.test.js — the tracker window in plain Chromium (Electron's host API stubbed, a canvas stands in for the
// game window). Fails on any page error. Needs playwright (global or npm i -D playwright).
const path = require("path"), {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    window.host = {gameFound: async () => true, wholeScreen: async on => on, settings: async () => ({share: true, idleSec: 60}),
      saveSession: async s => (window.saved = s, true), saveFrame: async () => "x", openFolder: async () => {}, ocr: async () => "Victoria Road\nSnail Hunting Ground III", shareRun: async () => true, summary: async () => null, sessions: async () => [], exportCsv: async () => "", mini: async () => true};
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement("canvas"); c.width = 800; c.height = 600;
      const x = c.getContext("2d"); setInterval(() => { x.fillStyle = "#" + Math.floor(Math.random() * 4095).toString(16); x.fillRect(0, 0, 800, 600) }, 100);
      return c.captureStream(4);
    };
  });
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  await page.click("#go");
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const t = Date.now(); session.add({t, type: "map", id: 42}); session.add({t, type: "exp", gain: 8});
    session.add({t: t + 5000, type: "exp", gain: 4}); session.add({t: t + 5100, type: "meso", amount: 12}); session.add({t: t + 5200, type: "item", id: 4000019}) });
  await page.waitForTimeout(800);
  const mobs = await page.textContent("#mobs"), items = await page.textContent("#items");
  await page.click("#go");
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => window.saved);
  // speed check card (no shared data yet), drop alert, history, mini bar
  await page.evaluate(async () => { settings.alertWorth = 10; dropAlert(4000019);
    await showSpeed({exp: 1000, barExp: 1000, minutes: 15, level: 20, party: 1, map: 42}) });
  const status = await page.textContent("#status"), last = await page.textContent("#lastRun");
  await page.click("#histBtn"); await page.waitForTimeout(100);
  const hist = await page.textContent("#hist");
  await page.click("#miniBtn"); const mini = await page.isVisible("#mini"), full = await page.isVisible("#go");
  await page.click("#mini"); const back = await page.isVisible("#go");
  if (!/Valuable drop: Horny Mushroom Cap/.test(status)) throw new Error("drop alert: " + status);
  if (!/4,000 EXP\/hr/.test(last) || !/Not enough shared runs/.test(last)) throw new Error("speed card: " + last);
  if (!/No sessions yet/.test(hist)) throw new Error("history: " + hist);
  if (!mini || full || !back) throw new Error("mini bar toggle");
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (!/Red Snail/.test(mobs) || !/Blue Snail/.test(mobs)) throw new Error("mobs table: " + mobs);
  if (!/Horny Mushroom Cap/.test(items)) throw new Error("items table: " + items);
  if (!saved || saved.kills !== 2 || !saved.shared) throw new Error("saved session: " + JSON.stringify(saved));
  console.log("ui test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
