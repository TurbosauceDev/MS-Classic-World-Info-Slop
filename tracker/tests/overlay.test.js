// node tests/overlay.test.js — Overlay Mode (Danny, 2026-10-26: "a true overlay style mode") + edit mode v2 (Danny,
// 2026-10-28, after ElvUI's Toggle Anchors, WoW Edit Mode and WeakAuras' MoverSizer). Part 1 loads the overlay page with
// the bridge stubbed: default widgets, values, the map card's spawn table and respawn countdowns, the panel picker (rows
// with eye toggles, per-widget detail: size / opacity / x-y / reset), dragging with magnetic snapping (guides, Shift
// bypass), grid display + grid rounding (edit mode only — Done and a locked boot hide it, Danny 10-28), resize (corner
// grip into any box — free width/height, Danny 10-29 — Ctrl+scroll and the slider scale), arrow nudging, Esc = Done,
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
        hit: on => (window.ovHits = (window.ovHits || []).concat([!!on])), bag: t => (window.ovBags = (window.ovBags || []).concat([t])), onBorderless: cb => window.ovBd = cb, showMain: async () => (window.ovBack = true, true), onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => window.ovScreens = cb,
      };
    });
    await page.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await page.waitForSelector("#ovw-status");   // boot: state() answered, the default cards are built
    // defaults: Status, EXP and Map & spawns on; the rest away; the edit panel up with one row per widget
    let st = await page.evaluate(() => [!!document.querySelector("#ovw-status .b"), !!document.querySelector("#ovw-exp .b"), !!document.querySelector("#ovw-map .b"),
      !document.querySelector("#ovw-kills"), !document.querySelector("#ovw-mesos"), !document.querySelector("#ovw-log"),
      !document.querySelector("#ovpanel").classList.contains("hidden"), document.body.classList.contains("edit"),
      document.querySelectorAll("#ovpRows .wrow").length, !!document.querySelector("#ovSnap"), !!document.querySelector("#ovGrid"), !!document.querySelector("#ovReset")]);
    if (!st[0] || !st[1] || !st[2] || !st[3] || !st[4] || !st[5] || !st[6] || !st[7] || st[8] !== 15 || !st[9] || !st[10] || !st[11]) fail("overlay defaults", st);
    // a push fills the cards; the map card shows the spawn table and the respawn countdowns
    const t = Date.now();
    const payload = {t, on: true, paused: false, dummy: false, runT0: t - 7530e3, state: "Tracking · 12 min farmed",
      st: {activeMin: 12.5, exp: 148000, expHr: 42500, expHr5: 51200, toLevelHrs: 2.4, kills: 1200, killsHr: 5760, mesos: 48000, mesosHr: 230000,
        lootHr: 88000, deaths: 1, level: 34, pct: 42.31, firstBar: {level: 33, pct: 12.4}, party: 3},
      map: {id: "10000013", name: "Henesys Hunting Ground I", spawns: [{name: "Green Mushroom", lv: 20, exp: 42, n: 25}, {name: "Orange Mushroom", lv: 22, exp: 50, n: 15}, {name: "Slime", lv: 15, exp: 24, n: 10}],
        respawns: [{name: "Mano", boss: true, sec: 3600, killed: t - 37 * 60e3}, {name: "Stumpy", boss: true, sec: 1800, killed: t - 5 * 60e3}, {name: "King Slime", boss: true, sec: 900, killed: null}, {name: "Mushmom", boss: true, sec: 4800, killed: t - 78 * 60e3}]},
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
    // due-soon (0.2.81): a respawn back within 2 min wears the warn colour so it reads at a glance
    st = await page.evaluate(() => [...document.querySelectorAll("#ovw-map .mrow")].map(r => r.querySelector("span").className + "|" + r.textContent).find(x => x.includes("Mushmom")));
    if (!st || !st.startsWith("soon|") || !st.includes("back in ~2 min")) fail("due-soon respawn", st);
    // the theme tokens follow the tracker's push
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), th: {c: {bg: "#101010", accent: "#ff8800", panel: "#202020", ink: "#ffffff"}, mode: "dark"}});
    if (!await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#ff8800")) fail("theme tokens", 0);
    await page.evaluate(d => window.ovData(d), structuredClone(payload));   // back to the plain payload
    // the Elv skin (0.2.83) rides the push: sk:"elv" squares the cards and drops the blur (the ElvUI panel look), and a
    // push without it goes straight back to glass — the tracker's theme choice alone drives both windows
    const elvTh = {c: {bg: "#101010", panel: "#202020", ink: "#ffffff", muted: "#999999", line: "#3f3f3f", accent: "#ff8800",
      soft: "#222222", on: "#ffffff", leaf: "#55b76b", warn: "#e5821f", bad: "#e63333"}, mode: "dark", sk: "elv"};
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), th: elvTh});
    st = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector("#ovw-status"));
      return [document.body.classList.contains("skin-elv"), cs.borderRadius, cs.backdropFilter, document.body.classList.contains("edit")]; });
    if (st[0] !== true || st[1] !== "0px" || st[2] !== "none" || st[3] !== true) fail("elv skin on the overlay", st);
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), th: {c: {accent: "#ff8800"}, mode: "dark"}});
    if (await page.evaluate(() => document.body.classList.contains("skin-elv"))) fail("elv skin clears without sk", 0);
    await page.evaluate(d => window.ovData(d), structuredClone(payload));
    // alert toasts (0.2.78): the engine's toasts hide while editing, show the moment the overlay locks (the card they
    // belong to pulses, WeakAuras' region flash) and age out on a later push
    const toastAt = Date.now();
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), toasts: [{id: "x1", text: "Mushmom (boss) is back now", at: toastAt, sev: "info", w: "map"}]});
    st = await page.evaluate(() => [document.querySelector("#ovtoasts").classList.contains("hidden"), document.querySelector("#ovtoasts").children.length]);
    if (st[0] !== true || st[1] !== 1) fail("toasts staged while editing", st);
    await page.evaluate(() => window.ovMode(false));
    st = await page.evaluate(() => { const b = document.querySelector("#ovtoasts");
      return [!b.classList.contains("hidden"), b.children.length, b.children[0]?.textContent, b.children[0]?.className,
        document.querySelector("#ovw-map").classList.contains("flash")] });
    if (!st[0] || st[1] !== 1 || st[2] !== "Mushmom (boss) is back now" || !/toast info/.test(st[3]) || !st[4]) fail("toast shows when locked", st);
    await page.evaluate(() => window.ovMode(true));
    if (!await page.evaluate(() => document.querySelector("#ovtoasts").classList.contains("hidden"))) fail("toasts hide on edit", 0);
    await page.evaluate(() => window.ovMode(false));
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), toasts: [{id: "x0", text: "old", at: toastAt - 7000, sev: "info"}]});
    st = await page.evaluate(() => [document.querySelector("#ovtoasts").classList.contains("hidden"), document.querySelector("#ovtoasts").children.length]);
    if (st[0] !== true || st[1] !== 0) fail("aged toast gone", st);
    await page.evaluate(() => window.ovMode(true));
    // card sparklines (0.2.80): a payload with a spark series draws the trend under the EXP card's big number; cards that
    // are off draw nothing; a payload without the series (old shape) leaves the slot empty
    const spk = [...Array(8)].map((_, i) => ({t: toastAt - (8 - i) * 6e4, exp: 40000 + i * 900, mesos: 200000 + i * 4000, kills: 5000 + i * 90}));
    await page.evaluate(d => window.ovData(d), {...structuredClone(payload), spark: spk});
    st = await page.evaluate(sp => { const s = document.querySelector("#ovw-exp svg.spark polyline");
      return [!!s, s ? s.getAttribute("points").split(" ").length : 0, document.querySelector("#ovw-mesos") === null,
        RENDER.mesos({spark: sp}).includes("svg class=\"spark\""), RENDER.kills({spark: sp}).includes("svg class=\"spark\"")] }, spk);
    if (!st[0] || st[1] !== 8 || !st[2] || !st[3] || !st[4]) fail("card sparkline", st);
    await page.evaluate(d => window.ovData(d), structuredClone(payload));
    if (!await page.evaluate(() => document.querySelector("#ovw-exp .spk")?.children.length === 0)) fail("sparkline clears without a series", 0);
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
    st = await page.evaluate(() => { const g = document.querySelector("#ovgv"), v = parseFloat(g.style.left);
      return [g.classList.contains("hidden"), getComputedStyle(g).display === "none", Number.isFinite(v) ? Math.round(v) : -1] });
    if (st[0] || st[1] || st[2] !== 0) fail("snap guide while dragging (class + computed + at x 0)", st);
    // the live x/y chip (0.2.83, ElvUI's movers say where they are): visible mid-drag with desktop pixels, gone on release
    st = await page.evaluate(() => { const c = document.querySelector("#ovxy");
      return [!!c && !c.classList.contains("hidden"), /^\d+, \d+$/.test(c?.textContent || "")]; });
    if (!st[0] || !st[1]) fail("live x/y chip while dragging", st);
    await page.mouse.up();
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const e = document.querySelector("#ovw-exp"), g = document.querySelector("#ovgv");
      return [e.offsetLeft, window.ovSaved.overlay.widgets.exp.x, g.classList.contains("hidden"), getComputedStyle(g).display === "none"] });
    if (st[0] !== 0 || st[1] !== 0 || !st[2] || !st[3]) fail("snaps to the screen edge, saves 0, guide really hides", st);
    if (!await page.evaluate(() => document.querySelector("#ovxy").classList.contains("hidden"))) fail("x/y chip hides on release", 0);
    // Shift skips snapping (ElvUI/WeakAuras): same approach, no alignment, guides stay hidden
    const off2 = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft, el.offsetTop] });
    const ebox2 = await page.locator("#ovw-exp header .t").boundingBox();
    const sdx2 = ebox2.x + 6 - off2[0], sdy2 = ebox2.y + 6 - off2[1];
    await page.keyboard.down("Shift");
    await page.mouse.move(ebox2.x + 6, ebox2.y + 6); await page.mouse.down();
    await page.mouse.move(10 + sdx2, 700 + sdy2, {steps: 4});   // inside the 15 px band: would snap without Shift
    st = await page.evaluate(() => { const v = document.querySelector("#ovgv"), h = document.querySelector("#ovgh");
      return [v.classList.contains("hidden"), h.classList.contains("hidden"),
        getComputedStyle(v).display === "none", getComputedStyle(h).display === "none"] });
    if (!st[0] || !st[1] || !st[2] || !st[3]) fail("shift skips snap (guides hidden, class + computed)", st);
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
    st = await page.evaluate(() => [document.querySelector(`#ovinsp .wdet[data-w="status"]`).classList.contains("open"),
      document.querySelector("#ovw-status").classList.contains("sel")]);
    if (!st[0] || !st[1]) fail("pick opens detail + ring", st);
    await page.evaluate(() => { const r = document.querySelector(`#ovinsp .wdet[data-w="status"] input[data-k="o"]`);
      r.value = "60"; r.dispatchEvent(new Event("input", {bubbles: true})) });
    st = await page.evaluate(() => [document.querySelector("#ovw-status").style.opacity, window.ovSaved.overlay.widgets.status.o]);
    if (st[0] !== "0.6" || st[1] !== 0.6) fail("opacity slider", st);
    // the x/y inputs place the card in desktop coordinates (ElvUI's nudge HUD); parked low so the corner grip sits clear
    // of the panel (a data-filled card is wide enough for its grip to reach the panel's footprint)
    await page.evaluate(() => { const nx = document.querySelector(`#ovinsp .wdet[data-w="status"] input[data-k="x"]`);
      nx.value = "300"; nx.dispatchEvent(new Event("change", {bubbles: true}));
      const ny = document.querySelector(`#ovinsp .wdet[data-w="status"] input[data-k="y"]`);
      ny.value = "700"; ny.dispatchEvent(new Event("change", {bubbles: true})) });
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-status"); return [el.offsetLeft, el.offsetTop, window.ovSaved.overlay.widgets.status.x, window.ovSaved.overlay.widgets.status.y] });
    if (st[0] !== 300 || st[1] !== 700 || st[2] !== 300 || st[3] !== 700) fail("x/y inputs place card", st);
    // the corner grip resizes freely now (Danny 10-29: "strange boxes... very long or very wide, skinny or fat"):
    // dragging it in pins the card's own width and height (saved as w/h), the card really gets smaller, and the box
    // stays pinned across a later push (the content reflows inside instead of the card following the numbers)
    const g0 = await page.evaluate(() => { const el = document.querySelector("#ovw-status");
      return [el.offsetWidth, el.offsetHeight, window.ovSaved.overlay.widgets.status.w, window.ovSaved.overlay.widgets.status.h] });
    const gbox = await page.locator("#ovw-status .rsz").boundingBox();
    await page.mouse.move(gbox.x + 7, gbox.y + 7); await page.mouse.down();
    await page.mouse.move(gbox.x - 30, gbox.y - 22, {steps: 4}); await page.mouse.up();
    await page.waitForTimeout(350);
    const g1 = await page.evaluate(() => { const el = document.querySelector("#ovw-status");
      return [el.offsetWidth, el.offsetHeight, window.ovSaved.overlay.widgets.status.w, window.ovSaved.overlay.widgets.status.h,
        el.classList.contains("sizedW"), el.classList.contains("sizedH")] });
    if (!(g1[0] < g0[0] && g1[1] < g0[1]) || g1[2] !== g1[0] || g1[3] !== g1[1] || !g1[4] || !g1[5]) fail("corner grip free resize (strange boxes)", {before: g0, after: g1});
    await page.evaluate(d => window.ovData(d), structuredClone(payload));
    const g2 = await page.evaluate(() => { const el = document.querySelector("#ovw-status"); return [el.offsetWidth, el.offsetHeight] });
    if (g2[0] !== g1[0] || g2[1] !== g1[1]) fail("pinned box keeps its size across a push", {after: g1, repush: g2});
    // one axis at a time: a horizontal drag leaves the height (and the content's natural height) alone
    await page.evaluate(() => { const w = {...(window.ovSaved.overlay.widgets.status || {})}; delete w.h; window.ovSaved.overlay.widgets.status = w;
      CFG.widgets.status = {...CFG.widgets.status, h: undefined}; delete CFG.widgets.status.h; styleCard(document.querySelector("#ovw-status"), "status") });
    const g3 = await page.evaluate(() => document.querySelector("#ovw-status").offsetHeight);
    const gbox3 = await page.locator("#ovw-status .rsz").boundingBox();
    await page.mouse.move(gbox3.x + 7, gbox3.y + 7); await page.mouse.down();
    await page.mouse.move(gbox3.x + 44, gbox3.y + 7, {steps: 4}); await page.mouse.up();   // same y: a purely horizontal drag
    await page.waitForTimeout(350);
    const g4 = await page.evaluate(() => { const el = document.querySelector("#ovw-status");
      return [el.offsetWidth, el.offsetHeight, window.ovSaved.overlay.widgets.status.w, window.ovSaved.overlay.widgets.status.h] });
    if (g4[2] !== g4[0] || g4[3] != null) fail("grip width-only drag keeps the height auto", {heightBefore: g3, after: g4});
    if (await page.evaluate(() => document.querySelector("#ovw-status").classList.contains("sizedH"))) fail("width-only drag pins no height", 0);
    // Ctrl+scroll still scales
    const s1 = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    await page.evaluate(() => document.querySelector("#ovw-status").dispatchEvent(new WheelEvent("wheel", {ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true})));
    st = await page.evaluate(() => window.ovSaved.overlay.widgets.status.s);
    if (!(st > s1)) fail("ctrl+scroll resize", {before: s1, after: st});
    // the log card's inspector renders too: the Lines shown row carried no formatter, so picking a log/loot/map card
    // threw and left the inspector empty for everyone since 0.2.89 (found while shooting the strange boxes, 10-29)
    await page.click(`.wrow[data-w="log"] .nm`);
    st = await page.evaluate(() => { const i = document.querySelector("#ovinsp");
      return [!i.classList.contains("hidden"), !!i.querySelector('input[data-k="lines"]'), !!i.querySelector('input[data-k="w"]'),
        !!i.querySelector('input[data-k="x"]')] });
    if (!st[0] || !st[1] || !st[2] || !st[3]) fail("log card inspector renders (lines, width, position rows)", st);
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
    st = await page.evaluate(() => { const g = document.querySelector("#ovgrid");
      return [!g.classList.contains("hidden"), getComputedStyle(g).display !== "none"] });
    if (!st[0] || !st[1]) fail("grid shows (class + computed)", st);
    await page.uncheck("#ovSnap");
    // park it through the saved layout, not inline styles: the page's 1 s tick re-applies saved spots, and an inline style set
    // between the tick and the mouse-down made the drag miss on slow CI machines (the flaky "grid rounding: [3,60,3]")
    await page.evaluate(() => { CFG.widgets.exp = {...CFG.widgets.exp, x: 70, y: 130}; place() });
    const gbox2 = await page.locator("#ovw-exp header .t").boundingBox();
    await page.mouse.move(gbox2.x + 6, gbox2.y + 6); await page.mouse.down();
    await page.mouse.move(gbox2.x + 14, gbox2.y + 9, {steps: 3}); await page.mouse.up();   // a tiny move; the drop re-rounds
    await page.waitForTimeout(350);
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); return [el.offsetLeft % 64, el.offsetTop % 64, window.ovSaved.overlay.widgets.exp.x] });
    if (st[0] !== 0 || st[1] !== 0 || st[2] % 64 !== 0) fail("grid rounding", st);
    // the grid is an edit-mode affordance (Danny 10-28: it used to stay on after Done — and survive a restart): with the
    // preference still checked, locking hides the lines and editing brings them back
    await page.evaluate(() => window.ovMode(false));
    st = await page.evaluate(() => { const g = document.querySelector("#ovgrid");
      return [g.classList.contains("hidden"), getComputedStyle(g).display === "none"] });
    if (!st[0] || !st[1]) fail("grid hides when locked (class + computed)", st);
    await page.evaluate(() => window.ovMode(true));
    st = await page.evaluate(() => { const g = document.querySelector("#ovgrid");
      return [!g.classList.contains("hidden"), getComputedStyle(g).display !== "none"] });
    if (!st[0] || !st[1]) fail("grid returns with edit (class + computed)", st);
    await page.uncheck("#ovGrid"); await page.check("#ovSnap");
    // the clamp trusts the window's real viewport, not the reported desk: a desk bigger than the window leaves no dead
    // strip where cards vanish past the edge (the 10-28 cut-off fix)
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp");
      el.style.left = "1900px"; el.style.top = "880px"; clampCard(el);
      const r = el.getBoundingClientRect();
      return [el.offsetLeft + r.width <= innerWidth, el.offsetTop + r.height <= innerHeight] });
    if (!st[0] || !st[1]) fail("clamp to the real viewport", st);
    // fractional widths (max-content text) must not leave the card a sub-pixel past the edge (the 0.2.89 CI-only failure)
    st = await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); el.style.width = "213.4px"; el.style.left = "1900px"; clampCard(el);
      const r = el.getBoundingClientRect(), ok = el.offsetLeft + r.width <= innerWidth; el.style.width = ""; clampCard(el); return ok });
    if (!st) fail("clamp holds with a fractional width", st);
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
    // layout profiles (0.2.79, ElvUI's profiles): the live layout is the active profile — Save copies it under a new
    // name, switching swaps the cards back out of the snapshot, Share round-trips a versioned code (WeakAuras' ritual)
    st = await page.evaluate(() => [!!document.querySelector("#ovProf"), document.querySelectorAll("#ovProf option").length,
      window.ovSaved?.overlay?.profile, Object.keys(window.ovSaved?.overlay?.profiles || {}).length]);
    if (!st[0] || st[1] !== 1 || st[2] !== "Default" || st[3] !== 1) fail("profile boot", st);
    await page.fill("#ovProfName", "Bossing"); await page.click("#ovProfSave"); await page.waitForTimeout(350);
    st = await page.evaluate(() => [document.querySelectorAll("#ovProf option").length, document.querySelector("#ovProf").value,
      Object.keys(window.ovSaved.overlay.profiles).length, window.ovSaved.overlay.profile]);
    if (st[0] !== 2 || st[1] !== "Bossing" || st[2] !== 2 || st[3] !== "Bossing") fail("profile save-as", st);
    // regression (0.2.84): esc() turned ">" into &quot;, so a profile named "Tank>DPS" showed as Tank"DPS and its option value no longer matched
    st = await page.evaluate(() => esc("a>b<c&\"d"));
    if (st !== "a&gt;b&lt;c&amp;&quot;d") fail("esc escapes >", st);
    await page.fill("#ovProfName", "Tank>DPS"); await page.click("#ovProfSave"); await page.waitForTimeout(350);
    await page.selectOption("#ovProf", "Bossing"); await page.waitForTimeout(350);
    await page.selectOption("#ovProf", "Tank>DPS"); await page.waitForTimeout(350);
    st = await page.evaluate(() => window.ovSaved.overlay.profile);
    if (st !== "Tank>DPS") fail("profile with > in its name selectable", st);
    await page.selectOption("#ovProf", "Bossing"); await page.waitForTimeout(350);
    await page.evaluate(() => { CFG.profiles["Tank>DPS"] && delete CFG.profiles["Tank>DPS"]; profUi(); ovSave() }); await page.waitForTimeout(350);
    const keepW = await page.evaluate(() => JSON.stringify(CFG.widgets));
    // widget instances (0.2.87): a second EXP card, a Stat number with a chosen token, a Level bar; removal; the code carries them
    await page.evaluate(() => { apply({t: Date.now(), on: true, st: {expHr: 12345, expHr5: 999, level: 31, pct: 42.5, mesosHr: 777}}) });
    const nIn0 = await page.evaluate(() => document.querySelectorAll(".ovw").length);
    await page.selectOption("#ovAddKind", "stat"); await page.click("#ovAdd");
    await page.selectOption("#ovAddKind", "exp"); await page.click("#ovAdd");
    await page.selectOption("#ovAddKind", "bar"); await page.click("#ovAdd"); await page.waitForTimeout(300);
    st = await page.evaluate(() => [document.querySelectorAll(".ovw").length, !!$("#ovw-stat_1"), !!$("#ovw-exp_1"), $("#ovw-stat_1 .big")?.textContent, $("#ovw-bar_1 .trk i")?.style.width,
      document.querySelector('.wrow[data-w="exp_1"] .nm').textContent]);
    if (st[0] !== nIn0 + 3 || !st[1] || !st[2] || st[3] !== "12,345" || st[4] !== "42.5%" || st[5] !== "EXP 1") fail("widget instances added", [st, nIn0]);
    await page.evaluate(() => pick("stat_1")); await page.selectOption('#ovinsp .wdet[data-w="stat_1"] select[data-k="tok"]', "mesosHr"); await page.waitForTimeout(300);
    st = await page.evaluate(() => [$("#ovw-stat_1 .big").textContent, window.ovSaved.overlay.widgets.stat_1?.tok]);
    if (st[0] !== "777" || st[1] !== "mesosHr") fail("stat token picker", st);
    const code2 = await page.evaluate(() => profCode());
    await page.click('.wrow[data-w="exp_1"] .del'); await page.waitForTimeout(300);
    st = await page.evaluate(() => [!!$("#ovw-exp_1"), !!window.ovSaved.overlay.widgets.exp_1]);
    if (st[0] || st[1]) fail("instance removed", st);
    await page.evaluate(c => { $("#ovShareIn").value = c; profImport() }, code2); await page.waitForTimeout(300);
    st = await page.evaluate(() => [!!$("#ovw-exp_1"), $("#ovw-stat_1 .big").textContent, !!$("#ovw-bar_1")]);
    if (!st[0] || st[1] !== "777" || !st[2]) fail("instances survive a share code", st);
    // a hostile code can't invent kinds or more than MAX_INST instances
    st = await page.evaluate(() => { const w = {zzz_1: {x: 1, y: 1}, "exp_0": {x: 1, y: 1}, "__proto__": {x: 1}}; for (let i = 1; i <= 15; i++) w["log_" + i] = {x: i, y: i};
      $("#ovShareIn").value = "OVL1." + btoa(JSON.stringify({widgets: w})); profImport(); return Object.keys(CFG.widgets) });
    if (st.length !== 12 || st.some(k => !/^log_\d+$/.test(k))) fail("import caps instances and drops unknown ids", st);
    // cards keep apart (Danny 10-28, tests/frames-overlay/overlap-status-mesos-kills-2026-10-28.png): Status, Mesos and Kills sat side by
    // side; the numbers grew and Status ran under Mesos while Kills cut off its "loot/hr". Rebuild that spacing, feed it the wide values.
    await page.evaluate(() => { CFG.widgets = {status: {on: true, x: 100, y: 500}, mesos: {on: true, x: 330, y: 500}, kills: {on: true, x: 520, y: 500}};
      profCards(); place(); apply({t: Date.now(), on: false, dummy: false, runT0: Date.now() - 4359e3, state: "Stopped at 1:57 PM · wrapping up the run", st: {activeMin: 43, mesosHr: 15928, mesos: 11315, lootHr: 16912345, kills: 599, killsHr: 843, deaths: 0}}) });
    const gap = () => page.evaluate(() => { const rs = [...document.querySelectorAll(".ovw")].map(e => [e.dataset.w, e.getBoundingClientRect()]), bad = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++){ const a = rs[i][1], b = rs[j][1];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) bad.push(rs[i][0] + "/" + rs[j][0]) }
      return {bad, saved: ["status", "mesos", "kills"].map(k => CFG.widgets[k].x + "," + CFG.widgets[k].y).join(" "), wide: document.querySelector("#ovw-status").offsetWidth} });
    st = await gap();
    if (st.bad.length || st.saved !== "100,500 330,500 520,500") fail("cards keep apart (wide numbers)", st);
    await page.evaluate(() => { CFG.edit = false; document.body.classList.add("locked"); apply({...DATA, t: Date.now()}) });   // locked play: same
    st = await gap(); if (st.bad.length) fail("cards keep apart (locked)", st);
    await page.evaluate(() => { CFG.edit = true; document.body.classList.remove("locked"); apply({t: Date.now(), on: true, state: "Tracking", st: {mesosHr: 5, lootHr: 1, killsHr: 1}}) });   // numbers shrink: cards settle back
    st = await page.evaluate(() => ["status", "mesos", "kills"].map(k => document.querySelector("#ovw-" + k).offsetLeft + "," + document.querySelector("#ovw-" + k).offsetTop).join(" "));
    if (st !== "100,500 330,500 520,500") fail("cards settle back when the numbers shrink", st);
    await page.evaluate(k => { CFG.widgets = JSON.parse(k); profCards(); place(); syncPanel(); ovSave() }, keepW); await page.waitForTimeout(400);   // back to the layout the later scenes expect
    // the per-module inspector (Danny 10-28): picking a card opens its own pop-up (x/y filled in, not part of the main panel),
    // the glass fits the content, params change the card, "show when" hides it, bad saved/imported values fall back to defaults
    await page.evaluate(() => { CFG.widgets = {status: {on: true, x: 100, y: 560}, exp: {on: true, x: 400, y: 560}}; profCards(); place(); pick("status"); apply({t: Date.now(), on: true, state: "Tracking", runT0: Date.now() - 6e4, st: {activeMin: 1, exp: 5, expHr: 100}}) });
    st = await page.evaluate(() => { const b = document.querySelector("#ovinsp"), c = document.querySelector("#ovw-status"), pn = document.querySelector("#ovpanel");
      return {open: !b.classList.contains("hidden"), inMain: pn.contains(b), x: b.querySelector('input[data-k="x"]').value, y: b.querySelector('input[data-k="y"]').value,
        params: b.querySelectorAll("[data-k]").length, cardW: c.offsetWidth, body: c.querySelector(".b").getBoundingClientRect().width, panelScroll: pn.scrollWidth > pn.clientWidth} });
    if (!st.open || st.inMain || st.x !== "100" || st.y !== "560" || st.params < 15 || st.panelScroll || st.cardW > st.body + 40) fail("inspector opens on pick, fits content", st);
    await page.evaluate(() => { const r = document.querySelector('#ovinsp input[data-k="rad"]'); r.value = "0"; r.dispatchEvent(new Event("input", {bubbles: true}));
      const g = document.querySelector('#ovinsp input[data-k="bg"]'); g.value = "20"; g.dispatchEvent(new Event("input", {bubbles: true}));
      const f = document.querySelector('#ovinsp input[data-k="fs"]'); f.value = "150"; f.dispatchEvent(new Event("input", {bubbles: true})) });
    st = await page.evaluate(() => { const c = document.querySelector("#ovw-status"), cs = getComputedStyle(c); return [cs.borderTopLeftRadius, c.style.getPropertyValue("--glass"), c.style.getPropertyValue("--fs"), CFG.widgets.status.rad, CFG.widgets.status.bg, CFG.widgets.status.fs] });
    if (st[0] !== "0px" || st[1] !== "20%" || st[2] !== "1.5" || st[3] !== 0 || st[4] !== 20 || st[5] !== 1.5) fail("inspector params restyle the card", st);
    await page.evaluate(() => { const s = document.querySelector('#ovinsp select[data-k="show"]'); s.value = "idle"; s.dispatchEvent(new Event("change", {bubbles: true})); CFG.edit = false; document.body.classList.add("locked"); vis() });
    st = await page.evaluate(() => [document.querySelector("#ovw-status").classList.contains("ovhide"), document.querySelector("#ovw-exp").classList.contains("ovhide")]);
    if (!st[0] || st[1]) fail("show-when hides a card while tracking (locked)", st);
    await page.evaluate(() => { CFG.edit = true; document.body.classList.remove("locked"); vis() });
    st = await page.evaluate(() => document.querySelector("#ovw-status").classList.contains("ovhide"));
    if (st) fail("show-when never hides while editing", st);
    st = await page.evaluate(() => { const ok = {on: true, x: 1, y: 2, rad: 99, bg: "x", acc: "red", brd: "evil", fs: "1.2", shd: "no", lines: 5, show: "idle", tok: "nope"};
      CFG.widgets = {status: ok}; $("#ovShareIn").value = "OVL1." + btoa(JSON.stringify({widgets: {status: ok, exp: ok}})); profImport(); const w = CFG.widgets.status;
      return {w, expHasLines: "lines" in CFG.widgets.exp} });
    if (st.w.rad !== 26 || "bg" in st.w || "acc" in st.w || "brd" in st.w || st.w.fs !== 1.2 || "shd" in st.w || st.w.show !== "idle" || "tok" in st.w || st.expHasLines) fail("import cleans params", st);
    // conditions: a card watching EXP/hr recolours while it is below the line, pulses/hides on request, and reverts above it; hide never applies while editing
    await page.evaluate(() => { CFG.widgets = {exp: {on: true, x: 400, y: 560}}; profCards(); place(); pick("exp") });
    await page.evaluate(() => { const set = (k, v) => { const e = document.querySelector(`#ovinsp [data-k="${k}"]`); e.value = v; e.dispatchEvent(new Event("change", {bubbles: true})) };
      set("cv", "expHr"); set("cn", "5000"); set("cact", "color") });
    const feed = hr => page.evaluate(h => apply({t: Date.now(), on: true, state: "Tracking", runT0: Date.now() - 6e4, st: {activeMin: 1, exp: 5, expHr: h}}), hr);
    await feed(100);
    st = await page.evaluate(() => { const c = document.querySelector("#ovw-exp"); return [c.classList.contains("cmet-color"), getComputedStyle(c.querySelector(".b")).getPropertyValue("--accent").trim(), CFG.widgets.exp.cn, CFG.widgets.exp.cv] });
    if (!st[0] || st[1] !== "#ef4444" || st[2] !== 5000 || st[3] !== "expHr") fail("condition recolours below the line", st);
    await feed(9000);
    if (await page.evaluate(() => document.querySelector("#ovw-exp").classList.contains("cmet-color"))) fail("condition clears above the line", 1);
    await page.evaluate(() => { const e = document.querySelector('#ovinsp [data-k="cact"]'); e.value = "hide"; e.dispatchEvent(new Event("change", {bubbles: true})) });
    await feed(100);
    st = await page.evaluate(() => [getComputedStyle(document.querySelector("#ovw-exp")).display, (document.body.classList.toggle("edit", false), getComputedStyle(document.querySelector("#ovw-exp")).display), document.body.classList.toggle("edit", true) && 0]);
    if (st[0] === "none" || st[1] !== "none") fail("condition hides when locked, never while editing", st);
    st = await page.evaluate(() => { const ok = {on: true, x: 1, y: 2, cv: "mesos<script>", cop: "eq", cn: "abc", cact: "boom", ccol: "red"}; CFG.widgets = {exp: ok}; return [wv("exp", "cv"), wv("exp", "cop"), wv("exp", "cn"), wv("exp", "cact"), wv("exp", "ccol")] });
    if (st.join() !== "none,lt,0,color,") fail("condition params fall back to defaults when invalid", st);
    await page.evaluate(k => { CFG.widgets = JSON.parse(k); profCards(); place(); syncPanel(); ovSave() }, keepW); await page.waitForTimeout(400);
    await page.evaluate(() => pick(null));
    if (!await page.evaluate(() => document.querySelector("#ovinsp").classList.contains("hidden"))) fail("inspector closes with no pick", 1);
    await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); el.style.left = "500px"; savePos("exp") });
    await page.waitForTimeout(350);   // the save (and the profile mirror) debounce
    const movedX = await page.evaluate(() => document.querySelector("#ovw-exp").offsetLeft);
    if (movedX !== 500) fail("profile: move before switch", movedX);
    await page.selectOption("#ovProf", "Default"); await page.waitForTimeout(350);
    st = await page.evaluate(() => [document.querySelector("#ovProf").value, document.querySelector("#ovw-exp").offsetLeft,
      window.ovSaved.overlay.profile]);
    if (st[0] !== "Default" || st[1] === 500 || st[2] !== "Default") fail("profile switch restores the old spot", st);
    await page.selectOption("#ovProf", "Bossing"); await page.waitForTimeout(350);
    st = await page.evaluate(() => [document.querySelector("#ovw-exp").offsetLeft, window.ovSaved.overlay.profile]);
    if (st[0] !== 500 || st[1] !== "Bossing") fail("profile switch brings the move back", st);
    await page.click("#ovProfShare");
    const code = await page.inputValue("#ovShareIn");
    if (!code.startsWith("OVL1.")) fail("profile export code", code.slice(0, 8));
    await page.evaluate(() => { const el = document.querySelector("#ovw-exp"); el.style.left = "42px"; savePos("exp") });
    await page.waitForTimeout(350);
    await page.fill("#ovShareIn", code); await page.click("#ovShareApply"); await page.waitForTimeout(350);
    st = await page.evaluate(() => document.querySelector("#ovw-exp").offsetLeft);
    if (st !== 500) fail("profile import restores the code's layout", st);
    await page.fill("#ovShareIn", "OVL1.nonsense"); await page.click("#ovShareApply");
    if (!/didn't read/.test(await page.inputValue("#ovShareIn"))) fail("bad code rejected", await page.inputValue("#ovShareIn"));
    await page.click("#ovProfShare");   // fold the strip away again
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
    await page.evaluate(() => { $("#ovpanel").style.left = "900px" });   // the panel is taller now (Add widget row, Stat + Level bar rows) and covered the EXP card at x=500
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
  // ---- part 1b: a locked boot with the grid preference still on (Danny's 10-28 report: the grid used to survive Done
  // and even a restart) — the lines must stay hidden while locked and appear only once editing starts ----
  {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}}), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.ovhost = {
        state: async () => ({edit: false, widgets: null, snap: true, grid: true, gsize: 64, desk: {x: 0, y: 0, width: 1400, height: 900}}),
        settings: async p => (window.ovSaved = {...(window.ovSaved || {}), ...p}, window.ovSaved),
        edit: async () => true, done: async () => true, close: async () => true,
        hit: on => (window.ovHits = (window.ovHits || []).concat([!!on])), bag: t => (window.ovBags = (window.ovBags || []).concat([t])), onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => window.ovScreens = cb,
      };
    });
    await page.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await page.waitForSelector("#ovw-status");
    let st = await page.evaluate(() => { const g = document.querySelector("#ovgrid"), p = document.querySelector("#ovpanel");
      return [document.body.classList.contains("locked"), p.classList.contains("hidden"), g.classList.contains("hidden"),
        getComputedStyle(g).display === "none", getComputedStyle(p).display === "none"] });
    if (!st[0] || !st[1] || !st[2] || !st[3] || !st[4]) fail("locked boot keeps grid + panel hidden (class + computed)", st);
    await page.evaluate(() => window.ovMode(true));   // Ctrl+Shift+E's ack: editing starts, the saved preference shows the grid
    st = await page.evaluate(() => { const g = document.querySelector("#ovgrid");
      return [!g.classList.contains("hidden"), getComputedStyle(g).display !== "none"] });
    if (!st[0] || !st[1]) fail("grid returns on edit after locked boot (computed)", st);
    await page.evaluate(() => window.ovMode(false));
    st = await page.evaluate(() => { const g = document.querySelector("#ovgrid");
      return [g.classList.contains("hidden"), getComputedStyle(g).display === "none"] });
    if (!st[0] || !st[1]) fail("grid hides again on lock (computed)", st);
    if (errors.length) throw new Error("overlay locked-boot errors: " + errors.join(" | "));
    await page.close();
  }
  // ---- part 1c: Bag check widget (core/bagstale.js): icons coloured by staleness, click = scan request, click-through
  // only gives way while the mouse is over an icon ----
  {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}}), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.ovhost = {
        state: async () => ({edit: false, widgets: {bag: {on: true, x: 100, y: 100}}, desk: {x: 0, y: 0, width: 1400, height: 900}}),
        settings: async p => p, edit: async () => true, done: async () => true, close: async () => true,
        hit: on => (window.ovHits = (window.ovHits || []).concat([!!on])), bag: t => (window.ovBags = (window.ovBags || []).concat([t])),
        onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => window.ovScreens = cb,
      };
    });
    await page.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await page.waitForSelector("#ovw-bag");
    const t = Date.now(), m = 60e3;
    await page.evaluate(([t, m]) => window.ovData({t, on: true, runT0: t - 20 * m, bagEvery: 5, inv: {equip: t - 2 * m, use: t - (5 * m + 10e3), etc: t - 8 * m}, st: {}, map: {}, feed: [], th: null}), [t, m]);
    let st = await page.evaluate(() => [...document.querySelectorAll("#ovw-bag [data-bag]")].map(e => [e.dataset.bag, e.className.replace("bagI ", ""), e.querySelector("svg") ? 1 : 0]));
    if (JSON.stringify(st) !== JSON.stringify([["equip", "ok", 1], ["use", "soon", 1], ["etc", "now pulse", 1]])) fail("bag icon stages", st);
    const box = await page.locator("#ovw-bag [data-bag=use]").boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down(); await page.mouse.up();
    await page.mouse.move(5, 5);
    st = await page.evaluate(() => [window.ovBags, window.ovHits]);
    if (JSON.stringify(st) !== JSON.stringify([["use"], [true, false]])) fail("bag click + click-through hand-off", st);
    // the whole card takes the mouse (Danny 10-29): its padding counts, not only the icons; the Background toggle drops the glass
    await page.mouse.move(5, 5); await page.evaluate(() => { window.ovHits = [] });
    const cb = await page.locator("#ovw-bag").boundingBox();
    await page.mouse.move(cb.x + 2, cb.y + 2); await page.mouse.move(cb.x + 3, cb.y + 3);
    st = await page.evaluate(() => window.ovHits);
    if (JSON.stringify(st) !== JSON.stringify([true])) fail("bag card padding takes the mouse", st);
    await page.evaluate(() => { CFG.widgets.bag = {...CFG.widgets.bag, bgon: false}; styleCard(document.querySelector("#ovw-bag"), "bag") });
    st = await page.evaluate(() => [document.querySelector("#ovw-bag").classList.contains("nobg"), getComputedStyle(document.querySelector("#ovw-bag")).backgroundColor]);
    if (!st[0] || st[1] !== "rgba(0, 0, 0, 0)") fail("bag card background off", st);
    // EXP card with its Bag check icons switch on: icons inside, and the card takes the mouse
    await page.evaluate(([t]) => { CFG.widgets.exp = {...CFG.widgets.exp, on: true, bagi: true}; document.querySelector("#ovw-exp") || document.querySelector("#ovroot").appendChild(mkCard("exp")); place(); apply({...DATA, t}) }, [t]);
    st = await page.evaluate(() => [document.querySelectorAll("#ovw-exp [data-bag]").length, PMAP.bagi?.kinds]);
    if (st[0] !== 3 || String(st[1]) !== "exp") fail("EXP card bag icons switch", st);
    await page.evaluate(([t, m]) => window.ovData({t, on: false, runT0: null, inv: {}, st: {}, map: {}, feed: [], th: null}), [t, m]);
    st = await page.evaluate(() => [...document.querySelectorAll("#ovw-bag [data-bag]")].map(e => e.classList.contains("idle")));
    if (st.some(x => !x)) fail("bag icons grey when not tracking", st);
    if (errors.length) throw new Error("bag page errors: " + errors.join(" | "));
    await page.close();
  }
  // ---- part 1d: Chat blocker (0.2.108): opaque resizable panel, tracker-drawn HP / MP / EXP bars, window left out of capture ----
  {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}}), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.ovhost = {
        state: async () => ({edit: false, widgets: {blocker: {on: true, x: 100, y: 600}, bag: {on: true, x: 110, y: 610}}, desk: {x: 0, y: 0, width: 1400, height: 900}}),
        settings: async p => (window.ovSaved = {...(window.ovSaved || {}), ...p}, window.ovSaved),
        edit: async () => true, done: async () => true, close: async () => true,
        hit: () => {}, bag: () => {},
        onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => window.ovScreens = cb,
      };
    });
    await page.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await page.waitForSelector("#ovw-blocker");
    const t = Date.now();
    await page.evaluate(t => window.ovData({t, on: true, st: {level: 40, pct: 12.5}, vit: {hp: [450, 900], mp: [100, 400], t}, map: {}, feed: [], th: null}), t);
    let st = await page.evaluate(() => { const b = document.querySelector("#ovw-blocker"), cs = getComputedStyle(b), w = [...b.querySelectorAll(".vb")].map(e => [e.className, e.querySelector("i").style.width, e.querySelector(".vn").textContent]);
      return [cs.backgroundColor.endsWith(", 1)") || !cs.backgroundColor.startsWith("rgba"), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height), w] });
    if (!st[0]) fail("blocker is opaque", st);
    if (st[1] !== 560 || st[2] !== 150) fail("blocker default size", st);
    if (JSON.stringify(st[3]) !== JSON.stringify([["vb hp", "50%", "450 / 900"], ["vb mp", "25%", "100 / 400"], ["vb xp", "12.5%", "12.50%"]])) fail("blocker bars", st[3]);
    // other cards may sit on top of it: the blocker neither moves them nor is moved by them
    const pos = await page.evaluate(() => { const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)] }; return [r("#ovw-bag"), r("#ovw-blocker")] });
    if (JSON.stringify(pos) !== JSON.stringify([[110, 610], [100, 600]])) fail("blocker does not repel cards", pos);
    // resize like any card, no vitals yet = empty bars (dimmed), removing the blocker lifts the capture exclusion
    await page.evaluate(() => setP("blocker", "w", 800));
    const w = await page.evaluate(() => Math.round(document.querySelector("#ovw-blocker").getBoundingClientRect().width));
    if (w !== 800) fail("blocker resizes", w);
    await page.evaluate(t => window.ovData({t, on: false, st: {}, vit: null, map: {}, feed: [], th: null}), t);
    st = await page.evaluate(() => [...document.querySelectorAll("#ovw-blocker .vb")].map(e => e.classList.contains("stale") + ":" + e.querySelector(".vn").textContent));
    if (JSON.stringify(st) !== JSON.stringify(["true:—", "true:—", "false:—"])) fail("blocker with no read", st);
    await page.evaluate(() => setOn("blocker", false));
    if (errors.length) throw new Error("blocker page errors: " + errors.join(" | "));
    await page.close();
  }
  // ---- Borderless cards (0.2.94): main asks for a view; it lands as a card at the window's old spot, with the same numbers ----
  {
    const pg = await browser.newPage({viewport: {width: 1400, height: 900}});
    await pg.addInitScript(() => { window.ovhost = {state: async () => ({edit: true, widgets: null, desk: {x: 0, y: 0, width: 1400, height: 900}}), settings: async () => ({}),
      edit: async () => true, done: async () => true, close: async () => true, onData: cb => window.ovData = cb, onMode: () => {}, onScreens: () => {},
      onBorderless: cb => window.ovBd = cb, showMain: async () => (window.ovBack = true, true)} });
    await pg.goto("file://" + path.join(__dirname, "../app/overlay.html"));
    await pg.waitForSelector("#ovw-status");
    const t = Date.now(), sm = {map: "Subway Depot", spawns: 40, level: 34, job: "Magician", min: 12, exp: 148000, best: 21000, a: {level: 33, pct: 12.4}, b: {level: 34, pct: 42.3},
      perMin: [[t - 120000, 9000], [t - 60000, 14000], [t, 21000]], pots: [{n: -30, name: "Red Potion", ic: ""}], spent: 1500, mesos: 48000, loot: 9000,
      items: [{name: "Snail Shell", n: 12, ic: ""}], itemsMore: 2, mobs: [{name: "Slime", n: 40}], mobsMore: 0};
    await pg.evaluate(() => window.ovBd({kind: "simple", x: 100, y: 80, mw: 420}));
    await pg.evaluate(s => window.ovData({t: s.t, on: true, state: "Tracking", st: {activeMin: 12}, sm: s.sm}), {t, sm});
    let r = await pg.evaluate(() => { const c = document.querySelector("#ovw-simple"), b = c?.getBoundingClientRect();
      return [!!c, c?.style.left, c?.style.top, Math.round(b?.width), c?.textContent, !document.querySelector("#ovBd").hidden, !!c?.querySelector(".svChart polyline")] });
    if (!r[0] || r[1] !== "100px" || r[3] !== 420 || !r[4].includes("Subway Depot") || !r[4].includes("+148,000") || !r[4].includes("12,333") || !r[4].includes("Red Potion")) fail("borderless simple card", r);
    if (!r[5] || !r[6]) fail("borderless panel button / chart", r);
    // Focus replaces Simple (one borderless view at a time) and adds the top lists
    await pg.evaluate(() => window.ovBd({kind: "focus", x: 100, y: 80, mw: 700}));
    r = await pg.evaluate(() => [!document.querySelector("#ovw-simple"), document.querySelector("#ovw-focus")?.textContent || ""]);
    if (!r[0] || !r[1].includes("Snail Shell") || !r[1].includes("and 2 more") || !r[1].includes("Slime")) fail("borderless focus card", r);
    await pg.click("#ovBack");
    r = await pg.evaluate(() => [window.ovBack, !document.querySelector("#ovw-focus"), document.querySelector("#ovBd").hidden]);
    if (!r[0] || !r[1] || !r[2]) fail("back to tracker window", r);
    await pg.close();
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
    // Borderless (0.2.94): the Simple / Focus buttons ask main for it, and the push carries the view's numbers
    await page.evaluate(() => { document.querySelector("#miniBd").click(); document.querySelector("#fzBd").click() });
    const bd = await page.evaluate(() => [(window.bdCalls || []).join(), window.ovPushed.at(-1).sm?.map, window.ovPushed.at(-1).sm?.perMin?.length > 0]);
    if (bd[0] !== "simple,focus" || !bd[1] || !bd[2]) fail("borderless buttons + sm payload", bd);
    if (errors.length) throw new Error("tracker page errors: " + errors.join(" | "));
    await page.close();
  }
  await browser.close();
  console.log("overlay.test: ok");
})().catch(e => { console.error(e); process.exit(1) });
