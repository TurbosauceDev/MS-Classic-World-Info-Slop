// Edge cases from the 2026-10-19 bug hunt: stale or hand-edited saved state and share links, hostile tracker-server
// replies, broken screenshot files, extreme inputs, phone layout, keyboard. Each check is a bug that was real.
// Run: node tests/edge.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
const TABS = ["trk", "trkhow", "trkruns", "trkkpq", "plan", "path", "maps", "expc", "quests", "mobs", "items", "skills", "wmap", "navi", "kpq", "cit", "craft", "keep", "inv", "log", "credits"];
const KEYS = "tab planner path pathdone qsort qeq qval ctown craft craftlv qcompact keep keephave mobs items skills navi wmap expc theme themes themec train bcmp anchors".split(" ");
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
    await open(p, "cit"); const r = await p.evaluate(() => ({cats: document.querySelector("nav .cats").getBoundingClientRect().height, sw: document.documentElement.scrollWidth,
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
  // site monkey test (tests/monkey.js seed 4): 1e308 in a stat box printed a 300-digit number and the phone page scrolled sideways
  for (const v of ["1e308", "-5"]){ const {p, errs, ctx} = await page({viewport: {width: 360, height: 800}}); await p.goto(URL); await open(p, "maps");
    for (const s of ["#uacc", "#uavo", "#uhp", "#uwdef"]){ await p.fill(s, v); await p.dispatchEvent(s, "input") } await p.waitForTimeout(100);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    check(!errs.length && sw <= 360 && !BADTEXT.test(await p.innerText("#maps")), `Where to train stat boxes = ${v}: no sideways scroll at 360px (${sw})`); await ctx.close() }

  // site monkey test (seed 3, 2026-10-20): DEX 1e308 in the Builder printed "4.8e+307" accuracy and scrolled phones sideways
  { const {p, errs, ctx} = await page({viewport: {width: 360, height: 800}}); await p.goto(URL); await open(p, "plan");
    await p.fill("#pDEX", "1e308"); await p.dispatchEvent("#pDEX", "input"); await p.waitForTimeout(100);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth), t = await p.innerText("#pstats");
    check(!errs.length && sw <= 360 && !/e\+\d/.test(t), `Builder DEX = 1e308: clamped, no sideways scroll at 360px (${sw})`); await ctx.close() }

  // 5. the tracker server's reply is outside data: markup can't get in, odd values don't print NaN or crash
  { const X = '<img src=x onerror="window.__x=1">';
    const replies = {empty: {}, emptyTimes: {runs: 3, players: 2, hours: 1, rows: [{map: "100000000", party: 1, level: 20, expHr: 1000, group: "a"}], times: {"100000000": []}},
      hostile: {runs: X, players: X, hours: "x", updated: X, rows: [{map: X, mapName: X, party: X, level: X, expHr: X, group: X}, {map: 100000000, level: -5, expHr: 1e308}],
        mobs: {[X]: {kills: X, players: X, items: {[X]: X}}, "100100": {kills: 5, players: X, items: {"2000000": 1e9}}},
        kpq: {rounds: X, groups: X, board: {Rush: [{best: null, median: X, rounds: X, names: [X, 5], party: X, level: X, job: X, date: X}], Bonus: [{best: X, rounds: X, names: X, level: X}]}}},
      hostileName: {runs: 3, players: 1, hours: 1, rows: [], kpq: {rounds: 2, groups: 1, board: {Bonus: [{best: 5000, exp: 4000, mesos: 1000, clear: 600, rounds: 1, names: [X]}]}}}};
    for (const [name, body] of Object.entries(replies)){
      const {p, errs, ctx} = await page();
      await p.route("**/api/summary", r => r.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body), headers: {"access-control-allow-origin": "*"}}));
      await p.goto(URL); for (const t of ["trkruns", "trkkpq"]){ await open(p, t); await p.waitForTimeout(400); await p.evaluate(() => document.querySelectorAll("#trkkm button").forEach(b => b.click())) }
      const r = await p.evaluate(re => ({x: window.__x, live: /Live from/.test(document.body.innerText), bad: (document.querySelector("#trkruns").innerText + document.querySelector("#trkkpq").innerText).match(new RegExp(re))?.[0],
        asText: document.querySelector("#trkkpq").innerText.includes('<img src=x onerror="window.__x=1">')}), BADTEXT.source);
      // a hostile player name shows up as the literal text, not as markup and not dropped
      check(!errs.length && !r.x && r.live && !r.bad && (name !== "hostileName" || r.asText), `tracker server reply "${name}" (${JSON.stringify(r)} ${errs.join("; ")})`); await ctx.close() } }

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
    await p.keyboard.press("Escape"); check(!(await p.isVisible("#thpop")) && await p.evaluate(() => document.activeElement.id) === "thopen", "Esc closes Settings, focus back on the cog");
    check(await p.getAttribute("#thopen", "aria-label") === "Settings", "cog button is labelled Settings");
    await p.click("#thopen"); await p.mouse.click(5, 5); check(!(await p.isVisible("#thpop")), "a click on the backdrop closes Settings"); await ctx.close() }
  // Toggle anchors (Settings): drag Search in the header, kept after reload, Reset all puts it back, hand-edited values ignored, phones keep the default
  { const {p, errs, ctx} = await page({viewport: {width: 1800, height: 1000}}); await p.goto(URL); await p.waitForTimeout(300);
    const at = () => p.$eval("#srchopen", e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)] });
    const home = await at(); await p.click("#thopen"); await p.click("#anchtog");
    const m = await (await p.$(".anchmv[data-id=search]")).boundingBox();
    await p.mouse.move(m.x + m.width / 2, m.y + m.height / 2); await p.mouse.down(); await p.mouse.move(m.x + m.width / 2 + 300, m.y + m.height / 2 - 40, {steps: 8}); await p.mouse.up();
    const moved = await at(), saved = await p.evaluate(() => JSON.parse(localStorage.getItem("anchors")));
    await p.keyboard.press("Escape"); const off = await p.evaluate(() => !document.documentElement.classList.contains("anchoring"));
    await p.reload(); await p.waitForTimeout(300); const kept = await at();
    check(moved[0] > home[0] + 200 && saved?.search?.y >= 0 && off && kept.join() === moved.join(), `anchors: Search moves, Esc locks, kept after reload (${home} -> ${moved} -> ${kept})`);
    await p.click("#thopen"); await p.click("#anchtog"); await p.click(".anchbar [data-reset]"); await p.waitForTimeout(300);
    check((await at()).join() === home.join() && await p.evaluate(() => localStorage.getItem("anchors")) === null, "anchors: Reset all puts Search back and forgets it");
    await p.click(".anchbar [data-lock]");
    await p.evaluate(() => localStorage.setItem("anchors", JSON.stringify({search: {x: 9, y: -5}, cog: {x: "a", y: 1}, evil: {x: 0, y: 0}}))); await p.reload(); await p.waitForTimeout(300);
    check((await at()).join() === home.join(), "anchors: out-of-range saved values are ignored");
    await p.evaluate(() => localStorage.setItem("anchors", JSON.stringify({search: {x: 0.1, y: 10}}))); await p.setViewportSize({width: 600, height: 900}); await p.reload(); await p.waitForTimeout(300);
    check(await p.$eval("#srchopen", e => getComputedStyle(e).transform) === "none" && await p.isDisabled("#anchtog"), "anchors: phones keep the default header, Toggle anchors off");
    check(!errs.length, "anchors: no JS errors " + errs.join(" | ")); await ctx.close() }
  // anchors round 2 (Danny 10-20): F1 toggles (no browser help), smart guides, scale, Colours theme editor
  { const {p, errs, ctx} = await page({viewport: {width: 1800, height: 1000}}); await p.goto(URL); await p.waitForTimeout(300);
    await p.keyboard.press("F1"); const f1 = await p.evaluate(() => document.documentElement.classList.contains("anchoring"));
    // drag the cog to roughly under the header's middle: its center sticks to the center line, the guide shows mid-drag
    const m = await (await p.$(".anchmv[data-id=cog]")).boundingBox(), hr = await (await p.$("header")).boundingBox();
    await p.mouse.move(m.x + m.width / 2, m.y + m.height / 2); await p.mouse.down();
    await p.mouse.move(hr.x + hr.width / 2 + 3, m.y + m.height / 2 + 30, {steps: 10});
    const guide = await p.isVisible(".anchguide.v"); await p.mouse.up();
    const c = await p.$eval("#thopen", e => { const r = e.getBoundingClientRect(); return r.x + r.width / 2 });
    check(f1 && guide && Math.abs(c - (hr.x + hr.width / 2)) < 1.5, `anchors: F1 opens, cog snaps to the center guide (${c} vs ${hr.x + hr.width / 2})`);
    await p.click(".anchmv[data-id=cog]"); await p.$eval(".anchnudge input[type=range]", e => { e.value = 150; e.dispatchEvent(new Event("input", {bubbles: true})); e.dispatchEvent(new Event("change", {bubbles: true})) });
    await p.waitForTimeout(350); const sc = await p.evaluate(() => JSON.parse(localStorage.getItem("anchors")).cog.s), big = await p.$eval("#thopen", e => e.getBoundingClientRect().width / e.offsetWidth);
    check(sc === 1.5 && big > 1.6, `anchors: scale 150% saved and drawn (${sc}, ${big.toFixed(2)})`);
    await p.click(".anchbar [data-cols]"); await p.$eval('.anchcol [data-tok="bg"]', e => { e.value = "#123456"; e.dispatchEvent(new Event("input", {bubbles: true})) });
    const live = await p.evaluate(() => document.documentElement.style.getPropertyValue("--bg"));
    await p.click(".anchcol [data-undo]"); const undone = await p.evaluate(() => document.documentElement.style.getPropertyValue("--bg"));
    await p.$eval('.anchcol [data-tok="accent"]', e => { e.value = "#ff00aa"; e.dispatchEvent(new Event("input", {bubbles: true})) });
    await p.fill(".anchcol [data-name]", "Edge pink"); await p.click(".anchcol [data-save]");
    await p.keyboard.press("Escape"); const done = await p.evaluate(() => !document.documentElement.classList.contains("anchoring") && document.querySelector(".anchcol").hidden);
    await p.reload(); await p.waitForTimeout(300);
    const kept = await p.evaluate(() => [document.documentElement.style.getPropertyValue("--accent"), localStorage.getItem("theme")].join());
    check(live === "#123456" && undone === "" && done && kept === "#ff00aa,\"u:Edge pink\"", `anchors: Colours previews live, Undo reverts, Save keeps it as my theme, Esc = Done (${live} | ${undone} | ${kept})`);
    check(!errs.length, "anchors round 2: no JS errors " + errs.join(" | ")); await ctx.close() }
  // round 3 (Danny 10-20): his screenshot is the default (Search on the left over the sidebar and as wide, small cog on the right
  // in the same row); edit mode also moves the title, resizes the sidebar or puts it right, reorders sidebar sections and Home cards
  { const {p, errs, ctx} = await page({viewport: {width: 1550, height: 1400}}); await p.goto(URL); await p.waitForTimeout(300);
    const r = s => p.$eval(s, e => { const b = e.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height, r: b.right} });
    const sr = await r("#srchopen"), nv = await r(".navcol"), cg = await r("#thopen"), hd = await r("header");
    check(Math.abs(sr.x - nv.x) < 2 && Math.abs(sr.w - nv.w) < 3 && Math.abs(cg.r - hd.r) < 2 && Math.abs((cg.y + cg.h / 2) - (sr.y + sr.h / 2)) < 4 && cg.w < 40,
      `default header: Search over the sidebar, small cog right in the same row (${JSON.stringify({sr, nv, cg})})`);
    await p.keyboard.press("F1");
    const drag = async (from, to, steps = 14) => { await p.mouse.move(from[0], from[1]); await p.mouse.down();   // a hand's pace: ~60 moves a second
      for (let i = 1; i <= steps; i++){ await p.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await p.waitForTimeout(16) }
      await p.waitForTimeout(250); await p.mouse.up(); await p.waitForTimeout(300) };
    const t0 = await r("header h1"); await drag([t0.x + 30, t0.y + 20], [t0.x - 200, t0.y + 20]);
    const t1 = await r("header h1");
    const s1 = await r("nav .sgh[data-cat=db]"), s2 = await r("nav .sgh[data-cat=trk]"); await drag([s1.x + 30, s1.y + 8], [s2.x + 30, s2.y + 2], 20);
    const a = await r(".homecat[data-sec=town]"), b = await r(".homecat[data-sec=trk]"); await drag([a.x + 40, a.y + 20], [b.x + b.w / 2, b.y + b.h / 2], 20);
    const h = await r(".anchsbw"); await drag([h.x + 4, h.y + 50], [h.x + 64, h.y + 50], 6);
    await p.click(".anchbar [data-side]"); await p.keyboard.press("Escape");
    const st = await p.evaluate(() => JSON.parse(localStorage.getItem("anchors")));
    await p.reload(); await p.waitForTimeout(300);
    const after = await p.evaluate(() => ({secs: [...document.querySelectorAll("nav .sgh")].map(e => e.dataset.cat).join(), home: [...document.querySelectorAll(".homegrid>.homecat")].map(e => e.dataset.sec).join(),
      side: document.documentElement.dataset.sbside, sbw: getComputedStyle(document.documentElement).getPropertyValue("--sbw"), nav: document.querySelector(".navcol").getBoundingClientRect().x > innerWidth / 2 }));
    check(t1.x < t0.x - 150 && st.title && st.secs?.[0] === "db" && st.home?.[0] === "town" && st.sb?.w > 280 && st.sb?.right && after.secs.startsWith("db,") && after.home.startsWith("town,") && after.side === "right" && after.nav && /px/.test(after.sbw),
      `edit mode: title moves, sections + Home cards reorder, sidebar wider + on the right, all kept after reload (${JSON.stringify({st, after})})`);
    await p.keyboard.press("F1"); await p.click(".anchbar [data-reset]"); await p.keyboard.press("Escape");
    const back = await p.evaluate(() => [[...document.querySelectorAll("nav .sgh")].map(e => e.dataset.cat).join(), [...document.querySelectorAll(".homegrid>.homecat")].map(e => e.dataset.sec)[0], document.documentElement.dataset.sbside || "", localStorage.getItem("anchors")].join("|"));
    check(back === "trk,train,world,db,town|trk||", `Reset all puts the page back (${back})`);
    await p.goto(URL + "#"); await p.evaluate(() => localStorage.setItem("anchors", JSON.stringify({secs: ["db", "db"], home: "x", sb: {w: 9999, right: "yes"}, hcw: 5})));
    await p.reload(); await p.waitForTimeout(300);
    check(await p.evaluate(() => !document.documentElement.dataset.sbside && !document.documentElement.style.getPropertyValue("--sbw") && document.querySelector("nav .sgh").dataset.cat === "trk"), "edit mode: bad saved layout ignored");
    // saved while My Character was a section (before 10-20): its order is kept, nothing orphaned or doubled
    await p.evaluate(() => localStorage.setItem("anchors", JSON.stringify({secs: ["db", "char", "trk", "train", "world", "town"], home: ["town", "char", "trk", "train", "world", "db", "more"]})));
    await p.reload(); await p.waitForTimeout(300);
    const old = await p.evaluate(() => [[...document.querySelectorAll("nav .sgh")].map(e => e.dataset.cat).join(), [...document.querySelectorAll(".homegrid>.homecat")].map(e => e.dataset.sec).join(),
      document.querySelectorAll("nav .subs [data-tab]").length, document.querySelector("#t-plan").dataset.cat + document.querySelector("#t-skills").dataset.cat].join("|"));
    check(old === "db,trk,train,world,town|town,trk,train,world,db,more|22|traindb", `edit mode: layout saved with My Character still loads (${old})`);
    await p.evaluate(() => localStorage.setItem("tab", "plan")); await p.goto(URL + "#"); await p.reload(); await p.waitForTimeout(300);
    const bt = await p.evaluate(() => !document.querySelector("#plan").hidden && document.querySelector("#c-train").getAttribute("aria-selected") === "true");
    await p.goto(URL + "#s=" + Buffer.from("{}").toString("base64")); await p.reload(); await p.waitForTimeout(300);
    check(bt && await p.evaluate(() => !document.querySelector("#skills").hidden && document.querySelector("#c-db").getAttribute("aria-selected") === "true"), "saved Builder tab opens under Training, old #s= skill link under Maple Database");
    check(!errs.length, "anchors round 3: no JS errors " + errs.join(" | ")); await ctx.close() }

  // 8. big tables draw in chunks (tab switches were 150-400 ms): first rows now, every row after scrolling
  { const {p, ctx} = await page(); await p.goto(URL); await open(p, "craft"); await p.waitForTimeout(100);
    const first = await p.$$eval("#crrows tr", r => r.length);
    for (let i = 0; i < 12; i++){ await p.evaluate(() => document.querySelector("#crrows").lastElementChild.scrollIntoView()); await p.waitForTimeout(80) }
    const all = await p.$$eval("#crrows tr", r => r.length);
    check(first <= 60 && all === 290, `crafting recipes: ${first} rows at first, ${all} after scrolling`); await ctx.close() }

  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
