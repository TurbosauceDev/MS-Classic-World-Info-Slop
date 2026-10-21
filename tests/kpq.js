// KPQ timer page (#kpqt) and the KPQ leaderboard's filters (68-trkkpq.js): stage splits by key, Bonus / skip Bonus, undo and
// throw away, the in-game clock feed (start on a new clock, time from the clock), sending a round (body the server's
// cleanKpq takes), and the board from a summary's round list: filters, stage splits, hostile names as text. Run: node tests/kpq.js
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };
const L = (g, c, extra = {}) => ({g, d: "2026-10-20", p: 4, l: 25, j: "Hunter", c, t: c + 90, k: 1, x: 9000, m: 300, s: [60, 50, 70, 40, c - 220, 90], n: [], src: "tracker", ...extra});
const SUMMARY = {updated: "2026-10-21T12:00:00Z", runs: 0, players: 0, hours: 0, rows: [], mobs: {}, times: {}, kpq: {rounds: 6, groups: 4, board: {}, list: [
  L("k0", 300, {n: ["Turbow", "Slimey"]}), L("k0", 340), L("k1", 280, {p: 3, j: "Cleric", n: ['<img src=x onerror="window.__x=1">']}),
  L("k2", 420, {p: 1, j: "Assassin", k: 0, x: 20000, n: ["Solo1"]}), L("k3", 250, {src: "site", k: 0, x: null, m: null, s: [50, 50, 50, 50, 50, null], n: ["Webby"], d: "2000-01-01"})]}};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1300, height: 900}}), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  await p.route("**/api/summary", r => r.fulfill({json: SUMMARY}));
  await p.route("**/api/kpq", r => { sent.push(JSON.parse(r.request().postData())); r.fulfill({json: {ok: true, counted: true}}) });
  await p.goto(URL);
  await p.evaluate(() => localStorage.setItem("kpqt", "{not json"));   // bad saved state must not break the page
  await p.reload();
  await p.clock.install(); await p.clock.pauseAt(Date.now() + 1000);   // the page's time only moves when the test says
  const open = id => p.evaluate(id => { const b = document.querySelector("#t-" + id); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, id);
  await open("kpqt");
  check(!(await p.isHidden("#kpqt")) && /Ready/.test(await p.textContent("#ktstate")), "KPQ timer opens, ready");

  // a full round by keys: 5 stages, Bonus, finish
  const key = async (k, sec) => { await p.keyboard.press(k); if (sec) await p.clock.fastForward(sec * 1000) };
  await key("Space", 61); await key("Space", 52); await key("Space", 70); await key("Space", 45); await key("Space", 30); await key("Space");
  check(/Bonus stage/.test(await p.textContent("#ktstate")), "after the Last stage: Bonus");
  await p.clock.fastForward(90e3); await key("Space");
  let R = await p.evaluate(() => KPQT.rounds);
  check(R.length === 1 && Math.abs(R[0].clear - 258) < 0.5 && Math.abs(R[0].st[0] - 61) < 0.5 && Math.abs(R[0].st[5] - 90) < 0.5 && !R[0].clock,
    `round saved: clear 4:18 = 1st…Last, Bonus apart (${JSON.stringify(R[0]?.st)} clear ${R[0]?.clear})`);
  check(/4:18/.test(await p.textContent("#ktstats")) && (await p.$$("#kthist tbody tr")).length === 1, "stats and history show the round");

  // skip the Bonus (Enter in the Last stage), undo a split, throw a round away and undo that
  await key("Space", 50); await key("Space", 10); await key("Backspace");
  check(await p.evaluate(() => KPQT.cur.splits.length) === 0, "Backspace undoes the last split");
  for (let i = 0; i < 4; i++) await key("Space", 50);
  await key("Space", 20); check(await p.evaluate(() => KPQT.cur.splits.length) === 5, "into the Bonus");
  await key("Backspace"); await key("Enter");
  R = await p.evaluate(() => KPQT.rounds);
  check(R.length === 2 && R[1].st[5] === null && Math.abs(R[1].clear - 280) < 0.5, `Enter in the Last stage: cleared, no Bonus (${R[1]?.clear})`);
  check((await p.$$eval("#kthist td.best", t => t.map(x => x.textContent))).includes("4:18"), "best clear marked in the history");
  await key("Space", 30); await key("Escape");
  check(!(await p.evaluate(() => KPQT.cur)) && /thrown away/.test(await p.textContent("#kttoast")), "Esc throws the round away");
  await p.click("#kttoast [data-undo]");
  check(await p.evaluate(() => !!KPQT.cur), "Undo brings it back"); await key("Escape");
  // keys typed into a box don't drive the timer
  await p.click("#ktname"); await p.keyboard.type("Turbow"); await p.keyboard.press("Space");
  check(!(await p.evaluate(() => KPQT.cur)) && await p.inputValue("#ktname") === "Turbow ", "Space in the name box types, doesn't start a round");
  await p.fill("#ktname", "");

  // the in-game clock: armed after 3 s without it, a new round starts on two agreeing reads, time follows the clock
  const t0 = await p.evaluate(() => Date.now());
  const st = await p.evaluate(t => { KPQT.sharing = true; KPQT.feed(null, t); KPQT.feed(null, t + 3500); KPQT.feed(1500, t + 4000); const a = !!KPQT.cur;
    KPQT.feed(1500, t + 4500); return {a, b: !!KPQT.cur, left0: KPQT.cur?.clk?.left0} }, t0);
  check(!st.a && st.b && st.left0 === 1500, `clock round: starts on the 2nd read (${JSON.stringify(st)})`);
  const el = await p.evaluate(t => { KPQT.feed(1400, Date.now()); return KPQT.cur.clk.left0 - KPQT.cur.clk.left }, t0);
  check(el === 100, "round time = clock at start - clock now");
  for (let i = 0; i < 5; i++){ await p.clock.fastForward(20e3); await p.evaluate(() => KPQT.next()) }
  await p.evaluate(() => { KPQT.end(); KPQT.sharing = false });
  R = await p.evaluate(() => KPQT.rounds);
  check(R.at(-1).clock === true, "clock-timed round marked");

  // sending: opt-in; the body is what the server's cleanKpq takes; no name = a made-up one
  check(!sent.length, "nothing sent with sending off");
  await p.selectOption("#ktjob", "Hunter"); await p.check("#ktsend");
  await p.click('#kthist [data-send]'); await p.waitForTimeout(100);
  const s0 = sent[0] || {};
  check(sent.length === 1 && s0.src === "site" && s0.kpq === true && /^site-[0-9a-f]{24}$/.test(s0.install) && s0.stages["80000000"] > 0 && s0.stages["80000400"] > 0 && s0.clear > 60,
    `round sent with src site and stage ids (${JSON.stringify(s0).slice(0, 200)})`);
  check(/^Archer\d{4}$/.test(s0.name) && s0.job === "Hunter" && s0.party === 4, `no name: made-up first-job name (${s0.name})`);
  check(await p.$$eval("#kthist .pill.p-good", l => l.length) === 1, "row shows sent");

  // leaderboard from the round list
  await open("trkkpq"); await p.waitForTimeout(300);
  const rows = () => p.$$eval("#trkkpqdata tr.kb-row", t => t.map(r => r.cells[1].textContent.trim()));
  let r = await rows();
  check(r.length === 4 && r[0].startsWith("4:10") && r[1].startsWith("4:40") && r[2].startsWith("5:00"), `Rush board: best per group, fastest first (${r})`);
  check(await p.evaluate(() => !window.__x) && (await p.textContent("#trkkpqdata")).includes('<img src=x onerror="window.__x=1">'), "hostile name shows as text");
  await p.selectOption('[data-f="party"]', "4"); r = await rows();
  check(r.length === 2, `party 4 filter (${r})`);
  await p.selectOption('[data-f="party"]', "any"); await p.selectOption('[data-f="job"]', "Thief"); r = await rows();
  check(r.length === 1 && r[0].startsWith("7:00"), `job filter: Thief = Assassin (${r})`);
  await p.click("[data-kreset]"); await p.selectOption('[data-f="timing"]', "clock"); r = await rows();
  check(r.length === 2, `in-game clock only (${r})`);
  await p.selectOption('[data-f="timing"]', "any"); await p.selectOption('[data-f="when"]', "week"); r = await rows();
  check(!r.some(x => x.startsWith("4:10")), "Last 7 days drops the old round");
  await p.click("[data-kreset]"); await p.click('#trkkm button[data-m="Bonus"]'); r = await rows();
  check(r.length === 3 && /20,300|20300/.test(r[0]), `Bonus board: no site rounds (no EXP), most EXP + mesos first (${r})`);
  await p.click('#trkkm button[data-m="Rush"]'); await p.click("#trkkpqdata tr.kb-row");
  check(/1st[\s\S]*Last/.test(await p.textContent("#trkkpqdata .kb-split")), "clicking a line shows its stage times");
  check(/Fastest stages/.test(await p.textContent("#trkkpqdata")), "fastest stages card");
  check(await p.evaluate(() => JSON.parse(localStorage.getItem("trkkf")).mode) === "Rush", "filters saved");
  check(!errs.length, "no page errors " + errs.join(" | "));
  await b.close();
  if (fails) { console.log(fails + " failed"); process.exit(1) }
  console.log("kpq tests passed");
})();
