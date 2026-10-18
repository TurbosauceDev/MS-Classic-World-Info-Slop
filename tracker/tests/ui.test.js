// node tests/ui.test.js — the tracker window in plain Chromium (Electron's host API stubbed, a canvas stands in for the
// game window). Fails on any page error. Needs playwright (global or npm i -D playwright).
const path = require("path"), {chromium} = require("playwright");
(async () => {
  // file access on: plain Chromium blocks a worker from a file:// page, Electron doesn't (INLINE=1 tests the fallback)
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: process.env.INLINE ? [] : ["--allow-file-access-from-files"]});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    window.host = {gameFound: async () => true, wholeScreen: async on => on, settings: async x => (window.st = {...(window.st || {share: false, idleSec: 60, partyCode: "snails"}), ...(x || {})}),
      party: async live => (window.sentParty = live, {expHr: 9000, members: [{you: true, level: 22, expHr: 4000}, {nick: "Bo<b>", job: "Hunter", level: 25, expHr: 5000, expHr5: 6000}]}),
      saveSession: async s => (window.saved = s, true), saveFrame: async () => "x", openFolder: async d => (window.opened = d), saveReport: async (f, info) => (window.report = {frames: f.length, info}, "report-2026-10-17T20-00-00"), ocr: async () => "Victoria Road\nSnail Hunting Ground III", shareRun: async () => true, summary: async () => ({rows: [], times: {"42": [[0, 0.9, 3], [18, 1.2, 4]]}}), sessions: async () => [{saved: Date.now() - 3600e3, date: "2026-10-17", mapName: "Snail Hunting Ground III", level: 22, activeMin: 30, exp: 6000, mesos: 900, deaths: 1,
          levelUps: [{level: 22, activeMin: 41, mapName: "Snail Hunting Ground III"}, {level: 21, activeMin: null}]},
        {saved: Date.now() - 7200e3, date: "2026-10-17", mapName: "Pig Beach", level: 21, activeMin: 20, exp: 2000, mesos: 300, deaths: 0},
        {saved: Date.now() - 9 * 864e5, date: "2026-10-08", mapName: "Old", level: 10, activeMin: 60, exp: 1, mesos: 1}], exportCsv: async () => "", mini: async () => true};
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement("canvas"); c.width = 800; c.height = 600;
      const x = c.getContext("2d"); setInterval(() => { x.fillStyle = "#" + Math.floor(Math.random() * 4095).toString(16); x.fillRect(0, 0, 800, 600) }, 100);
      return c.captureStream(4);
    };
  });
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  // first run: the guide asks about sharing
  if (!await page.isVisible("#guide")) throw new Error("guide not shown");
  await page.click("#guideShare");
  if (await page.isVisible("#guide") || !await page.isChecked("#share")) throw new Error("guide answer");
  await page.dblclick("#go");
  await page.waitForTimeout(1500);
  // the top card: tracking state and Stop; tabs switch sections
  const top = await page.evaluate(() => [document.querySelector("#stateText").textContent, document.querySelector("#go").textContent, document.querySelector("#go").classList.contains("on")]);
  if (!/^Tracking/.test(top[0]) || top[1] !== "Stop" || !top[2]) throw new Error("top card: " + top);
  await page.click(".tabs [data-tab=loot]");
  if (!await page.isVisible("#priceNote, #itemsEmpty") || await page.isVisible("#mobsEmpty") || !await page.isVisible("#itemsEmpty")) throw new Error("loot tab");
  await page.click(".tabs [data-tab=session]");
  const eng = await page.evaluate(() => [engine.kind, LOG.filter(l => l.kind === "event").length, LOG.filter(l => l.kind === "engine").map(l => l.kind + ":" + (l.why || "")).join()]);
  if (eng[0] !== (process.env.INLINE ? "window" : "worker")) throw new Error("reader engine: " + eng);
  const party = await page.textContent("#partyBox");
  if (!/9,000 EXP\/hr together \(2\)/.test(await page.textContent("#miniParty"))) throw new Error("mini party line");
  if (!/9,000 EXP\/hr together/.test(party) || !/Bo&lt;b&gt;|Bo<b>/.test(party) || await page.$("#partyBox b b")) throw new Error("party: " + party);
  await page.evaluate(() => { const t = Date.now(); session.add({t, type: "map", id: 42}); session.add({t, type: "exp", gain: 8});
    session.add({t: t + 5000, type: "exp", gain: 4}); session.add({t: t + 5100, type: "meso", amount: 12}); session.add({t: t + 5200, type: "item", id: 4000019}) });
  await page.waitForTimeout(800);
  const mobs = await page.textContent("#mobs"), items = await page.textContent("#items");
  // a goal level and a death from the EXP bar; EXP silent for 2+ minutes -> warning
  await page.click(".tabs [data-tab=settings]"); await page.fill("#goal", "23"); await page.dispatchEvent("#goal", "change");
  const gl = await page.evaluate(() => { const t = Date.now() - 200e3; session.add({t, type: "bar", exp: 5000, pct: 5000 / GAMEDATA.exp[22] * 100, level: 22});
    session.add({t: t + 10e3, type: "bar", exp: 6000, pct: 6000 / GAMEDATA.exp[22] * 100, level: 22}); session.add({t: t + 20e3, type: "bar", exp: 5500, pct: 5500 / GAMEDATA.exp[22] * 100, level: 22});
    session.state.lastExpT = Date.now() - 130e3;   // last EXP over 2 minutes ago
    render(); return [document.querySelector("#deaths").textContent, document.querySelector("#goalK").textContent, document.querySelector("#goalV").textContent, document.querySelector("#status").textContent] });
  if (gl[0] !== "1" || gl[1] !== "Level 23 in" || !/h|min/.test(gl[2]) || !/No EXP for 2 minutes/.test(gl[3])) throw new Error("goal/deaths/stop: " + gl);
  // potions used (from the quick-slot counts): cost per hour and the list
  const usedTxt = await page.evaluate(() => { session.add({t: Date.now(), type: "use", id: "2000002", n: 3}); render();
    return [document.querySelector("#used").textContent, document.querySelector("#usedBox").classList.contains("hidden"), document.querySelector("#netHr").textContent, ICONS.length] });
  if (!/White Potion×31,050/.test(usedTxt[0]) || usedTxt[1] || !/^net /.test(usedTxt[2]) || !(usedTxt[3] > 30)) throw new Error("used: " + usedTxt);
  // Mano killed on his map: respawn timer shows
  await page.evaluate(() => { const t = Date.now(); session.add({t, type: "map", id: 10000013}); session.add({t, type: "exp", gain: 148}); render() });
  const respawn = await page.textContent("#respawn");
  if (!/Mano \(boss\)/.test(respawn) || !/back in ~60 min/.test(respawn)) throw new Error("respawn: " + respawn);
  // self-check: still checking, then ✓/✗ per reader once its time is up (the noise canvas has no EXP bar or minimap)
  const chk = await page.evaluate(() => { const during = document.querySelector("#selfcheck").textContent;
    check.t0 -= 9000; check.lines = true; renderCheck(); return [during, document.querySelector("#selfcheck").innerHTML] });
  if (!/a few seconds/.test(chk[0]) || !/✓ Pickup \/ EXP lines/.test(chk[1]) || !/Minimap not found/.test(chk[1]) || !/EXP bar<\/td><td class="n slow">✗/.test(chk[1]) || !/turns ✓ by itself/.test(chk[1]) || !/Party window<\/td><td class="n slow">✗/.test(chk[1])) throw new Error("self-check: " + chk.join(" | "));
  // auto-pause: bar read once, then bar and minimap gone for 3 s -> paused; the bar back -> tracking again
  // (false: no minimap on screen)
  const ap = await page.evaluate(() => { const f = false, t = Date.now() + 1e4; autoPause(f, {bar: true}, t); autoPause(f, {bar: false}, t + 1000); const a = session.state.pausedAt;
    autoPause(f, {bar: false}, t + 4100); const b = session.state.pausedAt, st = document.querySelector("#status").textContent; autoPause(f, {bar: true}, t + 9000);
    return [a, b, st, session.state.pausedAt, session.state.pausedMs] });
  if (ap[0] !== null || !ap[1] || !/Paused/.test(ap[2]) || ap[3] !== null || !(ap[4] >= 4900)) throw new Error("auto-pause: " + JSON.stringify(ap));
  // Report a bug: frames kept every 3 s, log with events and status lines, the report folder opened
  await page.waitForTimeout(3200);
  await page.click(".tabs [data-tab=settings]"); await page.fill("#reportNote", "map read wrong"); await page.click("#report"); await page.waitForTimeout(100);
  const rep = await page.evaluate(() => [window.report, window.opened]);
  if (!rep[0] || rep[0].frames < 1 || rep[0].info.note !== "map read wrong" || !rep[0].info.log.some(l => l.kind === "event") || !rep[0].info.log.some(l => l.kind === "status")
    || !rep[0].info.check || rep[1] !== "report-2026-10-17T20-00-00") throw new Error("report: " + JSON.stringify(rep).slice(0, 300));
  // "Show me where my potions are": the snip window's box is saved and used; "Look everywhere" clears it
  const ar = await page.evaluate(async () => { host.snip = async url => (window.snipUrl = url.slice(0, 15), {x: 0.6, y: 0.7, w: 0.3, h: 0.25});
    await pickArea(); const saved = settings.countArea, st = document.querySelector("#status").textContent, note = document.querySelector("#areaNote").textContent;
    document.querySelector("#areaClear").click(); await new Promise(r => setTimeout(r, 50));
    return {saved, st, note, url: window.snipUrl, cleared: settings.countArea, hidden: document.querySelector("#areaClear").classList.contains("hidden")} });
  if (!ar.saved || ar.saved.x !== 0.6 || !/count|box/.test(ar.st) || !ar.note || ar.url !== "data:image/jpeg" || ar.cleared !== null || !ar.hidden) throw new Error("area pick: " + JSON.stringify(ar));
  // death check: a bar drop, then the chat OCR finds "lost 4,721 EXP for dying" (Danny's screenshot line)
  const dn = await page.evaluate(async () => { const ocr = host.ocr; host.ocr = async () => "[00:15] You have lost 4,721 EXP for dying\n"; deathSeen = session.state.deaths; session.state.deaths++;
    const t0 = Date.now(); while (!deaths.confirmed && Date.now() - t0 < 4000) await new Promise(r => setTimeout(r, 100));
    host.ocr = ocr; render(); return document.querySelector("#deathNote").textContent });
  if (!/1 confirmed by the chat line \(lost 4,721 EXP\)/.test(dn)) throw new Error("death note: " + dn);
  // snapshots: typed by hand (Lv 25, 46.61% -> 71.40% over 22 min, Danny's KPQ run) -> about 31,900 EXP/hr
  const sn = await page.evaluate(() => { snaps.start = {t: Date.now() - 22 * 60e3, level: 25, pct: 46.61, hand: true}; snaps.end = null;
    const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.onchange() };
    set("#s1lv", 25); set("#s1pct", 71.40); return [document.querySelector("#snapRate").textContent, document.querySelector("#snapNote").textContent] });
  const want = Math.round(0.2479 * 47216 / (22 / 60));
  if (Math.abs(+sn[0].replace(/\D/g, "") - want) > want * 0.01 || !/22 min/.test(sn[1])) throw new Error("snapshots: " + JSON.stringify(sn) + " want ~" + want);
  await page.click(".tabs [data-tab=snaps]"); await page.click("#snapEnd"); await page.waitForTimeout(200);   // a button snapshot from the (test) game picture: saved, replaces the typed end
  if (!(await page.evaluate(() => snaps.end.file && snaps.end.hand))) throw new Error("snap end button");
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
  if (!/Best time here: .+ 20% faster than usual then \(4 players\)/.test(last)) throw new Error("best time: " + last);
  if (!/4,000 EXP\/hr/.test(last) || !/Not enough shared runs/.test(last)) throw new Error("speed card: " + last);
  if (!/Last 7 days: 2 sessions, 0.8 h farming, 8,000 EXP, 1,200 mesos, level 21 → 22, 1 death. Fastest map: Snail Hunting Ground III \(12,000 EXP\/hr\)/.test(hist)) throw new Error("recap: " + hist);
  if (!/Lv 21 → 22\s*41 min\s*Snail Hunting Ground III/.test(hist) || /Lv 20 → 21/.test(hist)) throw new Error("level-up log: " + hist);
  if (!mini || full || !back) throw new Error("mini bar toggle");
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (!/Red Snail/.test(mobs) || !/Blue Snail/.test(mobs)) throw new Error("mobs table: " + mobs);
  if (!/Horny Mushroom Cap/.test(items)) throw new Error("items table: " + items);
  if (!saved || saved.kills !== 3 || !saved.shared) throw new Error("saved session: " + JSON.stringify(saved));
  console.log("ui test passed");
})().catch(e => { console.error(e.message); process.exit(1) });
