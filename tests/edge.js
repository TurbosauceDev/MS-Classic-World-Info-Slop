// Edge cases from the 2026-10-19 bug hunt: stale or hand-edited saved state and share links, hostile tracker-server
// replies, broken screenshot files, extreme inputs, phone layout, keyboard. Each check is a bug that was real.
// Run: node tests/edge.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
const TABS = ["trk", "trkhow", "trkruns", "trkkpq", "plan", "path", "maps", "expc", "quests", "mobs", "items", "skills", "wmap", "navi", "kpq", "cit", "craft", "keep", "inv", "log", "credits"];
const KEYS = "tab planner path pathdone qsort qeq qval ctown craft craftlv qcompact keep keephave mobs items skills navi wmap expc theme themes themec".split(" ");
const BADTEXT = /.{0,30}(NaN|undefined|Infinity|\[object).{0,30}/;
const enc = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };

(async () => {
  const b = await chromium.launch();
  const page = async (opts = {}) => { const ctx = await b.newContext({viewport: {width: 1300, height: 900}, ...opts}), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message.slice(0, 160))); return {p, errs, ctx} };
  const open = (p, t) => p.evaluate(t => { const b = document.querySelector("#t-" + t); document.querySelector("#c-" + b.dataset.cat).click(); b.click() }, t);
  const allTabs = async p => { const bad = []; for (const t of TABS){ await open(p, t); await p.waitForTimeout(30);
    const m = await p.evaluate(([t, re]) => (document.getElementById(t).innerText.match(new RegExp(re)) || [""])[0], [t, BADTEXT.source]); if (m) bad.push(`${t}: "${m}"`) } return bad };

  // 1. a real page for phones: doctype (standards mode, same as the artifact) and a viewport tag (Pages used to render
  //    phones at 980 px wide and zoomed out)
  { const {p, ctx} = await page({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    await p.goto(URL);
    check(await p.evaluate(() => document.compatMode) === "CSS1Compat" && await p.evaluate(() => document.documentElement.clientWidth) === 390, "standards mode + viewport tag (phone layout width 390)");
    await open(p, "credits"); const r = await p.evaluate(() => ({cats: document.querySelector("nav .cats").getBoundingClientRect().height, sw: document.documentElement.scrollWidth,
      sel: (() => { const s = document.querySelector("nav .cats [aria-selected=true]").getBoundingClientRect(), c = document.querySelector("nav .cats").getBoundingClientRect(); return s.left >= c.left - 1 && s.right <= c.right + 1 })()}));
    check(r.cats < 50 && r.sw === 390 && r.sel, `phone nav is one swipeable row and keeps the picked section in view (${JSON.stringify(r)})`);
    await ctx.close() }

  // 2. saved state from old versions or hand edits: every key at once, then the keys that used to crash on their own
  for (const g of ['"str"', "5", "[]", "{", "null", '{"cls":"Pirate","lvl":"abc","lv":-5,"q":5,"isl":"nope","fc":"Pirate","pace":"c"}']){
    const {p, errs, ctx} = await page(); await p.goto(URL);
    await p.evaluate(([K, g]) => K.forEach(k => localStorage.setItem(k, g)), [KEYS, g]); await p.goto(URL); await p.waitForTimeout(200);
    const bad = await allTabs(p); check(!errs.length && !bad.length, `every saved key = ${g}: all pages open (${[...errs, ...bad].join("; ")})`); await ctx.close() }
  for (const [k, v] of [["ctown", "Ellinia"], ["craft", '{"q":5}'], ["wmap", '{"isl":9,"cls":"Pirate","lv":"x"}'], ["mobs", '{"fc":"Pirate"}'], ["planner", '{"cls":"Warrior","lvl":-5}'], ["expc", '{"l0":"25","rec":"x"}']]){
    const {p, errs, ctx} = await page(); await p.goto(URL); await p.evaluate(([k, v]) => localStorage.setItem(k, v), [k, v]); await p.goto(URL);
    const bad = await allTabs(p); check(!errs.length && !bad.length, `saved ${k} = ${v} (${[...errs, ...bad].join("; ")})`); await ctx.close() }

  // 3. share links with values the page never makes
  for (const [k, v] of [["b", {cls: "Pirate"}], ["b", {cls: "Warrior", lvl: -5}], ["b", {cls: "Warrior", lvl: "abc", branch: "Nope", gear: "x", sp: 5, weapon: 7, ap: [1]}],
    ["p", {cls: "Pirate"}], ["p", {cls: "Thief", cur: "a", goal: "b", pace: "c", drop: -1, party: 0, mode: "zzz"}], ["n", {f: {}}], ["t", "x"], ["w", -1], ["m", {a: 1}]]){
    const {p, errs, ctx} = await page(); await p.goto(URL + "#" + k + "=" + enc(v)); await p.waitForTimeout(200);
    const bad = await allTabs(p); check(!errs.length && !bad.length, `share link ${k}=${JSON.stringify(v)} (${[...errs, ...bad].join("; ")})`); await ctx.close() }
  { const {p, ctx} = await page(); await p.goto(URL + "#b=!!!&m=" + enc("2")); await p.waitForTimeout(200);
    check(!(await p.isHidden("#mbpage")), "one broken part of a share link doesn't drop the rest"); await ctx.close() }

  // 4. extreme typed input
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "maps");
    await p.fill("#lvl", "1e308"); await p.dispatchEvent("#lvl", "change"); await p.waitForTimeout(100);
    check(!errs.length && !BADTEXT.test(await p.innerText("#maps")), "Where to train level 1e308 is clamped (was 'accuracy Infinity')"); await ctx.close() }

  // 5. the tracker server's reply is outside data: markup can't get in, odd values don't print NaN or crash
  { const X = '<img src=x onerror="window.__x=1">';
    const replies = {empty: {}, emptyTimes: {runs: 3, players: 2, hours: 1, rows: [{map: "100000000", party: 1, level: 20, expHr: 1000, group: "a"}], times: {"100000000": []}},
      hostile: {runs: X, players: X, hours: "x", updated: X, rows: [{map: X, mapName: X, party: X, level: X, expHr: X, group: X}, {map: 100000000, level: -5, expHr: 1e308}],
        mobs: {[X]: {kills: X, players: X, items: {[X]: X}}, "100100": {kills: 5, players: X, items: {"2000000": 1e9}}},
        kpq: {rounds: X, groups: X, board: {Rush: [{best: null, median: X, rounds: X, names: [X, 5], party: X, level: X, job: X, date: X}], Bonus: [{best: X, rounds: X, names: X, level: X}]}}}};
    for (const [name, body] of Object.entries(replies)){
      const {p, errs, ctx} = await page();
      await p.route("**/api/summary", r => r.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body), headers: {"access-control-allow-origin": "*"}}));
      await p.goto(URL); for (const t of ["trkruns", "trkkpq"]){ await open(p, t); await p.waitForTimeout(400); await p.evaluate(() => document.querySelectorAll("#trkkm button").forEach(b => b.click())) }
      const r = await p.evaluate(re => ({x: window.__x, live: /Live from/.test(document.body.innerText), bad: (document.querySelector("#trkruns").innerText + document.querySelector("#trkkpq").innerText).match(new RegExp(re))?.[0]}), BADTEXT.source);
      check(!errs.length && !r.x && r.live && !r.bad, `tracker server reply "${name}" (${JSON.stringify(r)} ${errs.join("; ")})`); await ctx.close() } }

  // 6. Price check: a file that isn't a picture is reported, not left on "Reading…"
  { const {p, errs, ctx} = await page(); await p.goto(URL); await open(p, "inv");
    await p.setInputFiles("#inv input[type=file]", {name: "shot.png", mimeType: "image/png", buffer: Buffer.from("not an image")});
    await p.waitForFunction(() => !/Reading/.test(document.querySelector("#ivst").textContent), null, {timeout: 30000});
    check(!errs.length && /couldn't be opened/.test(await p.textContent("#ivst")), `price check: broken file reported (${await p.textContent("#ivst")})`); await ctx.close() }

  // 7. search: Setup items (letter chairs 'Red "A"') no longer bury Red Snail / Red Potion; same-name items show their ID
  { const {p, ctx} = await page(); await p.goto(URL); await p.keyboard.press("Control+k"); await p.fill("#srchq", "red"); await p.waitForTimeout(100);
    const top = await p.$$eval("#srchres li", l => l.slice(0, 5).map(x => x.innerText.replace(/\s+/g, " ")));
    check(!top.some(t => /Setup/.test(t)) && /Monster/.test(top[0]) && top.some(t => /Red Snail/.test(t)), `search "red": real items and monsters first (${top.join(" | ")})`);
    await p.fill("#srchq", "red potion"); await p.waitForTimeout(100);
    check(await p.$$eval("#srchres li", l => l.filter(x => /Red Potion/.test(x.innerText) && /ID 200000[07]/.test(x.innerText)).length === 2), "two items named Red Potion show their IDs");
    await p.keyboard.press("Escape"); check(await p.evaluate(() => document.activeElement.id) !== "srchq", "Esc closes search and focus leaves the hidden box");
    await p.click("#thopen"); await p.click("#thsw button >> nth=0"); check(await p.isVisible("#thpop"), "picking a theme keeps the popup open");
    await p.fill("#thcode", "MSCT1.AAAAAAAAAAAAAAAAAAAAAAAA"); await p.click("#thadd");
    check(/damaged/.test(await p.textContent("#thmsg")), "a cut-off theme code says it's damaged (was: 'isn't a theme code')");
    await p.keyboard.press("Escape"); check(!(await p.isVisible("#thpop")), "Esc closes the theme popup"); await ctx.close() }

  // 8. big tables draw in chunks (tab switches were 150-400 ms): first rows now, every row after scrolling
  { const {p, ctx} = await page(); await p.goto(URL); await open(p, "craft"); await p.waitForTimeout(100);
    const first = await p.$$eval("#crrows tr", r => r.length);
    for (let i = 0; i < 12; i++){ await p.evaluate(() => document.querySelector("#crrows").lastElementChild.scrollIntoView()); await p.waitForTimeout(80) }
    const all = await p.$$eval("#crrows tr", r => r.length);
    check(first <= 60 && all === 348, `crafting recipes: ${first} rows at first, ${all} after scrolling`); await ctx.close() }

  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
