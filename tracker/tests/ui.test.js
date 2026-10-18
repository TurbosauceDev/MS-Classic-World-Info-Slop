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
      saveSession: async s => (window.saved = s, true), saveFrame: async () => "x", saveImage: async (n, b) => (window.img = {n, b: [...b]}, "x"), openFolder: async d => (window.opened = d), saveReport: async (f, info) => (window.report = {frames: f.length, info}, "report-2026-10-17T20-00-00"), ocr: async () => "Victoria Road\nSnail Hunting Ground III", shareRun: async r => ((window.shared ||= []).push(r), true), summary: async () => ({rows: [], times: {"42": [[0, 0.9, 3], [18, 1.2, 4]]}}), sessions: async () => [{saved: Date.now() - 3600e3, date: "2026-10-17", mapName: "Snail Hunting Ground III", level: 22, activeMin: 30, exp: 6000, mesos: 900, deaths: 1, player: "Turbow", job: "Archer", startLevel: 21, endLevel: 22, items: {"4000019": 3, "4000000": 9},
          levelUps: [{level: 22, activeMin: 41, mapName: "Snail Hunting Ground III"}, {level: 21, activeMin: null}]},
        {saved: Date.now() - 7200e3, date: "2026-10-17", mapName: "Pig Beach", level: 21, activeMin: 20, exp: 2000, mesos: 300, deaths: 0},
        {saved: Date.now() - 9 * 864e5, date: "2026-10-08", mapName: "Old", level: 10, activeMin: 60, exp: 1, mesos: 1}], exportCsv: async () => "", mini: async () => true,
      version: async () => "0.2.17", updateState: async () => ({state: "idle"}), updateCheck: async () => (window.upd?.({state: "downloading", version: "0.2.18", pct: 40}), {state: "ready", version: "0.2.18"}),
      updateInstall: async () => (window.installed = true), onUpdate: cb => window.upd = cb};
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
  // default Session layout (Danny, 2026-10-18): numbers, monsters, then KPQ / Alerts and goal / Start and end folded
  const lay0 = await page.evaluate(() => [...document.querySelectorAll('section[data-tab=session] > [data-box]')].map(b => b.dataset.box + (b.classList.contains("folded") ? "-" : "")).join());
  if (lay0 !== "stats,mobs,kpq-,alerts-,snaps-") throw new Error("default layout: " + lay0);
  await page.evaluate(() => document.querySelectorAll(".box.folded .fold").forEach(b => b.click()));
  await page.dblclick("#go");
  await page.waitForTimeout(1500);
  // updates: Check for updates -> downloading -> ready banner; Restart and update stops (saves) the session first
  await page.click(".tabs [data-tab=settings]"); await page.click("#updCheck"); await page.waitForTimeout(100);
  const up = await page.evaluate(() => [document.querySelector("#appVer").textContent, document.querySelector("#updNote").textContent, document.querySelector("#updText").textContent]);
  if (up[0] !== "0.2.17" || !/0\.2\.18 is ready/.test(up[1]) || !await page.isVisible("#updBanner") || !await page.isVisible("#updInstall")) throw new Error("update: " + up);
  await page.click(".tabs [data-tab=session]");
  // the top card: tracking state and Stop; tabs switch sections
  const top = await page.evaluate(() => [document.querySelector("#stateText").textContent, document.querySelector("#go").textContent, document.querySelector("#go").classList.contains("on")]);
  if (!/^Tracking/.test(top[0]) || top[1] !== "Stop" || !top[2]) throw new Error("top card: " + top);
  await page.click(".tabs [data-tab=loot]");
  if (!await page.isVisible("#priceNote, #itemsEmpty") || await page.isVisible("#mobsEmpty") || !await page.isVisible("#itemsEmpty")) throw new Error("loot tab");
  // Help: the ? button opens it, Close goes back to Loot; F1 opens it too
  await page.click("#helpBtn");
  if (!await page.isVisible("#help") || !/Getting started/.test(await page.textContent("#help")) || await page.isVisible("#itemsEmpty")) throw new Error("help open");
  await page.click("#helpClose");
  if (await page.isVisible("#help") || !await page.isVisible("#itemsEmpty")) throw new Error("help close");
  await page.keyboard.press("F1"); if (!await page.isVisible("#help")) throw new Error("F1 help");
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
  await page.click(".tabs [data-tab=session]"); await page.fill("#goal", "23"); await page.dispatchEvent("#goal", "change");
  const gl = await page.evaluate(() => { const t = Date.now() - 200e3; session.add({t, type: "bar", exp: 5000, pct: 5000 / GAMEDATA.exp[22] * 100, level: 22});
    session.add({t: t + 10e3, type: "bar", exp: 6000, pct: 6000 / GAMEDATA.exp[22] * 100, level: 22}); session.add({t: t + 20e3, type: "bar", exp: 5500, pct: 5500 / GAMEDATA.exp[22] * 100, level: 22});
    session.state.lastExpT = Date.now() - 130e3;   // last EXP over 2 minutes ago
    render(); return [document.querySelector("#deaths").textContent, document.querySelector("#goalK").textContent, document.querySelector("#goalV").textContent, document.querySelector("#status").textContent] });
  if (gl[0] !== "1" || gl[1] !== "Level 23 in" || !/h|min/.test(gl[2]) || !/No EXP for 2 minutes/.test(gl[3])) throw new Error("goal/deaths/stop: " + gl);
  // Next level (the default) and Off
  await page.click("#goalNext"); await page.waitForTimeout(50);
  const gn = await page.evaluate(() => [settings.goal, document.querySelector("#goal").value, document.querySelector("#goalNext").getAttribute("aria-pressed"), session.stats().goalLevel === session.stats().level + 1]);
  if (gn.join() !== "next,,true,true") throw new Error("goal next: " + gn);
  await page.click("#goalOff"); await page.waitForTimeout(50);
  if (await page.evaluate(() => session.stats().goalLevel) !== null) throw new Error("goal off");
  // potions used (from the quick-slot counts): cost per hour and the list
  const usedTxt = await page.evaluate(() => { session.add({t: Date.now(), type: "use", id: "2000002", n: 3}); render();
    return [document.querySelector("#used").textContent, document.querySelector("#usedBox").classList.contains("hidden"), document.querySelector("#netHr").textContent, ICONS.length] });
  if (!/White Potion×3\?350−1,050Total×3−1,050/.test(usedTxt[0]) || usedTxt[1] || !/^net /.test(usedTxt[2]) || !(usedTxt[3] > 30)) throw new Error("used: " + usedTxt);
  // "I only buy meat and lemons": colour potions cost nothing
  await page.evaluate(() => document.querySelector("#meatOnly").click()); await page.waitForTimeout(50);
  const meat = await page.evaluate(() => [document.querySelector("#used").textContent, document.querySelector("#meatOnly").getAttribute("aria-pressed")]);
  if (!/White Potion×3\?free \(drop\)/.test(meat[0]) || meat[1] !== "true") throw new Error("meat only: " + meat);
  await page.evaluate(() => document.querySelector("#meatOnly").click()); await page.waitForTimeout(50);
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
  // KPQ (Auto): a stage on the minimap turns it on; Kerning City between rounds pauses (and the bar doesn't resume it); the next stage resumes
  const kq = await page.evaluate(() => { const t = Date.now() + 2e4, f = false;
    kpqMap("104000000", t); const off = kpq.on;
    kpqMap("80000000", t + 100); kpqMap("80000100", t + 200); kpqMap("80000600", t + 300); const r1 = kpq.rounds;
    kpqMap("10003000", t + 400); const held = session.state.pausedAt !== null;
    autoPause(f, {bar: true}, t + 900); const stillHeld = session.state.pausedAt !== null;
    session.add({t: t + 950, type: "bar", level: 22, pct: 10}); autoPause(f, {bar: true}, t + 1000); const reheld = session.state.pausedAt !== null;
    kpqMap("80000000", t + 5000); const back = session.state.pausedAt === null;
    // the KPQ clock: 30:00 left on the 1st stage, 29:00 a minute into the 2nd, Exit 60 s later = a 2:00 round
    kpqTime(1800, t + 5000); kpqMap("80000100", t + 65000); kpqTime(1740, t + 65000); kpqMap("80000600", t + 125000);
    const times = [...kpq.times], st = kpq.stageTimes["80000000"]; render();
    return {times, st, off, r1, held, stillHeld, reheld, back, rounds: kpq.rounds, note: document.querySelector("#kpqNote").textContent, where: document.querySelector("#where").textContent} });
  if (kq.off || kq.r1 !== 1 || !kq.held || !kq.stillHeld || !kq.reheld || !kq.back || kq.rounds !== 2 || !/KPQ \(Bonus\): 2 rounds/.test(kq.note) || !/^KPQ \(Bonus\)/.test(kq.where) || kq.times.at(-1) !== 120 || kq.st?.at(-1) !== 60 || !/best round /.test(kq.note)) throw new Error("kpq: " + JSON.stringify(kq));
  // Grinding picked: KPQ stages don't turn it on
  const kg = await page.evaluate(async () => { const keep = kpq; settings = await host.settings({kpqAct: "grind"}); kpqReset(); kpqMap("80000000", Date.now() + 3e4); const on = kpq.on;
    settings = await host.settings({kpqAct: "auto"}); kpq = keep; return on });
  if (kg) throw new Error("kpq grind: still turned on");
  // KPQ leaderboard: with sharing on, a full round (1st stage .. Last, Bonus, Exit) is sent with its clear time (to leaving
  // the Last stage); a round left at the 2nd stage isn't
  const kl = await page.evaluate(async () => { const keep = settings, t = Date.now() + 4e5; settings = {...settings, share: true}; window.shared = [];
    kpqMap("10003000", t); for (const [i, id] of ["80000000", "80000100", "80000200", "80000300", "80000400", "80000500", "80000600"].entries()) kpqMap(id, t + 1000 + i * 60e3);
    kpqMap("10003000", t + 5e5); kpqMap("80000000", t + 6e5); kpqMap("80000100", t + 6.6e5); kpqMap("10003000", t + 7e5);
    settings = keep; return window.shared });
  if (kl.length !== 1 || !kl[0].kpq || kl[0].clear !== 300 || kl[0].total !== 360 || kl[0].mode !== "Bonus" || Object.keys(kl[0].stages).length !== 6) throw new Error("kpq share: " + JSON.stringify(kl));
  // inventory: Etc read at the start and later -> fills unread pickup lines; Stop goes to the wrap-up card, where each tab
  // turns green once read after Stop; Resume goes back to tracking
  const iv = await page.evaluate(async () => { const t = Date.now();
    session.add({t: t - 300e3, type: "inv", tab: "etc", items: {"4000019": 3}, unknown: 0});
    session.add({t: t - 200e3, type: "itemraw", text: "?"});
    session.add({t: t - 150e3, type: "inv", tab: "etc", items: {"4000019": 8}, unknown: 0}); render();
    const ask = document.querySelector("#invAsk").textContent, chips = document.querySelector("#invTabs").textContent, items = document.querySelector("#items").textContent;
    await stop(); const ok = () => document.querySelectorAll("#wrapTabs .chip.ok").length;
    const asked = [document.querySelector("#status").textContent, !document.querySelector("#wrap").classList.contains("hidden"), timer != null, document.querySelector("#go").textContent, ok(), session.state.pausedAt !== null];
    for (const tab of ["equip", "use", "etc"]) session.add({t: Date.now(), type: "inv", tab, items: tab === "etc" ? {"4000019": 8} : {}, unknown: 0});
    render(); const after = [ok(), document.querySelector("#wrapNote").textContent];
    resume(); const back = [wrap, document.querySelector("#go").textContent, document.querySelector("#wrap").classList.contains("hidden"), session.state.pausedAt];
    return {ask, asked2: document.querySelector("#invAsk").classList.contains("hidden"), chips, items, asked, after, back, mesos: document.querySelector("#mesoGrid").textContent} });
  if (!/✓✓ Etc/.test(iv.chips) || !/from the inventory/.test(iv.items) || !/Total/.test(iv.items) || /not read yet/.test(iv.items) || !/Finalize log/.test(iv.asked[0]) || !/show the Equip, Use tabs/.test(iv.ask) || !iv.asked2
    || !iv.asked[1] || !iv.asked[2] || iv.asked[3] !== "Resume" || iv.asked[4] !== 0 || !iv.asked[5] || iv.after[0] !== 3 || !/Finalize log/.test(iv.after[1])
    || iv.back[0] !== null || iv.back[1] !== "Stop" || !iv.back[2] || iv.back[3] !== null || !/Picked up\s*\+12/.test(iv.mesos)) throw new Error("inventory: " + JSON.stringify(iv));
  // boxes: a saved layout puts the Mesos box in the pinned strip and folds Monsters; Reset puts them back
  const lay = await page.evaluate(async () => { layoutLoad({order: {dock: ["mesos"]}, folded: ["mobs"]});
    const moved = [document.querySelector("#mesoBox").parentElement.id, document.querySelector("[data-box=mobs]").classList.contains("folded")];
    document.querySelector("#layoutReset").click(); await new Promise(r => setTimeout(r, 50));
    return [...moved, document.querySelector("#mesoBox").parentElement.dataset.tab, document.querySelector("[data-box=mobs]").classList.contains("folded"), JSON.stringify(settings.layout.order.dock)] });
  if (lay[0] !== "dock" || !lay[1] || lay[2] !== "loot" || lay[3] || lay[4] !== "[]") throw new Error("box layout: " + lay);
  // dragged with the mouse: the Mesos box by its title onto the Session tab (moves there and opens it), then the Monsters
  // box by its grip onto the top half of the Start and end box (goes above it)
  // (the target is measured once the drag has started: the pin strip opening above the tabs moves things down)
  const dragTo = async (from, to, dy = 0) => { const a = await page.locator(from).boundingBox();
    await page.mouse.move(a.x + 10, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 20, {steps: 3});
    const b = await page.locator(to).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + (dy || b.height / 2), {steps: 5}); await page.mouse.up(); await page.waitForTimeout(50) };
  await page.setViewportSize({width: 600, height: 2400}); await page.click(".tabs [data-tab=loot]");
  await dragTo("#mesoBox h3", ".tabs [data-tab=session]");
  await dragTo("[data-box=mobs] .grip", "#snaps", 10);
  const dr = await page.evaluate(() => [document.querySelector("#mesoBox").parentElement.dataset.tab, document.querySelector(".tabs .sel").dataset.tab,
    document.querySelector("[data-box=mobs]").nextElementSibling?.id, !!document.querySelector(".dragLabel, .moving"), JSON.stringify(settings.layout.order.session)]);
  if (dr[0] !== "session" || dr[1] !== "session" || dr[2] !== "snaps" || dr[3] || !/mobs.*snaps/.test(dr[4])) throw new Error("mouse drag: " + dr);
  // pinned: dropped on the strip above the tabs (it only has a size while dragging) the box lands there, not back in a tab
  { const a = await page.locator("[data-box=stats] .grip").boundingBox(); await page.mouse.move(a.x + 3, a.y + 3); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y + 20, {steps: 3});
    const d = await page.locator("#dock").boundingBox(); await page.mouse.move(d.x + 40, d.y + d.height / 2, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(50) }
  const pin = await page.evaluate(() => [document.querySelector("[data-box=stats]").parentElement.id, JSON.stringify(settings.layout.order.dock)]);
  if (pin[0] !== "dock" || pin[1] !== '["stats"]') throw new Error("pin: " + pin);
  // side by side: Items looted dropped on the right edge of Consumables used makes a row; the splitter resizes it; the
  // Mesos box dropped on the bottom half of Items looted stacks under it in a column; saved and loaded back as rows
  await page.click(".tabs [data-tab=loot]");
  const edge = async (from, to, fx, fy) => { const a = await page.locator(from).boundingBox();
    await page.mouse.move(a.x + 3, a.y + 3); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y + 20, {steps: 3});
    const b = await page.locator(to).boundingBox(); await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(50) };
  await edge("[data-box=items] .grip", "#usedBox", 0.95, 0.5);
  const row1 = await page.evaluate(() => { const r = document.querySelector("#usedBox").parentElement;
    return [r.className, [...r.children].map(x => x.dataset.box || x.className).join(), JSON.stringify(settings.layout.order.loot)] });
  if (row1[0] !== "boxrow" || row1[1] !== "used,split,items" || !row1[2].includes('{"row":["used","items"]')) throw new Error("row: " + row1);
  { const s = await page.locator(".boxrow .split").boundingBox(); await page.mouse.move(s.x + 4, s.y + 20); await page.mouse.down();
    await page.mouse.move(s.x + 104, s.y + 20, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(50) }
  const wd = await page.evaluate(() => [document.querySelector("#usedBox").getBoundingClientRect().width, document.querySelector("[data-box=items]").getBoundingClientRect().width, settings.layout.order.loot.find(x => x.row).w]);
  if (!(wd[0] > wd[1] + 150) || !(wd[2][0] > wd[2][1])) throw new Error("resize: " + JSON.stringify(wd));
  await page.evaluate(() => document.querySelector("section[data-tab=loot]").appendChild(document.querySelector("#mesoBox")));   // (moved to Session above)
  await edge("#mesoBox h3", "[data-box=items]", 0.5, 0.9);
  const col = await page.evaluate(() => { const c = document.querySelector("#mesoBox").parentElement;
    return [c.className, c.parentElement.className, [...c.children].map(x => x.dataset.box).join(), JSON.stringify(settings.layout.order.loot)] });
  if (col[0] !== "boxcol" || col[1] !== "boxrow" || col[2] !== "items,mesos" || !col[3].includes('["items","mesos"]')) throw new Error("column: " + col);
  // pulled back out: the column and then the row unwrap on their own
  const unw = await page.evaluate(async () => { const saved = JSON.parse(JSON.stringify(settings.layout));
    for (const k of ["ArrowUp", "ArrowUp"]) document.querySelector("[data-box=mesos] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: k}));
    document.querySelector("[data-box=items] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
    const flat = document.querySelectorAll(".boxrow, .boxcol").length;
    layoutLoad(saved); const re = document.querySelector("#mesoBox").parentElement.className + "/" + Math.round(document.querySelector("#usedBox").getBoundingClientRect().width);
    return [flat, re, document.querySelector("#usedBox").parentElement.className] });
  if (unw[0] !== 0 || !unw[1].startsWith("boxcol/") || unw[2] !== "boxrow") throw new Error("unwrap/load: " + unw);
  await page.click(".tabs [data-tab=settings]"); await page.click("#layoutReset"); if ((await page.evaluate(() => [...document.querySelectorAll(".box.folded")].map(b => b.dataset.box).join())) !== "kpq,alerts,snaps") throw new Error("reset folds");
  await page.evaluate(() => document.querySelectorAll(".box.folded .fold").forEach(b => b.click())); await page.setViewportSize({width: 1280, height: 720});
  // Report a bug: frames kept every 3 s, log with events and status lines, the report folder opened
  await page.waitForTimeout(3200);
  await page.click(".tabs [data-tab=settings]"); await page.fill("#reportNote", "map read wrong"); await page.click("#report"); await page.waitForTimeout(100);
  const rep = await page.evaluate(() => [window.report, window.opened]);
  if (!rep[0] || rep[0].frames < 1 || rep[0].info.note !== "map read wrong" || !rep[0].info.log.some(l => l.kind === "event") || !rep[0].info.log.some(l => l.kind === "status")
    || !rep[0].info.check || rep[1] !== "report-2026-10-17T20-00-00") throw new Error("report: " + JSON.stringify(rep).slice(0, 300));
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
  await page.click(".tabs [data-tab=session]"); await page.click("#snapEnd"); await page.waitForTimeout(200);   // a button snapshot from the (test) game picture: saved, replaces the typed end
  if (!(await page.evaluate(() => snaps.end.file && snaps.end.hand))) throw new Error("snap end button");
  await page.fill("#runName", "KPQ rush with randoms");
  await page.click("#go"); await page.waitForTimeout(200);
  if (await page.isVisible("#runName")) throw new Error("name row shown while wrapping up");
  if (await page.evaluate(() => window.saved) || !await page.isVisible("#wrap")) throw new Error("stop: saved before End run");
  // a name typed in the top card shows in the wrap-up card; a note written there; both saved and shown in the summary
  await page.fill("#runNote", "ch 4, lost 2 to <b>ers");
  if (await page.inputValue("#wrapName") !== "KPQ rush with randoms") throw new Error("wrap name");
  await page.click("#wrapEnd"); await page.waitForTimeout(200);
  { const nm = await page.evaluate(() => [window.saved?.name, window.saved?.note, document.querySelector("#runName").value, document.querySelector("#sumBody b, #sumBody .hnote")?.textContent, !!document.querySelector("#sumBody b b")]);
    if (nm[0] !== "KPQ rush with randoms" || nm[1] !== "ch 4, lost 2 to <b>ers" || nm[2] !== "" || nm[4]) throw new Error("name/note: " + nm);
    if (!/KPQ rush with randoms[\s\S]*ch 4, lost 2 to <b>ers/.test(await page.textContent("#sumBody"))) throw new Error("summary name/note") }
  // summary saved as a picture: a PNG at 2x the card's size
  await page.click("#sumImg"); await page.waitForFunction(() => window.img);
  const im = await page.evaluate(async () => { const b = new Uint8Array(window.img.b), i = new Image(); i.src = URL.createObjectURL(new Blob([b], {type: "image/png"})); await i.decode();
    return [window.img.n, b[1] === 80 && b[2] === 78, i.width === document.querySelector("#summary").offsetWidth * 2] });
  if (!/^run-\d{4}-\d\d-\d\d-\d{4}\.png$/.test(im[0]) || !im[1] || !im[2]) throw new Error("summary image: " + im);
  if (process.env.SHOT) require("fs").writeFileSync(process.env.SHOT, Buffer.from(await page.evaluate(() => window.img.b)));
  const saved = await page.evaluate(() => window.saved), sum = await page.textContent("#summary");
  if (!await page.isVisible("#summary") || !/EXP per active minute/.test(sum) || !/Mesos looted\s*\+12/.test(sum) || !/Horny Mushroom Cap/.test(sum) || await page.isVisible("#wrap")) throw new Error("summary: " + sum);
  // speed check card (no shared data yet), drop alert, history, mini bar
  await page.evaluate(async () => { settings.alertWorth = 10; dropAlert(4000019);
    await showSpeed({exp: 1000, barExp: 1000, minutes: 15, level: 20, party: 1, map: 42}) });
  const status = await page.textContent("#status"), last = await page.textContent("#lastRun");
  await page.click("#histBtn"); await page.waitForTimeout(100);
  const hist = await page.textContent("#hist");
  // compare: tick two sessions
  await page.click("#histRows .cmp >> nth=0"); await page.click("#histRows .cmp >> nth=1");
  const cmp = await page.textContent("#cmp");
  await page.click("#cmpClear"); if (await page.evaluate(() => document.querySelectorAll("#histRows .cmp:checked").length)) throw new Error("compare clear");
  if (!/B did better on/.test(cmp) || !/▲|▼/.test(cmp) || !/EXP\/hr/.test(cmp) || !/Pig Beach/.test(cmp)) throw new Error("compare: " + cmp);
  // a watched item: the alert set finds it by part of its name
  const watched = await page.evaluate(() => { settings.alertItems = "Horny Mushroom Cap"; return alertSet().has("4000019") });
  if (!watched) throw new Error("item alert set");
  await page.click("#miniBtn"); const mini = await page.isVisible("#mini"), full = await page.isVisible("#go");
  await page.click("#mini"); const back = await page.isVisible("#go");
  if (!/Valuable drop: Horny Mushroom Cap/.test(status)) throw new Error("drop alert: " + status);
  if (!/Best time here: .+ 20% faster than usual then \(4 players\)/.test(last)) throw new Error("best time: " + last);
  if (!/4,000 EXP\/hr/.test(last) || !/Not enough shared runs/.test(last)) throw new Error("speed card: " + last);
  { const r0 = await page.textContent("#histRows tr"); if (!/Turbow · Archer · Lv 21 → 22 · solo · 1 death/.test(r0) || !/best drop: Horny Mushroom Cap ×3/.test(r0) || !/\+6,000 EXP · 200 EXP\/min active/.test(r0)) throw new Error("history details: " + r0) }
  if (!/Last 7 days: 2 sessions, 0.8 h farming, 8,000 EXP, 1,200, level 21 → 22, 1 death. Fastest map: Snail Hunting Ground III \(12,000 EXP\/hr\)/.test(hist)) throw new Error("recap: " + hist);
  if (!/Lv 21 → 22\s*41 min\s*Snail Hunting Ground III/.test(hist) || /Lv 20 → 21/.test(hist)) throw new Error("level-up log: " + hist);
  if (!mini || full || !back) throw new Error("mini bar toggle");
  // History: × asks first, the second click deletes and the list is redrawn
  await page.evaluate(() => { host.deleteSession = async saved => (window.deleted = saved, true) });
  await page.click("#histBtn"); await page.waitForTimeout(100);
  const del = "#histRows button.del >> nth=0"; await page.click(del);
  const ask = await page.textContent(del), before = await page.evaluate(() => window.deleted);
  await page.click(del); await page.waitForTimeout(100);
  if (ask !== "Delete?" || before || !(await page.evaluate(() => window.deleted > 0))) throw new Error("delete session: " + ask);
  await page.click("#updGo"); await page.waitForTimeout(100);
  if (!await page.evaluate(() => window.installed)) throw new Error("restart and update");
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (!/Red Snail/.test(mobs) || !/Blue Snail/.test(mobs)) throw new Error("mobs table: " + mobs);
  if (!/Horny Mushroom Cap/.test(items)) throw new Error("items table: " + items);
  if (!saved || saved.kills !== 3 || !saved.shared) throw new Error("saved session: " + JSON.stringify(saved));
  console.log("ui test passed");
})().catch(e => { console.error(process.env.STACK ? e.stack : e.message); process.exit(1) });
