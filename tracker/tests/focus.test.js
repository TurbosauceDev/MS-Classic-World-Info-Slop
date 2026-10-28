// node tests/focus.test.js — Focus Mode, the third view beside Simple Mode (Danny, 2026-10-26, skinned after
// maplestory.watch/market): opens from the button and the View menu, shows the run in a centred column with soft shadows,
// the window shrinks to fit it (the same host.mini Simple Mode uses), and Full view brings everything back. A pop-up
// (Settings) leaves Focus like it leaves Simple. Needs playwright, like ui.test.js.
const path = require("path"), {chromium} = require("playwright");
const fail = (what, v) => { throw new Error(what + ": " + JSON.stringify(v)) };
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ["--allow-file-access-from-files"]});
  const page = await browser.newPage({viewport: {width: 900, height: 950}}), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.emulateMedia({reducedMotion: "reduce"});   // boxes pop instead of gliding; Focus doesn't glide anyway
  await page.addInitScript(require("./ui-host"));
  await page.goto("file://" + path.join(__dirname, "../app/index.html"));
  await page.click("#guideShare");
  // the button: Focus on, everything else away but the title bar, the window asked to fit the column
  await page.click("#focusBtn");
  let st = await page.evaluate(() => [document.body.classList.contains("focus"), getComputedStyle($("#focus")).display !== "none",
    $("#go").offsetParent === null, $("#titlebar").getBoundingClientRect().height > 0,   // fixed elements have no offsetParent
    window.miniCalls?.at(-1)?.[0] === true && window.miniCalls.at(-1)[1] > 100, getComputedStyle($("#focusBtn")).display !== "none"]);
  if (!st[0] || !st[1] || !st[2] || !st[3] || !st[4] || !st[5]) fail("focus on", st);
  // the column is centred at a wide window (equal air left and right), and the cards cast a shadow
  let centre = await page.evaluate(() => { const r = $("#focus").getBoundingClientRect(), b = document.body.getBoundingClientRect();   // within the body's box: html reserves a scrollbar gutter on the right
    return [Math.round(r.left - b.left), Math.round(b.left + document.body.clientWidth - r.right)] });
  if (Math.abs(centre[0] - centre[1]) > 2) fail("focus column centred", centre);
  if (!await page.evaluate(() => getComputedStyle(document.querySelector("#focus .fzCard")).boxShadow !== "none")) fail("fzCard shadow", 0);
  // regression 0.2.88 (Danny: "glow and not shadows"): shadows were made of --ink, the light colour in dark themes. Every shadow colour must be black, hover included.
  const shCols = await page.evaluate(async () => { const c = document.querySelector("#focus .fzCard"), out = [getComputedStyle(c).boxShadow];
    c.classList.add("hov"); const css = [...document.styleSheets].flatMap(ss => [...ss.cssRules]).find(r => r.selectorText === ".fzCard:hover"); out.push(css ? css.style.getPropertyValue("box-shadow") : "no hover rule");
    out.push(getComputedStyle(document.querySelector("#focus")).getPropertyValue("--fzShUp")); return out });
  for (const sh of shCols) for (const m of sh.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) if (+m[1] || +m[2] || +m[3]) fail("focus shadows are black, not a light glow", sh);
  if (!/var\(--fzShUp\)/.test(shCols[1])) fail("hover shadow uses the shared dark token", shCols[1]);
  // Dummy data fills the Focus view: hero, tiles, chart, lists, run log; a taller column asks the window to grow
  await page.evaluate(() => window.menu("dummy")); await page.waitForTimeout(300);
  const d = await page.evaluate(() => [$("#fzMap").textContent, $("#fzTotal").textContent, $("#fzPerMin").textContent, $("#fzChart").children.length > 0,
    $("#fzItems").children.length, $("#fzMobs").children.length, $("#fzFeed").children.length, $("#fzExp").textContent,
    $("#fzState").textContent, miniCalls.filter(c => c[0]).length]);
  if (d[0] === "No map yet" || !/^\+/.test(d[1]) || d[2] === "-" || !d[3] || !d[4] || !d[5] || !d[6] || d[7] === "-" || !/Dummy/.test(d[8]) || d[9] < 2)
    fail("focus with dummy data", d);
  // the View menu action toggles it off (the window is let go), and back on
  await page.evaluate(() => window.menu("focus"));
  st = await page.evaluate(() => [document.body.classList.contains("focus"), $("#go").offsetParent !== null, miniCalls.at(-1)[0] === false]);
  if (st[0] || !st[1] || !st[2]) fail("menu focus off", st);
  await page.evaluate(() => window.menu("focus"));
  if (!await page.evaluate(() => document.body.classList.contains("focus"))) fail("menu focus on", 0);
  // Simple Mode and Focus switch cleanly between each other (only one view at a time)
  await page.evaluate(() => window.menu("mini"));
  st = await page.evaluate(() => [document.body.classList.contains("mini"), document.body.classList.contains("focus"), $("#mini").offsetParent !== null]);
  if (!st[0] || st[1] || !st[2]) fail("focus to simple", st);
  await page.evaluate(() => window.menu("focus"));
  st = await page.evaluate(() => [document.body.classList.contains("focus"), document.body.classList.contains("mini")]);
  if (!st[0] || st[1]) fail("simple to focus", st);
  // Full view (the button in the Focus head) brings the layout back
  await page.click("#fzFull");
  st = await page.evaluate(() => [document.body.classList.contains("focus"), $("#go").offsetParent !== null]);
  if (st[0] || !st[1]) fail("fzFull back to full", st);
  // a pop-up leaves Focus, like it leaves Simple Mode (the window grows back first)
  await page.click("#focusBtn");
  await page.evaluate(() => window.menu("settings"));
  st = await page.evaluate(() => [document.body.classList.contains("focus"), $("#prefsPop").classList.contains("hidden"), miniCalls.at(-1)[0] === false]);
  if (st[0] || st[1] || !st[2]) fail("settings leaves focus", st);
  await page.keyboard.press("Escape");
  if (!await page.evaluate(() => $("#prefsPop").classList.contains("hidden"))) fail("settings closed", 0);
  // a narrow window keeps the view on (the top bar — and its button — is hidden with the rest of the layout anyway);
  // in the full view the button itself hides under a 400 px main card and comes back at width
  await page.evaluate(() => window.menu("focus"));
  await page.setViewportSize({width: 340, height: 900});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  if (!await page.evaluate(() => document.body.classList.contains("focus"))) fail("focus stays on when narrow", 0);
  await page.setViewportSize({width: 900, height: 950});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  await page.evaluate(() => window.menu("focus"));   // full view again
  await page.setViewportSize({width: 340, height: 900});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  if (!await page.evaluate(() => getComputedStyle($("#focusBtn")).display === "none")) fail("focusBtn hidden when narrow", 0);
  await page.setViewportSize({width: 900, height: 950});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  if (!await page.evaluate(() => getComputedStyle($("#focusBtn")).display !== "none")) fail("focusBtn back when wide", 0);
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  console.log("focus.test: ok");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1) });
