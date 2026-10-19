// node tests/layout.test.js — box layout fitting and window resizing (Danny, 2026-10-19: "introduce some options to auto
// size the modules to properly fit ... properly resizing when the window is moved and resized ... smooth and flawless").
// Each check is a jank found by dragging the window edge over Dummy data in his docked layout. Needs playwright, like ui.test.js.
const path = require("path"), {chromium} = require("playwright");
const fail = (what, v) => { throw new Error(what + ": " + JSON.stringify(v)) };
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 900, height: 820}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  // the window resized, then one frame: the resize event runs in the frame's own update, before it paints
  const vp = async (width, height) => { await page.setViewportSize({width, height}); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))) };
  await page.emulateMedia({reducedMotion: "reduce"});   // boxes jump straight to where they land (the glide is checked once below)
  await page.addInitScript(require("./ui-host"));
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  await page.click("#guideShare");
  await page.evaluate(() => { window.menu("dummy");
    // Danny's docked layout (his 10-18 screenshot): main card; Session numbers beside run log over Monsters; three Loot boxes in a row
    layoutLoad({order: {dock: ["main", {row: ["stats", ["log", "mobs"]], w: [1, 1]}, {row: ["items", "mesos", "used"], w: [1, 1, 1]}]}, folded: [], h: {}});
    document.querySelectorAll(".box.folded .fold").forEach(b => b.click()) });
  await page.waitForTimeout(200);
  // everything that went wrong while the edge moved, measured in one go
  const probe = () => page.evaluate(() => { const vis = [...document.querySelectorAll(".boxrow .box")].filter(b => b.offsetParent && !b.classList.contains("folded"));
    const f = $("#feed"), ctl = b => b.querySelector(".boxctl").getBoundingClientRect(), h3 = b => b.querySelector(":scope > h3");
    return {
      cut: vis.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.dataset.box),   // content wider than its box (was scrolled or cut)
      thin: vis.filter(b => b.getBoundingClientRect().width < 180).map(b => b.dataset.box),   // one word a line
      over: [...document.querySelectorAll(".boxrow")].filter(r => r.offsetParent && !r.classList.contains("wrapped") && [...r.children].reduce((a, x) => a + x.offsetWidth, 0) > r.clientWidth + 1).length,
      hscroll: document.documentElement.scrollWidth > innerWidth,
      feed: Math.round(f.scrollHeight - f.scrollTop - f.clientHeight),   // the run log's newest line in view
      title: vis.filter(b => { const t = h3(b); if (!t) return false; const r = document.createRange(); r.selectNodeContents(t);   // the title's text runs under ⠿ –
        return [...r.getClientRects()].some(x => x.right > ctl(b).left + 1 && x.top < ctl(b).bottom && x.bottom > ctl(b).top) }).map(b => b.dataset.box),
      wrapped: [...document.querySelectorAll(".boxrow")].map(r => r.classList.contains("wrapped") ? "W" : "-").join("") } });
  // the window edge dragged in from 900 to 340 px and back, a step at a time
  const widths = []; for (let w = 900; w >= 340; w -= 20) widths.push(w); for (let w = 360; w <= 900; w += 40) widths.push(w);
  const seen = {};
  for (const w of widths){ await vp(w, 820); const p = await probe(); seen[w] = p.wrapped;
    if (p.cut.length || p.thin.length || p.over || p.hscroll || p.feed > 2 || p.title.length) fail("at " + w + " px", p) }
  // wide: side by side; 700: the three Loot boxes go two and one; narrow: each on its own line; back wide: side by side again
  if (seen[900] !== "--" || seen[340] !== "WW") fail("rows wrapped", seen);
  await vp(700, 820);
  const line = await page.evaluate(() => ["items", "mesos", "used"].map(id => Math.round(document.querySelector(`[data-box=${id}]`).getBoundingClientRect().top)));
  if (!(line[0] === line[1] && line[2] > line[0])) fail("700 px: two boxes then one", line);
  // the wrapped box grows to fill its line, no gap at the right
  const fill = await page.evaluate(() => { const r = document.querySelector("[data-box=used]").getBoundingClientRect(), row = document.querySelector("[data-box=used]").parentElement.getBoundingClientRect(); return [r.left - row.left, row.right - r.right] });
  if (fill.some(x => Math.abs(x) > 1)) fail("wrapped box fills its line", fill);
  // the window resize is handled before the frame paints: no frame shows a row overflowing (checked right after one resize)
  const sync = await page.evaluate(() => { const r = document.querySelectorAll(".boxrow")[1]; document.body.style.width = "520px"; dispatchEvent(new Event("resize"));
    const o = !r.classList.contains("wrapped") || r.getBoundingClientRect().right > document.body.getBoundingClientRect().right; document.body.style.width = ""; dispatchEvent(new Event("resize")); return o });
  if (sync) fail("resize handled in the same frame", sync);
  // the main card at the narrowest: Start and the buttons on one line, the state under them (it was a 100 px column)
  await vp(340, 820);
  const mc = await page.evaluate(() => [$("#go").getBoundingClientRect(), $("#miniBtn").getBoundingClientRect(), $("#state").getBoundingClientRect()].map(r => [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)]));
  if (Math.abs(mc[0][0] - mc[1][0]) > 12 || mc[2][0] < mc[0][1] - 2 || mc[2][2] < 200) fail("narrow main card", mc);
  await vp(900, 820);
  // scrolled up to read the run log: a resize leaves it where you are
  await page.evaluate(() => { const f = $("#feed"); f.dispatchEvent(new WheelEvent("wheel", {deltaY: -100})); f.scrollTop = 0 }); await page.waitForTimeout(50);
  await vp(600, 820); await page.waitForTimeout(50);
  if (await page.evaluate(() => $("#feed").scrollTop) !== 0) fail("run log scrolled up stays", 0);
  await page.evaluate(() => { const f = $("#feed"); f.scrollTop = f.scrollHeight }); await page.waitForTimeout(50);
  await vp(900, 820);
  // Fit off (Settings > Layout): the old way, rows never wrap
  await page.evaluate(() => window.menu("settings")); await page.click("#fitBoxes"); await page.click("#prefsClose");
  await vp(420, 820);
  const off = await page.evaluate(() => [document.body.classList.contains("fit"), document.querySelectorAll(".boxrow.wrapped").length, settings.fit]);
  if (off[0] || off[1] || off[2] !== false) fail("fit off", off);
  await page.evaluate(() => window.menu("settings")); await page.click("#fitBoxes"); await page.click("#prefsClose");
  if (!await page.evaluate(() => document.body.classList.contains("fit") && document.querySelectorAll(".boxrow.wrapped").length === 2 && settings.fit === true)) fail("fit back on", 0);
  await vp(900, 820);
  // the width bar stops where the box beside it would cut its content off
  await page.keyboard.down("Shift");
  const s = await page.locator(".boxrow >> nth=1 >> .split >> nth=0").boundingBox();
  await page.mouse.move(s.x + 4, s.y + 20); await page.mouse.down(); await page.mouse.move(s.x - 500, s.y + 20, {steps: 5}); await page.mouse.up(); await page.keyboard.up("Shift");
  const bar = await page.evaluate(() => { const b = document.querySelector("[data-box=items]"); return [b.scrollWidth - b.clientWidth, Math.round(b.getBoundingClientRect().width), document.querySelectorAll(".boxrow.wrapped").length] });
  if (bar[0] > 1 || bar[1] < 230 || bar[2]) fail("width bar stops at the content", bar);
  // resize bars follow the window: held Shift, then the window resized, the bar under the run log is still at its foot
  await page.keyboard.down("Shift"); await vp(640, 820);
  const hb = await page.evaluate(() => { const h = [...document.querySelectorAll(".hsplit")].find(x => x.rz.id === "logBox"); return [Math.round(h.getBoundingClientRect().top), Math.round($("#logBox").getBoundingClientRect().bottom - 1), Math.round(h.getBoundingClientRect().width), Math.round($("#logBox").getBoundingClientRect().width)] });
  await page.keyboard.up("Shift");
  if (Math.abs(hb[0] - hb[1]) > 1 || Math.abs(hb[2] - hb[3]) > 1) fail("resize bar follows the window", hb);
  await vp(900, 820);
  // Fit every box now (Settings and the View menu): widths and heights you set go, the arrangement stays
  await page.evaluate(() => { heightSet($("#logBox"), 300); layoutSave(); window.menu("fit") }); await page.waitForTimeout(50);
  const fa = await page.evaluate(() => [document.querySelectorAll(".sized").length, [...document.querySelectorAll(".boxrow > :not(.split)")].filter(p => p.style.flex).length, JSON.stringify(settings.layout.order.dock), JSON.stringify(settings.layout.h)]);
  if (fa[0] || fa[1] || fa[2] !== '["main",{"row":["stats",["log","mobs"]],"w":[1,1]},{"row":["items","mesos","used"],"w":[1,1,1]}]' || fa[3] !== "{}") fail("fit every box now", fa);
  // double-click a box's title: that box (and its row's widths) fit again
  await page.evaluate(() => heightSet($("#mesoBox"), 400)); await page.dblclick("#mesoBox h3");
  if (await page.evaluate(() => $("#mesoBox").classList.contains("sized"))) fail("double-click title fits the box", 0);
  // Window height follows the boxes (Settings > Layout): the window is asked for the content's height, and a fold shrinks it
  const fw = await page.evaluate(async () => { const asked = []; host.mini = async (on, h) => (asked.push(on ? h : 0), true); const w = () => new Promise(r => setTimeout(r, 80));
    $("#fitWin").click(); await w(); const a = asked.at(-1), natural = Math.ceil($(".tabs").getBoundingClientRect().bottom - document.querySelector(".tabs").getBoundingClientRect().top);
    document.querySelector("#top .fold").click(); await w(); const b = asked.at(-1);
    document.querySelector("#top .fold").click(); await w();
    $("#fitWin").click(); await w(); return [a, b, asked.at(-1), settings.fitWin, natural] });
  if (!(fw[0] > 600) || !(fw[1] < fw[0] - 100) || fw[2] !== 0 || fw[3] !== false) fail("window follows the boxes", fw);
  // a drop glides into place (unless the system asks for less motion)
  await page.emulateMedia({reducedMotion: "no-preference"});
  const gl = await page.evaluate(() => { document.querySelector("#top .fold").click();   // (everything under the main card moves up)
    return document.getAnimations().filter(a => a.effect?.target?.matches?.("[data-box]")).length });
  if (!gl) fail("boxes glide when the layout changes", gl);
  // Mini: the zoom follows the window edge in fine steps, never past the window, growing as the window grows
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.evaluate(() => { $("#miniBtn").click() }); await vp(700, 380);
  let z0 = 0; const zs = [];
  for (let h = 380; h <= 600; h += 10){ await vp(700, h);
    const [z, bottom, applied] = await page.evaluate(() => [miniZ, $("#mini").getBoundingClientRect().bottom, +$("#mini").style.zoom]); zs.push(z);
    if (Math.abs(applied - z) > 0.001) fail("mini zoom applied at " + h, {z, applied});
    if (z < z0 - 0.001 || bottom > h + 1) fail("mini zoom at " + h, {z, z0, bottom}); z0 = z }
  if (!(zs.at(-1) > zs[0]) || zs.some((z, i) => i && z - zs[i - 1] > 0.12)) fail("mini zoom steps", zs);
  // Line up every box (Danny, 2026-10-19, his screenshot): Session numbers / Event log / Run log pinned, Consumables / Mesos /
  // Items looted on the Loot tab under them, the edges between the boxes off by up to 50 px, and a box with its own height
  await page.evaluate(() => $("#miniFull").click()); await vp(900, 820);
  const edges = () => page.evaluate(() => { const R = id => document.querySelector(`[data-box=${id}]`).getBoundingClientRect();
    const a = ["stats", "events", "log"].map(R), b = ["used", "mesos", "items"].map(R), r = x => Math.round(x * 10) / 10;
    return {cols: [0, 1, 2].map(i => [r(a[i].left - b[i].left), r(a[i].right - b[i].right)]).flat(), tops: b.map(x => r(x.top - b[0].top)), bottoms: a.map(x => r(x.bottom - a[0].bottom)),
      gaps: [a[1].left - a[0].right, a[2].left - a[1].right, b[1].left - b[0].right, b[2].left - b[1].right].map(r), wrapped: document.querySelectorAll(".boxrow.wrapped").length} });
  await page.evaluate(() => { showTab("loot");
    layoutLoad({order: {dock: ["main", {row: ["stats", "events", "log"], w: [218, 205, 207]}], loot: [{row: ["used", "mesos", "items"], w: [250, 168, 200]}, "invcheck"]}, folded: [], h: {events: 260}}) });
  await page.waitForTimeout(50);
  const before = await edges();
  if (before.cols.every(x => Math.abs(x) < 1) || before.bottoms.every(x => Math.abs(x) < 1)) fail("misaligned to start with", before);
  await page.evaluate(() => window.menu("align")); await page.waitForTimeout(50);
  const al = await edges();
  if (al.wrapped || al.cols.some(x => Math.abs(x) > 1) || al.tops.some(x => Math.abs(x) > 1) || al.bottoms.some(x => Math.abs(x) > 1) || al.gaps.some(g => Math.abs(g - al.gaps[0]) > 1)) fail("line up every box", {before, al});
  const saved = await page.evaluate(() => [JSON.stringify(settings.layout.h), settings.layout.order.dock.find(x => x.row).h > 0]);
  if (saved[0] !== "{}" || !saved[1]) fail("line up saves the row height", saved);
  // the edges hold as the window narrows (while the rows still fit side by side)
  await vp(780, 820); const nar = await edges();
  if (!nar.wrapped && nar.cols.some(x => Math.abs(x) > 1)) fail("lined up at 780 px", nar);
  await vp(900, 820);
  // Keep box edges lined up (on by default): a width bar let go near another row's edge snaps onto it; far from one, it stays
  const bar2 = async dx => { await page.keyboard.down("Shift"); const s = await page.locator("section[data-tab=loot] .boxrow .split >> nth=0").boundingBox();
    await page.mouse.move(s.x + 4, s.y + 20); await page.mouse.down(); await page.mouse.move(s.x + 4 + dx, s.y + 20, {steps: 4}); await page.mouse.up(); await page.keyboard.up("Shift"); return edges() };
  const near = await bar2(14);
  if (Math.abs(near.cols[1]) > 1) fail("bar snaps to the edge above", near);
  const far = await bar2(-70);   // (Consumables stops at its content, about 30 px in)
  if (Math.abs(far.cols[1]) < 24) fail("bar far from an edge stays put", far);
  await page.evaluate(() => { window.menu("settings"); $("#snapBoxes").click(); $("#prefsClose").click() });
  const off2 = await bar2(58);
  if (Math.abs(off2.cols[1]) < 4 || await page.evaluate(() => settings.snap) !== false) fail("snap off", off2);
  await browser.close();
  if (errors.length) fail("page errors", errors);
  console.log("layout test passed");
})().catch(e => { console.error(process.env.STACK ? e.stack : e.message); process.exit(1) });
