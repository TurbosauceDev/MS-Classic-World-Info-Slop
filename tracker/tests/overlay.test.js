// node tests/overlay.test.js — Overlay Mode (Danny, 2026-10-26: "a true overlay style mode"): the tracker window pushes a
// snapshot and the overlay page (app/overlay.html) renders it as floating widgets. Part 1 loads that page with the bridge
// stubbed: default widgets, values, the map card's spawn table and respawn countdowns, the picker, dragging, lock (Done),
// re-clamping when the monitors change, KPQ/log/loot cards and the theme following the tracker. Part 2 loads the tracker
// window like ui.test.js: the Overlay button, the View-menu actions, the state coming back, and dummy data reaching the
// push (map 42's spawn list is in the built gamedata). Needs playwright, like ui.test.js.
const path = require("path"), {chromium} = require("playwright");
const fail = (what, v) => { throw new Error(what + ": " + JSON.stringify(v)) };
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  // ---- part 1: the overlay page, bridge stubbed ----
  {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}}), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.ovhost = {
        state: async () => ({edit: true, widgets: window.ovSaved?.overlay?.widgets || null, desk: {x: 0, y: 0, width: 1400, height: 900}}),
        settings: async p => (window.ovSaved = {...(window.ovSaved || {}), ...p}, window.ovSaved),
        edit: async on => (window.ovEditCalls = (window.ovEditCalls || []).concat([on !== false]), true),
        done: async () => (window.ovEditCalls = (window.ovEditCalls || []).concat([false]), true),
        close: async () => (window.ovClosed = true, true),
        onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => window.ovScreens = cb,
      };
    });
    await page.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await page.waitForSelector("#ovw-status");   // boot: state() answered, the default cards are built
    // defaults: Status, EXP and Map & spawns on; the rest away; the edit toolbar up
    let st = await page.evaluate(() => [!!document.querySelector("#ovw-status .b"), !!document.querySelector("#ovw-exp .b"), !!document.querySelector("#ovw-map .b"),
      !document.querySelector("#ovw-kills"), !document.querySelector("#ovw-mesos"), !document.querySelector("#ovw-log"), !document.querySelector("#ovbar").classList.contains("hidden"),
      document.body.classList.contains("edit"), Object.keys(document.querySelectorAll("#ovbar input[data-w]")).length]);
    if (!st[0] || !st[1] || !st[2] || !st[3] || !st[4] || !st[5] || !st[6] || !st[7] || st[8] !== 9) fail("overlay defaults", st);
    // a push fills the cards; the map card shows the spawn table and the respawn countdowns
    const t = Date.now();
    const payload = {t, on: true, paused: false, dummy: false, runT0: t - 7530e3, state: "Tracking · 12 min farmed",
      st: {activeMin: 12.5, exp: 148000, expHr: 42500, expHr5: 51200, toLevelHrs: 2.4, kills: 1200, killsHr: 5760, mesos: 48000, mesosHr: 230000,
        lootHr: 88000, deaths: 1, level: 34, pct: 42.31, firstBar: {level: 33, pct: 12.4}, party: 3},
      map: {id: "10000013", name: "Henesys Hunting Ground I", spawns: [{name: "Green Mushroom", lv: 20, exp: 42, n: 25}, {name: "Orange Mushroom", lv: 22, exp: 50, n: 15}, {name: "Slime", lv: 15, exp: 24, n: 10}],
        respawns: [{name: "Mano", boss: true, sec: 3600, killed: t - 37 * 60e3}, {name: "Stumpy", boss: true, sec: 1800, killed: t - 5 * 60e3}, {name: "King Slime", boss: true, sec: 900, killed: null}]},
      kpq: null, party: {expHr: 90000, members: [{you: true, level: 34, expHr: 42500}, {nick: "Bo", level: 36, expHr: 47500}]},
      feed: [{t: t - 4000, kind: "exp", text: "You gained 20 EXP"}, {t: t - 2000, kind: "loot", text: "You looted 1 Red Potion"}, {t: t - 1000, kind: "level", text: "Level 34!"}],
      th: null};
    await page.evaluate(d => window.ovData(d), structuredClone(payload));
    st = await page.evaluate(() => [document.querySelector("#ovw-exp .b").textContent, document.querySelector("#ovw-status .b").textContent,
      document.querySelector("#ovw-map .b").textContent]);
    if (!st[0].includes("42,500") || !st[0].includes("+148,000") || !st[0].includes("2.4 h") || !st[0].includes("+129.91%") || !st[0].includes("Lv 33") || !st[0].includes("Lv 34"))
      fail("exp card", st[0]);
    if (!st[1].includes("Tracking") || !st[1].includes("2:05:30") || !st[1].includes("13 min")) fail("status card", st[1]);
    if (!st[2].includes("Henesys Hunting Ground I") || !st[2].includes("50 spawns") || !st[2].includes("Green Mushroom") || !st[2].includes("×25") || !st[2].includes("42 EXP"))
      fail("map card spawns", st[2]);
    if (!/Mano \(boss\).*back in ~23 min/.test(st[2]) || !/Stumpy \(boss\).*back in ~25 min/.test(st[2]) || !/King Slime \(boss\).*every 15 min/.test(st[2]))
      fail("map card respawns", st[2]);
    // the theme tokens follow the tracker's push
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), th: {c: {bg: "#101010", accent: "#ff8800", panel: "#202020", ink: "#ffffff"}, mode: "dark"}});
    if (!await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#ff8800")) fail("theme tokens", 0);
    await page.evaluate(d => window.ovData(d), structuredClone(payload));   // back to the plain payload
    // pick and choose: the toolbar toggles Party, Kills, Loot, KPQ and the run log on; each saves
    for (const w of ["party", "kills", "loot", "kpq", "log"]) await page.check(`#ovbar input[data-w="${w}"]`);
    await page.waitForTimeout(350);
    st = await page.evaluate(() => [!!document.querySelector("#ovw-party"), !!document.querySelector("#ovw-kills"), !!document.querySelector("#ovw-loot"), !!document.querySelector("#ovw-kpq"), !!document.querySelector("#ovw-log"),
      Object.keys(window.ovSaved?.overlay?.widgets || {}).length,
      document.querySelector("#ovw-party .b").textContent, document.querySelector("#ovw-kpq .b").textContent,
      document.querySelector("#ovw-loot .b").textContent, document.querySelector("#ovw-log .b").textContent]);
    if (st.slice(0, 5).some(x => !x) || st[5] < 5) fail("picker toggles", st.slice(0, 6));
    if (!st[6].includes("Party of 3") || !st[6].includes("you") || !st[6].includes("Bo") || !st[6].includes("90,000")) fail("party card", st[6]);
    if (!st[7].includes("Not in KPQ")) fail("kpq card empty", st[7]);
    if (!st[8].includes("Red Potion")) fail("loot card", st[8]);
    if (!st[9].includes("Level 34!") || !st[9].includes("gained 20 EXP")) fail("log card", st[9]);
    // the KPQ card with a round going: round, stage, and the clock (the game clock read 90 s left 1 s ago)
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), kpq: {rounds: 2, stage: "3rd", stageT0: t - 45e3, round: {t0: t - 320e3}, clock: {left: 90, leftT: t - 1000}, hold: false}});
    const kq = await page.evaluate(() => document.querySelector("#ovw-kpq .b").textContent);
    if (!/Round 2/.test(kq) || !/3rd stage\s*0:45/.test(kq) || !/this round\s*5:20/.test(kq) || !/KPQ clock\s*1:29/.test(kq)) fail("kpq card", kq);
    // a drag moves the card and saves the new spot (desk origin is 0,0, so desktop x/y = left/top)
    const box = await page.locator("#ovw-exp header .t").boundingBox();
    const before = await page.evaluate(() => [document.querySelector("#ovw-exp").offsetLeft, document.querySelector("#ovw-exp").offsetTop]);
    await page.mouse.move(box.x + 6, box.y + 6); await page.mouse.down();
    await page.mouse.move(box.x + 156, box.y + 66, {steps: 6}); await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft, el.offsetTop, window.ovSaved?.overlay?.widgets?.exp] });
    if (st[0] === before[0] || st[1] === before[1] || st[2]?.x !== st[0] || st[2]?.y !== st[1]) fail("drag", {before, after: st});
    // Done locks: the page says so and the toolbar goes; the ack comes back from main (ovMode) and the cards lose their titles
    await page.click("#ovDone");
    if (!await page.evaluate(() => window.ovEditCalls.at(-1) === false)) fail("Done asks main to lock", window.ovEditCalls);
    await page.evaluate(() => window.ovMode(false));
    st = await page.evaluate(() => [document.body.classList.contains("locked"), !document.body.classList.contains("edit"), document.querySelector("#ovbar").classList.contains("hidden"),
      getComputedStyle(document.querySelector("#ovw-exp header")).display]);
    if (!st[0] || !st[1] || !st[2] || st[3] !== "none") fail("locked", st);
    // editing again (Ctrl+Shift+E's ack): drag works again, the ✕ on a card hides it and saves
    await page.evaluate(() => window.ovMode(true));
    const kbox = await page.locator("#ovw-kills header .t").boundingBox();
    await page.mouse.move(kbox.x + 6, kbox.y + 6); await page.mouse.down();
    await page.mouse.move(kbox.x - 40, kbox.y - 30, {steps: 4}); await page.mouse.up();
    await page.waitForTimeout(350);
    if (!await page.evaluate(() => window.ovSaved.overlay.widgets.kills.x >= 0 && window.ovSaved.overlay.widgets.kills.y >= 0)) fail("drag clamped to the desk", window.ovSaved.overlay.widgets.kills);
    await page.click("#ovw-log header .x");
    await page.waitForTimeout(350);
    st = await page.evaluate(() => [!document.querySelector("#ovw-log"), window.ovSaved.overlay.widgets.log.on]);
    if (!st[0] || st[1]) fail("card ✕ hides it", st);
    // the monitors change: everything re-clamps inside the new desk, and a saved spot survives on the cards that fit
    await page.evaluate(() => window.ovScreens({x: 0, y: 0, width: 800, height: 500}));
    st = await page.evaluate(() => [...document.querySelectorAll(".ovw")].map(el => [el.id, el.offsetLeft, el.offsetTop, el.offsetLeft + el.offsetWidth <= 800, el.offsetTop + el.offsetHeight <= 500]));
    if (st.some(([,, , wf, hf]) => !wf || !hf)) fail("re-clamp on screens changed", st);
    // Close asks main to shut the window
    await page.click("#ovClose");
    if (!await page.evaluate(() => window.ovClosed)) fail("close", 0);
    if (errors.length) throw new Error("overlay page errors: " + errors.join(" | "));
    await page.close();
  }
  // ---- part 2: the tracker window (ui-host stubbed): the button, the menu actions, the push ----
  {
    const page = await browser.newPage({viewport: {width: 1100, height: 900}}), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(require("./ui-host"));
    await page.goto("file://" + path.join(__dirname, "../app/index.html"));
    await page.click("#guideShare");
    // the button asks main to open it; the View-menu action goes through the same click (no ack yet, so still "open")
    await page.click("#overlayBtn");
    await page.evaluate(() => window.menu("overlay"));
    let st = await page.evaluate(() => [window.ovCalls, document.querySelector("#overlayBtn").getAttribute("aria-pressed")]);
    if (st[0]?.join() !== "true,true" || st[1] !== "false") fail("overlay button + menu", st);
    // main's ack flips the button; the next toggle asks to close
    await page.evaluate(() => window.ovState({open: true, edit: true}));
    st = await page.evaluate(() => [document.querySelector("#overlayBtn").getAttribute("aria-pressed")]);
    if (st[0] !== "true") fail("overlay ack", st);
    await page.evaluate(() => window.menu("overlay"));
    if (!await page.evaluate(() => window.ovCalls.join() === "true,true,false")) fail("overlay ack then close", window.ovCalls);
    // the edit-layout menu action asks main (the key action goes the same road)
    await page.evaluate(() => window.menu("overlayEdit"));
    if (!await page.evaluate(() => (window.ovEditCalls || []).length === 1)) fail("overlayEdit menu", window.ovEditCalls);
    // dummy data flows to the push: real game data for the spawn list, the theme, the feed, the made-up run
    await page.evaluate(() => { window.ovState({open: true, edit: true}); window.menu("dummy") });
    await page.waitForTimeout(250);
    st = await page.evaluate(() => { const d = (window.ovPushed || []).at(-1);
      return [window.ovPushed.length, !!d, d?.state, d?.dummy, d?.st?.exp > 0, d?.map?.spawns?.length >= 1, d?.map?.name,
        !!d?.th?.c?.accent, d?.feed?.length >= 1, d?.on, d?.kpq] });
    if (st[0] < 2 || !st[1] || !/Dummy/.test(st[2]) || !st[3] || !st[4] || !st[5] || !st[6] || !st[7] || !st[8] || st[9] !== false || st[10] !== null)
      fail("dummy data push", st);
    if (errors.length) throw new Error("tracker page errors: " + errors.join(" | "));
    await page.close();
  }
  await browser.close();
  console.log("overlay.test: ok");
})().catch(e => { console.error(e); process.exit(1) });
