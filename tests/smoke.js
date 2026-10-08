// Smoke test: open dist/index.html in Chromium, click through every tab and the main interactions,
// fail on any page error. Run: npm i -D playwright && node tests/smoke.js
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve(__dirname, "../dist/index.html"));
  const check = (ok, msg) => { if (!ok) errs.push("FAILED: " + msg); else console.log("ok  " + msg) };

  // Character Builder
  for (const c of ["Warrior", "Magician", "Bowman", "Thief"]) {
    await p.click(`#pclass button[data-v="${c}"]`);
    await p.fill("#plvl", "45"); await p.dispatchEvent("#plvl", "change");
    check((await p.textContent("#pspleft")).includes("spent") || (await p.textContent("#pspleft")).includes("spare"), `${c} 45 auto-build spends all SP`);
    check(+(await p.textContent("#pdps")).replace(/,/g, "") > 0, `${c} 45 has damage`);
  }
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
  await p.click("#t-maps"); check(await p.$$eval("#maps tbody tr", r => r.length) > 0, "map ranking renders");
  await p.selectOption("#party", "3"); await p.fill("#lvl", "85"); await p.dispatchEvent("#lvl", "input");
  check(await p.$$eval("#maprows tr", r => r.length) > 0 && /portals to/.test(await p.textContent("#maprows")) && !/NaN|undefined/.test(await p.textContent("#maps")), "Where to train: level 85, party, danger, potions");
  // Quest Database
  await p.click("#t-quests");
  check((await p.textContent("#qcount")).includes("quests"), "quest table renders");
  await p.click("#qhead th[data-k=lvl] button");
  await (await p.$(".chainbtn")).click(); check(!(await p.isHidden("#qchainbar")), "questline filter");
  await p.click("#qchainclear");
  await p.click("#qeq"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "equipment filter"); await p.click("#qeq");
  // Citizenship
  await p.click("#t-cit");
  for (const t of ["Henesys", "Kerning City"]) {
    await p.click(`#ctown button[data-t="${t}"]`);
    check(await p.$$eval("#cgrades tr", r => r.length) === 10, `${t} grades table`);
  }
  // Crafting
  await p.click("#t-craft");
  check(await p.$$eval("#crmasters .fact", r => r.length) === 6, "six profession masters");
  check(/^348 /.test(await p.textContent("#crcount")), "all 348 recipes listed");
  await p.click('#crdisc button[data-d="4"]'); await p.selectOption("#crcls", "Thief");
  check(await p.$$eval("#crrows tr", r => r.length) > 0, "Leatherworking Thief filter");
  await p.click("#crmats .crfind >> nth=0");
  check(await p.$$eval("#crrows tr", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#craft")), "material click filters recipes");
  // Keep or sell, armor, share links, crafting leveling, bosses, quest compact toggle
  await p.click("#t-keep"); check(/items/.test(await p.textContent("#kcount")) && await p.$$eval("#krows tr", r => r.length) > 50, "keep list renders");
  await p.click("#konly"); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: no-source filter"); await p.click("#konly");
  { const tr = await p.$("#krows tr:has(td:nth-child(2) .p-hot)"); const before = await tr.$eval("td:nth-child(2)", e => e.textContent);
    await (await tr.$(".khave")).fill("999"); const after = await tr.$eval("td:nth-child(2)", e => e.textContent);
    check(/Keep \d/.test(before) && /Enough|Repeatable|If you craft/.test(after), "keep list: have count changes the verdict", [before, after]);
    await (await tr.$(".khave")).fill(""); }
  await p.selectOption("#kby", "c"); await p.selectOption("#kdisc", { index: 1 }); check(await p.$$eval("#krows tr", r => r.length) > 0, "keep list: crafting + profession filter");
  await p.selectOption("#kby", ""); await p.selectOption("#kdisc", "");
  await p.click("#t-mobs"); check(/^71 /.test(await p.textContent("#mbcount")), "monster database lists 71 monsters");
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
  await p.click("#t-items"); if (await p.isChecked("#itsrc")) await p.click("#itsrc"); if (await p.isChecked("#itnoq")) await p.click("#itnoq"); check(/^2,220 /.test(await p.textContent("#itcount")), "item database lists 2,220 items");
  await p.click("#itsrc"); check(/^[\d,]+ /.test(await p.textContent("#itcount")) && !/^2,220/.test(await p.textContent("#itcount")), "item list: known-source filter");
  { const n = await p.textContent("#itcount"); await p.click("#itnoq"); await p.fill("#itsearch", "letter");
    check(!/Maria's Letter/.test(await p.textContent("#itrows")) && n !== await p.textContent("#itcount"), "item list: hide quest items");
  await p.fill("#itsearch", "") }
  await p.selectOption("#itfrom", "drop"); check(await p.$$eval("#itrows tr[data-id]", r => r.length > 50 && r.every(x => /drops/.test(x.lastElementChild.textContent))), "item list: dropped-by filter"); await p.selectOption("#itfrom", "");
  await p.selectOption("#ituse", "craft"); check(/Ore|Ingot|Plank|Leather/.test(await p.textContent("#itrows")) && !/Gladius/.test(await p.textContent("#itrows")), "item list: crafting component filter"); await p.selectOption("#ituse", "");
  await p.selectOption("#itcat", "Equip"); await p.selectOption("#itjob", "Warrior"); check(await p.$$eval("#itrows tr[data-id]", r => r.length) > 50, "item filters: warrior equipment");
  await p.selectOption("#itcat", ""); await p.selectOption("#itjob", "");
  await p.fill("#itsearch", "snail shell"); await p.click("#itrows .ibtn");
  check(/Snail/.test(await p.textContent("#itpage .mlist")) && !/NaN|undefined/.test(await p.textContent("#items")), "item page: snail shell drops");
  await p.click("#itpage .mobname"); check(!(await p.isHidden("#mbpage")), "item page monster link opens the monster page");
  await p.click("#mbpage .itname"); check(!(await p.isHidden("#itpage")) && !/NaN|undefined/.test(await p.textContent("#itpage")), "monster drop opens the item page");
  await p.click("#itback"); await p.fill("#itsearch", "");
  await p.fill("#itsearch", "red potion"); await p.click("#itrows .ibtn"); check(/Lucy in Amherst/.test(await p.textContent("#itpage")), "item page: shops");
  await p.click("#itback"); await p.fill("#itsearch", "");
  await p.click("#t-quests"); { const ri = await p.$("#qrows .ri"); if (ri) { await ri.click(); check(!(await p.isHidden("#itpage")), "item icon in quests opens its page"); await p.click("#itback") } }
  await p.click("#t-quests"); const mn = await p.$("#qrows .mobname"); if (mn) { await mn.click(); check(!(await p.isHidden("#mbpage")), "monster name in quests opens its page"); await p.click("#mbback") }
  // a map name opens its World Map card
  await p.click("#t-maps"); const mn1 = await p.textContent("#maprows .mname >> nth=0"); await p.click("#maprows .mname >> nth=0");
  check(!(await p.isHidden("#wmap")) && (await p.textContent("#wmcard")).includes(mn1) && !/NaN|undefined/.test(await p.textContent("#wmcard")), "map name opens its World Map card");
  await p.click("#t-navi");
  await p.click('#navtowns button[data-id="10001000"]'); await p.fill("#navto", "Perion"); await p.dispatchEvent("#navto", "change");
  check(await p.$$eval("#navout .navsteps li", r => r.length) > 0 && /cab ride/.test(await p.textContent("#navout")), "navigator: Henesys to Perion by cab");
  await p.check("#navnocab"); check(!/cab ride/.test(await p.textContent("#navout")) && /maps? on foot/.test(await p.textContent("#navout")), "navigator: no taxi walks the whole way"); await p.uncheck("#navnocab");
  await p.click('#navtowns button[data-id="60"]'); await p.fill("#navto", "Ant Tunnel I"); await p.dispatchEvent("#navto", "change");
  check(/Shanks/.test(await p.textContent("#navout")) && await p.$$eval("#navout .pt.on", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#navi")), "navigator: Maple Island route via Shanks with highlighted exits");
  // World Map: hover a dot fills the card, click pins it, Route here opens the navigator
  await p.click("#t-wmap");
  await p.click('#wmisl button[data-i="1"]');
  check(await p.$$eval("#wmmap .wmdot", r => r.length) > 40, "world map: Victoria Island dots");
  await p.hover('#wmmap .wmdot.k0 >> nth=1');
  check(/Town/.test(await p.textContent("#wmcard")) && await p.$$eval("#wmcard .wmrow", r => r.length) > 0 && !/NaN|undefined/.test(await p.textContent("#wmcard")), "world map: hovering a town fills the card");
  await p.mouse.move(0, 0); await p.fill("#wmfind", "Henesys Hunting Ground I"); await p.dispatchEvent("#wmfind", "change");
  check(/Henesys Hunting Ground I/.test(await p.textContent("#wmcard")) && /EXP/.test(await p.textContent("#wmcard")) && await p.$$eval("#wmmap .wmdot.pin", r => r.length) === 1, "world map: find a map pins its dot with monsters");
  check(await p.$$eval("#wmcard .mmwrap .mspot", r => r.length) >= 38 && await p.$$eval("#wmcard .wmleg li", r => r.length) === 7, "world map: minimap shows monster spawn points with legend");
  await p.fill("#wmmob", "Horny Mushroom"); await p.dispatchEvent("#wmmob", "change");
  check(await p.$$eval("#wmmap .wmdot.hit", r => r.length) > 0 && await p.$$eval("#wmmap .wmdot.dim", r => r.length) > 20 && /Horny Mushroom/.test(await p.textContent("#wmmobnote")), "world map: monster search lights up its spawn places");
  await p.hover("#wmmap .wmdot.hit >> nth=0");
  check(await p.$$eval("#wmcard .wmleg li.me", r => r.length) === 1, "world map: lit dot's minimap shows the searched monster");
  await p.click("#wmmobclr"); check(await p.$$eval("#wmmap .wmdot.dim", r => r.length) === 0, "world map: clear monster search");
  await p.click('#wmisl button[data-i="0"]'); await p.hover('#wmmap .wmdot >> nth=3');
  check(!/NaN|undefined/.test(await p.textContent("#wmcard")) && (await p.textContent("#wmcard")).length > 20, "world map: Maple Island card");
  await p.click('#wmcard [data-route]');
  check(!(await p.isHidden("#navi")) && (await p.inputValue("#navto")) !== "", "world map: Route here opens the navigator");
  await p.click("#t-kslist"); check(/EllieFlower/.test(await p.textContent("#ksrows")), "the list renders");
  await p.click("#t-log"); check(await p.$$eval("#log .card", c => c.length) >= 1, "changelog tab renders");
  await p.click("#t-credits"); check(await p.$$eval("#credits .card", c => c.length) === 6, "credits tab renders");
  await p.click("#t-craft"); await p.selectOption("#crlvdisc", "2"); check(/mesos to craft Lv 10/.test(await p.textContent("#crlvtot")) && await p.$$eval("#crlvrows tr", r => r.length) === 10, "crafting leveling plan");
  await p.click("#t-maps"); check(await p.$$eval("#timedrows tr", r => r.length) > 10 && /Mushmom/.test(await p.textContent("#timedrows")), "bosses and timed spawns");
  await p.click("#t-quests"); await p.click("#qcompact"); await p.click("#qcompact"); check(await p.$$eval("#qrows tr", r => r.length) > 0, "quest compact toggle");
  await p.click("#t-plan"); const opt = await p.$eval('#pgear select[data-slot="Hat"]', s => s.options[1]?.value);
  if (opt) { await p.selectOption('#pgear select[data-slot="Hat"]', opt); check(/1 piece/.test(await p.textContent("#pgearsum")), "armor slot equips"); await p.click("#pgearclear") }
  check(/mesos\/hr/.test(await p.textContent("#pcost")), "builder upkeep shown");
  await p.click("#pshare"); await p.waitForTimeout(200); check(!/NaN|undefined/.test(await p.textContent("#plan")), "copy build link");
  console.log(errs.length ? "\n" + errs.join("\n") : "\nall good");
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
