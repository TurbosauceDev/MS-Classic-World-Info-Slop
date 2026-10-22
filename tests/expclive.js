// EXP/hr calculator live reader (63-expclive.js): the Grind Tracker's readers + session maths on real game frames
// (tracker/tests/frames, Danny's 2560x1440 capture), fed without a screen share; Stop saves to the sessions table.
// Also the screenshot pair (karuzk, 10-18): two frames as files fill in the EXP and level.
const {chromium} = require("playwright"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), FR = path.join(ROOT, "tracker/tests/frames");
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++ };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {}), p = await b.newPage({viewport: {width: 1300, height: 900}});
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.join(ROOT, "dist/index.html"));
  await p.click("#t-expc");
  ok(await p.isVisible("#eclshare"), "Share game window button shown");
  const frames = fs.readdirSync(FR).filter(f => f.endsWith(".png")).sort().map(f => fs.readFileSync(path.join(FR, f)).toString("base64"));
  const r = await p.evaluate(async frames => {
    await EXPLIVE.begin();
    const t0 = Date.now() - 10 * 60e3;
    for (let i = 0; i < frames.length; i++){
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(frames[i]), c => c.charCodeAt(0))], {type: "image/png"}));
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      EXPLIVE.feed({w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data}, t0 + i * 20e3);
    }
    const s = EXPLIVE.run.sess.stats();
    return {level: s.level, mesos: s.mesos, msgExp: EXPLIVE.run.sess.state.msgExp, bar: EXPLIVE.run.sess.state.bar, out: document.getElementById("eclout").textContent};
  }, frames);
  ok(r.bar && r.level > 0, `EXP bar read, level ${r.level}`);
  ok(r.mesos > 0 && r.msgExp > 0, `pickup lines counted (mesos ${r.mesos}, EXP lines ${r.msgExp})`);
  ok(/EXP\/hr/.test(r.out) && /Mesos\/hr/.test(r.out) && !/NaN|undefined/.test(r.out), "live card shows rates, no NaN");
  // pause by hand: pickups while held don't count
  const held = await p.evaluate(() => { EXPLIVE.pause(); const a = EXPLIVE.run.held; EXPLIVE.pause(); return [a, EXPLIVE.run.held] });
  ok(held[0] === true && held[1] === false, "Pause / Resume");
  // stop: a run with EXP lands in the sessions table with Mesos/hr
  await p.evaluate(() => { const s = EXPLIVE.run.sess.state; s.barExp = s.barExp || 500; s.activeMs = Math.max(s.activeMs, 5 * 60e3); EXPLIVE.stop() });
  const row = await p.textContent("#ecrows tr:first-child");
  ok(/\d/.test(row) && !/No saved/.test(row), "Stop saved the run: " + row.replace(/\s+/g, " ").trim().slice(0, 80));
  ok(await p.isVisible("#eclimg"), "Save as image offered after Stop");
  await p.click("#eclimg"); await p.waitForSelector("#eclimgout img");
  ok(true, "Save as image draws the card");
  // screenshot pair: two frames as files fill the hand calculator
  await p.setInputFiles("#ecfile", [path.join(FR, "frame-000.png"), path.join(FR, "frame-046.png")]);
  await p.waitForFunction(() => /Start:/.test(document.getElementById("ecshot").textContent), null, {timeout: 20000});
  const shot = await p.evaluate(() => ({e0: $("#ece0").value, l0: $("#ecl0").value, txt: $("#ecshot").textContent}));
  ok(+shot.e0 > 0 && +shot.l0 > 0, `screenshot pair read: ${shot.txt.slice(0, 90)}`);
  ok(!errs.length, "no page errors " + errs.join(" | "));
  await b.close();
  console.log(fails ? fails + " failed" : "all passed"); process.exit(fails ? 1 : 0);
})();
