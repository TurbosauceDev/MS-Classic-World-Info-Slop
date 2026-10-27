// Smoke test: open dist/index.html in Chromium, click through every tab and the main interactions,
// fail on any page error. Run: npm i -D playwright && node tests/smoke.js
const { chromium } = require("playwright");
const path = require("path");
const boxGaps = require("./boxgaps");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve(__dirname, "../dist/index.html"));
  const check = (ok, msg) => { if (!ok) errs.push("FAILED: " + msg); else console.log("ok  " + msg) };

  // Home page + section nav. Sidebar layout (default, wider than a phone): every page button shows; the two-row layout and
  // phones show one section's pages at a time, so open the section first when its button is showing
  const tab = async sel => { const c = "#c-" + await p.$eval(sel, b => b.dataset.cat); if (await p.isVisible(c)) await p.click(c); await p.click(sel) };
  check(!(await p.isHidden("#home")) && await p.$$eval("#home .hlink", l => l.length) === 28, "home page lists every page");
  { const miss = await p.evaluate(() => { const h = new Set([...document.querySelectorAll("#home [data-go]")].map(a => a.dataset.go)); return [...document.querySelectorAll('[id^="t-"]')].map(b => b.id.slice(2)).filter(x => !h.has(x)) });
    check(!miss.length, `every nav page has a Home link (missing: ${miss})`) }   // 10-21: KPQ timer shipped without one
  check(await p.$$eval("#home img.hic", l => l.length === 34 && l.every(i => i.src.startsWith("data:image/png") && i.naturalWidth > 0)), "home sprites all load (34)");
  await p.click('#home .hlink[data-go="mobs"]'); check(!(await p.isHidden("#mobs")) && await p.getAttribute("#t-mobs", "aria-selected") === "true", "home link opens its page");
  const side = await p.evaluate(() => ({pages: [...document.querySelectorAll("nav .subs [data-tab]")].filter(b => b.offsetParent).length,
    titles: [...document.querySelectorAll("nav .sgh")].filter(b => b.offsetParent).map(b => (b.querySelector(".sgt") || b).textContent.trim()).join("|"),
    sprites: [...document.querySelectorAll("nav img.nic")].filter(i => i.offsetParent).every(i => i.src.startsWith("data:image/png") && i.naturalWidth > 0),
    cats: !!document.querySelector("nav .cats").offsetParent}));
  check(side.pages === 28 && side.titles === "Grind Tracker|Training|Victoria Island|Maple Database|Mesos and Trade" && side.sprites && !side.cats,
    `sidebar lists every page under its section, each with a sprite (${JSON.stringify(side)})`);
  { const [nb, ft] = await p.evaluate(() => { scrollTo(0, 1e6); return [document.querySelector("nav").getBoundingClientRect().bottom, document.querySelector(".sitefoot").getBoundingClientRect().top] }); await p.evaluate(() => scrollTo(0, 0));
    check(ft >= nb, `footer starts below the whole sidebar (nav bottom ${Math.round(nb)}, footer top ${Math.round(ft)})`) }   // Danny 10-20: it slid over the footer
  await p.click("#sbhome"); check(!(await p.isHidden("#home")) && await p.isHidden("#mobs"), "sidebar Home returns home");
  // Settings (cog): Two rows and Basic mode
  const layout = async nv => { await p.click("#thopen"); await p.click(`#navmode [data-nv="${nv}"]`); await p.click("#thclose") };
  await layout("rows"); await p.click("#c-db"); check(!(await p.isHidden("#mobs")) && await p.isHidden("#t-plan") && await p.isVisible("#c-db"), "two rows: section remembers its last page, other sections' pages hidden");
  await layout("basic"); check(await p.isVisible("#t-plan") && await p.isHidden("nav img.nic >> nth=0") && await p.evaluate(() => localStorage.getItem("navmode")) === "basic", "basic mode: plain sidebar, no sprites, remembered");
  await layout("side"); check(await p.isVisible("nav img.nic >> nth=1") && await p.evaluate(() => !document.documentElement.hasAttribute("data-nav")), "back to the sidebar");
  // section landing pages (77-landing.js, Danny 10-22): the sidebar section title opens its section's page with live examples
  for (const [c, demo] of [["trk", "#lptruns"], ["train", "#lpexp .lpbig"], ["world", "#lpnav .lpbig"], ["db", "#lpmob .mobname"], ["town", "#lpprice .lpchips"]]){
    await p.click("#t-" + c); await p.waitForTimeout(80);
    check(!(await p.isHidden("#" + c)) && await p.getAttribute("#t-" + c, "aria-selected") === "true" && (await p.$$eval(demo, l => l.length)) > 0
      && (await p.title()).startsWith(await p.$eval(`#t-${c} .sgt`, e => e.textContent)), `landing page ${c}: opens from its section title, example drawn`) }
  await p.click("#t-db"); await p.fill("#lpitq", "glove"); check(await p.$$eval("#lpitems .itname", l => l.length) > 0, "Maple Database landing: item search finds glove");
  await p.click("#lpitems .itname"); check(!(await p.isHidden("#items")) && await p.isVisible("#itback"), "landing item result opens its item page"); await p.click("#itback");
  await p.click("#t-db"); await p.click('#db .lpcard [data-go="skills"]'); check(!(await p.isHidden("#skills")), "landing Open button opens its page");
  await p.click("#t-world"); await p.click("#lpnroute"); check(!(await p.isHidden("#navi")), "Victoria Island landing: Show the route opens Map Navigator");
  await layout("rows"); await p.click("#c-train"); check(!(await p.isHidden("#train")) && (await p.textContent("#t-train")).trim().endsWith("Overview") && await p.isVisible("#t-train .sgo"),
    "two rows: a section opens on its landing page, shown as an Overview pill"); await layout("side");
  await p.click('.sitefoot [data-foot="log"]'); check(!(await p.isHidden("#log")), "footer: Changelog");
  // Back / Forward (75-history.js): pages and places inside them are browser history entries
  await tab("#t-mobs"); await p.click("#mbrows .mbtn"); const mob1 = await p.textContent("#mbpage h2");
  await tab("#t-items"); await tab("#t-wmap"); await p.waitForTimeout(50);
  await p.goBack(); await p.waitForTimeout(50); check(!(await p.isHidden("#items")) && await p.isHidden("#wmap"), "browser Back returns to the previous page");
  await p.click("#navback"); await p.waitForTimeout(50);
  check(!(await p.isHidden("#mbpage")) && await p.textContent("#mbpage h2") === mob1, "site Back reopens the monster page");
  { const w = await p.evaluate(() => { const t = document.querySelector("#mfarm .tblwrap"); return t ? [t.scrollWidth, t.clientWidth] : [0, 0] });
    check(w[0] <= w[1] + 1, `monster page: best-maps table fits next to the minimap at 1300px (${w})`) }   // second audit #3
  await p.click("#navback"); await p.waitForTimeout(50); check(!(await p.isHidden("#mblist")), "Back again: monster list");
  await p.click("#navfwd"); await p.waitForTimeout(50); check(!(await p.isHidden("#mbpage")), "Forward redoes the step");
  await p.click("#mbback"); await p.waitForTimeout(50); check(await p.isDisabled("#navfwd"), "a new step clears Forward");
  await tab("#t-plan");

  // Character Builder
  for (const c of ["Warrior", "Magician", "Bowman", "Thief"]) {
    await p.click(`#pclass button[data-v="${c}"]`);
    await p.fill("#plvl", "45"); await p.dispatchEvent("#plvl", "change");
    check((await p.textContent("#pspleft")).includes("spent") || (await p.textContent("#pspleft")).includes("spare"), `${c} 45 auto-build spends all SP`);
    check(+(await p.textContent("#pdps")).replace(/,/g, "") > 0, `${c} 45 has damage`);
  }
  // screenshot import (Danny's in-game windows): applied as soon as read (no Apply step, Danny 10-21): level, AP after gear, gear, skills
  const shots = n => p.waitForFunction(n => document.querySelectorAll("#pimpshots .pishot").length === n && !/Reading/.test(document.querySelector("#pimpst").textContent), n, {timeout: 30000});
  await p.setInputFiles("#pimpfile", ["stat", "equip", "skill"].map(f => path.resolve(__dirname, `fixtures/${f}.png`))); await shots(3);
  const ap = await p.$$eval("#pSTR,#pDEX,#pINT,#pLUK", l => l.map(x => x.value).join(" "));
  check(ap === "4 4 127 25" && (await p.textContent("#psummary")).startsWith("Level 28 Magician · Ice Wand · Magic Claw 20") && (await p.textContent("#pgearsum")) === "5 pieces" && !(await p.$("#piapply")), `screenshot import applies itself (AP ${ap})`);
  await p.click("#preset"); await shots(0);
  check(!(await p.textContent("#pimpnote")).trim() && (await p.textContent("#psummary")).startsWith("Level 30 Fighter") && (await p.textContent("#pgearsum")) === "none", "builder Reset: fresh build, screenshots cleared");
  // Danny's Lv28 Archer: every skill level read (The Eye of Amazon's used to fail), and the builder's own numbers match his stat window
  await p.setInputFiles("#pimpfile", ["stat", "equip", "skill"].map(f => path.resolve(__dirname, `fixtures/bow-${f}.png`))); await shots(3);
  const bsk = await p.evaluate(() => Object.values(BLD.S.sp).filter(v => v > 0).length);
  const bst = await p.evaluate(() => [...document.querySelectorAll("#plan .card")].find(c => c.querySelector("h3")?.textContent === "Character stats")?.innerText.replace(/\s+/g, " "));
  check(bsk === 5 && (await p.textContent("#psummary")).startsWith("Level 28 Archer · Battle Bow") && /ACCURACY 66 AVOID 28 .*HP \/ MP 845 \/ 669 W.DEF \/ M.DEF 107 \/ 30/.test(bst), `bowman import matches the stat window (${bsk} skills; ${bst})`);
  await p.click("#preset"); await shots(0);
  // the same Archer, equipment uploaded first and the stat window after (Danny, 2026-10-18: stats alone read "11 over the budget")
  await p.setInputFiles("#pimpfile", path.resolve(__dirname, "fixtures/bow-equip2.png")); await shots(1);
  check(/Add: Stats/.test(await p.textContent("#pimpst")), "equipment alone asks for the stat window");
  await p.setInputFiles("#pimpfile", path.resolve(__dirname, "fixtures/bow-stat2.png")); await shots(2);
  const bnote = await p.textContent("#pimpnote");
  check(await p.$eval("#pweapon", s => s.value) === "Battle Bow" && !/over|more than/.test(bnote), `equipment then stats: weapon read, AP fits (${bnote})`);
  await p.click("#preset"); await shots(0);
  // Danny's whole screen (2560x1440, all three windows open, 10-21): one paste builds his Lv 30 Hunter; only the 2nd job's
  // 1 SP (not on the 1st job skill tab) is asked for. Undo takes the pick, then the paste, back off; Redo puts it back
  await p.setInputFiles("#pimpfile", path.resolve(__dirname, "fixtures/bow-full.png")); await shots(1);
  const fap = await p.$$eval("#pSTR,#pDEX,#pINT,#pLUK", l => l.map(x => x.value).join(" ")), fsum = await p.textContent("#psummary");
  check(fap === "29 133 4 4" && fsum.startsWith("Level 30 Hunter · Battle Bow") && (await p.textContent("#pgearsum")) === "6 pieces" &&
    await p.evaluate(() => ["3000000", "3000001", "3001002", "3001003"].every(id => BLD.S.sp[id] === 15) && BLD.S.sp["3001001"] === 1), `full-screen shot builds the Hunter (AP ${fap}; ${fsum})`);
  check(/1 Hunter SP isn't in your screenshots/.test(await p.textContent("#pimpsp")), "asks where the Lv 30 Hunter SP went");
  await p.click(".pithumb"); await p.waitForSelector("#pishotpop:not([hidden])");
  check(await p.$$eval("#pishotbody li", l => l.length) === 17 && await p.$$eval("#pishotbody .pimk", l => l.length) === 17, "big view: a box and a line for all 17 things read");
  await p.keyboard.press("Escape"); check(await p.isHidden("#pishotpop"), "Esc closes the big view");
  await p.click("#pimpsp [data-addsp]");
  check((await p.textContent("#pspleft")) === "All SP spent" && !(await p.textContent("#pimpsp")).trim(), "picking the skill spends it and the ask goes away");
  await p.click("#pundo"); check((await p.textContent("#pspleft")) === "1 SP left", "Undo takes the SP back");
  await p.keyboard.press("Control+z"); await p.waitForTimeout(50);
  check(await p.$$eval("#pimpshots .pishot", l => l.length) === 0 && (await p.textContent("#psummary")).startsWith("Level 30 Fighter"), "Ctrl+Z takes the screenshot back off");
  await p.click("#predo"); check(await p.$$eval("#pimpshots .pishot", l => l.length) === 1 && (await p.textContent("#psummary")).startsWith("Level 30 Hunter"), "Redo puts it back");
  await p.click("#preset"); await shots(0);
  // Path Planner (opened from the builder)
  await p.click("#ppath");
  await p.waitForTimeout(300);
  check(!(await p.isHidden("#path")), "builder opens Path Planner");
  for (const m of ["mix", "quests", "grind", "rewards"]) {
    await p.click(`#xmode button[data-v="${m}"]`);
    check((await p.$$eval("#xrows tr", r => r.length)) > 0 && !/NaN|undefined/.test(await p.textContent("#path")), `path plan (${m}) renders`);
  }
  await p.click("#xrows .stepchk input >> nth=0");
  check(await p.$eval("#xrows tr[data-k]", r => r.classList.contains("done")), "planner step tick fades the row");
  await p.click("#xrows .stepchk input >> nth=0");
  for (const g of ["all", "build", ""]) {
    await p.selectOption("#xguide", g);
    check((await p.$$eval("#xrows tr", r => r.length)) > 0 && !/NaN|undefined/.test(await p.textContent("#path")), `class guides "${g || "off"}" plan renders`);
  }
  await p.selectOption("#xguide", "all"); await p.fill("#xcur", "10"); await p.fill("#xgoal", "30"); await p.waitForTimeout(400);
  check(/guide map/.test(await p.textContent("#xrows")) && /Lv 1\d: /.test(await p.textContent("#xrows")), "guide maps and level-up notes shown");
  for (const [br, n] of [["Bandit", "reset"], ["Hunter", "Hunter guide weapons"]]) {
    await p.click(`#xcls button[data-v="${br === "Bandit" ? "Thief" : "Bowman"}"]`); await p.selectOption("#xbranch", br);
    await p.fill("#xcur", "30"); await p.fill("#xgoal", "100"); await p.waitForTimeout(800);
    check((await p.textContent("#xrows")).includes(n) && /to level 100/.test(await p.textContent("#xsum")), `${br} 30-100 plan with ${n}`);
  }
  await p.selectOption("#xparty", "4"); await p.fill("#xcur", "15"); await p.fill("#xgoal", "30"); await p.waitForTimeout(500);
  check(/Kerning Party Quest/.test(await p.textContent("#xrows")) && /Safe|Caution|Danger/.test(await p.textContent("#xrows")), "party, KPQ and danger in the plan");
  await p.selectOption("#xparty", "1");
  // Where to train
  await tab("#t-maps"); check(await p.$$eval("#maps tbody tr", r => r.length) > 0, "map ranking renders");
  await p.selectOption("#party", "3"); await p.fill("#lvl", "85"); await p.dispatchEvent("#lvl", "input");
  check(await p.$$eval("#maprows tr", r => r.length) > 0 && /portals to/.test(await p.textContent("#maprows")) && !/NaN|undefined/.test(await p.textContent("#maps")), "Where to train: level 85, party, danger, potions");
  // EXP/hr calculator
  await tab("#t-expc"); await p.fill("#ecl0", "30"); await p.fill("#ecl1", "31"); await p.fill("#ece0", "90000[94.04%]"); await p.fill("#ece1", "10%");
  await p.fill("#ecmin", "10"); await p.fill("#ecmap", "Ant Tunnel I"); await p.dispatchEvent("#ecmap", "input");
  check(/EXP\/hr/.test(await p.textContent("#ecout")) && /our estimate/.test(await p.textContent("#ecout")) && !/NaN|undefined/.test(await p.textContent("#ecout")), "EXP/hr calculator: readings across a level-up, map estimate");
 await p.click("#ecsave"); check(await p.$$eval("#ecrows tr", r => r.length) === 1 && /Ant Tunnel/.test(await p.textContent("#ecrows")), "EXP/hr calculator: session saved");
  // Quest Database
  await tab("#t-quests");
  check((await p.textContent("#qcount")).includes("quests"), "quest table renders");
  await p.click("#qhead th[data-k=lvl] button");
  await (await p.$(".chainbtn")).click(); check(!(await p.isHidden("#qchainbar")), "questline filter");
  await p.click("#qchainclear");
  await p.click("#qeq"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "equipment filter"); await p.click("#qeq");
  // Citizenship
  // KPQ guide
  await tab("#t-kpq");
  check(await p.$$eval("#kpq .kpqstage", r => r.length) === 6, "KPQ stages render");
  check(await p.$$eval("#kpq img.mm", r => r.length) === 6, "KPQ minimaps");
  check(await p.$$eval("#kpq .kpqtry", t => t.map(x => x.tBodies[0].rows.length).join()) === "4,10,20", "KPQ combination tables");
  await tab("#t-cit");
  for (const t of ["Henesys", "Kerning City"]) {
    await p.click(`#ctown button[data-t="${t}"]`);
    check(await p.$$eval("#cgrades tr", r => r.length) === 10, `${t} grades table`);
  }
  // Crafting
  await tab("#t-craft");
  check(await p.$$eval("#crmasters .fact", r => r.length) === 6, "six profession masters");
  await p.click('#crmode [data-m="rec"]');
  check(/^308 /.test(await p.textContent("#crcount")), "all 308 recipes up to the craft Lv 8 cap listed");
  await p.click('#crdisc button[data-d="4"]'); await p.selectOption("#crcls", "Thief");
  check(await p.$$eval("#crrows tr", r => r.length) > 0, "Leatherworking Thief filter");
  await p.click('#crmode [data-m="ref"]'); await p.click("#crmats .crfind >> nth=0");
  check(await p.$$eval("#crrows tr", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#craft")), "material click filters recipes");
  // Keep or sell, armor, share links, crafting leveling, bosses, quest compact toggle
  await tab("#t-keep"); check(/items/.test(await p.textContent("#kcount")) && await p.$$eval("#krows tr", r => r.length) > 50, "keep list renders");
  { const names = await p.$$eval("#krows tr b", b => b.map(x => x.textContent)); check(!names.some(n => /^(Pink Anthurium|Black Feather|Fresh Milk|Shumi's Coin)$/.test(n)), "keep list: no quest items (403xxxx)", names.filter(n => /Anthurium|Feather|Milk|Shumi/.test(n))); }
  await p.click("#konly"); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: no-source filter"); await p.click("#konly");
  { const tr = await p.$("#krows tr:has(td:nth-child(2) .p-hot)"); const before = await tr.$eval("td:nth-child(2)", e => e.textContent);
    await (await tr.$(".khave")).fill("999"); const after = await tr.$eval("td:nth-child(2)", e => e.textContent);
    check(/Keep \d/.test(before) && /Enough|Repeatable|If you craft/.test(after), "keep list: have count changes the verdict", [before, after]);
    await (await tr.$(".khave")).fill(""); }
  await p.selectOption("#kby", "c"); await p.selectOption("#kdisc", { index: 1 }); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: crafting + profession filter");
  await p.selectOption("#kby", ""); await p.selectOption("#kdisc", "");
  await tab("#t-mobs"); check(/^84 /.test(await p.textContent("#mbcount")), "monster database lists 84 monsters");
  await p.fill("#mbsearch", "balrog"); await p.click("#mbrows .mbtn");
  check(/Cursed Sanctuary/.test(await p.textContent("#mbpage")) && !/NaN|undefined/.test(await p.textContent("#mobs")), "monster page: Jr. Balrog");
  await p.click("#mbback"); await p.fill("#mbsearch", "green mushroom"); await p.click("#mbrows .mbtn");
  check(await p.$$eval("#mfarm .mfrow", r => r.length) > 3 && await p.$$eval("#mfarm .mspot", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#mbpage")), "monster page: farming maps + spawn dots");
  await p.fill("#mflvl", "60"); check(/level 60/.test(await p.textContent("#mfarm")), "monster page: level changes the estimate");
  await p.click("#mbback");
  await p.fill("#mbsearch", "snail shell"); check(await p.$$eval("#mbrows tr.mrow", r => r.length) > 0, "monster search by drop");
  await p.fill("#mbsearch", ""); await p.selectOption("#mbkind", "kpq"); check(await p.$$eval("#mbrows tr.mrow", r => r.length) === 4, "monster type filter: KPQ");
  await p.selectOption("#mbkind", "");
  // Item database: list, filters, item page, cross-links with monster pages
  await tab("#t-skills"); check(/^90 /.test(await p.textContent("#skcount")), "skill database lists 90 skills");
  await p.fill("#sksearch", "magic claw"); await p.click("#skrows .skbtn");
  check(/Magic Claw/.test(await p.textContent("#skpage h2")) && await p.$$eval("#skpage tbody tr", r => r.length) === 20 && /Energy Bolt/.test(await p.textContent("#skpage .mcols")), "skill page: levels and requirements");
  await p.click("#skback"); await p.click("#skreset"); check(/^90 /.test(await p.textContent("#skcount")) && !/NaN|undefined/.test(await p.textContent("#skills")), "skill list: reset filters");
  check(/^https:\/\/maplestory\.io\/api\/MCW\/CBT2\/character\/2000\/\d+,\d+.*\/stand[12]\/0$/.test(await p.$eval("#pavatar", i => i.dataset.src || "")), "builder: avatar URL (maplestory.io MCW)");
  await tab("#t-items"); if (await p.isChecked("#itsrc")) await p.click("#itsrc"); if (await p.isChecked("#itnoq")) await p.click("#itnoq"); check(/^2,258 /.test(await p.textContent("#itcount")), "item database lists 2,258 items");
  await p.click("#itsrc"); check(/^[\d,]+ /.test(await p.textContent("#itcount")) && !/^2,258/.test(await p.textContent("#itcount")), "item list: known-source filter");
  { const n = await p.textContent("#itcount"); await p.click("#itnoq"); await p.fill("#itsearch", "letter");
    check(!/Maria's Letter/.test(await p.textContent("#itrows")) && n !== await p.textContent("#itcount"), "item list: hide quest items");
  await p.fill("#itsearch", "") }
  await p.selectOption("#itfrom", "drop"); check(await p.$$eval("#itrows tr[data-id]", r => r.length > 50 && r.every(x => /drops/.test(x.lastElementChild.textContent))), "item list: dropped-by filter"); await p.selectOption("#itfrom", "");
  await p.selectOption("#ituse", "craft"); check(/Ore|Ingot|Plank|Leather/.test(await p.textContent("#itrows")) && !/Gladius/.test(await p.textContent("#itrows")), "item list: crafting component filter"); await p.selectOption("#ituse", "");
  await p.selectOption("#itcat", "Equip"); await p.selectOption("#itjob", "Warrior"); check(await p.$$eval("#itrows tr[data-id]", r => r.length) > 50, "item filters: warrior equipment");
  await p.selectOption("#itcat", ""); await p.selectOption("#itjob", "");
  // meso.watch live listings + trend (2026-10-19): cheap filter is non-equipment only, sorted by how far under the median
  // needs real live listings, which are dropped when meso.watch only has stale ones (10-21): FM Sniper's own listing checks
  // run on a fixture (tests/snipe.js), so here an empty list only has to show the filter's empty state
  // guard on what the cheap filter can show, not on raw PWNOW: pwCheap needs a live listing AND a solid
  // (non-equip) median (10-maps.js), so an all-equip listing lull must take the empty branch, not false-fail the gate
  const live = await p.evaluate(() => Object.keys(PWNOW).filter(id => PW[id] && !(PW[id][4] & 1)).length);
  if (live){
    await p.click("#itcheap"); { const r = await p.$$eval("#itrows tr[data-id]", r => r.map(x => [x.children[2].textContent, x.children[6].textContent]));
      check(r.length > 0 && r.every(([lv, pw]) => lv === "" && /now [\d,]+/.test(pw)), "item list: cheap in shops now (non-equip, with listing)") }
    await p.click("#itrows .ibtn"); check(/Cheapest listed\s*[\d,.]+/i.test(await p.innerText("#itpage")) && /meso\.watch \(cheapest per item only, from streams, updated (just now|\d+ (min|h|days) ago)/.test(await p.textContent("#itpage")) && !/NaN|undefined/.test(await p.textContent("#itpage")), "item page: cheapest live listing");
    await p.click("#itback"); await p.click("#itcheap");
  } else { await p.click("#itcheap"); check(!(await p.$$("#itrows tr[data-id]")).length, "item list: cheap in shops now is empty with no live listings"); await p.click("#itcheap") }
  check(await p.$$eval("#itrows tr[data-id] td:nth-child(8)", c => c.some(x => /[▲▼]\d+%/.test(x.textContent))), "item list: trend column");
  await p.fill("#itsearch", "snail shell"); await p.click("#itrows .ibtn");
  check(/Snail/.test(await p.textContent("#itpage .mlist")) && !/NaN|undefined/.test(await p.textContent("#items")), "item page: snail shell drops");
  await p.click("#itpage .mobname"); check(!(await p.isHidden("#mbpage")), "item page monster link opens the monster page");
  await p.click("#mbpage .itname"); check(!(await p.isHidden("#itpage")) && !/NaN|undefined/.test(await p.textContent("#itpage")), "monster drop opens the item page");
  await p.click("#itback"); await p.fill("#itsearch", "");
  await p.fill("#itsearch", "red potion"); await p.click("#itrows .ibtn"); check(/Lucy in Amherst/.test(await p.textContent("#itpage")), "item page: shops");
  await p.click("#itback"); await p.fill("#itsearch", "");
  await tab("#t-quests"); { const ri = await p.$("#qrows .ri"); if (ri) { await ri.click(); check(!(await p.isHidden("#itpage")), "item icon in quests opens its page"); await p.click("#itback") } }
  await tab("#t-quests"); const mn = await p.$("#qrows .mobname"); if (mn) { await mn.click(); check(!(await p.isHidden("#mbpage")), "monster name in quests opens its page"); await p.click("#mbback") }
  // a map name opens its World Map card
  await tab("#t-maps"); const mn1 = await p.textContent("#maprows .mname >> nth=0"); await p.click("#maprows .mname >> nth=0");
  check(!(await p.isHidden("#wmap")) && (await p.textContent("#wmcard")).includes(mn1) && !/NaN|undefined/.test(await p.textContent("#wmcard")), "map name opens its World Map card");
  { const ex = "#wmcard .mexits .mname >> nth=0", en = await p.textContent(ex); await p.hover(ex); const tip = await p.textContent("#qtip");
    await p.click(ex); check(tip.includes(en) && (await p.textContent("#wmcard .qt-h, #wmcard h3, #wmcard")).includes(en), `exit name previews and opens that map (${en})`) }
  await tab("#t-navi");
  await p.click('#navtowns button[data-id="10001000"]'); await p.fill("#navto", "Perion"); await p.dispatchEvent("#navto", "change");
  if (await p.isChecked("#navnocab")) await p.uncheck("#navnocab");   // the Victoria Island card leaves No taxi ticked
  check(await p.$$eval("#navout .navsteps li", r => r.length) > 0 && /cab ride/.test(await p.textContent("#navout")), "navigator: Henesys to Perion by cab");
  await p.check("#navnocab"); check(!/cab ride/.test(await p.textContent("#navout")) && /maps? on foot/.test(await p.textContent("#navout")), "navigator: no taxi walks the whole way"); await p.uncheck("#navnocab");
  await p.click('#navtowns button[data-id="60"]'); await p.fill("#navto", "Ant Tunnel I"); await p.dispatchEvent("#navto", "change");
  check(/Shanks/.test(await p.textContent("#navout")) && await p.$$eval("#navout .pt.on", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#navi")), "navigator: Maple Island route via Shanks with highlighted exits");
  // World Map: hover a dot fills the card, click pins it, Route here opens the navigator
  await tab("#t-wmap");
  await p.click('#wmisl button[data-i="1"]');
  check(await p.$$eval("#wmmap .wmdot", r => r.length) > 40, "world map: Victoria Island dots");
  await p.hover('#wmmap .wmdot.k0 >> nth=1');
  check(!(await p.isHidden("#wmlabel")) && /Click a dot/.test(await p.textContent("#wmcard")), "world map: hover shows only a label, card unchanged");
  await p.click('#wmmap .wmdot.k0 >> nth=1');
  check(/Town/.test(await p.textContent("#wmcard")) && await p.$$eval("#wmcard .wmrow", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#wmcard")), "world map: hovering a town fills the card");
  await p.mouse.move(0, 0); await p.fill("#wmfind", "Henesys Hunting Ground I"); await p.dispatchEvent("#wmfind", "change");
  check(/Henesys Hunting Ground I/.test(await p.textContent("#wmcard")) && /EXP/.test(await p.textContent("#wmcard")) && await p.$$eval("#wmmap .wmdot.pin", r => r.length) === 1, "world map: find a map pins its dot with monsters");
  check(await p.$$eval("#wmcard .mmwrap .mspot", r => r.length) >= 38 && await p.$$eval("#wmcard .wmleg li", r => r.length) === 7, "world map: minimap shows monster spawn points with legend");
  await p.fill("#wmmob", "Horny Mushroom"); await p.dispatchEvent("#wmmob", "change");
  check(await p.$$eval("#wmmap .wmdot.hit", r => r.length) > 0 && await p.$$eval("#wmmap .wmdot.dim", r => r.length) > 20 && /Horny Mushroom/.test(await p.textContent("#wmmobnote")), "world map: monster search lights up its spawn places");
  await p.click("#wmmap .wmdot.hit:not(.k2) >> nth=0");
  check(await p.$$eval("#wmcard .wmleg li.me", r => r.length) === 1, "world map: lit dot's minimap shows the searched monster");
  await p.click("#wmmobclr"); check(await p.$$eval("#wmmap .wmdot.dim", r => r.length) === 0, "world map: clear monster search");
  // OSMS 63db094 (10-21) maps with no spot on the client's world map are listed with the nearest marked spot
  await p.mouse.move(0, 0); await p.fill("#wmfind", "Excavation Site I"); await p.dispatchEvent("#wmfind", "change");
  check(/Excavation Site I/.test(await p.textContent("#wmcard")) && /Remains <Tomb> IV/.test(await p.textContent("#wmcard")) && /aren't marked on the in-game world map/.test(await p.textContent("#wmcard")) && await p.$$eval("#wmmap .wmdot.pin", r => r.length) === 1, "world map: Excavation Site (no client spot) found via the nearest spot");
  await p.fill("#wmmob", "Ghost Stump"); await p.dispatchEvent("#wmmob", "change");
  check(await p.$$eval("#wmmap .wmdot.hit", r => r.length) === 1, "world map: new monster Ghost Stump lights its spot");
  await p.click("#wmmobclr");
  await p.mouse.move(0, 0); await p.fill("#wmfind", "Sleepywood"); await p.dispatchEvent("#wmfind", "change"); await p.locator("#wmfind").blur();
  check(await p.$$eval("#wmmap .wmnode", r => r.length) > 40 && await p.$$eval("#wmmap .wmsvg line", r => r.length) > 40, "world map: Sleepywood opens its sub-map with exits");
  await p.click('#wmmap .wmnode[data-map="10005070"]'); const sel = await p.textContent("#wmcard .qt-h");
  await p.hover('#wmmap .wmnode[data-map="10005000"]'); check(await p.textContent("#wmcard .qt-h") === sel, "world map: hovering another Sleepywood map keeps the selected card");
  check(/Ant Tunnel Park/.test(await p.textContent("#wmcard .qt-h")) && !/NaN|undefined/.test(await p.textContent("#wmcard")), "world map: hovering a Sleepywood map shows its card");
  await p.click("#wmmap .wmback");
  check(await p.$$eval("#wmmap .wmdrill", r => r.length) === 1, "world map: Sleepywood label on the map"); await p.click("#wmareas [data-drill]");
  check(await p.$$eval("#wmmap .wmnode", r => r.length) > 40, "world map: Sleepywood area map button opens it");
  await p.click("#wmmap .wmback"); check(await p.$$eval("#wmmap .wmnode", r => r.length) === 0 && await p.$$eval("#wmmap .wmdot", r => r.length) > 40, "world map: back to Victoria Island");
  await p.click('#wmisl button[data-i="0"]'); await p.click('#wmmap .wmdot >> nth=3');
  check(!/NaN|undefined/.test(await p.textContent("#wmcard")) && (await p.textContent("#wmcard")).length > 20, "world map: Maple Island card");
  await p.click('#wmcard [data-route]');
  check(!(await p.isHidden("#navi")) && (await p.inputValue("#navto")) !== "", "world map: Route here opens the navigator");
  await p.click('.sitefoot [data-foot="log"]'); check(await p.$$eval("#log .card", c => c.length) >= 1, "changelog tab renders");
  await p.click('.sitefoot [data-foot="credits"]'); check(await p.$$eval("#credits .card", c => c.length) === 8 && await p.$$eval("#srcdates li", l => l.length) >= 3, "credits tab renders (7 sources + Data last updated)");
  { // Feedback: a note goes to the server with its kind, page and version; the honeypot stays empty; errors show (server faked)
    const sent = []; let code = 200;
    await p.route("**/api/feedback", r => { sent.push(JSON.parse(r.request().postData() || "{}")); r.fulfill({status: code, contentType: "application/json", body: "{}", headers: {"access-control-allow-origin": "*"}}) });
    await p.click('.sitefoot [data-foot="feedback"]');
    check(!(await p.isHidden("#feedback")) && await p.isDisabled("#fbsend"), "feedback: page opens, Send waits for a note");
    { const w = await p.evaluate(() => ["#feedback .howto", ".fbcard", ".fbadmin"].map(e => { const r = document.querySelector(e).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)] }));
      check(w.every(x => x[0] === w[0][0] && x[1] === w[0][1]), "feedback: About box and form share one column, no long tail (" + JSON.stringify(w) + ")") }
    await p.click('#fbkind [data-k="Bug"]'); await p.fill("#fbmsg", "Snail EXP looks off"); await p.fill("#fbcontact", "Turbow");
    code = 429; await p.click("#fbsend"); await p.waitForSelector("#fbstat.bad");
    check(/try again later/.test(await p.textContent("#fbstat")) && await p.inputValue("#fbmsg") === "Snail EXP looks off", "feedback: a refused note keeps the text and says why");
    code = 200; await p.click("#fbsend"); await p.waitForSelector("#fbdone:not([hidden])");
    const b = sent.at(-1);
    check(b.kind === "Bug" && b.msg === "Snail EXP looks off" && b.contact === "Turbow" && b.website === "" && b.page === "credits" && /^\d+\.\d+\.\d+$/.test(b.ver), "feedback: note sent (" + JSON.stringify(b) + ")");
    await p.click("#fbagain"); check(await p.inputValue("#fbmsg") === "" && !(await p.isHidden("#fbform")), "feedback: Send another clears the form");
    await p.unroute("**/api/feedback");
    await p.click('.sitefoot [data-foot="privacy"]');
    check(!(await p.isHidden("#privacy")) && /not uploaded/.test(await p.textContent("#privacy")) && /NEXON/.test(await p.textContent("#privacy")), "privacy: footer link opens the policy");
  }
  await tab("#t-craft"); await p.click('#crmode [data-m="lvl"]'); await p.selectOption("#crlvdisc", "2"); check(/mesos to finish craft Lv 8/.test(await p.textContent("#crlvtot")) && await p.$$eval("#crlvrows tr", r => r.length) === 8, "crafting leveling plan");
  await tab("#t-maps"); check(await p.$$eval("#timedrows tr", r => r.length) > 10 && /Mushmom/.test(await p.textContent("#timedrows")), "bosses and timed spawns");
  await tab("#t-quests"); await p.click("#qcompact"); await p.click("#qcompact"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "quest compact toggle");
  await tab("#t-plan"); const opt = await p.$eval('#pgear select[data-slot="Hat"]', s => s.options[1]?.value);
  if (opt) { await p.selectOption('#pgear select[data-slot="Hat"]', opt); check(/1 piece/.test(await p.textContent("#pgearsum")), "armor slot equips"); await p.click("#pgearclear") }
  check(/mesos\/hr/.test(await p.textContent("#pcost")), "builder upkeep shown");
  await p.click("#pshare"); await p.waitForTimeout(200); check(!/NaN|undefined/.test(await p.textContent("#plan")), "copy build link");
  // inventory price check: the grind tracker's Use-tab fixture (Danny's screenshot, game pixels)
  // FM Sniper on the build's real meso.watch list (logic with fixed numbers: tests/snipe.js)
  await tab("#t-snipe"); await p.click('#snview [data-v="deal"]');
  { const r = await p.$$eval("#snrows tr", l => l.map(x => [parseInt((x.querySelector(".snpct") || {}).textContent?.replace("<", "") ?? "NaN"), /under NPC/i.test(x.textContent)]));
    const tiles = await p.$$eval("#snstats .sntile", l => l.length) === 6;
    if (live) check(r.length > 0 && r.every(([v, npc]) => v < 100 || npc) && tiles, `FM Sniper: deals all under 100% of value or under the NPC price (${r.length} rows)`);
    else check(r.every(([v]) => isNaN(v)) && tiles && !/NaN|undefined/.test(await p.textContent("#snipe")), `FM Sniper: no live listings, no deal rows (${r.length} rows)`) }
  // Market Comparison Index: rows with icons, a price on 3+ sites, middle between cheapest and dearest; name opens the item page
  await tab("#t-mci");
  { const r = await p.$$eval("#mcirows tr", l => l.map(x => { const v = [...x.querySelectorAll("td.num")].slice(0, 7).map(t => parseInt(t.textContent.replace(/,/g, ""))); return [!!x.querySelector(".ri img"), v.slice(0, 6).filter(n => !isNaN(n)), v[6]] }));
    check(r.length > 50 && r.every(([ic, s, m]) => ic && s.length >= 3 && m >= Math.min(...s) && m <= Math.max(...s)) && !/NaN|undefined/.test(await p.textContent("#mci")), `Market Comparison Index: rows with icons and 3+ sites (${r.length} rows)`);
    await p.click("#mcirows .itname >> nth=0"); check(!(await p.isHidden("#items")) && !(await p.isHidden("#itpage")), "Market Comparison Index: item name opens its page") }
  // Movers: day-over-day rows, every change pill shows a percent; name opens the item page
  await tab("#t-movers");
  { const r = await p.$$eval("#mvrows tr", l => l.map(x => ({chg: x.querySelector(".chg")?.textContent || "", src: x.querySelector(".src b")?.textContent || "", txt: x.textContent})));
    check(r.length > 10 && r.every(x => /^[\u25b2\u25bc]\d+%$/.test(x.chg) && /^(meso\.watch|classicmarket\.kr|maplestory\.watch)$/.test(x.src)) && !/NaN|undefined|Infinity/.test(r.map(x => x.txt).join("")), `Movers: day-over-day rows with change pills (${r.length} rows)`);
    const dirs = await p.evaluate(() => [...document.querySelectorAll("#mvrows .chg")].map(x => x.classList.contains("up") ? 1 : -1));
    await p.selectOption("#mvdir", "rise");
    check((await p.$$eval("#mvrows .chg", l => l.every(x => x.classList.contains("up")))) && dirs.includes(-1), "Movers: rising filter keeps only rises");
    await p.selectOption("#mvdir", "");
    await p.click("#mvrows .itname >> nth=0"); check(!(await p.isHidden("#items")) && !(await p.isHidden("#itpage")), "Movers: item name opens its page") }
  await tab("#t-inv"); await p.setInputFiles("#ivfile", path.resolve(__dirname, "../tracker/tests/frames-inv/use-12162.png"));
  await p.waitForFunction(() => /^Read$|had no/.test(document.querySelector("#ivst").textContent), null, {timeout: 60000});
  check(/Lemon/.test(await p.textContent("#ivbody")) && /mesos/.test(await p.textContent("#ivsum")), "price check reads a Use tab");
  // Danny's bank, scrolled 0-4 rows, plus the bank with the inventory open beside it: overlapping rows counted once
  await p.click("#ivclear");
  await p.setInputFiles("#ivfile", ["bank-3", "bank-0", "bank-inv", "bank-4", "bank-1", "bank-2"].map(f => path.resolve(__dirname, `fixtures/${f}.png`)));
  await p.waitForFunction(() => /^Read$|had no/.test(document.querySelector("#ivst").textContent), null, {timeout: 60000});
  const bankRow = n => p.$$eval("#ivbody tr", (r, n) => r.find(x => x.cells[0].innerText.includes(n))?.cells[2].innerText, n);
  check(await bankRow("Green Mushroom Cap") === "387" && await bankRow("Arrows for Bows") === "1,970" && await bankRow("Set of Match Cards") === "3" &&
    /in the bank: 5,825/.test(await p.textContent("#ivsum")) && !/Equip:/.test(await p.textContent("#ivreads")), "price check lines up scrolled bank screenshots");
  // theme picker: tracker presets recolour the page, a tracker share code is accepted, the pick survives a reload, Default
  // puts styles.css back (no inline colours)
  {
    const bg = () => p.evaluate(() => [document.documentElement.style.getPropertyValue("--bg"), document.documentElement.dataset.theme || ""].join());
    await p.click("#thopen"); await p.click('#thsw [data-th="p:Slime"]');
    const slime = await bg();
    const code = await p.evaluate(() => TrackerThemes.encode({name: "Smoke pink", mode: "light", c: {...TrackerThemes.PRESETS[5].c, accent: "#ff00aa"}}));
    await p.fill("#thcode", code); await p.click("#thadd");
    const pink = await p.evaluate(() => [document.documentElement.style.getPropertyValue("--accent"), document.documentElement.dataset.theme].join());
    await p.reload(); await p.waitForTimeout(300);
    const kept = await p.evaluate(() => document.documentElement.style.getPropertyValue("--accent"));
    await p.click("#thopen"); await p.click('#thsw [data-th="p:Default"]'); const def = await bg();
    await p.fill("#thcode", "nope"); await p.click("#thadd"); const bad = await p.textContent("#thmsg"); await p.click("#thclose");
    check(slime === "#111a14,dark" && pink === "#ff00aa,light" && kept === "#ff00aa" && def === "," && /isn't a theme/.test(bad),
      `theme picker (${slime} | ${pink} | ${kept} | ${def})`);
  }
  // every page at 1300px: no table scrolls sideways inside its card (Danny 10-21, second audit #2: Where to train hid EXP/hr)
  await p.setViewportSize({width: 1300, height: 900});
  for (const [id, cat] of await p.$$eval(".subs button[id^=t-]", bs => bs.map(b => [b.id, b.dataset.cat]))){
    if (cat === "more") await p.click(`.sitefoot [data-foot="${id.slice(2)}"]`); else await tab("#" + id); await p.waitForTimeout(200);
    const wide = await p.evaluate(() => [...document.querySelectorAll(".tblwrap")].filter(w => w.offsetParent && w.scrollWidth > w.clientWidth + 1)
      .map(w => (w.closest("[id]") || {}).id + " " + w.scrollWidth + "/" + w.clientWidth));
    check(!wide.length, `${id} at 1300px: tables fit their card${wide.length ? " (" + wide.slice(0, 3).join(" | ") + ")" : ""}`);
  }
  // every page at phone width: no sideways scroll, no NaN/undefined text
  await p.setViewportSize({width: 390, height: 800});
  for (const [id, cat] of await p.$$eval(".subs button[id^=t-]", bs => bs.map(b => [b.id, b.dataset.cat]))){
    if (cat === "more") await p.click(`.sitefoot [data-foot="${id.slice(2)}"]`); else { await p.click("#c-" + cat); await p.click("#" + id) } await p.waitForTimeout(200);
    const [sw, cw, bad] = await p.evaluate(() => { const m = document.querySelector("main section:not([hidden])") || document.body;
      return [document.documentElement.scrollWidth, document.documentElement.clientWidth, (m.innerText.match(/.{0,30}\b(NaN|undefined|Infinity)\b.{0,20}/) || [""])[0]] });
    check(sw <= cw + 1 && !bad, `${id} at 390px (width ${sw}/${cw}${bad ? ", text: " + bad : ""})`);
    // tables don't hide columns off to the side (Danny 10-21, audit #3): 4+ column tables stack into row cards (76-stack.js)
    const wide = await p.evaluate(() => [...document.querySelectorAll(".tblwrap")].filter(w => w.offsetParent && w.scrollWidth > w.clientWidth + 1)
      .map(w => (w.closest("[id]") || {}).id + " " + w.scrollWidth + "/" + w.clientWidth));
    check(!wide.length, `${id} at 390px: tables fit, no sideways scroll${wide.length ? " (" + wide.slice(0, 3).join(" | ") + ")" : ""}`);
    const spill = await p.evaluate(spillingInputs);
    check(!spill, `${id} at 390px: inputs stay inside their labels${spill ? " (" + spill + ")" : ""}`);
    const gaps = await p.evaluate(boxGaps, [6, id.slice(2)]);
    check(!gaps.length, `${id} at 390px: boxes padded from their card, cards don't touch${gaps.length ? " (" + gaps.slice(0, 3).join(" | ") + ")" : ""}`);   // Danny 10-21, Craft planner
  }
  // builder AP boxes overlapped each other at desktop width (Danny 10-19: width:100% + padding, no border-box)
  await p.click("#c-" + await p.$eval("#t-plan", b => b.dataset.cat)); await p.click("#t-plan");
  // page size (Theme popup) only applies on wide windows: default 3 = 82% of the window, 15% bigger
  await p.setViewportSize({width: 1900, height: 900}); await p.waitForTimeout(100);
  const wide = await p.evaluate(() => { const w = document.querySelector(".wrap"); return [getComputedStyle(w).zoom, Math.round(w.getBoundingClientRect().width)] });
  check(wide[0] === "1.15" && Math.abs(wide[1] - 1595) < 8, `page size 3 at 1900px: zoom 1.15, 82% wide (${wide})`);
  // no long empty tail (Danny 10-21 Feedback, 10-22 Changelog): if a page's content is a narrow column but its About box
  // stretches far past it, the page needs .narrowpage on its <section>
  for (const id of await p.$$eval(".subs button[id^=t-]", bs => bs.map(b => b.id))){
    await p.evaluate(i => document.getElementById(i).click(), id); await p.waitForTimeout(150);
    const t = await p.evaluate(sid => { const sec = document.getElementById(sid), h = sec && sec.querySelector(":scope > details.howto"); if (!h || !h.getClientRects().length) return null;
      const x0 = h.getBoundingClientRect().left, solid = /^(IMG|CANVAS|INPUT|SELECT|BUTTON|TEXTAREA|TABLE|svg)$/; let r = 0;
      for (const e of sec.querySelectorAll("*")){ if (h.contains(e) || !e.getClientRects().length) continue;
        if (solid.test(e.tagName)) { r = Math.max(r, e.getBoundingClientRect().right); continue }
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const g = document.createRange(); g.selectNodeContents(e); for (const q of g.getClientRects()) r = Math.max(r, q.right) }
      return [Math.round(h.getBoundingClientRect().width), Math.round(r - x0)] }, id.slice(2));
    if (t) check(t[1] > t[0] * 0.95, `${id} at 1900px: content fills its About box width, no empty tail (content ${t[1]}/${t[0]} px; else add .narrowpage)`);
  }
  // Changelog: a page or section named in bold is a link to it (Danny 10-22), and the link works
  { await p.evaluate(() => document.getElementById("t-log").click());
    const [bad, n] = await p.evaluate(() => { const names = new Set([...document.querySelectorAll(".subs button[data-tab], button[id^=c-][data-cat]")].map(b => b.textContent.trim().toLowerCase()));
      names.delete("overview"); names.delete("how to use"); names.delete("more");
      const bs = [...document.querySelectorAll("#log .changelog b")].filter(b => names.has(b.textContent.trim().replace(/:$/, "").toLowerCase()));
      return [bs.filter(b => !b.closest("a[data-go],a[data-go-cat]")).map(b => b.textContent).slice(0, 5), bs.length] });
    check(n > 10 && !bad.length, `changelog: ${n} page names are links${bad.length ? " (unlinked: " + bad.join(", ") + ")" : ""}`);
    await p.evaluate(() => { document.querySelector("#log .changelog details").open = true; document.querySelector('#log .changelog a[data-go="qlog"]').click() });
    check(await p.evaluate(() => !document.getElementById("qlog").hidden), "changelog: clicking Quest log opens Quest log");
  }
  await p.click("#t-plan").catch(() => p.evaluate(() => document.getElementById("t-plan").click()));
  for (const w of [1280, 900, 700, 430]){
    await p.setViewportSize({width: w, height: 800}); await p.waitForTimeout(100);
    const spill = await p.evaluate(spillingInputs);
    check(!spill, `builder at ${w}px: inputs stay inside their labels${spill ? " (" + spill + ")" : ""}`);
  }
  await p.setViewportSize({width: 390, height: 800});
  // site version stamp shows the viewer's local zone, UTC on hover (Danny 10-19: UTC was confusing)
  { const c = await b.newContext({ timezoneId: "America/Los_Angeles" }), q = await c.newPage();
    await q.goto("file://" + path.resolve(__dirname, "../dist/index.html"));
    const [t, h] = await q.$eval(".sitever", e => [e.textContent, e.title]);
    check(/^Site version: v0\.\d+\.\d+ · built \w{3} \d{1,2}, \d{4} · \d{1,2}:\d\d [AP]M P[DS]T$/.test(t) && / UTC$/.test(h), `site version in local time (${t} / ${h})`);
    // meso.watch data state under the version (Danny 10-20): price count, sale date, live listings with relative age
    const pws = await q.$eval("#pwstate", e => e.hidden ? "" : e.textContent);
    check(/^meso\.watch: [\d,]+ item prices \(sales up to \w{3} \d{1,2}\)( · [\d,]+ live listings, updated (just now|\d+ (min|h|days) ago)| · no live listings(: meso\.watch's newest list is from \w{3} \d{1,2}| from meso\.watch right now))?$/.test(pws), `meso.watch state on Home (${pws})`);
    // Market today on the Mesos and Trade card (D.pw.tot, Z.ai todo #4): sales count + named top sale
    const mkt = await q.$eval("#mktday", e => e.hidden ? "" : e.textContent);
    check(/^Market today [\d,]+ player-shop sales tracked · top sale: \S.* for [\d,]+ mesos.*Best sellers \S/.test(mkt), `Market today on Home (${mkt})`);
    // version number = newest changelog entry (build.py numbers every card, Danny 10-19); tracker patch notes on its Overview
    const vers = await q.$$eval("#log .changelog .ver", a => a.map(e => e.textContent));
    check(vers.length > 50 && t.includes(vers[0] + " ·") && vers.at(-1) === "v0.1.0" && new Set(vers).size === vers.length, `site version matches the changelog (${vers[0]}, ${vers.length} entries)`);
    const tp = await q.$$eval("#trkpatch p", a => a.length), tv = await q.$eval("#trkpatchver", e => e.textContent);
    check(tp > 50 && /^latest 0\.\d+\.\d+$/.test(tv), `tracker patch notes on Overview (${tp}, ${tv})`);
    await c.close() }
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall good");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();

// inputs/selects that stick out of their .lab (overlap the next grid cell), e.g. "pSTR +20px"; "" if none
function spillingInputs(){
  return [...document.querySelectorAll("section:not([hidden]) .lab > :is(input,select)")].map(e => {
    const r = e.getBoundingClientRect(), d = Math.round(r.right - e.parentElement.getBoundingClientRect().right);
    return r.width && d > 1 ? (e.id || e.dataset.sk || e.tagName) + " +" + d + "px" : "";
  }).filter(Boolean).join(", ");
}
