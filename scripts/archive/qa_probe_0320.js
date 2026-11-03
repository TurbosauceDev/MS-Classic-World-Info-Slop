// QA probe for Claude's 0.3.14-0.3.16 + Danny's 0.3.17-0.3.19 overlay work (2026-10-29):
// fitCard shrink/recover, per-card options pop-up rows + when-deps, number-param clearing,
// per-kind lines defaults, chat channel filters + order, bag empty state. Headless, no release.
const path = require("path"), {chromium} = require("playwright");
const fail = m => { console.error("FAIL: " + m); process.exitCode = 1 };
(async () => {
  const browser = await chromium.launch({args: ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 1400, height: 900}});
  page.on("pageerror", e => fail("pageerror: " + e.message));
  await page.addInitScript(() => {
    window.ovhost = {
      state: async () => ({edit: true, widgets: null, desk: {x: 0, y: 0, width: 1400, height: 900}}),
      settings: async () => ({}), edit: async () => {}, done: async () => {}, close: async () => {},
      hit: async () => {}, onData: cb => window.ovData = cb, onMode: cb => window.ovMode = cb, onScreens: cb => {},
    };
  });
  await page.goto("file://" + path.join(__dirname, "../tracker/app/overlay.html"));
  await page.waitForSelector("#ovw-status");
  const t = Date.now();
  const base = {t, on: true, paused: false, dummy: false, runT0: t - 5413e3, state: "Tracking",
    st: {activeMin: 41, exp: 512400, expHr: 44800, expHr5: 52300, toLevelHrs: 1.6, kills: 4180, killsHr: 6070,
      mesos: 168400, mesosHr: 245000, lootHr: 91500, deaths: 0, level: 34, pct: 42.31,
      firstBar: {level: 33, pct: 12.4}, party: 3},
    map: {id: "10000013", name: "Henesys Hunting Ground I", spawns: [{name: "Green Mushroom", lv: 20, exp: 42, n: 25}],
      respawns: [{name: "Mano", boss: true, sec: 3600, killed: t - 37 * 60e3}]},
    kpq: null, party: {expHr: 92500, members: []}};
  const longFeed = Array.from({length: 30}, (_, i) => ({t: t - i * 6e4, kind: i % 2 ? "exp" : "meso",
    text: "A very long run log line that should never fit in a small card, entry " + i + " with plenty of words"}));
  const loot = [{id: "1302000", name: "Red Whip", ic: null, n: 3, v: 125000, c: "Equip"},
    {id: "2000001", name: "Orange Potion", ic: null, n: 17, v: 510, c: "Consumable"},
    {id: "2040701", name: "Glove Attack Scroll", ic: null, n: 2, v: 45000, c: "Scroll"},
    {id: "4000001", name: "Orange Mushroom Cap", ic: null, n: 44, v: 220, c: "Etc"}];
  const chatMsgs = [
    {t: t - 40e3, cls: "all", who: "Alice", text: "all chat hello"},
    {t: t - 30e3, cls: "party", who: "Bo", text: "party plan"},
    {t: t - 20e3, cls: "error", who: "", text: "System notice line"},
    {t: t - 10e3, cls: "whisper", who: "Cy", dir: "from", text: "whisper hi"},
    {t: t - 5e3, cls: "buddy", who: "Di", text: "buddy yo"}];
  await page.evaluate(d => window.ovData(d), {...base, feed: longFeed, loot, chat: chatMsgs, chatOn: true, th: null});
  await page.waitForTimeout(120);

  // A. fitCard: a NON-flow card (exp) in a tiny pinned box shrinks; growing it restores 1 (flow cards fill by rows instead, 0.3.17 spec)
  await page.evaluate(() => { CFG.widgets.exp = {on: true, x: 24, y: 24, w: 150, h: 70}; setOn("exp", true); styleCard($("#ovw-exp"), "exp"); apply(DATA) });
  await page.waitForTimeout(80);
  const a1 = await page.evaluate(() => { const b = document.querySelector("#ovw-exp .b"); reflow(); return {af: b.style.getPropertyValue("--af"), sh: b.scrollHeight, ch: b.clientHeight} });
  if (!a1.af || parseFloat(a1.af) >= 1) fail("fitCard did not shrink a tiny pinned exp card " + JSON.stringify(a1));
  else console.log("A1 fitCard shrink ok (--af " + a1.af + ")");
  await page.evaluate(() => { CFG.widgets.exp.h = 300; styleCard($("#ovw-exp"), "exp"); apply(DATA) });
  const a2 = await page.evaluate(() => { reflow(); return document.querySelector("#ovw-exp .b").style.getPropertyValue("--af") });
  if (a2 !== "") fail("fitCard did not clear --af after growth (got '" + a2 + "')");
  else console.log("A2 fitCard recover ok");
  // zoom floor: an absurdly tiny box bottoms out at AF_MIN, never NaN or negative
  await page.evaluate(() => { CFG.widgets.exp.w = 60; CFG.widgets.exp.h = 36; styleCard($("#ovw-exp"), "exp"); apply(DATA) });
  const a3 = await page.evaluate(() => { reflow(); const v = parseFloat(document.querySelector("#ovw-exp .b").style.getPropertyValue("--af")); return v });
  if (!(a3 >= 0.5 && isFinite(a3))) fail("fitCard floor broken: " + a3);
  else console.log("A3 fitCard floor ok (--af " + a3 + ")");
  await page.evaluate(() => { delete CFG.widgets.exp.w; delete CFG.widgets.exp.h; styleCard($("#ovw-exp"), "exp"); apply(DATA) });

  // B. per-kind lines defaults (log 6, loot 5, chat 8 with nothing stored)
  const lines = await page.evaluate(() => ({log: wv("log", "lines"), loot: wv("loot", "lines"), chat: wv("chat", "lines")}));
  if (lines.log !== 6 || lines.loot !== 5 || lines.chat !== 8) fail("per-kind lines defaults: " + JSON.stringify(lines));
  else console.log("B1 per-kind lines defaults ok");

  // C. options pop-up: loot card, lmode dep rows, number clear -> default
  await page.evaluate(() => pick("loot"));
  await page.waitForSelector("#ovopt:not(.hidden)");
  const c1 = await page.evaluate(() => ({rows: [...document.querySelectorAll("#ovopt [data-k]")].map(i => i.dataset.k)}));
  for (const k of ["lmode", "ldisp", "lf_eq", "lf_use", "lf_scr", "lf_etc", "lf_set"])
    if (!c1.rows.includes(k)) fail("options missing row " + k + " in log mode: " + c1.rows.join(","));
  for (const k of ["lcols", "lsort", "ltot", "lmin"])
    if (c1.rows.includes(k)) fail("inv-only row " + k + " visible in log mode");
  console.log("C1 log-mode option rows ok");
  await page.evaluate(() => { const s = document.querySelector('#ovopt select[data-k="lmode"]'); s.value = "inv"; s.dispatchEvent(new Event("change", {bubbles: true})) });
  await page.waitForTimeout(60);
  const c2 = await page.evaluate(() => [...document.querySelectorAll("#ovopt [data-k]")].map(i => i.dataset.k));
  for (const k of ["lcols", "lsort", "ltot", "lmin"]) if (!c2.includes(k)) fail("inv-mode row " + k + " missing: " + c2.join(","));
  console.log("C2 inv-mode option rows ok");
  await page.evaluate(() => { const n = document.querySelector('#ovopt input[data-k="lmin"]'); n.value = "500"; n.dispatchEvent(new Event("change", {bubbles: true})) });
  const c3 = await page.evaluate(() => wv("loot", "lmin"));
  if (c3 !== 500) fail("lmin set: " + c3);
  await page.evaluate(() => { const n = document.querySelector('#ovopt input[data-k="lmin"]'); n.value = ""; n.dispatchEvent(new Event("change", {bubbles: true})) });
  const c4 = await page.evaluate(() => ({v: wv("loot", "lmin"), stored: (CFG.widgets.loot || {}).lmin}));
  if (c4.v !== null || c4.stored !== undefined) fail("lmin clear did not fall back to default: " + JSON.stringify(c4));
  else console.log("C3 number clear falls back ok");
  await page.evaluate(() => { const s = document.querySelector('#ovopt select[data-k="lmode"]'); s.value = "log"; s.dispatchEvent(new Event("change", {bubbles: true})) });

  // D. chat card: channel filters (all + error off by default), order (cord default = chronological, newest LAST like a chat log), empty states
  await page.evaluate(() => { CFG.widgets.chat = {on: true, x: 620, y: 120}; setOn("chat", true); apply(DATA) });
  const d1 = await page.evaluate(() => [...document.querySelectorAll("#ovw-chat .cm")].map(e => e.querySelector("span").textContent));
  if (d1.length !== 3 || d1.join("|") !== "party plan|whisper hi|buddy yo") fail("chat default filter/order wrong: " + JSON.stringify(d1));
  else console.log("D1 chat default channels (newest last) ok");
  await page.evaluate(() => { setP("chat", "cal", true); setP("chat", "cer", true) });
  const d2 = await page.evaluate(() => [...document.querySelectorAll("#ovw-chat .cm")].map(e => e.querySelector("span").textContent));
  if (d2.length !== 5 || d2[0] !== "all chat hello" || d2[4] !== "buddy yo") fail("chat with all channels wrong: " + JSON.stringify(d2));
  else console.log("D2 chat all-channels ok");
  await page.evaluate(() => setP("chat", "cord", "top"));
  const d3 = await page.evaluate(() => [...document.querySelectorAll("#ovw-chat .cm")].map(e => e.querySelector("span").textContent));
  if (d3[0] !== "buddy yo" || d3[4] !== "all chat hello") fail("chat newest-on-top wrong: " + JSON.stringify(d3));
  else console.log("D3 chat newest-on-top ok");
  await page.evaluate(() => { setP("chat", "cord", "bottom"); setP("chat", "cal", false); setP("chat", "cer", false) });

  // E. bag card: no tabs picked -> the empty state, not a blank card
  await page.evaluate(() => { CFG.widgets.bag = {on: true, x: 620, y: 420}; setOn("bag", true); apply(DATA) });
  await page.evaluate(() => { for (const k of ["bt_equip", "bt_use", "bt_etc"]) setP("bag", k, false) });
  const e1 = await page.evaluate(() => document.querySelector("#ovw-bag .b").textContent.trim());
  if (!/Pick a tab to watch/.test(e1)) fail("bag empty state: '" + e1 + "'");
  else console.log("E1 bag empty state ok");
  // bgon=false: the nobg class (icon-only glass card)
  await page.evaluate(() => { setP("bag", "bt_equip", true); setP("bag", "bgon", false) });
  const e2 = await page.evaluate(() => document.querySelector("#ovw-bag").classList.contains("nobg"));
  if (!e2) fail("bgon off did not set nobg");
  else console.log("E2 bag nobg ok");

  // F. chat empty states: waiting vs none
  await page.evaluate(() => window.ovData({...DATA, chat: [], chatOn: false}));
  const f1 = await page.evaluate(() => document.querySelector("#ovw-chat .empty")?.textContent || "");
  if (!/Waiting for the game's chat box/.test(f1)) fail("chat waiting state: '" + f1 + "'");
  await page.evaluate(() => window.ovData({...DATA, chat: [], chatOn: true}));
  const f2 = await page.evaluate(() => document.querySelector("#ovw-chat .empty")?.textContent || "");
  if (!/No messages yet/.test(f2)) fail("chat none state: '" + f2 + "'");
  else console.log("F1 chat empty states ok");

  await browser.close();
  console.log(process.exitCode ? "PROBE HAD FAILURES" : "QA probe: all clear");
})().catch(e => { console.error(e); process.exit(1) });
