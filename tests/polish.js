// Audit fixes 2026-10-21 (Danny picked 15 items): shared Reset + Copy link on list pages, Keep or sell fits its card,
// FM Sniper tiles on one row, Home masonry, changelog days + version times, World Map idle card, item page layout.
// Second audit (same day): drop zones, Path Planner tiles, EXP/hr form, quest stack chips, phone selects, footer.
// Run: node tests/polish.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  const open = t => p.evaluate(t => { const b = document.querySelector("#t-" + t); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, t);
  await p.goto(URL); await p.waitForTimeout(500);

  // 1. every list page: Reset filters + Copy link together at the end of its filter row
  const pages = await p.evaluate(() => Object.keys(PAGECTL));
  for (const t of pages){ await open(t); await p.waitForTimeout(80);
    const r = await p.evaluate(t => [...document.querySelectorAll(`#${t} .ctlend`)].map(e => [...e.querySelectorAll("button")].map(x => x.textContent.trim()).join("|")), t);
    check(r.length === 1 && /Reset filters/.test(r[0]) && /Copy link/.test(r[0]), `${t}: Reset filters + Copy link side by side (${r})`) }

  // 2. a Keep or sell list link brings the filters back; Reset puts the page's own defaults back
  await open("keep"); await p.fill("#ksearch", "coconut"); await p.click("#kneed"); await p.selectOption("#ksort", "name");
  const st = await p.evaluate(() => ctlState("keep"));
  check(st.ksearch === "coconut" && st.kneed === true && st.ksort === "name" && !("kdone" in st), `keep: link keeps only changed fields (${JSON.stringify(st)})`);
  const link = await p.evaluate(() => shareUrl("L", {p: "keep", v: ctlState("keep")}).replace(/^.*#/, "#"));
  await p.evaluate(() => ctlReset("keep")); await p.waitForTimeout(50);
  const back = await p.evaluate(() => [$("#ksearch").value, $("#kneed").getAttribute("aria-pressed"), $("#ksort").value, $("#kdone").getAttribute("aria-pressed")].join());
  check(back === ",false,,true", `keep: Reset filters = page defaults (${back})`);
  { const q = await ctx.newPage(); await q.goto(URL + link); await q.waitForTimeout(500);
    const r = await q.evaluate(() => [$("#keep").hidden, $("#ksearch").value, $("#kneed").getAttribute("aria-pressed"), $("#ksort").value].join());
    check(r === "false,coconut,true,name", `keep: list link opens the page with its filters (${r})`); await q.close() }
  await p.evaluate(() => ctlReset("keep"));

  // 3. Keep or sell table fits its card at 1300 px (audit #2: the last column was cut off)
  const kw = await p.evaluate(() => { const t = $("#keep .tblwrap"); return [t.scrollWidth, t.clientWidth] });
  check(kw[0] <= kw[1] + 1, `keep: table fits its card (${kw})`);

  // 4. FM Sniper: all six stat tiles share one row (one was left alone on a second row)
  await open("snipe"); await p.waitForTimeout(200);
  const tops = await p.$$eval("#snstats > .sntile", l => [...new Set(l.map(e => Math.round(e.getBoundingClientRect().top)))]);
  check(tops.length === 1, `snipe: stat tiles in one row (${tops.length} rows)`);

  // 5. Home: masonry spans (cards keep their own height), More lists Feedback + Privacy
  await p.click("header h1"); await p.waitForTimeout(300);
  const h = await p.evaluate(() => { const g = $(".homegrid"), c = [...g.children];
    return {mas: g.classList.contains("masonry") && c.every(x => /^span \d+$/.test(x.style.gridRowEnd)),
      stretch: c.filter(x => x.getBoundingClientRect().height - x.scrollHeight > 4).length,
      more: [...document.querySelectorAll('.homecat[data-sec="more"] .hlink')].map(x => x.dataset.go).join()} });
  check(h.mas && !h.stretch && h.more === "log,credits,feedback,privacy", `home: masonry, no stretched cards, More links (${JSON.stringify(h)})`);
  // stacked cards sit one gap apart at every width, incl. 1700px+ where .wrap is CSS-zoomed (10-21: zoomed heights left 55-95px holes)
  for (const [w, size] of [[1300, null], [2000, null], [2000, "5"]]){
    const q = await b.newPage({viewport: {width: w, height: 1200}}); if (size) await q.addInitScript(v => localStorage.setItem("pagesize", v), size);
    await q.goto(URL); await q.waitForTimeout(600);
    const gaps = await q.evaluate(() => { const cols = {}; for (const c of document.querySelectorAll(".homegrid > .homecat")){ const r = c.getBoundingClientRect(); (cols[Math.round(r.left)] ||= []).push(r) }
      return Object.values(cols).flatMap(l => l.sort((a, b) => a.top - b.top).slice(1).map((r, i) => Math.round(r.top - l[i].bottom))) });
    check(gaps.length && gaps.every(g => g >= 8 && g <= 30), `home: stacked cards one gap apart at ${w}px${size ? " size " + size : ""} (${gaps})`); await q.close() }

  // 6. Changelog: every version has its ship time (data-t, backfilled from git), days folded, newest day open
  await open("log"); await p.waitForTimeout(100);
  const lg = await p.evaluate(() => { const c = [...document.querySelectorAll("#log .changelog .card")], d = [...document.querySelectorAll("#log .logday")];
    return {cards: c.length, t: c.filter(x => /^\d{4}-\d\d-\d\d/.test(x.dataset.t || "")).length, times: document.querySelectorAll("#log .vtime").length,
      days: d.length, open: d.map(x => x.open ? 1 : 0).join("")} });
  const loose = await p.$$eval("#log .changelog > :not(.card):not(.logday)", l => l.length);
  check(loose === 0, `changelog: no entry outside a day card (${loose} loose)`);
  check(lg.cards > 80 && lg.t === lg.cards && lg.times >= lg.cards - 1 && lg.days > 5 && /^10+$/.test(lg.open), `changelog: times on every version, days folded (${JSON.stringify(lg)})`);

  // 7. World Map: before a click the side card lists the best spots (dots 1-3); a pick opens that spot's card
  await open("wmap"); await p.waitForTimeout(200);
  const idle = await p.$$eval("#wmcard [data-wmpick]", l => l.length);
  await p.click("#wmcard [data-wmpick] >> nth=0"); await p.waitForTimeout(150);
  check(idle >= 1 && idle <= 3 && !(await p.$("#wmcard [data-wmpick]")) && (await p.$$("#wmmap .wmdot.on")).length === 1, `world map: idle card lists ${idle} best spots, a pick opens one`);

  // 8. item page: header in a card, "Restores 100 HP" on one line, Updated column says when (no bare dates)
  await open("items"); await p.fill("#itsearch", "red potion"); await p.waitForTimeout(200); await p.click("#itrows .ibtn >> nth=0"); await p.waitForTimeout(300);
  const it = await p.evaluate(() => { const dd = [...document.querySelectorAll("#items .mhead dd")].find(e => /Restores/.test(e.textContent));
    return {card: !!document.querySelector("#items .mhead .mtop"), lines: dd ? (dd.getBoundingClientRect().height < parseFloat(getComputedStyle(dd).fontSize) * 2 ? 1 : 2) : -1,
      bare: [...document.querySelectorAll("#itprices .pxsrc td:last-child")].filter(e => /^\d{4}-\d\d-\d\d$/.test(e.textContent.trim())).length} });
  check(it.card && it.lines === 1 && !it.bare, `item page: header card, effect on one line, relative Updated (${JSON.stringify(it)})`);
  // Danny 10-21: Stats, then Where to get it and What it's for, then Prices
  const order = await p.evaluate(() => [...document.querySelectorAll("#items h3.msec")].map(h => h.textContent.trim().split(" ")[0]).filter(t => /^(Stats|Where|What|Prices)$/.test(t)).join(","));
  check(order === "Stats,Where,What,Prices", `item page section order (${order})`);

  // 9. Where to train: one summary line, the working folded under it
  await open("maps"); await p.waitForTimeout(200);
  const mn = await p.evaluate(() => ({fold: !!document.querySelector("#mapnote details.mnmore:not([open])"), dmg: /^Damage: /.test($("#mapnote").innerText)}));
  check(mn.fold && mn.dmg, `where to train: note folded under the summary (${JSON.stringify(mn)})`);

  // second audit (Danny 10-21 artifact comments)
  // #5 screenshot drop zones: no browser "Choose Files" button showing
  for (const t of ["inv", "expc", "plan"]){ await open(t); await p.waitForTimeout(80);
    const d = await p.evaluate(t => [...document.querySelectorAll(`#${t} .drop input[type=file]`)].map(i => getComputedStyle(i).opacity), t);
    check(d.length === 1 && d[0] === "0", `${t}: drop zone hides the native file button (${d})`) }
  // #10 Path Planner: headline numbers as tiles, explanations folded
  await open("path"); await p.waitForTimeout(200);
  const ps = await p.evaluate(() => ({tiles: document.querySelectorAll("#xsum .sntile").length, fold: !!document.querySelector("#xsum details.xmore:not([open])")}));
  check(ps.tiles >= 3 && ps.fold, `path planner: stat tiles + folded working (${JSON.stringify(ps)})`);
  // #11 EXP/hr calculator: Start timer beside Minutes, hint inside the form, empty state instead of an empty table
  await open("expc"); await p.waitForTimeout(100);
  const ec = await p.evaluate(() => ({row: Math.abs($("#ectimer").getBoundingClientRect().top - $("#ecmin").getBoundingClientRect().top) < 20,
    hint: !!$(".ecform #echint").textContent, empty: !$("#ecempty").hidden && $("#ectbl").hidden}));
  check(ec.row && ec.hint && ec.empty, `exp/hr calculator form (${JSON.stringify(ec)})`);
  // #12 Quests: "Stack with" is a closed chip, not an inline list
  await open("quests"); await p.waitForTimeout(200);
  check(await p.evaluate(() => document.querySelectorAll("#qrows details.qstack:not([open])").length > 0), "quests: stacks-with lists start folded");
  // #7 phones: a select too narrow for its value takes the whole row
  await p.setViewportSize({width: 390, height: 800}); await open("maps"); await p.waitForTimeout(200);
  const sel = await p.evaluate(() => { const s = $("#mapatk") || [...document.querySelectorAll("#maps .controls select")].find(x => /Area attack/.test(x.selectedOptions[0]?.textContent));
    return s ? [s.parentElement.classList.contains("wide"), Math.round(s.getBoundingClientRect().width)] : null });
  check(sel && sel[0] && sel[1] > 300, `phone: Where to train's attack select gets the full row (${sel})`);
  // #14 footer version wraps between its two halves
  check(await p.evaluate(() => document.querySelectorAll(".sitefoot .sitever:not(.pwstate)>span").length === 2), "footer: version line in two unbreakable halves");
  // Victoria Island Map Navigator card assumes no taxis (Danny 10-23) and hands that to the full navigator
  await open("world");
  const vn = await p.evaluate(() => { $("#lpnfrom").value = "10000000"; $("#lpnto").value = $("#lpnto").options[3].value; $("#lpnto").dispatchEvent(new Event("change"));
    const t = $("#lpnav").innerText; $("#lpnroute").click(); return [/no taxis/.test(t), $("#navnocab").checked] });
  check(vn[0] && vn[1], `Victoria Island Map Navigator card: no taxis (${vn})`);
  check(!errs.length, `no page errors (${errs.join(" | ")})`);
  await b.close(); console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
