// node tests/replay-ui.test.js — replay mode in plain Chromium (0.3.42): the tracker page with host.replay stubbed like the real
// replay-preload.js would, fed four of Danny's real frames (tests/frames, expected values in docs/ai/fixtures.md) as a "report".
// Runs the real readers and the real tick over them on a virtual clock and checks the events that come out. Needs playwright.
const fs = require("fs"), path = require("path"), {chromium} = require("playwright");
const T0 = Date.UTC(2026, 10, 4, 18, 0, 0);
const frames = ["frame-000.png", "frame-006.png", "frame-042.png", "frame-046.png"].map((f, i) => ({
  name: `frame-${i}-${new Date(T0 + i * 3000).toISOString().slice(11, 19).replace(/:/g, "")}.png`, t: T0 + i * 3000,
  b64: fs.readFileSync(path.join(__dirname, "frames", f)).toString("base64")}));
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: process.env.INLINE ? [] : ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 1100, height: 900}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(require("./ui-host"));
  await page.addInitScript(fx => {
    const bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    window.host.replay = {load: async () => ({dir: "report-2026-11-04T18-00-12", log: {version: "0.3.41", saved: "Wed Nov 04 2026 10:00:12 GMT-0800", note: "auto: test", settings: {share: false}, lines: [{t: fx.frames[0].t, kind: "status", text: "as it happened live"}],
      now: {state: "paused", pause: {reason: "kpq", label: "Paused: between KPQ rounds"}, kpq: {on: true, hold: true}, map: {now: "10003000"}}, auto: {reason: "the KPQ clock was on screen for 12 s"}},
      frames: fx.frames.map(f => ({name: f.name, t: f.t, bytes: bytes(f.b64)}))}) };
    window.host.settings = async x => (window.st = {...(window.st || {share: false, idleSec: 60, guideDone: true, autoReport: false}), ...(x || {})});
  }, {frames});
  await page.goto("file://" + path.join(__dirname, "../app/index.html") + "?replay=1");
  await page.waitForFunction(() => window.__replaySpeed, null, {timeout: 20000});
  if (!await page.evaluate(() => document.body.classList.contains("replaying") && !!document.querySelector("#replayPanel"))) throw new Error("replay panel missing");
  await page.evaluate(() => window.__replaySpeed(16));
  await page.waitForFunction(() => window.__replay.done || window.__replay.error, null, {timeout: 120000});
  const r = await page.evaluate(() => ({st: window.__replay, bars: LOG.filter(l => l.kind === "event" && l.type === "bar").map(l => l.exp), kinds: [...new Set(LOG.filter(l => l.kind === "event").map(l => l.type))],
    times: LOG.filter(l => l.kind === "event").map(l => l.t), panel: document.querySelector("#rpLog").innerText, orig: document.querySelector("#rpOrig").innerText, kpq: document.querySelector("#rpKpq").innerText,
    wrote: Object.entries({saved: window.saved, report: window.report instanceof Element ? null : window.report, shared: window.shared, shopShared: window.shopShared, spotsShared: window.spotsShared}).filter(e => e[1]).map(e => e[0] + "=" + JSON.stringify(e[1]).slice(0, 80)), now: Date.now(), running: timer != null}));
  if (r.st.error) throw new Error("replay error: " + r.st.error);
  if (r.st.idx !== 3) throw new Error("replay stopped at picture " + r.st.idx + " of 4");
  for (const exp of [18572, 18757, 19803, 19894]) if (!r.bars.includes(exp)) throw new Error("the replay never read EXP " + exp + ": " + JSON.stringify(r.bars));
  if (!r.kinds.includes("meso") || !r.kinds.includes("exp")) throw new Error("pickup/EXP events missing: " + r.kinds);
  if (r.times.some(t => t < T0 - 3000 || t > T0 + 12000 + 5000)) throw new Error("events outside the recorded time span (virtual clock): " + r.times.join());
  if (!/bar/.test(r.panel) || !/\+0:0\d/.test(r.panel)) throw new Error("replay column: " + r.panel.slice(0, 300));
  if (!/as it happened live/.test(r.orig) || !/AUTO REPORT: the KPQ clock/.test(r.orig) || !/KPQ/.test(r.kpq)) throw new Error("original/KPQ columns: " + r.orig + " | " + r.kpq);
  if (r.wrote.length) throw new Error("the replay saved or shared something: " + r.wrote);
  // the confusion detector wired into the real tracker page (0.3.42): EXP/pickups arriving for 30+ s while the KPQ hold is up save a
  // report by themselves - note "auto: ...", the ring's frames, the "now" state block - once, and not at all with the setting off
  const p2 = await browser.newPage(); p2.on("pageerror", e => errors.push(e.message));
  await p2.addInitScript(require("./ui-host"));
  await p2.goto("file://" + path.join(__dirname, "../app/index.html"));
  await p2.click("#guideNo");
  const auto = await p2.evaluate(async () => {
    const out = {}, t0 = Date.now();
    session = GrindSession.createSession(G); slicer = GrindSession.createRunSlicer(G, {onRun(){}}); timer = 1; kpqReset(); kpq.on = true; kpq.hold = true; session.state.pausedAt = t0;
    for (let i = 0; i < 12; i++) RECENT.push({t: t0 - (12 - i) * 3000, bytes: new Uint8Array(4)});
    settings = {...settings, autoReport: false};
    for (let s = 0; s <= 40; s += 4) onEvent({type: "meso", amount: 5}, t0 + s * 1000);
    confTick(t0 + 41e3); await new Promise(r => setTimeout(r, 100)); out.off = window.report instanceof Element ? null : window.report;
    settings = {...settings, autoReport: true}; confT = 0;
    confTick(t0 + 42e3); await new Promise(r => setTimeout(r, 100));
    out.on = window.report instanceof Element ? null : window.report; window.report = null;
    confTick(t0 + 50e3); await new Promise(r => setTimeout(r, 100)); out.again = window.report instanceof Element ? null : window.report;
    out.text = document.querySelector("#events")?.innerText || "";
    return out;
  });
  if (auto.off) throw new Error("auto-report fired with the setting off");
  const ai = auto.on?.info;
  if (!ai || !/^auto: EXP or pickups kept arriving for \d+ s while the tracker was paused \(between KPQ rounds\)/.test(ai.note) || ai.auto?.kind !== "gain" || auto.on.frames < 10) throw new Error("auto report: " + JSON.stringify(auto.on));
  if (ai.now?.state !== "paused" || ai.now.pause?.reason !== "kpq" || ai.now.kpq?.hold !== true || !ai.now.at) throw new Error("state block: " + JSON.stringify(ai.now));
  if (auto.again) throw new Error("a second auto report within 10 minutes");
  if (!/stays on this PC; nothing is sent/.test(auto.text)) throw new Error("the event log doesn't say the report stays local: " + auto.text.slice(0, 200));
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  console.log("replay ui test passed (" + r.bars.length + " bar reads, events: " + r.kinds.join(",") + ")");
})().catch(e => { console.error(process.env.STACK ? e.stack : e.message); process.exit(1) });
