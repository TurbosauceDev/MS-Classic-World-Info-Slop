// node tests/ui.test.js — the tracker window in plain Chromium (Electron's host API stubbed, a canvas stands in for the
// game window). Fails on any page error. Needs playwright (global or npm i -D playwright).
const path = require("path"), {chromium} = require("playwright");
(async () => {
  // file access on: plain Chromium blocks a worker from a file:// page, Electron doesn't (INLINE=1 tests the fallback)
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: process.env.INLINE ? [] : ["--allow-file-access-from-files"]});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(require("./ui-host"));
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  // first run: the guide asks about sharing
  if (!await page.isVisible("#guide")) throw new Error("guide not shown");
  await page.click("#guideShare");
  if (await page.isVisible("#guide") || !await page.isChecked("#share")) throw new Error("guide answer");
  // default layout: the old Session tab (numbers, monsters, then KPQ / Alerts and goal / Start and end folded) then the old Loot
  // tab, all in one layout (Danny, 2026-10-19: modules instead of tabs); Past sessions is a pop-up (F2) since 0.2.70, so the toolbox starts empty
  const lay0 = await page.evaluate(() => [[...document.querySelectorAll('#dock > [data-box]')].map(b => b.dataset.box + (b.classList.contains("folded") ? "-" : "")).join(),
    [...document.querySelectorAll("#tbList .tbItem")].map(x => x.dataset.mod).join(), !!document.querySelector(".tabs, section[data-tab=session]")]);
  if (lay0.join("|") !== "main,log,events,stats,mobs,kpq-,alerts-,mesos,watch-,pulse-,items,used||false") throw new Error("default layout: " + lay0);
  await page.evaluate(() => document.querySelectorAll(".box.folded .fold").forEach(b => b.click()));
  // a capture that never sends a frame (minimized game): Start says so instead of waiting for good, and works after (2026-10-19)
  await page.evaluate(() => { window.gdm0 = navigator.mediaDevices.getDisplayMedia; navigator.mediaDevices.getDisplayMedia = async () => document.createElement("canvas").captureStream(4) });
  await page.click("#go"); await page.waitForTimeout(6000);
  const nf = await page.evaluate(() => { navigator.mediaDevices.getDisplayMedia = window.gdm0; return [$("#status").textContent, starting, timer] });
  if (!/minimized/.test(nf[0]) || nf[1] || nf[2] != null) throw new Error("capture with no frames: " + JSON.stringify(nf));
  // Dummy data (View menu): every box filled, marked, nothing saved or shared; Start wipes it and tracks for real
  await page.evaluate(() => window.menu("dummy")); await page.waitForTimeout(100);
  const dm = await page.evaluate(() => [!document.querySelector("#dummyBar").classList.contains("hidden"), document.querySelectorAll("#items tr").length, document.querySelectorAll("#mobs tr").length,
    document.querySelectorAll("#feed .fl").length, document.querySelector("#expHr").textContent, document.querySelector("#used").textContent, !!window.saved, document.querySelector("#go").textContent]);
  // on its own the run log shows whole lines at the newest (its 7.5em height left a half line at the top, 2026-10-19)
  await page.waitForTimeout(400);   // the lines slide in (feedIn)
  const half = await page.evaluate(() => { const f = $("#feed"), cs = getComputedStyle(f), top = f.getBoundingClientRect().top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    return [...f.children].filter(l => { const r = l.getBoundingClientRect(); return r.top < top - 0.5 && r.bottom > top + 0.5 }).length });
  if (half) throw new Error("half a line at the top of the run log: " + half);
  if (!dm[0] || dm[1] < 3 || dm[2] !== 3 || dm[3] < 3 || dm[4] === "-" || !/Red Potion/.test(dm[5]) || dm[6] || dm[7] !== "Start") throw new Error("dummy data: " + JSON.stringify(dm));
  // turning it off (View menu again, or Clear) wipes it in place: it used to reload, which Electron blocks (Danny, 2026-10-19)
  let reloaded = false; page.once("framenavigated", () => reloaded = true);
  await page.evaluate(() => window.menu("dummy")); await page.waitForTimeout(100);
  const dmOff = await page.evaluate(() => [document.querySelector("#dummyBar").classList.contains("hidden"), dummyOn, session, document.querySelector("#feed").textContent,
    document.querySelectorAll("#mobs tr").length, document.querySelector("#expHr").textContent, document.querySelector("#stateText").textContent, document.querySelector("#miniState").textContent]);
  if (reloaded || !dmOff[0] || dmOff[1] || dmOff[2] || /Dummy/.test(dmOff[3]) || dmOff[4] || dmOff[5] !== "0" || /Dummy/.test(dmOff[6] + dmOff[7])) throw new Error("dummy data off: " + JSON.stringify(dmOff));
  await page.evaluate(() => window.menu("dummy")); await page.waitForTimeout(100); await page.click("#dummyClear");
  if (!await page.evaluate(() => document.querySelector("#dummyBar").classList.contains("hidden") && !dummyOn)) throw new Error("dummy data Clear button");
  // Dummy data has no run slicer: a job picked in Settings meanwhile threw; it can't be turned on while Start opens the capture
  // (Stop then found no session). Both from the random-click test, 2026-10-19
  await page.evaluate(() => { dummyFill(); const sel = $("#job"); sel.value = sel.options[1].value; sel.dispatchEvent(new Event("change")) });
  await page.waitForTimeout(100);
  const dj = await page.evaluate(() => { dummyClear(); starting = true; dummyFill(); const on = dummyOn; starting = false; return on });
  await page.waitForTimeout(100); if (dj) throw new Error("dummy data while starting");
  await page.evaluate(() => window.menu("dummy")); await page.waitForTimeout(100);
  await page.dblclick("#go");
  await page.waitForFunction(() => session != null, null, {timeout: 20000});   // Start's capture flow is async; CI runners are slower
  await page.waitForTimeout(400);
  const dm2 = await page.evaluate(() => [document.querySelector("#dummyBar").classList.contains("hidden"), /Dummy/.test(document.querySelector("#feed").textContent), session.state.kills]);
  if (!dm2[0] || dm2[1] || dm2[2]) throw new Error("dummy data after Start: " + dm2);
  // run log: a batch of kills and pickups becomes one line per kind, newest at the bottom (Danny, 2026-10-18)
  const fd = await page.evaluate(() => { const t = Date.now(), s = GrindSession.createSession(G), f = GrindFeed.createFeed(G); f.step(s.state, t);
    for (const e of [{type: "exp", gain: 20}, {type: "exp", gain: 20}, {type: "meso", amount: 55}, {type: "item", id: 2000000}]) s.add({t, ...e});
    feedAdd(f.step(s.state, t + 2500, "Danny"));
    return [...document.querySelectorAll("#feed .fl")].map(l => l.className + ":" + l.textContent).join("|") });
  if (!/^fl sep:.*Started tracking\|fl exp:.*Danny gained 40 EXP from 2 kills\|fl meso:.*Danny picked up 55\|fl loot:.*Danny looted 1 Red Potion/.test(fd)) throw new Error("run log: " + fd);
  // event log (Danny 2026-10-19): map/level/party lines and every status message land here, not in the run log; a message
  // that only changes its numbers updates its line; a red (bad) message stays red; the level-up isn't logged twice
  const ev = await page.evaluate(async () => {
    const tick = () => new Promise(r => setTimeout(r, 0)), t = Date.now(), st = $("#status"), n0 = $("#events").children.length;
    feedAdd([{t, kind: "map", text: "Danny entered Henesys"}, {t, kind: "party", text: "Party of 3"}, {t, kind: "exp", who: "Danny", n: 5, text: "Danny gained 5 EXP"}]);
    st.textContent = "Saving sample frames: 1/60"; await tick(); st.textContent = "Saving sample frames: 2/60"; await tick();
    st.textContent = "Couldn't capture the game: test"; st.className = "bad"; await tick(); st.className = "";
    statusKind = "level"; st.textContent = "Level 11! Level 10 took 20 min of farming."; await tick();
    feedAdd([{t, kind: "level", text: "Danny has reached level 11!"}]);
    const lines = [...document.querySelectorAll("#events .fl")].slice(n0).map(l => l.className + ":" + l.querySelector("span").textContent);
    return [lines.join("|"), /Henesys|Party of 3/.test($("#feed").textContent), /gained 5 EXP/.test($("#events").textContent), st.textContent] });
  if (ev[0] !== "fl map:Danny entered Henesys|fl party:Party of 3|fl msg:Saving sample frames: 2/60|fl bad:Couldn't capture the game: test|fl level:Level 11! Level 10 took 20 min of farming."
    || ev[1] || ev[2] || !/^Level 11/.test(ev[3])) throw new Error("event log: " + ev);
  // updates: Check for updates -> downloading -> ready banner; Restart and update stops (saves) the session first
  await page.evaluate(() => window.menu("settings")); await page.click("#updCheck"); await page.waitForTimeout(100);
  const up = await page.evaluate(() => [document.querySelector("#appVer").textContent, document.querySelector("#updNote").textContent, document.querySelector("#updText").textContent]);
  if (up[0] !== "0.2.17" || !/0\.2\.18 is ready/.test(up[1]) || !await page.isVisible("#updBanner") || !await page.isVisible("#updInstall")) throw new Error("update: " + up);
  await page.click("#prefsClose");
  // the top card: tracking state and Stop; tabs switch sections
  const top = await page.evaluate(() => [document.querySelector("#stateText").textContent, document.querySelector("#go").textContent, document.querySelector("#go").classList.contains("on")]);
  if (!/^Tracking/.test(top[0]) || top[1] !== "Stop" || !top[2]) throw new Error("top card: " + top);
  // Pause (button or shortcut): stays paused through frames until pressed again
  await page.evaluate(() => window.menu("pause")); await page.waitForTimeout(700);
  const ps = await page.evaluate(() => [document.querySelector("#stateText").textContent, document.querySelector("#pauseBtn").textContent, session.state.pausedAt !== null]);
  await page.click("#pauseBtn"); await page.waitForTimeout(100);
  const ps2 = await page.evaluate(() => [document.querySelector("#pauseBtn").textContent, session.state.pausedAt === null]);
  if (ps.join() !== "Paused by you,Go on,true" || ps2.join() !== "Pause,true") throw new Error("pause: " + JSON.stringify({ps, ps2}));
  
  if (!await page.isVisible("#mobsEmpty") || !await page.isVisible("#itemsEmpty")) throw new Error("session and loot boxes in one layout");
  // Help: the ? button opens it as a pop-up over the layout, ✕ closes it; F1 opens it too
  await page.click("#helpBtn");
  if (!await page.isVisible("#help") || !/Getting started/.test(await page.textContent("#help")) ) throw new Error("help open");
  // patch notes (changelog.js) listed in Help, newest = this version
  if (await page.$$eval("#patchList p", a => a.length) < 50 || !(await page.textContent("#patchList p")).startsWith(require("../package.json").version + " ")) throw new Error("patch notes");
  await page.click("#helpClose"); await page.waitForTimeout(250);
  if (await page.isVisible("#help") || !await page.isVisible("#itemsEmpty")) throw new Error("help close");
  await page.keyboard.press("F1"); if (!await page.isVisible("#help")) throw new Error("F1 help");
  await page.click("#helpClose"); await page.waitForTimeout(250);
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
  await page.fill("#goal", "23"); await page.dispatchEvent("#goal", "change");
  const gl = await page.evaluate(() => { const t = Date.now() - 200e3; session.add({t, type: "bar", exp: 5000, pct: 5000 / GAMEDATA.exp[22] * 100, level: 22});
    session.add({t: t + 10e3, type: "bar", exp: 6000, pct: 6000 / GAMEDATA.exp[22] * 100, level: 22}); session.add({t: t + 20e3, type: "bar", exp: 5500, pct: 5500 / GAMEDATA.exp[22] * 100, level: 22});
    session.state.lastExpT = Date.now() - 130e3;   // last EXP over 2 minutes ago
    render(); alertsTick(); return [document.querySelector("#deaths").textContent, document.querySelector("#goalK").textContent, document.querySelector("#goalV").textContent, document.querySelector("#status").textContent] });
  if (gl[0] !== "1" || gl[1] !== "Level 23 in" || !/h|min/.test(gl[2]) || !/No EXP for 2 min/.test(gl[3])) throw new Error("goal/deaths/stop: " + gl);
  // Next level (the default) and Off
  await page.click("#goalNext"); await page.waitForTimeout(50);
  const gn = await page.evaluate(() => [settings.goal, document.querySelector("#goal").value, document.querySelector("#goalNext").getAttribute("aria-pressed"), session.stats().goalLevel === session.stats().level + 1]);
  if (gn.join() !== "next,,true,true") throw new Error("goal next: " + gn);
  // conditions & alerts (0.2.78): the migrated row renders, a new alert edits + saves through, Test fires the real path
  const arow0 = await page.evaluate(() => [...document.querySelectorAll("#alertList .arow")].map(r => r.querySelector(".akind").value));
  if (arow0.join() !== "idleExp") throw new Error("alerts migration row: " + arow0);
  await page.click("#alertAdd"); await page.waitForTimeout(60);
  await page.selectOption("#alertList .arow >> nth=1 >> .akind", "lootWorth");
  await page.fill('#alertList .arow >> nth=1 >> .ap[data-k="v"]', "123");
  await page.dispatchEvent('#alertList .arow >> nth=1 >> .ap[data-k="v"]', "change");
  await page.waitForTimeout(450);   // the save debounces 300 ms
  const asaved = await page.evaluate(() => window.st.alerts);
  if (!Array.isArray(asaved) || asaved.length !== 2 || asaved[1].kind !== "lootWorth" || asaved[1].v !== 123) throw new Error("alerts saved: " + JSON.stringify(asaved));
  await page.click('#alertList .arow >> nth=1 >> .atest');
  if (!/picked up \(test\)/.test(await page.textContent("#status"))) throw new Error("alert test fire: " + await page.textContent("#status"));
  // 0.2.92: a new trigger kind rebuilds the row; the player's own sounds join the Sound list and save as file:<name>
  await page.selectOption("#alertList .arow >> nth=1 >> .akind", "died"); await page.waitForTimeout(60);
  await page.click("#soundAdd"); await page.waitForTimeout(80);
  const snd = await page.evaluate(() => [...document.querySelectorAll("#alertList .arow")[1].querySelectorAll(".asnd option")].map(o => o.value));
  if (!snd.includes("file:ding.wav") || !snd.includes("file:boom.mp3")) throw new Error("sounds in the list: " + snd);
  await page.selectOption("#alertList .arow >> nth=1 >> .asnd", "file:boom.mp3"); await page.waitForTimeout(450);
  const sv = await page.evaluate(() => [window.st.alerts[1].kind, window.st.alerts[1].act.sound]);
  if (sv.join() !== "died,file:boom.mp3") throw new Error("file sound saved: " + sv);
  await page.click('#alertList .arow >> nth=1 >> .atest'); await page.waitForTimeout(100);   // unreadable file: falls back to the chime, no throw
  if (!/You died/.test(await page.textContent("#status"))) throw new Error("died test fire: " + await page.textContent("#status"));
  await page.click('#alertList .arow >> nth=1 >> .adel'); await page.waitForTimeout(450);
  if (await page.evaluate(() => window.st.alerts.length) !== 1) throw new Error("alert removed: " + JSON.stringify(window.st.alerts));
  // the overlay's rate trend (0.2.80): each sample lands in the ring (a new session empties it), ovBuild carries the series
  const sp = await page.evaluate(() => { ovSparkSample(); const n0 = ovBuild(session.stats()).spark.length;
    session.add({t: Date.now(), type: "exp", gain: 5}); render(); ovSparkSample();
    return [n0, ovBuild(session.stats()).spark.length] });
  if (sp[0] !== 1 || sp[1] !== 2) throw new Error("overlay spark samples: " + sp);
  await page.click("#goalOff"); await page.waitForTimeout(50);
  if (await page.evaluate(() => session.stats().goalLevel) !== null) throw new Error("goal off");
  // potions used (from the quick-slot counts): cost per hour and the list
  const usedTxt = await page.evaluate(() => { session.add({t: Date.now(), type: "use", id: "2000002", n: 3}); render();
    return [document.querySelector("#used").textContent, document.querySelector("#usedBox").classList.contains("hidden"), document.querySelector("#netHr").textContent, ICONS.length] });
  if (!/White Potion×3\?350−1,050Total×3−1,050/.test(usedTxt[0]) || usedTxt[1] || !/^net /.test(usedTxt[2]) || !(usedTxt[3] > 30)) throw new Error("used: " + usedTxt);
  // "Dropped potions are free" (was "I only buy meat and lemons"): colour potions cost nothing
  await page.evaluate(() => document.querySelector("#meatOnly").click()); await page.waitForTimeout(50);
  const meat = await page.evaluate(() => [document.querySelector("#used").textContent, String(document.querySelector("#meatOnly").checked)]);
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
    // the saved timeline (Danny, 2026-10-19: rounds and the Bonus readable off the saved run): 2 rounds, each to Exit
    const tl = kpqTimeline(t + 126000).map(r => [r.n, r.end, r.stages.map(x => x[0] + " " + x[2]).join(", "), r.total]);
    return {tl, times, st, off, r1, held, stillHeld, reheld, back, rounds: kpq.rounds, note: document.querySelector("#kpqNote").textContent, where: document.querySelector("#where").textContent} });
  if (JSON.stringify(kq.tl) !== JSON.stringify([[1, "Exit", "1st 0, 2nd 0", 0], [2, "Exit", "1st 60, 2nd 60", 120]])) throw new Error("kpq timeline: " + JSON.stringify(kq.tl));
  if (kq.off || kq.r1 !== 1 || !kq.held || !kq.stillHeld || !kq.reheld || !kq.back || kq.rounds !== 2 || !/KPQ \(Bonus\): 2 rounds/.test(kq.note) || !/^KPQ \(Bonus\)/.test(kq.where) || kq.times.at(-1) !== 120 || kq.st?.at(-1) !== 60 || !/best round /.test(kq.note)) throw new Error("kpq: " + JSON.stringify(kq));
  // Grinding picked: KPQ stages don't turn it on
  const kg = await page.evaluate(async () => { const keep = kpq; settings = await host.settings({kpqAct: "grind"}); kpqReset(); kpqMap("80000000", Date.now() + 3e4); const on = kpq.on;
    settings = await host.settings({kpqAct: "auto"}); kpq = keep; return on });
  if (kg) throw new Error("kpq grind: still turned on");
  // KPQ leaderboard: with sharing on, a full round (1st stage .. Last, Bonus, Exit) is sent with its clear time (to leaving
  // the Last stage) and the character name; a round left at the 2nd stage isn't
  const kl = await page.evaluate(async () => { const keep = settings, t = Date.now() + 4e5; settings = {...settings, share: true, nick: "two words"}; window.shared = []; charName = "Turbow";
    kpqMap("10003000", t); for (const [i, id] of ["80000000", "80000100", "80000200", "80000300", "80000400", "80000500", "80000600"].entries()) kpqMap(id, t + 1000 + i * 60e3);
    kpqMap("10003000", t + 5e5); kpqMap("80000000", t + 6e5); kpqMap("80000100", t + 6.6e5); kpqMap("10003000", t + 7e5);
    // name off: a made-up name from the 1st job and the install ID, the same on the next round even after a job advance
    settings = {...settings, kpqName: false, alias: undefined, install: "0000abcd-0000"}; const a1 = kpqAlias("Hunter"), a2 = kpqAlias("Assassin");
    settings = keep; charName = null; return [...window.shared, a1, a2] });
  const [al1, al2] = kl.splice(-2);
  if (al1 !== "Archer8981" || al2 !== al1) throw new Error("kpq alias: " + [al1, al2]);
  // the name: a Name that isn't letters/digits falls back to the one read from the status bar
  if (kl.length !== 1 || !kl[0].kpq || kl[0].name !== "Turbow" || kl[0].clear !== 300 || kl[0].total !== 360 || kl[0].mode !== "Bonus" || Object.keys(kl[0].stages).length !== 6) throw new Error("kpq share: " + JSON.stringify(kl));
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
  // boxes: an old (per-tab) save loads into the one layout: its dock list first, then Session's, then Loot's; Reset puts them back
  const lay = await page.evaluate(async () => { layoutLoad({order: {dock: ["mesos"]}, folded: ["mobs"]});
    const moved = [document.querySelector("#mesoBox").parentElement.id, document.querySelector("[data-box=mobs]").classList.contains("folded")];
    document.querySelector("#layoutReset").click(); await new Promise(r => setTimeout(r, 50));
    return [...moved, document.querySelector("#mesoBox").previousElementSibling.id, document.querySelector("[data-box=mobs]").classList.contains("folded"), JSON.stringify(settings.layout.order.dock), settings.layout.v] });
  if (lay[0] !== "dock" || !lay[1] || lay[2] !== "alertsBox" || lay[3] || lay[4] !== '["main","log","events","stats","mobs","kpq","alerts","mesos","watch","pulse","items","used"]' || lay[5] !== 2) throw new Error("box layout: " + lay);
  { const old = await page.evaluate(() => { layoutLoad({order: {dock: ["main", "log"], session: ["stats", {row: ["mobs", "events"], w: [1, 1]}], loot: ["items"], hist: ["hist"]}});
      const r = [JSON.stringify([...document.querySelectorAll("#dock > *")].slice(0, 6).map(e => e.dataset.box || [...e.children].map(x => x.dataset.box).join("+"))), !!document.querySelector("#hist").closest("#histPop") && !document.querySelector("#dock #hist")];
      document.querySelector("#layoutReset").click(); return r });
    if (old[0] !== '["main","log","stats","mobs++events","items","kpq"]' || !old[1]) throw new Error("old layout migrated: " + old) }
  // Modules toolbox (Danny, 2026-10-19): Consumables used (put away first) dragged from it onto the bottom of the run log lands under it; × puts it
  // back; a box dragged onto the toolbox is put away, + adds it at the bottom. Then Monsters by its grip onto the top half of
  // Start and end (goes above it). (The target is measured once the drag has started: the layout grows a drop border.)
  const dragTo = async (from, to, dy = 0) => { const a = await page.locator(from).boundingBox();
    await page.mouse.move(a.x + 10, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 20, {steps: 3});
    await page.waitForTimeout(150); const b = await page.locator(to).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + (dy || b.height / 2), {steps: 5}); await page.waitForTimeout(120);   // let the drop detector see the pointer rest
    await page.mouse.up(); await page.waitForTimeout(50) };
  await page.setViewportSize({width: 600, height: 2400}); 
  await page.click("#usedBox .shut"); await page.waitForTimeout(250);
  await page.click("#tbBtn"); if (!await page.isVisible("#toolbox") || await page.textContent("#tbList") !== "⠿Consumables used+") throw new Error("toolbox open: " + await page.textContent("#tbList"));
  // (flaky in CI 2026-10-19: aiming 4 px above the run log's bottom edge missed it when the layout moved a few px after the drag
  // began, and it fell through to "add at the bottom". Wait out the toolbox's open animation and the drag-start reflow, then aim
  // well inside the box's lower half.)
  await page.waitForTimeout(250);
  { const a = await page.locator("#tbList .tbItem").boundingBox(); await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x - 20, a.y + 30, {steps: 3});
    await page.waitForTimeout(150);
    const b = await page.locator("#logBox").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.75, {steps: 5});
    const g = await page.evaluate(() => [document.querySelector(".dragLabel")?.textContent, document.querySelector(".dropGhost").textContent]);
    await page.mouse.up(); await page.waitForTimeout(50);
    const t = await page.evaluate(() => [document.querySelector("#logBox").nextElementSibling?.id, document.querySelector("#tbList").textContent, JSON.stringify(settings.layout.order.dock), !!document.querySelector(".moving, .dragLabel")]);
    if (!/Consumables used/.test(g[0]) || !/Below/.test(g[1]) || t[0] !== "usedBox" || !/Every module is in your layout/.test(t[1]) || !t[2].startsWith('["main","log","used","events"') || t[3]) throw new Error("toolbox drag in: " + JSON.stringify([g, t])) }
  await page.click("#usedBox .shut");
  { const t = await page.evaluate(() => [!!document.querySelector("#usedBox").closest("#shelf"), document.querySelector("#tbList").textContent, settings.layout.order.dock.includes("used")]);
    if (!t[0] || !/Consumables used/.test(t[1]) || t[2]) throw new Error("× puts away: " + t) }
  await page.waitForTimeout(450); await dragTo("#mesoBox h3", "#tbList");   // (after the boxes stop gliding — a gliding start point aims the drag at empty space)
  { const t = await page.evaluate(() => [!!document.querySelector("#mesoBox").closest("#shelf"), [...document.querySelectorAll("#tbList .tbItem")].map(x => x.dataset.mod).sort().join(), !document.querySelector("#main .shut, #top .shut")]);
    if (!t[0] || t[1] !== "mesos,used" || !t[2]) throw new Error("dragged onto the toolbox: " + t) }
  await page.click("#tbList [data-mod=used] button"); await page.click("#tbList [data-mod=mesos] button");
  if (await page.evaluate(() => document.querySelector("#dock").lastElementChild.id) !== "mesoBox") throw new Error("+ adds at the bottom");
  await page.click("#tbClose"); if (await page.isVisible("#toolbox")) throw new Error("toolbox close");
  await page.waitForTimeout(250); await dragTo("[data-box=mobs] .grip", "#alertsBox", 10);
  const dr = await page.evaluate(() => [document.querySelector("[data-box=mobs]").nextElementSibling?.id, !!document.querySelector(".dragLabel, .moving"), JSON.stringify(settings.layout.order.dock)]);
  if (dr[0] !== "alertsBox" || dr[1] || !/mobs.*alerts/.test(dr[2])) throw new Error("mouse drag: " + dr);
  // pinned: dropped on the strip above the tabs (it only has a size while dragging) the box lands there, not back in a tab
  { const a = await page.locator("[data-box=stats] .grip").boundingBox(); await page.mouse.move(a.x + 3, a.y + 3); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y + 20, {steps: 3});
    const d = await page.locator("#logBox").boundingBox(); await page.mouse.move(d.x + d.width / 2, d.y + d.height - 4, {steps: 5});
    // the ghost shows where it lands (Danny couldn't find side by side when it was a 3 px line)
    const g = await page.evaluate(() => { const e = document.querySelector(".dropGhost"); return [e.classList.contains("hidden"), e.textContent] });
    if (g[0] || !/Below/.test(g[1])) throw new Error("ghost: " + g);
    await page.mouse.up(); await page.waitForTimeout(50) }
  const pin = await page.evaluate(() => [document.querySelector("[data-box=stats]").parentElement.id, JSON.stringify(settings.layout.order.dock), document.querySelector(".dropGhost").classList.contains("hidden")]);
  if (pin[0] !== "dock" || !pin[1].startsWith('["main","log","stats","events"') || !pin[2]) throw new Error("pin: " + pin);
  // keyboard: right arrow on a box on its own puts it beside its neighbour (the run log, above it)
  const kb = await page.evaluate(async () => { const w = () => new Promise(r => setTimeout(r, 30));
    document.querySelector("[data-box=stats] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight"})); await w();
    const r = JSON.stringify(settings.layout.order.dock); document.querySelector("[data-box=stats] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"})); await w();
    return [r, JSON.stringify(settings.layout.order.dock)] });
  if (!kb[0].startsWith('["main",{"row":["log","stats"]') || !kb[1].startsWith('["main","log","stats","events"')) throw new Error("keyboard side by side: " + kb);
  // the main card is a box too (Danny, 2026-10-18): it goes beside the run log, and folded it keeps the Start bar
  const mc = await page.evaluate(async () => { const w = () => new Promise(r => setTimeout(r, 30)), g = document.querySelector("#top .grip");
    g.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight"})); await w(); const r = JSON.stringify(settings.layout.order.dock);
    document.querySelector("#top .fold").click(); await w(); const go = !!document.querySelector("#go").offsetParent, tiles = !!document.querySelector("#expHr").offsetParent;
    document.querySelector("#top .fold").click(); g.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp"})); await w();
    return [r, go, tiles, JSON.stringify(settings.layout.order.dock)] });
  if (!mc[0].startsWith('[{"row":["log","main"]') || !mc[1] || mc[2] || !mc[3].startsWith('["main","log","stats","events"')) throw new Error("main card: " + mc);
  // side by side: Items looted dropped on the right edge of Consumables used makes a row; the splitter resizes it; the
  // Mesos box dropped on the bottom half of Items looted stacks under it in a column; saved and loaded back as rows
  
  const edge = async (from, to, fx, fy) => { await page.waitForTimeout(220); const a = await page.locator(from).boundingBox();
    await page.mouse.move(a.x + 3, a.y + 3); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y + 20, {steps: 3});
    const b = await page.locator(to).boundingBox(); await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(50) };
  await edge("[data-box=items] .grip", "#usedBox", 0.95, 0.5);
  const row1 = await page.evaluate(() => { const r = document.querySelector("#usedBox").parentElement;
    return [r.className, [...r.children].map(x => x.dataset.box || x.className).join(), JSON.stringify(settings.layout.order.dock)] });
  if (row1[0] !== "boxrow" || row1[1] !== "used,split,items" || !row1[2].includes('{"row":["used","items"]')) throw new Error("row: " + row1);
  // the splitter only grabs with Shift (or Alt) held (Danny, 2026-10-19): a plain drag leaves the widths alone
  // (grabbed at mid-height, not 20 px down: up there a plain drag could catch a box's title bar and drag the box out of the row,
  // flaky in CI 2026-10-19)
  const splitDrag = async () => { const s = await page.locator(".boxrow .split").boundingBox(), y = s.y + Math.max(20, s.height / 2); await page.mouse.move(s.x + 4, y); await page.mouse.down();
    await page.mouse.move(s.x + 104, y, {steps: 4}); await page.mouse.up(); await page.waitForTimeout(50) };
  await splitDrag();
  if (await page.evaluate(() => settings.layout.order.dock.find(x => x.row).w.join()) !== "1,1") throw new Error("splitter grabbed without Shift");
  await page.keyboard.down("Shift"); await splitDrag(); await page.keyboard.up("Shift");
  // (Fit on: the bar stops where Items looted would cut its table off, not at 110 px)
  const wd = await page.evaluate(() => { const it = document.querySelector("[data-box=items]"); return [document.querySelector("#usedBox").getBoundingClientRect().width, it.getBoundingClientRect().width, settings.layout.order.dock.find(x => x.row).w, it.scrollWidth - it.clientWidth] });
  if (!(wd[0] > wd[1] + 20) || !(wd[2][0] > wd[2][1]) || wd[3] > 1) throw new Error("resize: " + JSON.stringify(wd));
  await edge("#mesoBox h3", "[data-box=items]", 0.5, 0.9);
  const col = await page.evaluate(() => { const c = document.querySelector("#mesoBox").parentElement;
    return [c.className, c.parentElement.className, [...c.children].map(x => x.dataset.box).join(), JSON.stringify(settings.layout.order.dock)] });
  if (col[0] !== "boxcol" || col[1] !== "boxrow" || col[2] !== "items,mesos" || !col[3].includes('["items","mesos"]')) throw new Error("column: " + col);
  // pulled back out: the column and then the row unwrap on their own
  const unw = await page.evaluate(async () => { const saved = JSON.parse(JSON.stringify(settings.layout));
    for (const k of ["ArrowUp", "ArrowUp"]) document.querySelector("[data-box=mesos] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: k}));
    document.querySelector("[data-box=items] .grip").dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
    const flat = document.querySelectorAll(".boxrow, .boxcol").length;
    layoutLoad(saved); const re = document.querySelector("#mesoBox").parentElement.className + "/" + Math.round(document.querySelector("#usedBox").getBoundingClientRect().width);
    return [flat, re, document.querySelector("#usedBox").parentElement.className] });
  if (unw[0] !== 0 || !unw[1].startsWith("boxcol/") || unw[2] !== "boxrow") throw new Error("unwrap/load: " + unw);
  await page.evaluate(() => window.menu("settings")); await page.click("#layoutReset"); await page.click("#prefsClose"); if ((await page.evaluate(() => [...document.querySelectorAll(".box.folded")].map(b => b.dataset.box).join())) !== "kpq,alerts,watch,pulse") throw new Error("reset folds");
  await page.evaluate(() => document.querySelectorAll(".box.folded .fold").forEach(b => b.click())); await page.setViewportSize({width: 1280, height: 720});
  // Report a bug: frames kept every 3 s, log with events and status lines, the report folder opened
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.menu("settings")); await page.fill("#reportNote", "map read wrong"); await page.click("#report"); await page.waitForTimeout(100); await page.evaluate(() => closePrefs());
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
  await page.click("#snapFix"); if (!await page.isVisible("#s1lv")) throw new Error("fix opens the start/end fields");
  await page.click("#snapEnd"); await page.waitForFunction(() => snaps.end?.file && snaps.end.hand, null, {timeout: 3000}).catch(() => {});   // (200 ms flaked, 2026-10-23)   // a button snapshot from the (test) game picture: saved, replaces the typed end
  await page.click("#snapFix");   // close the start/end fields again
  // main card (Danny 2026-10-23, mockup card 2): Start -> now on one line; Per hour / Total switch on the tiles, remembered
  { await page.click("#tTot"); const t = await page.evaluate(() => [$("#snapLine").textContent, $("#expHrK").textContent, $("#expHr").textContent, $("#lootTK").textContent, settings.tileTotal, String(Math.round(session.stats().exp).toLocaleString())]);
    await page.click("#tPer"); const p = await page.evaluate(() => [$("#expHrK").textContent, settings.tileTotal]);
    if (!/^Lv 25 46\.61% → .* read /.test(t[0]) || t[1] !== "EXP gained" || t[2] !== t[5] || t[3] !== "Loot value" || t[4] !== true || p[0] !== "EXP/hr" || p[1] !== false) throw new Error("main card: " + JSON.stringify([t, p])) }
  if (!(await page.evaluate(() => snaps.end.file && snaps.end.hand))) throw new Error("snap end button");
  await page.fill("#runName", "KPQ rush with randoms");
  await page.click("#go"); await page.waitForTimeout(200);
  if (await page.isVisible("#runName")) throw new Error("name row shown while wrapping up");
  if (await page.evaluate(() => window.saved) || !await page.isVisible("#wrap")) throw new Error("stop: saved before End run");
  // the wrap-up card shows above the layout, in view: under a dozen modules it was off the bottom (2026-10-19)
  if (!await page.evaluate(() => { const r = $("#wrap").getBoundingClientRect(); return r.top < $("#dock").getBoundingClientRect().top && r.top < innerHeight })) throw new Error("wrap-up card not in view");
  // a name typed in the top card shows in the wrap-up card; a note written there; both saved and shown in the summary
  await page.fill("#runNote", "ch 4, lost 2 to <b>ers");
  if (await page.inputValue("#wrapName") !== "KPQ rush with randoms") throw new Error("wrap name");
  await page.click("#wrapEnd"); await page.waitForTimeout(200);
  // a run name with no spaces (60 letters, the cap) wraps instead of running off a narrow window (random-click test, 2026-10-19)
  { const vp0 = page.viewportSize(); await page.setViewportSize({width: 340, height: vp0.height});
    const over = await page.evaluate(() => { const d = document.createElement("div"); d.textContent = "a".repeat(60); $("#sumBody").prepend(d);
      const o = document.documentElement.scrollWidth > innerWidth; d.remove(); return o });
    await page.setViewportSize(vp0); if (over) throw new Error("long run name overflows the summary") }
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
  // Past sessions: a pop-up on F2 (Danny 2026-10-23), not a module
  await page.keyboard.press("F2"); await page.waitForTimeout(250);
  if (!await page.isVisible("#histPop") || await page.evaluate(() => !!document.querySelector("[data-box=hist]"))) throw new Error("F2 opens Past sessions");
  const hist = await page.textContent("#hist");
  // compare (Danny, 2026-10-19: more than two at once): A = the oldest and the baseline; another baseline; take one out; Clear
  await page.click("#histRows .cmp >> nth=0"); await page.click("#histRows .cmp >> nth=1");
  const cmp = await page.textContent("#cmp");
  if (!/Best on \(★\): A \d+ · B \d+/.test(cmp) || !/▲|▼/.test(cmp) || !/EXP\/hr/.test(cmp) || !/Pig Beach/.test(cmp) || !/Kills per hour|Pickups per hour/.test(cmp)) throw new Error("compare: " + cmp);
  await page.click("#histRows .cmp >> nth=2");
  const c3 = await page.$$eval("#cmp .cmpWho", w => w.map(x => x.textContent));
  if (c3.length !== 3 || !/^A .*Old/.test(c3[0]) || !/^C .*Snail/.test(c3[2]) || !/Baseline/.test(c3[0])) throw new Error("compare 3: " + c3);
  // a narrow window: the compare table scrolls inside its box, the page doesn't get wider
  { const v0 = page.viewportSize(); await page.setViewportSize({width: 400, height: v0.height}); await page.waitForTimeout(100);
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); await page.setViewportSize(v0);
    if (wide[0] > wide[1]) throw new Error("History wider than a 400 px window: " + wide) }
  await page.click("#cmp .cmpBase >> nth=-1");
  if (!/change from C/.test(await page.textContent("#cmp"))) throw new Error("compare baseline");
  await page.click("#cmp .cmpX >> nth=0");
  const c2 = await page.$$eval("#cmp .cmpWho", w => w.map(x => x.textContent));
  if (c2.length !== 2 || c2.some(t => /Old/.test(t)) || !/change from B/.test(await page.textContent("#cmp")) || await page.isChecked("#histRows .cmp >> nth=2")) throw new Error("compare take out: " + c2);
  await page.click("#cmpClear"); if (await page.evaluate(() => document.querySelectorAll("#histRows .cmp:checked").length)) throw new Error("compare clear");
  // History filters: search, map, sort; Maps; personal best badge; details (monsters, loot, level-ups) and rename/note
  await page.fill("#histQ", "pig"); await page.waitForTimeout(50);
  const hq = [await page.$$eval("#histRows tr", r => r.length), await page.textContent("#histRows"), await page.textContent("#histCount")];
  if (hq[0] !== 1 || !/Pig Beach/.test(hq[1]) || !/1 of 3 sessions/.test(hq[2])) throw new Error("history search: " + hq);
  await page.fill("#histQ", ""); await page.selectOption("#histSort", "expHr"); await page.waitForTimeout(50);
  const hs = await page.$$eval("#histRows > tbody > tr, #histRows > tr", r => r.map(x => x.textContent));
  if (!/Snail Hunting Ground III.*Best EXP\/hr/.test(hs[0]) || !/Pig Beach/.test(hs[1])) throw new Error("history sort/best: " + hs);
  const maps = await page.$$eval("#maps tr", r => r.length);
  if (maps !== 4) throw new Error("maps table rows: " + maps);
  await page.click("#maps .mapPick >> text=Pig Beach"); await page.waitForTimeout(50);
  if (await page.inputValue("#histMap") !== "Pig Beach" || await page.$$eval("#histRows tr", r => r.length) !== 1) throw new Error("maps filter");
  await page.selectOption("#histMap", ""); await page.selectOption("#histSort", "new"); await page.waitForTimeout(50);
  await page.click("#histRows button.det >> nth=0"); await page.waitForTimeout(50);
  const hd = await page.textContent("#histRows tr.hdet");
  if (!/Horny Mushroom Cap ×3/.test(hd) || !/Lv 21 → 22/.test(hd) || /Compare with the run before/.test(hd)) throw new Error("history details: " + hd);
  await page.click("#histRows .hedit summary");
  await page.fill("#histRows .eName", "Snail rush"); await page.fill("#histRows .eNote", "ch 3"); await page.click("#histRows .eSave"); await page.waitForTimeout(50);
  const upd = await page.evaluate(() => window.updated);
  if (!upd || upd.name !== "Snail rush" || upd.note !== "ch 3" || !(upd.saved > 0) || "exp" in upd || "mapName" in upd) throw new Error("rename session: " + JSON.stringify(upd));
  // Edit run (Danny 2026-10-23): the map and a misread number fixed by hand; only what changed is sent, the map's id looked up
  await page.click("#histRows button.det >> nth=0"); await page.click("#histRows .hedit summary");
  await page.fill("#histRows .eMapIn", "The Pig Beach"); await page.fill("#histRows .eN[data-k=exp]", "7000"); await page.click("#histRows .eSave"); await page.waitForTimeout(50);
  { const u = await page.evaluate(() => window.updated);
    if (u.mapName !== "The Pig Beach" || u.map !== "10000021" || u.exp !== 7000 || "kills" in u || "activeMin" in u) throw new Error("edit run: " + JSON.stringify(u)) }
  // an older run on the same map: its details offer to compare the two
  await page.evaluate(async () => { const s0 = host.sessions; window.s0 = s0; host.sessions = async () => [...await s0(), {saved: Date.now() - 20 * 864e5, date: "2026-09-29", mapName: "Snail Hunting Ground III", activeMin: 30, exp: 3000, mesos: 400}]; await loadHist() });
  await page.click("#histRows button.det >> nth=0"); await page.click("#histRows button.cmpPrev"); await page.waitForTimeout(50);
  const cp2 = await page.$$eval("#cmp .cmpWho", w => w.map(x => x.textContent));
  if (cp2.length !== 2 || !/Snail/.test(cp2[0]) || !/Snail/.test(cp2[1])) throw new Error("compare with the run before: " + cp2);
  await page.click("#cmpClear"); await page.evaluate(async () => { host.sessions = window.s0; histOpen.clear(); await loadHist() });
  await page.keyboard.press("F2"); await page.waitForTimeout(250); if (await page.isVisible("#histPop")) throw new Error("F2 closes Past sessions");
  // a watched item: the alert set finds it by part of its name
  const watched = await page.evaluate(() => { settings.alertItems = "Horny Mushroom Cap"; return alertSet().has("4000019") });
  if (!watched) throw new Error("item alert set");
  // Modules toolbox by keyboard (View menu / Ctrl+Shift+K): focus lands on the first module, Enter adds it, Esc closes; saved
  await page.click("[data-box=stats] .shut"); await page.evaluate(() => window.menu("toolbox")); await page.waitForTimeout(30);
  const tf = await page.evaluate(() => [!document.querySelector("#toolbox").classList.contains("hidden"), document.activeElement.dataset.mod]);
  await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
  const tk = await page.evaluate(() => [!!document.querySelector("[data-box=stats]").closest("#dock"), document.querySelector("#toolbox").classList.contains("hidden"), settings.layout.order.dock.includes("stats"), document.querySelector("#tbBtn").getAttribute("aria-expanded")]);
  if (!tf[0] || tf[1] !== "stats" || tk.join() !== "true,true,true,false") throw new Error("toolbox keys: " + JSON.stringify([tf, tk]));
  await page.click("#miniBtn"); const mini = await page.isVisible("#mini"), full = await page.isVisible("#go");
  // Mini view (Danny, 2026-10-18): the totals and times, the run log and the three lists; the window asked to fit it
  const mv = await page.evaluate(() => ["#miniExp", "#miniMeso", "#miniTotal", "#miniActive", "#miniClock", "#miniTtl", "#miniItems", "#miniMobs", "#miniUsed"].filter(q => !document.querySelector(q).offsetParent));
  if (mv.length) throw new Error("mini view hides: " + mv);
  // Simple Mode (Danny's B2 <Subway Depot> mockup, 2026-10-23): map, Lv/job, EXP gained, potions, spent / picked up / loot value
  { const sm = await page.evaluate(() => [$("#smMap").textContent, $("#smWho").textContent, $("#miniTotal").textContent, $("#smMoney").textContent, !!$("#smChart").children.length]);
    if (sm[0] === "No map yet" || !/Lv\./.test(sm[1]) || !/^\+/.test(sm[2]) || !/spent.*picked up.*loot value/.test(sm[3]) || !sm[4]) throw new Error("simple mode: " + JSON.stringify(sm)) }
  // a window bigger than the Mini view: the content grows to fill it, no blank space (Danny, 2026-10-19)
  const vp = page.viewportSize(); await page.setViewportSize({width: 1276, height: 1900}); await page.waitForTimeout(150);   // (Simple Mode is ~1000 px tall at 1x since 0.2.71)
  const mz = await page.evaluate(() => [miniZ, document.querySelector("#mini").getBoundingClientRect().bottom, innerHeight]);
  if (!(mz[0] > 1.3) || mz[1] < mz[2] - 30) throw new Error("mini fill: " + mz);
  await page.setViewportSize(vp);
  await page.click("#miniFull"); const back = await page.isVisible("#go");
  // Discard run (Danny 2026-10-29): next to Finalize log, two clicks, saves nothing
  { await page.evaluate(() => { window.saved = null }); await page.click("#go"); await page.waitForTimeout(1500); await page.click("#go"); await page.waitForTimeout(400);
    const d0 = await page.evaluate(() => [!$("#wrap").classList.contains("hidden"), $("#wrapDrop").offsetParent != null, !!$("#miniWrapDrop"), !!$("#fzWrapDrop")]);
    if (d0.includes(false)) throw new Error("discard buttons: " + d0);
    await page.click("#wrapDrop");
    const d1 = await page.evaluate(() => [$("#wrapDrop").textContent, timer != null, !!window.saved]);
    if (d1[0] !== "Really discard?" || !d1[1] || d1[2]) throw new Error("discard first click must only arm: " + d1);
    await page.click("#wrapDrop"); await page.waitForTimeout(400);
    const d2 = await page.evaluate(() => [timer, !!window.saved, $("#wrap").classList.contains("hidden"), $("#wrapDrop").textContent, $("#status").textContent]);
    if (d2[0] != null || d2[1] || !d2[2] || d2[3] !== "Discard run" || !/discarded/.test(d2[4])) throw new Error("discard: " + d2) }
  // resize bars (Danny, 2026-10-19): hidden and not grabbable until Shift or Alt is held; the bar under a box sets its height
  if (await page.isVisible("#sumClose")) await page.click("#sumClose");   // the run summary sits above the layout now
  const rz0 = await page.evaluate(() => [!!document.querySelector("#rzLayer").offsetParent, document.querySelector("#logBox").getBoundingClientRect().height]);
  if (rz0[0]) throw new Error("resize bars show without a key");
  await page.keyboard.down("Shift");
  const hb = await page.evaluate(() => { const h = [...document.querySelectorAll(".hsplit")].find(x => x.rz.id === "logBox"); if (!h) return null; const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 5] });
  if (!hb) throw new Error("no resize bar under the run log");
  await page.mouse.move(hb[0], hb[1]); await page.mouse.down(); await page.mouse.move(hb[0], hb[1] + 40, {steps: 3}); await page.mouse.move(hb[0], hb[1] + 80, {steps: 3}); await page.mouse.up();
  await page.keyboard.up("Shift"); await page.waitForTimeout(100);
  const rz1 = await page.evaluate(() => [document.querySelector("#logBox").getBoundingClientRect().height, settings.layout?.h?.log, !!document.querySelector("#rzLayer").offsetParent]);
  if (Math.abs(rz1[0] - rz0[1] - 80) > 3 || Math.abs(rz1[1] - rz1[0]) > 2 || rz1[2]) throw new Error("resize run log: " + rz0 + " -> " + rz1);
  await page.evaluate(() => { const h = [...document.querySelectorAll(".hsplit")].find(x => x.rz.id === "logBox"); h.dispatchEvent(new MouseEvent("dblclick", {bubbles: true})) }); await page.waitForTimeout(100);
  if (await page.evaluate(() => document.querySelector("#logBox").classList.contains("sized") || settings.layout.h.log)) throw new Error("resize double-click undo");
  if (!/Valuable drop: Horny Mushroom Cap/.test(status)) throw new Error("drop alert: " + status);
  if (!/Best time here: .+ 20% faster than usual then \(4 players\)/.test(last)) throw new Error("best time: " + last);
  if (!/4,000 EXP\/hr/.test(last) || !/Not enough shared runs/.test(last)) throw new Error("speed card: " + last);
  { const r0 = await page.textContent("#histRows tr"); if (!/Turbow · Archer · Lv 21 → 22 · solo · 1 death/.test(r0) || !/best drop: Horny Mushroom Cap ×3/.test(r0) || !/\+6,000 EXP · 200 EXP\/min active/.test(r0)) throw new Error("history details: " + r0) }
  if (!/Last 7 days: 2 sessions, 0.8 h farming, 8,000 EXP, 1,200, level 21 → 22, 1 death. Fastest map: Snail Hunting Ground III \(12,000 EXP\/hr\)/.test(hist)) throw new Error("recap: " + hist);
  if (!/Lv 21 → 22\s*41 min\s*Snail Hunting Ground III/.test(hist) || /Lv 20 → 21/.test(hist)) throw new Error("level-up log: " + hist);
  if (!mini || full || !back) throw new Error("mini bar toggle");
  // History: × asks first, the second click deletes and the list is redrawn
  await page.evaluate(() => { host.deleteSession = async saved => (window.deleted = saved, true) });
  await page.evaluate(() => openHist()); await page.waitForTimeout(250);
  const del = "#histRows button.del >> nth=0"; await page.click(del);
  const ask = await page.textContent(del), before = await page.evaluate(() => window.deleted);
  await page.click(del); await page.waitForTimeout(100);
  if (ask !== "Delete?" || before || !(await page.evaluate(() => window.deleted > 0))) throw new Error("delete session: " + ask);
  await page.keyboard.press("Escape"); await page.waitForTimeout(250); if (await page.isVisible("#histPop") || await page.isVisible("#prefsPop")) throw new Error("Esc closes Past sessions (and only that)");
  // Esc with nothing open: Settings (Danny 2026-10-23)
  await page.keyboard.press("Escape"); await page.waitForTimeout(250); if (!await page.isVisible("#prefsPop")) throw new Error("Esc opens Settings");
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  // strange boxes (Danny 10-29): a skinny window stacks the two-column stat grids into one column instead of cramming
  // the numbers; back at a normal width the two columns return
  { const v0 = page.viewportSize(); await page.setViewportSize({width: 380, height: 900}); await page.waitForTimeout(150);
    const cols = await page.evaluate(() => ["#top .tiles", "[data-box=stats] .grid"].map(s =>
      getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(" ").length));
    await page.setViewportSize(v0); await page.waitForTimeout(150);
    const back = await page.evaluate(() => getComputedStyle(document.querySelector("#top .tiles")).gridTemplateColumns.split(" ").length);
    if (cols[0] !== 1 || cols[1] !== 1 || back !== 2) throw new Error("skinny window stat grids: " + JSON.stringify({skinny: cols, back})) }
  // Settings: a popup from File → Settings; no panel tabs any more (modules, 2026-10-19)
  if (await page.$(".tabs")) throw new Error("panel tabs are back");
  await page.evaluate(() => window.menu("settings")); if (!await page.isVisible("#prefsPop #themeSw")) throw new Error("preferences popup not shown");
  await page.keyboard.press("Escape"); await page.waitForTimeout(250); if (await page.isVisible("#prefsPop")) throw new Error("Esc didn't close preferences");
  // pop-ups (Settings, Help, Patch notes, Report a bug) float over the layout: inset from the window edges, blurred backdrop,
  // and opening or closing one never resizes the window (Help used to open under the layout and the window grew, Danny 2026-10-19)
  await page.evaluate(() => { fitWinSet(true); window.resized = []; for (const k of ["mini", "winSize"]){ const f = host[k]; host[k] = (...a) => (resized.push(k + ":" + a), f?.(...a)) } });
  await page.waitForTimeout(300); await page.evaluate(() => { resized.length = 0; window.docH = document.documentElement.scrollHeight });
  for (const [open, sel] of [["settings", "#prefsPop"], ["help", "#helpPop"], ["patchnotes", "#helpPop"], ["report", "#bugPop"]]){
    await page.evaluate(m => window.menu(m), open); await page.waitForTimeout(350);
    const m = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(), b = document.querySelector("#modalBack");
      return {l: r.left, t: r.top, r: innerWidth - r.right, b: innerHeight - r.bottom, back: getComputedStyle(b).display !== "none" && /blur/.test(getComputedStyle(b).backdropFilter), docH: document.documentElement.scrollHeight} }, sel);
    if (Math.min(m.l, m.r, m.b) < 10 || m.t < 40 || !m.back) throw new Error(`${open} pop-up not inset over a blurred backdrop: ` + JSON.stringify(m));
    if (open === "patchnotes" && !await page.evaluate(() => { const r = document.querySelector("#patchNotes").getBoundingClientRect(), p = document.querySelector("#helpPop").getBoundingClientRect(); return document.querySelector("#patchNotes").open && r.top >= p.top && r.top < p.bottom - 40 })) throw new Error("patch notes not scrolled into view");
    await page.keyboard.press("Escape"); await page.waitForTimeout(250);
    const after = await page.evaluate(s => [document.querySelector(s).classList.contains("hidden"), document.querySelector("#modalBack").classList.contains("hidden"), resized.join(), document.documentElement.scrollHeight - docH], sel);
    if (!after[0] || !after[1]) throw new Error(`Esc didn't close the ${open} pop-up`);
    if (after[2] || after[3] || m.docH !== await page.evaluate(() => docH)) throw new Error(`${open} pop-up resized the window: ` + JSON.stringify({calls: after[2], docH: [m.docH, after[3]]}));
  }
  await page.evaluate(() => fitWinSet(!!settings.fitWin));
  // themes (Settings): a preset swatch recolours the page and the title bar; the editor saves your own; share code round trip
  await page.evaluate(() => window.menu("settings"));
  const sw = await page.$$eval("#themeSw [data-th]", b => b.map(x => x.dataset.th));
  if (sw.length < 12 || sw[0] !== "p:Default") throw new Error("theme swatches: " + sw);
  await page.click('#themeSw [data-th="p:Slime"]'); await page.waitForTimeout(50);
  const th1 = await page.evaluate(() => [document.documentElement.style.getPropertyValue("--bg"), window.bar?.bg, window.st.theme, document.querySelector('[data-th="p:Slime"]').getAttribute("aria-checked")]);
  if (th1.join() !== "#111a14,#111a14,p:Slime,true") throw new Error("theme pick: " + th1);
  await page.click("#themeEdit");
  await page.evaluate(() => { const i = document.querySelector('#thColors [data-tk="ink"]'); i.value = "#1a1a1a"; i.dispatchEvent(new Event("input", {bubbles: true})) });
  const warn = await page.textContent("#thWarn");
  await page.evaluate(() => { const i = document.querySelector('#thColors [data-tk="ink"]'); i.value = "#e8f5ea"; i.dispatchEvent(new Event("input", {bubbles: true}));
    const a = document.querySelector('#thColors [data-tk="accent"]'); a.value = "#ff00aa"; a.dispatchEvent(new Event("input", {bubbles: true})) });
  const live = await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"));
  await page.fill("#thName", "Danny's pink"); await page.click("#thSave"); await page.waitForTimeout(50);
  const th2 = await page.evaluate(() => [window.st.theme, window.st.themes.length, window.st.themes[0].c.accent, document.querySelectorAll("#themeSw [data-th]").length]);
  if (!/Hard to read: Text/.test(warn) || live !== "#ff00aa" || th2.slice(0, 3).join() !== "u:Danny's pink,1,#ff00aa" || th2[3] !== sw.length + 1) throw new Error("theme editor: " + JSON.stringify({warn, live, th2}));
  await page.click("#thCopy"); const code = await page.inputValue("#thCode");
  const thBack = await page.evaluate(c => TrackerThemes.decode(c), code);
  await page.fill("#thCode", "MSCT1.bm9wZSBub3BlIG5vcGUgbm9wZQ=="); await page.click("#thPaste"); const bad = await page.textContent("#thNote");
  await page.fill("#thCode", code); await page.click("#thPaste"); await page.waitForTimeout(50);
  const th3 = await page.evaluate(() => [window.st.themes.length, window.st.theme]);
  if (!/^MSCT1\./.test(code) || thBack?.c.accent !== "#ff00aa" || thBack.name !== "Danny's pink" || !/isn't a theme/.test(bad) || th3.join() !== "1,u:Danny's pink") throw new Error("theme share: " + JSON.stringify({code, thBack, bad, th3}));
  // a hostile code can't get markup or odd values in
  const evil = await page.evaluate(() => TrackerThemes.decode(TrackerThemes.encode({name: "<img src=x onerror=alert(1)>", mode: "dark", c: {...TrackerThemes.PRESETS[1].c, bg: "red;background:url(x)"}})));
  if (evil !== null) throw new Error("theme validation: " + JSON.stringify(evil));
  // shortcuts: click one, press new keys; Shift + a letter is refused; Backspace turns one off; keys from the game (main) act
  await page.click('#keyRows [data-key="onTop"]');
  const paused = await page.evaluate(() => window.keysPaused);
  await page.keyboard.press("Shift+A"); const refused = await page.textContent("#keysNote");
  await page.keyboard.press("Control+Alt+K"); await page.waitForTimeout(50);
  const k1 = await page.evaluate(() => [window.keysSt?.onTop, document.querySelector('#keyRows [data-key="onTop"]').textContent]);
  await page.click('#keyRows [data-key="mini"]'); await page.keyboard.press("Control+Alt+K"); await page.waitForTimeout(50);
  const k2 = await page.evaluate(() => [window.keysSt?.mini, window.keysSt?.onTop]);
  await page.click('#keyRows [data-key="report"]'); await page.keyboard.press("Backspace"); await page.waitForTimeout(50);
  const k3 = await page.evaluate(() => [window.keysSt?.report, document.querySelector('#keyRows [data-key="report"]').textContent]);
  await page.evaluate(() => window.menu("onTop:false")); const onTopNow = await page.isChecked("#ontop");
  if (!paused || !/Add Ctrl or Alt/.test(refused) || k1.join() !== "CommandOrControl+Alt+K,Ctrl + Alt + K" || k2.join() !== "CommandOrControl+Alt+K," || k3.join() !== ",Off" || onTopNow)
    throw new Error("shortcuts: " + JSON.stringify({paused, refused, k1, k2, k3, onTopNow}));
  // the other shortcuts: mark (run note), picture of the numbers (no Explorer window), mute, click-through state shown
  await page.evaluate(() => { window.img = null; window.menu("mark") });
  const note = await page.inputValue("#runNote");
  await page.evaluate(() => window.menu("saveImage")); await page.waitForTimeout(400);
  const pic = await page.evaluate(() => window.img && [/^(now|run)-.*\.png$/.test(window.img.n), window.img.b.length > 1000]);
  await page.evaluate(() => window.menu("mute")); await page.waitForTimeout(50);
  const mute = await page.evaluate(() => [window.st.muted, document.querySelector("#muted").checked]);
  await page.evaluate(() => window.menu("mute")); await page.waitForTimeout(50);
  // beta channel (0.2.82): the checkbox saves through (main.js re-applies allowPrerelease on the real thing)
  await page.evaluate(() => { $("#beta").checked = true; $("#beta").dispatchEvent(new Event("change")) }); await page.waitForTimeout(60);
  if (await page.evaluate(() => window.st.beta) !== true) throw new Error("beta on not saved");
  await page.evaluate(() => { $("#beta").checked = false; $("#beta").dispatchEvent(new Event("change")) }); await page.waitForTimeout(60);
  if (await page.evaluate(() => window.st.beta) !== false) throw new Error("beta off not saved");
  await page.evaluate(() => window.menu("clickThrough:true")); const thr = await page.evaluate(() => [document.body.classList.contains("through"), document.querySelector("#status").textContent]);
  await page.evaluate(() => window.menu("clickThrough:false"));
  const rows = await page.$$eval("#keyRows [data-key]", b => b.length);
  if (!/\[.*\] mark/.test(note) || pic?.join() !== "true,true" || mute.join() !== "true,true" || await page.evaluate(() => window.st.muted) !== false || !thr[0] || !/Ctrl \+ Shift \+ X turns it off/.test(thr[1]) || rows !== 15)
    throw new Error("more shortcuts: " + JSON.stringify({note, pic, mute, thr, rows}));
  // Settings chips in a narrow window (the header wraps to 3 lines): the section lands just under the header and its chip is
  // marked, the short last ones too (they landed under it, the chip before was marked, 2026-10-19)
  { const vp0 = page.viewportSize(); await page.emulateMedia({reducedMotion: "reduce"}); await page.setViewportSize({width: 360, height: 760});
    const chips = await page.evaluate(() => [...$("#prefsNav").children].map((b, i) => { b.click(); return $("#prefsNav [aria-current=true]")?.dataset.i == i && PREF_SECS[i].getBoundingClientRect().top >= prefsHead() - 1 }));
    await page.setViewportSize(vp0); await page.emulateMedia({reducedMotion: "no-preference"});
    if (chips.some(x => !x)) throw new Error("settings chips: " + chips) }
  await page.click("#prefsClose"); await page.click("#updGo"); await page.waitForTimeout(100);
  if (!await page.evaluate(() => window.installed)) throw new Error("restart and update");
  // History at a 340 px window: the × turning into "Delete?" widened the list past the window (monkey seed 2 in CI, 2026-10-19)
  { const p2 = await browser.newPage({viewport: {width: 340, height: 600}}); await p2.addInitScript(require("./ui-host"));
    await p2.goto("file://" + path.join(__dirname, "../app/index.html")); await p2.click("#guideShare");
    await p2.evaluate(async () => { openHist(); await loadHist() }); await p2.waitForTimeout(300);   // after the pop-up's open animation (scale)
    const r0 = await p2.evaluate(() => { return document.querySelector("#histRows").getBoundingClientRect().right });
    await p2.locator("#histRows .del").first().click();
    const w = await p2.evaluate(() => [document.querySelector("#histRows .del.sure")?.textContent, document.documentElement.scrollWidth, document.documentElement.clientWidth,
      document.querySelector("#histRows").getBoundingClientRect().right]);
    if (w[0] !== "Delete?" || w[1] > w[2] || w[3] > r0 + 1) throw new Error("history at 340 px: " + w + " (was " + r0 + ")");
    await p2.close() }
  // site market cards (0.2.83): a fake market.json through the stubbed bridge; watchlist add → row → remove, pulse rows
  { const mk = await page.evaluate(() => { window.siteMkFake = {read: "2026-10-17", listed: "2026-10-17 12:00",
      it: {"4000019": [300, 290, 330, 16866, 0, -0.06], "2000001": [50, 48, 55, 120, 0, 0.4]},
      hist: {"4000019": [["2026-10-15", 350, 2014], ["2026-10-16", 310, 2326], ["2026-10-17", 300, 1662]],
             "2000001": [["2026-10-16", 40, 50], ["2026-10-17", 50, 60]]},
      asks: {"4000019": [[299, 1, 15, "FM <10>", "Levon", 29886734]]},
      tot: {sales: 721874, top: ["4000019", 330, 2, "12:00"]}};
    window.siteMkCb(window.siteMkFake, Date.now()); return true });
  await page.evaluate(() => { document.querySelectorAll("#watchBox.folded .fold, #pulseBox.folded .fold").forEach(b => b.click()) });
  const pulse = await page.evaluate(() => [$("#pulseGrid").textContent, $("#pulseMovers").textContent]);
  if (!/721,874/.test(pulse[0]) || !/Horny Mushroom Cap/.test(pulse[0]) || !/Rising/.test(pulse[1]) || !/Orange Potion/.test(pulse[1]) || !/Falling/.test(pulse[1]) || !/Horny Mushroom Cap/.test(pulse[1]))
    throw new Error("market pulse: " + JSON.stringify(pulse));
  await page.fill("#watchSearch", "Orange Potion"); await page.click("#watchAdd");
  await page.waitForTimeout(50);
  let wrow = await page.evaluate(() => [$("#watchRows").textContent, $("#watchNote").textContent]);
  if (!/Orange Potion/.test(wrow[0]) || !/50/.test(wrow[0]) || !/▲ \+40%/.test(wrow[0]) || !/updated /.test(wrow[1]))
    throw new Error("watchlist add: " + wrow);
  await page.click("#watchRows [data-wdrop]");
  wrow = await page.evaluate(() => $("#watchRows").textContent);
  if (/Orange Potion/.test(wrow) || !await page.evaluate(() => (window.st.siteWatch || []).length === 0))
    throw new Error("watchlist remove: " + wrow);
  const amb = await page.evaluate(async () => { $("#watchSearch").value = "Mushroom"; $("#watchAdd").click(); return $("#watchNote").textContent });
  if (!/no single item/.test(amb)) throw new Error("ambiguous watch add: " + amb);
  // compare modal (0.2.84): a fake cross-source payload; the modal shows per-source prices + the spread mark
  { const cmp = await page.evaluate(async () => { window.sitePrFake = {pw: {it: {"2000001": [50]}}, cmp: {it: {"2000001": [49, 48, 55, 8]}},
      mdb: {it: {"2000001": [500, 58, 3]}}, srcd: {mesowatch_prices: "2026-10-17 12:00", classicmarket_market: "2026-10-17 11:52", meowdb_market: "2026-10-17 10:23"}};
      window.siteMkCb(window.siteMkFake, Date.now(), window.sitePrFake);
      settings = await host.settings({siteWatch: ["2000001"]}); siteRender();
      $("#watchCmp").click(); return [$("#cmpRows").textContent, $("#cmpNote").textContent] });
    const flat = cmp[0].replace(/\s+/g, "");
    if (!/meowdb/.test(flat) || !/500/.test(flat) || !/498sales/.test(flat) || !/classicmarket\.kr/.test(flat) || !/×10 spread/.test(cmp[0]) || !/read stamp/.test(cmp[1]))
      throw new Error("compare modal: " + JSON.stringify(cmp));
    await page.click("#cmpClose") } }
  // quick palette (0.2.85): Ctrl+K opens, filter narrows, Enter runs the pick, Esc closes
  { await page.keyboard.press("Control+k");
    if (!await page.isVisible("#palPop") || !(await page.textContent("#palList")).includes("Past sessions")) throw new Error("palette open");
    await page.fill("#palQ", "sessions");
    const narrow = await page.evaluate(() => [...document.querySelectorAll("#palList li")].map(l => l.textContent).join("|"));
    if (!/Past sessions/.test(narrow) || /Settings/.test(narrow)) throw new Error("palette filter: " + narrow);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    if (!await page.evaluate(() => modalIsOpen($("#histPop")))) throw new Error("palette Enter ran the pick");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    if (await page.evaluate(() => modalIsOpen($("#histPop")) || modalIsOpen($("#palPop")))) throw new Error("palette Esc chain");
    await page.evaluate(() => { modalClose($("#histPop")) });
    await page.keyboard.press("Control+k"); await page.fill("#palQ", "overlay mode"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
    if (!await page.evaluate(() => (window.ovCalls || []).includes(true))) throw new Error("palette toggles overlay");
    await page.evaluate(() => window.menu("overlay")); await page.waitForTimeout(200) }
  // adaptive pace (T-13): 2 reads a second while things happen, 1 after 45 s quiet, 0.5 after 3 min, back to 2 on activity;
  // slow reads cap it at 1
  { const r = await page.evaluate(() => { const t0 = Date.now(), out = []; paceReset(); lastActive = t0;
      for (const [dt, act] of [[10e3, false], [46e3, false], [181e3, false], [182e3, true], [183e3, false]]){ pace(t0 + dt, act); out.push(FPS) }
      slowCap = true; pace(t0 + 300e3, true); out.push(FPS); pace(t0 + 500e3, false); out.push(FPS); paceReset(); setFps(2); return out });
    if (JSON.stringify(r) !== "[2,1,0.5,2,2,1,0.5]") throw new Error("pace steps: " + JSON.stringify(r)) }
  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  if (!/Red Snail/.test(mobs) || !/Blue Snail/.test(mobs)) throw new Error("mobs table: " + mobs);
  if (!/Horny Mushroom Cap/.test(items)) throw new Error("items table: " + items);
  if (!saved || saved.kills !== 3 || !saved.shared) throw new Error("saved session: " + JSON.stringify(saved));
  console.log("ui test passed");
})().catch(e => { console.error(process.env.STACK ? e.stack : e.message); process.exit(1) });
