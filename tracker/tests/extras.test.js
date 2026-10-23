// node tests/extras.test.js — the 0.2.60 additions in the window (stubbed host, like ui.test.js): Finalize log from Mini,
// the crash-recovery autosave and its "Unsaved run" card, History's Today card and goal ETA per map, and setup codes
// (layout + theme in one line). CI: tracker.yml job ui. The maths has its own tests in core.test.js.
const path = require("path"), {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 900, height: 900}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(require("./ui-host"));
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  await page.click("#guideNo");
  const fail = (what, v) => { throw new Error(what + ": " + JSON.stringify(v)) };

  // 1. Stop pressed in Mini (the Start/Stop shortcut): the wrap-up card is hidden there, so Mini shows one line with its own
  // Finalize log, which saves the run (bug hunt 2026-10-19 idea 1)
  await page.click("#go"); await page.waitForFunction(() => timer != null && !starting);
  const auto = await page.evaluate(() => { const t = Date.now();
    session.add({t: t - 120e3, type: "map", id: "104040000", name: "Henesys Hunting Ground I"});
    session.add({t: t - 60e3, type: "exp", gain: 20}); session.add({t: t - 30e3, type: "exp", gain: 20}); render();
    return [autoTimer != null, autosaveNow(), window.autosaved && typeof window.autosaved.autosaved, window.autosaved?.kills, window.autosaved?.name] });
  // the autosave: on a timer while tracking, the same record History keeps plus when it was written
  if (!auto[0] || !auto[1] || auto[2] !== "number" || auto[3] !== 2) fail("autosave while tracking", auto);
  await page.evaluate(() => $("#miniBtn").click());
  await page.evaluate(() => window.menu("startStop")); await page.waitForFunction(() => wrap && !stopping);
  const mw = await page.evaluate(() => [document.body.classList.contains("mini"), !$("#miniWrap").classList.contains("hidden"), $("#miniWrap").offsetParent != null,
    $("#wrap").offsetParent == null, $("#miniWrapText").textContent, $("#miniWrapEnd").textContent]);
  if (!mw[0] || !mw[1] || !mw[2] || !mw[3] || !/0 of 3 inventory tabs/.test(mw[4]) || mw[5] !== "Finalize log") fail("mini wrap-up line", mw);
  { const vp0 = page.viewportSize(); await page.setViewportSize({width: 340, height: 600}); await page.waitForTimeout(50);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); await page.setViewportSize(vp0);
    if (over) fail("mini wrap-up line runs off a 340 px window", over) }
  await page.evaluate(() => { window.saved = null; $("#miniWrapEnd").click() }); await page.waitForFunction(() => window.saved && !stopping);
  const done = await page.evaluate(() => [window.saved.kills, $("#miniWrap").classList.contains("hidden"), timer, autoTimer, document.body.classList.contains("mini"), autosaveNow()]);
  if (done[0] !== 2 || !done[1] || done[2] !== null || done[3] !== null || !done[4] || done[5] !== false) fail("mini Finalize log", done);
  await page.evaluate(() => $("#miniFull").click());
  if (!await page.isVisible("#summary")) fail("summary waits in the full view", false);
  await page.click("#sumClose");

  // 2. crash recovery: an autosave left over at launch is offered back; Save puts it in History marked recovered, Discard clears it
  const rec = {mapName: "Pig Beach", activeMin: 42, expTotal: 12345, exp: 12000, mesos: 6789, kills: 99, note: "ch 3", autosaved: Date.now() - 600e3};
  const rv = await page.evaluate(async r => { window.autoRec = r; window.saved = null; await recoverCheck();
    return [!$("#recover").classList.contains("hidden"), $("#recoverText").textContent] }, rec);
  if (!rv[0] || !/Pig Beach · 42 min farming · 12,345 EXP · 6,789 mesos/.test(rv[1]) || !/wasn't saved/.test(rv[1])) fail("recover card", rv);
  await page.click("#recoverSave"); await page.waitForFunction(() => window.saved);
  const rs = await page.evaluate(() => [window.saved.recovered, window.saved.kills, "autosaved" in window.saved, window.saved.note, $("#recover").classList.contains("hidden")]);
  if (rs[0] !== true || rs[1] !== 99 || rs[2] || !/^ch 3\nRecovered/.test(rs[3]) || !rs[4]) fail("recover save", rs);
  const rd = await page.evaluate(async () => { window.autosaved = "x"; await recoverCheck(); const shown = !$("#recover").classList.contains("hidden");
    $("#recoverDrop").click(); await new Promise(r => setTimeout(r, 50)); return [shown, window.autosaved, $("#recover").classList.contains("hidden")] });
  if (!rd[0] || rd[1] !== null || !rd[2]) fail("recover discard", rd);
  const none = await page.evaluate(async () => { window.autoRec = null; await recoverCheck(); return $("#recover").classList.contains("hidden") });
  if (!none) fail("no autosave: no card", none);

  // 3. History: Today card (runs saved today, local day) and the goal ETA per map from History's EXP/hr and the EXP table
  const hs = await page.evaluate(async () => {
    const t0 = new Date().setHours(0, 0, 0, 0), D = 864e5;
    window.histFake = [{saved: t0 + 2000, date: "today", mapName: "Snail Hunting Ground III", activeMin: 30, exp: 6000, mesos: 900, endLevel: 22, level: 22,
        snap: {startLevel: 22, startPct: 10, endLevel: 22, endPct: 50, exp: 6000, minutes: 30}},
      {saved: t0 + 1000, date: "today", mapName: "Pig Beach", activeMin: 20, exp: 2000, mesos: 300, level: 21},
      {saved: t0 - 1000, date: "yesterday", mapName: "Pig Beach", activeMin: 60, exp: 5000, mesos: 1000, level: 21}];
    host.sessions = async () => window.histFake.map(x => ({...x}));
    settings = await host.settings({goal: 25}); goalUi();
    openHist(); await loadHist(); const out =
    [$("#today").textContent, $("#eta").textContent, [...document.querySelectorAll("#eta tr td:first-child")].map(td => td.textContent),
      GAMEDATA.exp[22] * 0.5 + GAMEDATA.exp[23] + GAMEDATA.exp[24], hm((GAMEDATA.exp[22] * 0.5 + GAMEDATA.exp[23] + GAMEDATA.exp[24]) / 12000)]; modalClose($("#histPop")); return out });
  if (!/^Today: 50 min farming · 8,000 EXP · .*1,200 \(2 runs\)$/.test(hs[0].trim())) fail("today card", hs[0]);
  if (!hs[1].includes(`Goal: Lv 25 (${hs[3].toLocaleString()} EXP from Lv 22 50.0%`) || hs[2].join() !== "Snail Hunting Ground III,Pig Beach"
    || !hs[1].includes(hs[4] + " farming") || !/about (today|tomorrow|\w+day|\w{3} \d+)/.test(hs[1]) || !/a day \(your days played this week\)/.test(hs[1])) fail("goal ETA", hs);
  // the goal set to off: no ETA; a goal past the EXP table: says so instead of guessing
  const g2 = await page.evaluate(async () => { $("#goalOff").click(); await new Promise(r => setTimeout(r, 50)); const off = $("#eta").textContent;
    $("#goal").value = "150"; $("#goal").dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 50)); return [off, $("#eta").textContent] });
  if (g2[0] !== "" || !/Lv 150: past the EXP table, no estimate/.test(g2[1])) fail("goal ETA off / past the table", g2);
  { const vp0 = page.viewportSize(); await page.setViewportSize({width: 340, height: 700}); await page.waitForTimeout(50);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); await page.setViewportSize(vp0);
    if (over) fail("History runs off a 340 px window", over) }

  // 4. profile codes (0.2.60 setup codes + 0.2.61 profiles): copy, change the layout and theme, paste it back -> a preview
  // and nothing changed; Use it -> both as they were, the changed setup kept as "My old setup"; junk changes nothing
  const sc = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await themePick("p:Slime"); layoutSave(); await wait(50);
    const before = [JSON.stringify(settings.layout.order), settings.theme];
    $("#setupCopy").click(); await wait(50); const code = $("#setupCode").value;
    shelve(BOXES.find(b => b.dataset.box === "mobs")); await themePick("p:Midnight"); await wait(50);
    const changed = [JSON.stringify(settings.layout.order), settings.theme];
    $("#setupCode").value = "MSCS1.bm90IGEgY29kZSBhdCBhbGwgcmVhbGx5"; $("#setupPaste").click(); await wait(50);
    const junk = [$("#setupNote").textContent, JSON.stringify(settings.layout.order), settings.theme, $("#setupPrev").classList.contains("hidden")];
    $("#setupCode").value = "here: " + code; $("#setupPaste").click(); await wait(50);
    const prev = {shown: !$("#setupPrev").classList.contains("hidden"), boxes: $("#spMap").textContent, info: $("#spInfo").textContent,
      bg: $("#spMap").style.background, still: [JSON.stringify(settings.layout.order), settings.theme]};
    $("#spUse").click(); await wait(200);
    return {code, before, changed, junk, prev, after: [JSON.stringify(settings.layout.order), settings.theme], note: $("#setupNote").textContent,
      mobsIn: !!BOXES.find(b => b.dataset.box === "mobs").closest("#dock"), css: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      old: settings.profiles?.find(p => p.name === "My old setup"), used: settings.profile, win: window.winSized} });
  if (!/^MSCS1\./.test(sc.code) || sc.changed[0] === sc.before[0] || sc.changed[1] !== "p:Midnight") fail("setup code copy", sc);
  if (!/isn't a profile code/.test(sc.junk[0]) || sc.junk[1] !== sc.changed[0] || sc.junk[2] !== "p:Midnight" || !sc.junk[3]) fail("setup code junk", sc);
  if (!sc.prev.shown || !/Monsters|mobs/i.test(sc.prev.boxes) || !/Theme: Slime/.test(sc.prev.info) || !/Window \d+ × \d+/.test(sc.prev.info)
    || sc.prev.bg !== "rgb(17, 26, 20)" || sc.prev.still[0] !== sc.changed[0] || sc.prev.still[1] !== "p:Midnight") fail("profile code preview", sc.prev);
  if (sc.after[0] !== sc.before[0] || sc.after[1] !== "p:Slime" || !sc.mobsIn || !/Using "Friend's setup"/.test(sc.note) || sc.css !== "#111a14") fail("setup code use", sc);
  if (sc.old?.theme?.preset !== "Midnight" || sc.used !== "Friend's setup" || !Array.isArray(sc.win)) fail("old setup kept / window size", sc);

  // 5. profiles: save two, switch between them; what you change in the one in use goes into it when you switch away
  const pf = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    $("#profName").value = "Grind"; $("#profSave").click(); await wait(80);
    await themePick("p:Henesys"); $("#fitBoxes").checked = false; $("#fitBoxes").dispatchEvent(new Event("change")); await wait(50);
    $("#profName").value = "KPQ"; $("#profSave").click(); await wait(80);
    $("#profSel").value = "Grind"; $("#profUse").click(); await wait(200);
    const a = [settings.theme, settings.fit, settings.profile, $("#profSel").textContent];
    await themePick("p:Ellinia"); await wait(30);
    $("#profSel").value = "KPQ"; $("#profUse").click(); await wait(200);
    const b = [settings.theme, settings.fit, settings.profile, settings.profiles.find(p => p.name === "Grind").theme.preset];
    $("#profSel").value = "Grind"; $("#profDel").click(); await wait(50);
    const theme = TH.encode(TH.PRESETS[8]); $("#setupCode").value = theme; $("#setupPaste").click(); await wait(30);
    const tinfo = $("#spName").textContent + " / " + $("#spMap").textContent; $("#spUse").click(); await wait(100);
    return {a, b, left: settings.profiles.map(p => p.name), used: settings.profile, opts: $("#profSel").options.length, tinfo, theme2: settings.theme} });
  if (pf.a[0] !== "p:Slime" || pf.a[1] !== true || pf.a[2] !== "Grind" || !/Grind \(in use\)/.test(pf.a[3])) fail("profile switch", pf);
  if (pf.b[0] !== "p:Henesys" || pf.b[1] !== false || pf.b[2] !== "KPQ" || pf.b[3] !== "Ellinia") fail("profile keeps changes on switch", pf);
  if (pf.left.includes("Grind") || pf.used !== "KPQ") fail("profile delete", pf);
  if (!/theme only/.test(pf.tinfo) || !/Keeps your box layout/.test(pf.tinfo) || !/Kerning neon/.test(pf.theme2)) fail("theme code in the profile box", pf);
  // 6. built-in profile (Danny's Default): listed under Built in, can't be deleted, applies his layout, theme and window size,
  // and changes made while it's in use never go into it
  const bi = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    $("#profSel").value = "b:Danny's Default"; $("#profSel").dispatchEvent(new Event("change"));
    const del = $("#profDel").disabled; $("#profUse").click(); await wait(250);
    const got = {theme: settings.theme, profile: settings.profile, win: window.winSized, dock: [...$("#dock").querySelectorAll("[data-box]")].map(b => b.dataset.box).sort().join(),
      hist: !document.querySelector("#dock #hist") && !BOXES.some(b => b.dataset.box === "hist"),   // Past sessions is a pop-up since 0.2.70
      note: $("#setupNote").textContent};
    await themePick("p:Midnight"); $("#profSel").value = "KPQ"; $("#profUse").click(); await wait(250);
    const again = TH.builtins(boxIds())[0].theme.preset, kept = settings.profiles.some(p => /Danny/.test(p.name));
    return {del, got, again, kept, opt: [...$("#profSel").querySelectorAll("optgroup")].map(g => g.label).join()} });
  if (!bi.del || bi.got.theme !== "p:Default" || bi.got.profile !== "b:Danny's Default" || String(bi.got.win) !== "2560,1392" || !bi.got.hist
    || bi.got.dock !== "alerts,events,items,kpq,log,main,mesos,mobs,stats,used" || !/built in/.test(bi.got.note)) fail("built-in profile", bi);
  if (bi.again !== "Default" || bi.kept || bi.opt !== "Yours,Built in") fail("built-in profile stays as shipped", bi);

  await browser.close();
  if (errors.length) throw new Error("page errors: " + errors.join("; "));
  console.log("extras test passed");
})().catch(e => { console.error(process.env.STACK ? e.stack : e.message); process.exit(1) });
