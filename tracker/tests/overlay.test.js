// node tests/overlay.test.js — Overlay Mode (Danny, 2026-10-26: "a true overlay style mode") + edit mode v2 (Danny,
// 2026-10-28, after ElvUI's Toggle Anchors, WoW Edit Mode and WeakAuras' MoverSizer). Part 1 loads the overlay page with
// the bridge stubbed: default widgets, values, the map card's spawn table and respawn countdowns, the panel picker (rows
// with eye toggles, per-widget detail: size / opacity / x-y / reset), dragging with magnetic snapping (guides, Shift
// bypass), grid display + grid rounding, resize (corner grip, Ctrl+scroll, scale slider), arrow nudging, Esc = Done,
// clamping to the window's real viewport (not the reported desk — the dead-strip fix), the panel's own drag, reset
// layout, lock (Done) and the theme following the tracker. Part 2 loads the tracker window like ui.test.js: the Overlay
// button, the View-menu actions, the state coming back, and dummy data reaching the push. Needs playwright.
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
    // defaults: Status, EXP and Map & spawns on; the rest away; the edit panel up with one row per widget
    let st = await page.evaluate(() => [!!document.querySelector("#ovw-status .b"), !!document.querySelector("#ovw-exp .b"), !!document.querySelector("#ovw-map .b"),
      !document.querySelector("#ovw-kills"), !document.querySelector("#ovw-mesos"), !document.querySelector("#ovw-log"),
      !document.querySelector("#ovpanel").classList.contains("hidden"), document.body.classList.contains("edit"),
      document.querySelectorAll("#ovpRows .wrow").length, !!document.querySelector("#ovSnap"), !!document.querySelector("#ovGrid"), !!document.querySelector("#ovReset")]);
    if (!st[0] || !st[1] || !st[2] || !st[3] || !st[4] || !st[5] || !st[6] || !st[7] || st[8] !== 9 || !st[9] || !st[10] || !st[11]) fail("overlay defaults", st);
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
    // pick and choose: the panel's eye toggles Party, Kills, Loot, KPQ and the run log on; each saves
    for (const w of ["party", "kills", "loot", "kpq", "log"]) await page.click(`.wrow[data-w="${w}"] .eye`);
    await page.waitForTimeout(350);
    st = await page.evaluate(() => [!!document.querySelector("#ovw-party"), !!document.querySelector("#ovw-kills"), !!document.querySelector("#ovw-loot"), !!document.querySelector("#ovw-kpq"), !!document.querySelector("#ovw-log"),
      Object.keys(window.ovSaved?.overlay?.widgets || {}).length,
      document.querySelector("#ovw-party .b").textContent, document.querySelector("#ovw-kpq .b").textContent,
      document.querySelector("#ovw-loot .b").textContent, document.querySelector("#ovw-log .b").textContent]);
    if (st.slice(0, 5).some(x => !x) || st[5] < 5) fail("panel eye toggles", st.slice(0, 6));
    if (!st[6].includes("Party of 3") || !st[6].includes("you") || !st[6].includes("Bo") || !st[6].includes("90,000")) fail("party card", st[6]);
    if (!st[7].includes("Not in KPQ")) fail("kpq card empty", st[7]);
    if (!st[8].includes("Red Potion")) fail("loot card", st[8]);
    if (!st[9].includes("Level 34!") || !st[9].includes("gained 20 EXP")) fail("log card", st[9]);
    // a drag moves the card and saves the new spot (dropped far from everything, so no snapping interferes)
    const box = await page.locator("#ovw-exp header .t").boundingBox();
    const before = await page.evaluate(() => [document.querySelector("#ovw-exp").offsetLeft, document.querySelector("#ovw-exp").offsetTop]);
    await page.mouse.move(box.x + 6, box.y + 6); await page.mouse.down();
    await page.mouse.move(box.x + 306, box.y + 76, {steps: 6}); await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft, el.offsetTop, window.ovSaved?.overlay?.widgets?.exp] });
    if (st[0] === before[0] || st[1] === before[1] || st[2]?.x !== st[0] || st[2]?.y !== st[1]) fail("drag", {before, after: st});
    // magnetic snap (ElvUI's 15 px sticky): put EXP at a known spot (status moved aside so no stronger candidate wins),
    // drag it so its left edge lands within 15 px of the screen's left edge — the drop aligns to 0 and the vertical guide
    // shows while the drag is live
    await page.evaluate(() => { window.ovScreens({x: 0, y: 0, width: 1400, height: 900});
      CFG.widgets.status = {on: true, x: 800, y: 24}; CFG.widgets.exp = {on: true, x: 400, y: 600}; place();
      for (const w of ["kills", "mesos", "loot", "party", "kpq", "log"]) document.querySelector("#ovw-" + w)?.remove() });
    await page.waitForTimeout(120);
    const off = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft, el.offsetTop] });
    const ebox = await page.locator("#ovw-exp header .t").boundingBox();
    const sdx = ebox.x + 6 - off[0], sdy = ebox.y + 6 - off[1];   // pointer offset from the card's top-left while held
    await page.mouse.move(ebox.x + 6, ebox.y + 6); await page.mouse.down();
    await page.mouse.move(-8 + sdx, 700 + sdy, {steps: 5});   // card left would land 8 px off-screen: inside the 15 px snap
    st = await page.evaluate(() => { const v = parseFloat(document.querySelector("#ovgv").style.left);
      return [document.querySelector("#ovgv").classList.contains("hidden"), Number.isFinite(v) ? Math.round(v) : -1] });
    if (st[0] || st[1] !== 0) fail("snap guide while dragging", st);
    await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const e = document.querySelector("#ovw-exp");
      return [e.offsetLeft, window.ovSaved.overlay.widgets.exp.x, document.querySelector("#ovgv").classList.contains("hidden")] });
    if (st[0] !== 0 || st[1] !== 0 || !st[2]) fail("snaps to the screen edge and saves 0 as a real spot", st);
    // Shift skips snapping (ElvUI/WeakAuras): same approach, no alignment, guides stay hidden
    const off2 = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft, el.offsetTop] });
    const ebox2 = await page.locator("#ovw-exp header .t").boundingBox();
    const sdx2 = ebox2.x + 6 - off2[0], sdy2 = ebox2.y + 6 - off2[1];
    await page.keyboard.down("Shift");
    await page.mouse.move(ebox2.x + 6, ebox2.y + 6); await page.mouse.down();
    await page.mouse.move(10 + sdx2, 700 + sdy2, {steps: 4});   // inside the 15 px band: would snap without Shift
    st = await page.evaluate(() => [document.querySelector("#ovgv").classList.contains("hidden"), document.querySelector("#ovgh").classList.contains("hidden")]);
    if (!st[0] || !st[1]) fail("shift skips snap (guides hidden)", st);
    await page.mouse.up(); await page.keyboard.up("Shift");
    await page.waitForTimeout(350);
    st = await page.evaluate(() => document.querySelector("#ovw-exp").offsetLeft);
    if (st !== 10) fail("shift bypasses snapping", st);
    // the panel row's steppers resize: + on Status = 105 %, transform applied, saved; the detail strip follows
    await page.click(`.wrow[data-w="status"] .st[data-d="1"]`);
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-status");
      return [document.querySelector(`.wrow[data-w="status"] .sv`).textContent, el.style.transform,
        window.ovSaved.overlay.widgets.status.s] });
    if (st[0] !== "105%" || !/scale\(1.05\)/.test(st[1]) || st[2] !== 1.05) fail("size stepper", st);
    await page.click(`.wrow[data-w="status"] .nm`);   // pick: the row's detail strip opens on the page too
    st = await page.evaluate(() => [document.querySelector(`.wdet[data-w="status"]`).classList.contains("open"),
      document.querySelector("#ovw-status").classList.contains("sel")]);
    if (!st[0] || !st[1]) fail("pick opens detail + ring", st);
    await page.evaluate(() => { const r = document.querySelector(`.wdet[data-w="status"] input[data-k="o"]`);
      r.value = "60"; r.dispatchEvent(new Event("input", {bubbles: true})) });
    st = await page.evaluate(() => [document.querySelector("#ovw-status").style.opacity, window.ovSaved.overlay.widgets.status.o]);
    if (st[0] !== "0.6" || st[1] !== 0.6) fail("opacity slider", st);
    // the x/y inputs place the card in desktop coordinates (ElvUI's nudge HUD); parked low so the corner grip sits clear
    // of the panel (a data-filled card is wide enough for its grip to reach the panel's footprint)
    await page.evaluate(() => { const nx = document.querySelector(`.wdet[data-w="status"] input[data-k="x"]`);
      nx.value = "300"; nx.dispatchEvent(new Event("change", {bubbles: true}));
      const ny = document.querySelector(`.wdet[data-w="status"] input[data-k="y"]`);
      ny.value = "560"; ny.dispatchEvent(new Event("change", {bubbles: true})) });
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-status"); return [el.offsetLeft, el.offsetTop, window.ovSaved.overlay.widgets.status.x, window.ovSaved.overlay.widgets.status.y] });
    if (st[0] !== 300 || st[1] !== 560 || st[2] !== 300 || st[3] !== 560) fail("x/y inputs place card", st);
    // the corner grip resizes (WeakAuras' handle): dragging it in shrinks the card and saves the scale
    const s0 = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    const gbox = await page.locator("#ovw-status .rsz").boundingBox();
    await page.mouse.move(gbox.x + 7, gbox.y + 7); await page.mouse.down();
    await page.mouse.move(gbox.x - 30, gbox.y - 22, {steps: 4}); await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    if (!(st < s0)) fail("corner grip resize", {before: s0, after: st});
    // Ctrl+scroll resizes too
    const s1 = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    await page.evaluate(() => document.querySelector("#ovw-status").dispatchEvent(new WheelEvent("wheel", {ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true})));
    st = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    if (!(st > s1)) fail("ctrl+scroll resize", {before: s1, after: st});
    // arrow keys nudge the picked card by 1 px (Shift = 10), saving each step; Esc = Done
    await page.evaluate(() => document.activeElement?.blur());
    await page.click(`.wrow[data-w="exp"] .nm`);
    const n0 = await page.evaluate(() => document.querySelector("#ovw-exp").offsetLeft);
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    st = await page.evaluate(() => [document.querySelector("#ovw-exp").offsetLeft, window.ovSaved.overlay.widgets.exp.x]);
    if (st[0] !== n0 + 3 || st[1] !== n0 + 3) fail("arrow nudge", {before: n0, after: st});
    await page.keyboard.down("Shift"); await page.keyboard.press("ArrowLeft"); await page.keyboard.up("Shift");
    st = await page.evaluate(() => document.querySelector("#ovw-exp").offsetLeft);
    if (st !== n0 + 3 - 10) fail("shift-arrow nudge", st);
    await page.keyboard.press("Escape");
    if (!await page.evaluate(() => window.ovEditCalls.at(-1) === false)) fail("Esc asks main to lock", window.ovEditCalls);
    await page.evaluate(() => window.ovMode(true));   // back to editing for the grid + clamp scenes
    // the alignment grid shows and hides, and while it's on (with snap off) drops round to the grid lines (WoW Edit Mode)
    await page.check("#ovGrid");
    if (!await page.evaluate(() => !document.querySelector("#ovgrid").classList.contains("hidden"))) fail("grid shows", 0);
    await page.uncheck("#ovSnap");
    const gx = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); el.style.left = "70px"; el.style.top = "130px";
      return [el.offsetLeft, el.offsetTop] });
    const gbox2 = await page.locator("#ovw-exp header .t").boundingBox();
    await page.mouse.move(gbox2.x + 6, gbox2.y + 6); await page.mouse.down();
    await page.mouse.move(gbox2.x + 14, gbox2.y + 9, {steps: 3}); await page.mouse.up();   // a tiny move; the drop re-rounds
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft % 64, el.offsetTop % 64, window.ovSaved.overlay.widgets.exp.x] });
    if (st[0] !== 0 || st[1] !== 0 || st[2] % 64 !== 0) fail("grid rounding", st);
    await page.uncheck("#ovGrid"); await page.check("#ovSnap");
    // the clamp trusts the window's real viewport, not the reported desk: a desk bigger than the window leaves no dead
    // strip where cards vanish past the edge (the 10-28 cut-off fix)
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp");
      el.style.left = "1900px"; el.style.top = "880px"; clampCard(el);
      const r = el.getBoundingClientRect();
      return [el.offsetLeft + r.width <= innerWidth, el.offsetTop + r.height <= innerHeight] });
    if (!st[0] || !st[1]) fail("clamp to the real viewport", st);
    // the panel itself drags by its header and saves its spot
    const pbox = await page.locator("#ovpHead").boundingBox();
    await page.mouse.move(pbox.x + 40, pbox.y + 8); await page.mouse.down();
    await page.mouse.move(pbox.x - 120, pbox.y + 60, {steps: 4}); await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const p = document.querySelector("#ovpanel");
      return [p.offsetLeft < 500, window.ovSaved?.overlay?.panel?.x === p.offsetLeft] });
    if (!st[0] || !st[1]) fail("panel drag + saved spot", st);
    // the monitors change: everything re-clamps inside the new desk, and a saved spot survives on the cards that fit
    await page.evaluate(() => window.ovScreens({x: 0, y: 0, width: 800, height: 500}));
    st = await page.evaluate(() => [...document.querySelectorAll(".ovw")].map(el => { const r = el.getBoundingClientRect();
      return [el.id, r.left + r.width <= innerWidth + 1, r.top + r.height <= innerHeight + 1] }));
    if (st.some(([, wf, hf]) => !wf || !hf)) fail("re-clamp on screens changed", st);
    // Reset layout (two clicks: arm, confirm) puts every widget back to the factory layout
    await page.click("#ovReset");
    st = await page.evaluate(() => document.querySelector("#ovReset").textContent);
    if (st !== "Reset everything?") fail("reset arms", st);
    await page.click("#ovReset");
    await page.waitForTimeout(350);
    st = await page.evaluate(() => [document.querySelectorAll("#ovroot .ovw").length,
      !!document.querySelector("#ovw-party"), !!document.querySelector("#ovw-kills"),
      Object.keys(window.ovSaved.overlay.widgets).length,
      document.querySelector("#ovw-status").offsetLeft, document.querySelector("#ovw-status").offsetTop]);
    if (st[0] !== 3 || st[1] || st[2] || st[3] !== 0 || st[4] !== 24 || st[5] !== 24) fail("reset layout", st);
    // Done locks: the page says so and the panel goes; the ack comes back from main (ovMode) and the cards lose their titles
    await page.click("#ovDone");
    if (!await page.evaluate(() => window.ovEditCalls.at(-1) === false)) fail("Done asks main to lock", window.ovEditCalls);
    await page.evaluate(() => window.ovMode(false));
    st = await page.evaluate(() => [document.body.classList.contains("locked"), !document.body.classList.contains("edit"),
      document.querySelector("#ovpanel").classList.contains("hidden"),
      getComputedStyle(document.querySelector("#ovw-exp header")).display, !document.querySelector("#ovw-exp .rsz").offsetParent]);
    if (!st[0] || !st[1] || !st[2] || st[3] !== "none" || !st[4]) fail("locked", st);
    // editing again (Ctrl+Shift+E's ack): drag works again, the ✕ on a card hides it and saves
    await page.evaluate(() => window.ovMode(true));
    const kbox = await page.locator("#ovw-status header .t").boundingBox();
    await page.mouse.move(kbox.x + 6, kbox.y + 6); await page.mouse.down();
    await page.mouse.move(kbox.x - 20, kbox.y - 20, {steps: 4}); await page.mouse.up();
    await page.waitForTimeout(350);
    if (!await page.evaluate(() => window.ovSaved.overlay.widgets.status.x >= 0 && window.ovSaved.overlay.widgets.status.y >= 0)) fail("drag clamped to the desk", window.ovSaved.overlay.widgets.status);
    await page.click("#ovw-exp header .x");
    await page.waitForTimeout(350);
    st = await page.evaluate(() => [!document.querySelector("#ovw-exp"), window.ovSaved.overlay.widgets.exp.on]);
    if (!st[0] || st[1]) fail("card ✕ hides it", st);
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
