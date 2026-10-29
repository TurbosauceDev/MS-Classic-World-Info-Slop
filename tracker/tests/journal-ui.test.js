// node tests/journal-ui.test.js — the journey log in the window (stubbed host, like extras.test.js): off writes nothing; on, a
// tracked run's events (tapped off session.add) land as parseable lines, with RUN_START / RUN_STOP around them. CI: tracker.yml job ui.
const path = require("path"), {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 900, height: 900}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(require("./ui-host"));
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  await page.click("#guideNo");
  const fail = (what, v) => { throw new Error(what + ": " + JSON.stringify(v)) };
  const lines = () => page.evaluate(async () => { await jr.flush(); return window.journal || [] });
  const run = async () => { await page.click("#go"); await page.waitForFunction(() => timer != null && !starting);
    await page.evaluate(() => { const t = Date.now(); session.add({t, type: "map", id: "104040000", name: "Henesys Hunting Ground I"}); session.add({t: t + 1, type: "exp", gain: 20}); session.add({t: t + 2, type: "meso", amount: 12}) }) };

  // off by default: nothing is written, and the Settings card says so
  if (await page.evaluate(() => [$("#jrOn").checked, $("#jrWatch").disabled])[0]) fail("journal should start off");
  await run(); if ((await lines()).length) fail("off wrote lines", await lines());
  await page.evaluate(() => window.menu("startStop")); await page.waitForFunction(() => wrap && !stopping);
  await page.evaluate(() => $("#wrapEnd")?.click?.()); await page.waitForTimeout(300);
  if (await page.evaluate(() => timer != null)) await page.evaluate(() => stopNow());

  // on: the next run is logged
  await page.evaluate(() => { $("#jrOn").checked = true; $("#jrOn").dispatchEvent(new Event("change")) });
  await page.waitForFunction(() => settings.journal === true);
  await page.evaluate(() => resetTracker());
  await run();
  const on = (await lines()).map(l => { const p = GJ(l); return p });
  function GJ(l){ const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)  ([A-Z_]+)(.*)$/.exec(l); return m ? m[2] : "BAD:" + l }
  for (const k of ["WATCH_START", "RUN_START", "MAP_CHANGE", "COMBAT_START", "EXP_GAIN", "MESO_GAIN"]) if (!on.includes(k)) fail("missing " + k, on);
  if (on.some(k => k.startsWith("BAD:"))) fail("unparseable line", on);
  await page.evaluate(() => stopNow());
  const after = (await lines()).map(GJ); if (!after.includes("RUN_STOP") || !after.includes("COMBAT_END")) fail("run end not logged", after);
  // between runs: with "also log between runs" the app watches the game by itself; a run takes the capture over and hands it back
  await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 360; const x = c.getContext("2d");
    setInterval(() => { x.fillStyle = "#335"; x.fillRect(0, 0, 640, 360); x.fillStyle = "#fff"; x.fillRect(Math.random() * 600, 100, 20, 20) }, 100);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(10) });
  await page.evaluate(() => { window.journal = []; resetTracker() });
  await page.evaluate(() => jr.wake()); await page.waitForFunction(() => jr.stats().watching, null, {timeout: 15000}).catch(() => fail("watch never started", null));
  let seen = await lines(); if (!seen.some(l => /  WATCH_START,watch/.test(l))) fail("no WATCH_START,watch", seen);
  await page.click("#go"); await page.waitForFunction(() => timer != null && !starting);
  seen = await lines(); if (await page.evaluate(() => jr.stats().watching) || !seen.some(l => /  WATCH_STOP,watch,run/.test(l)) || !seen.some(l => /  WATCH_START,run/.test(l))) fail("run did not take over from the watch", seen);
  await page.evaluate(() => stopNow());
  if (errors.length) fail("page errors", errors);
  await browser.close(); console.log("journal ui ok");
})().catch(e => { console.error(e); process.exit(1) });
