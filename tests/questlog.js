// Quest log (src/js/61-questlog.js): Danny's In Progress screenshot (every row exact), his Completed-tab recording
// (tests/fixtures/questlog-completed.webm, VP9 because test Chromium has no H.264) against the true list read off its
// frames, the Keep or sell hand-off, bad saved state, and the route planner. Run: node tests/questlog.js (CI: tests.yml)
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "..", "dist", "index.html"), FX = f => path.resolve(__dirname, "fixtures", f);
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };
// the Completed tab in the recording, by category (checked by eye, frame by frame)
const TRUTH = ["[Event] Founder's First Step", "[Event] The Marks We Leave Behind", "[Event] The First Mark", "[Event] The Second Mark", "[Event] The Third Mark",
  "[Event] The Fourth Mark", "[Event] The Fifth Mark", "[Event] The Final Mark", "[Event] The Journey Begins", "The Bowman's Next Journey",
  "To Henesys, the Prairie Town", "To the Gray City, Kerning City", "First Greeting with Camila, the Town Resident", "First Greeting with Mrs. Ming Ming, the Town Resident",
  "Asking After Camila, the Town Resident", "Donating to Henesys", "First Greeting with Pia, the Town Resident", "Asking After Mrs. Ming Ming, the Town Resident.",
  "Asking After Pia, the Town Resident", "First Greeting with Maya, the Town Resident", "A Home in Henesys",
  "Vicious in Need of an Apprentice", "Silas Irons in Need of an Apprentice", "Mr. Thunder in Need of an Apprentice", "Francois in Need of an Apprentice",
  "JM From tha Streetz Looking for a Partner", "Chrishrama in Need of an Apprentice", "Father's Mushroom Stew", "I Need Help on My Homework!",
  "The Reason Behind the Mushroom Studies", "Mrs. Ming Ming's First Worry", "I Need to Find My Daughter", "Mrs. Ming Ming's Second Worry", "Camila's Gem", "Luke the Security Guy",
  "I'm Bored", "Alex the Runaway Kid", "Nella & Kerning City Citizen's Request", "First Time Together", "Nella & Kerning City Citizen's Other Request",
  "Phil's Call", "Teo's Collection", "Olaf's Training", "Jane and the Mushroom", "Pio's Collecting Recycled Goods", "Rain's Maple Quiz", "Biggs's Collection of Items",
  "Roger's Apple", "Todd's How-to-Hunt", "Mai's Training", "Nina and Sen's Dinner Menu", "Please bring this letter to Lucas", "Sam's Suggestion", "Sera's Mirror",
  "Fixing Blackbull's House", "The Stump Horror Story", "Winston's Fossil Dig-up", "Dr. Betty's Research on Plants", "Welcome to the Free Market!"];
const PROG = ["Donating to Henesys", "A Carpenter in My Own Right!", "Vicious in Need of Help", "Maya and the Weird Medicine", "Pia and the Blue Mushroom",
  "Icarus's Dream", "Mystery of Niora Hospital", "[Forest of Patience] Sabitrama and the Diet Medicine"];

(async () => {
  const b = await chromium.launch(), errs = [];
  const page = async () => { const p = await b.newPage({viewport: {width: 1300, height: 900}}); p.on("pageerror", e => errs.push(e.message)); await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { const t = document.querySelector("#t-qlog"), s = t.closest("[hidden]"); if (s) s.hidden = false; t.hidden = false; t.click() }); return p };
  const read = async (p, files) => { await p.setInputFiles("#qlfile", files.map(FX)); await p.waitForFunction(() => /^Read |Couldn|No quest/.test(document.querySelector("#qlstat").textContent), null, {timeout: 240000}) };
  const lnOf = (p, ids) => p.evaluate(ids => { const Q = [...D.quests, ...D.citq]; return [...new Set(ids.map(i => { const r = Q.find(r => String(r.id) === i); return r.ln || r.chain || r.name }))] }, ids);

  // 1. In Progress screenshot: all 8 rows and every bar count
  { const p = await page(); await read(p, ["questlog-progress.png"]);
    const s = await p.evaluate(() => ({prog: Object.keys(QLOG.S.prog), cats: QLOG.S.cats.prog}));
    const got = await lnOf(p, s.prog), cats = Object.entries(s.cats).map(([c, o]) => c + " " + o.found + "/" + o.n).join(", ");
    check(got.length === 8 && PROG.every(n => got.includes(n)), `screenshot: the 8 quests in progress (${got.join(" | ")})`);
    check(cats === "Citizenship 1/1, Crafting 2/2, Henesys 2/2, Kerning City 2/2, Sleepywood 1/1", `screenshot: categories and every bar count (${cats})`);
    // a questline you're on: pick a later step, the earlier ones count as done
    const row = p.locator('#qlrows tr:has(.qlstep)').first(); await row.locator(".qlstep").selectOption({index: 1}); await p.waitForTimeout(200);
    const st = await p.evaluate(() => { const id = document.querySelector("#qlrows .qlstep")?.value; return {id, prog: id in QLOG.S.prog} });
    check(st.prog, `step picker moves the quest you're on (${st.id})`);
    // plan the in-progress quests
    await p.click("#qlpickprog"); await p.waitForTimeout(400);
    const pl = await p.evaluate(() => { const t = document.querySelector("#qlplan").innerText; return {rows: document.querySelectorAll(".qlsteps tbody tr").length, kinds: [...document.querySelectorAll(".qlsteps tbody tr")].map(r => r.className),
      added: /added: .* needs it first/.test(t), bad: /NaN|undefined/.test(t), craft: /Craft/.test(t), hunts: [...document.querySelectorAll(".qlsteps tr.k-hunt td:nth-child(4)")].map(td => td.querySelector(".mobname")?.textContent)} });
    const dupHunt = pl.hunts.filter((m, i) => m && pl.hunts.indexOf(m) !== i);
    check(pl.rows > 8 && !pl.bad && pl.kinds.includes("k-hunt") && pl.kinds.includes("k-turn"), `plan: a route with hunts and turn-ins (${pl.rows} steps)`);
    check(!pl.added, "plan: no earlier quests re-added for quests already in progress");
    check(pl.craft, "plan: crafted quest items (Processed Wood, The Red Relaxer) get craft steps");
    check(dupHunt.length <= 1, `plan: one hunt per monster (repeats: ${dupHunt})`);
    await p.close() }

  // 2. Completed recording: the true list, few misses, almost no wrong reads (a wrong read marks a quest done)
  { const p = await page(); await read(p, ["questlog-completed.webm"]);
    const ids = await p.evaluate(() => QLOG.S.done), got = await lnOf(p, ids);
    const right = got.filter(n => TRUTH.includes(n)), wrong = got.filter(n => !TRUTH.includes(n));
    check(right.length >= 55, `recording: ${right.length} of ${TRUTH.length} done quests read (missed: ${TRUTH.filter(n => !got.includes(n)).join(" | ")})`);
    check(wrong.length <= 1, `recording: wrong reads ≤ 1 (${wrong.join(" | ") || "none"})`);
    const un = await p.evaluate(() => QLOG.unsure.map(u => u.opts[0] + " (" + u.why + ")"));
    check(un.every(n => !got.includes(n.replace(/ \(\w+\)$/, ""))), `recording: rows asked about aren't also applied (${un.join(" | ") || "none"})`);
    // Keep or sell / Path Planner read done quests from pathdone
    const pd = await p.evaluate(() => { const s = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); const r = D.quests.find(r => r.name === "Camila's Gem"); return s.has("q" + r.id) });
    check(pd, "done quests reach Keep or sell (pathdone q<id>)");
    await p.close() }

  // 1b. Danny's 10-22 In Progress shot (questlog-progress2.png): the clicked row (white on blue, "Icarus's Dream"), a cut
  // Citizenship name that read as "Nella"/"Rina" ("Asking After Maya, the Tow..."), "(2)" counts, nothing left unsure;
  // the same shot without its tab row is refused (no tab = no state), not guessed
  { const p = await page(); await read(p, ["questlog-progress2.png"]);
    const s = await p.evaluate(() => ({prog: Object.keys(QLOG.S.prog), done: QLOG.S.done.length, cats: QLOG.S.cats.prog, unsure: QLOG.unsure.length}));
    const got = await lnOf(p, s.prog), want = ["Asking After Maya, the Town Resident", "A Carpenter in My Own Right!", "Arwen and the Glass Shoe", "Maya and the Weird Medicine", "Pia and the Blue Mushroom", "Icarus's Dream", "Mystery of Niora Hospital", "[Forest of Patience] Sabitrama and the Diet Medicine"];
    const cats = Object.entries(s.cats).map(([c, o]) => c + " " + o.found + "/" + o.n).join(", ");
    check(got.length === 8 && want.every(n => got.includes(n)) && !s.done, `shot 2: the 8 in-progress rows, all as in progress (${got.join(" | ")})`);
    check(cats === "Citizenship 1/1, Crafting 1/1, Ellinia 1/1, Henesys 2/2, Kerning City 2/2, Sleepywood 1/1" && !s.unsure, `shot 2: every bar count read and matched, nothing unsure (${cats}; ${s.unsure} unsure)`);
    await p.click("#qlforget");
    const st = await p.evaluate(async src => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height - 125;
      c.getContext("2d").drawImage(im, 0, -125); const b = await new Promise(ok => c.toBlob(ok)); await QLOG.handle([new File([b], "x.png", {type: "image/png"})]);
      return {st: document.querySelector("#qlstat").textContent, prog: Object.keys(QLOG.S.prog).length} }, "data:image/png;base64," + require("fs").readFileSync(FX("questlog-progress2.png")).toString("base64"));
    check(!st.prog && /not its tabs/.test(st.st), `no tab row in the shot: nothing applied, says why (${st.st})`);
    // an unsure row is asked, not applied; picking it adds it in that tab's state, None drops it
    const u = await p.evaluate(() => { QLOG.setUnsure([{tab: "done", cat: "Henesys", opts: ["Pia and the Blue Mushroom", "Maya and the Weird Medicine"], why: "narrow"}, {tab: "prog", cat: "Citizenship", opts: ["Asking After Maya, the Town Resident"], why: "faint"}]);
      const before = QLOG.S.done.length + Object.keys(QLOG.S.prog).length; document.querySelector('#qlunsure button[data-n="Pia and the Blue Mushroom"]').click();
      document.querySelector('#qlunsure button[data-n=""]').click();
      return {before, done: QLOG.S.done.length, prog: Object.keys(QLOG.S.prog).length, left: document.querySelectorAll("#qlunsure button").length} });
    check(u.before === 0 && u.done >= 1 && u.prog === 0 && u.left === 0, `unsure rows: pick adds as done, None drops (${JSON.stringify(u)})`);
    await p.close() }

  // 2b. live screen reading (Danny 10-22): frames fed as a shared screen would (QLOG.liveFrame), applied with no Apply
  // step, the names read shown, Undo / Redo / Forget; and the share button copes with a refused share
  { const p = await page();
    await p.evaluate(async src => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0); const f = {w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data};
      for (let i = 0; i < 3; i++) QLOG.liveFrame(f); QLOG.endLive() }, "data:image/png;base64," + require("fs").readFileSync(FX("questlog-progress.png")).toString("base64"));
    const s = await p.evaluate(() => ({prog: Object.keys(QLOG.S.prog), seen: document.querySelectorAll("#qlseen .pill").length, st: document.querySelector("#qlstat").textContent, undo: !document.querySelector("#qlundo").disabled}));
    const got = await lnOf(p, s.prog);
    check(got.length === 8 && PROG.every(n => got.includes(n)), `live: the 8 quests in progress (${got.join(" | ")})`);
    check(s.seen >= 8 && /^Read 0 done and 8/.test(s.st) && s.undo, `live: what was read is shown and undoable (${s.seen} names, "${s.st}")`);
    await p.click("#qlundo"); const u = await p.evaluate(() => Object.keys(QLOG.S.prog).length);
    await p.click("#qlredo"); const r = await p.evaluate(() => Object.keys(QLOG.S.prog).length);
    await p.click("#qlforget"); const f = await p.evaluate(() => Object.keys(QLOG.S.prog).length);
    await p.click("#qlundo"); const fu = await p.evaluate(() => Object.keys(QLOG.S.prog).length);
    check(u === 0 && r === 8 && f === 0 && fu === 8, `Undo / Redo / Forget / Undo (${u} ${r} ${f} ${fu})`);
    await p.click("#qllive"); await p.waitForFunction(() => document.querySelector("#qllive").textContent === "Read my screen" && document.querySelector("#qlstat").textContent, null, {timeout: 15000}).catch(() => {});
    const sh = await p.evaluate(() => ({b: document.querySelector("#qllive").textContent, st: document.querySelector("#qlstat").textContent}));
    check(sh.b === "Read my screen" && /cancel|can't share|desktop browser/i.test(sh.st), `refused screen share says so (${sh.st})`);
    await p.close() }

  // 3. hostile saved state: the page still opens and lists quests
  { const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); await p.goto(URL);
    await p.evaluate(() => localStorage.setItem("qlog", JSON.stringify({done: ["<img>", 5, null], prog: {"x": 1, "10104": {}}, pick: "nope", lv: 1e9, from: "../x", cats: 7})));
    await p.reload(); await p.evaluate(() => { const t = document.querySelector("#t-qlog"), s = t.closest("[hidden]"); if (s) s.hidden = false; t.hidden = false; t.click() }); await p.waitForTimeout(300);
    const ok = await p.evaluate(() => ({lv: QLOG.S.lv, done: QLOG.S.done.length, rows: document.querySelectorAll("#qlrows tr").length}));
    check(ok.lv === 30 && ok.done === 0 && ok.rows >= 1, `bad saved state is ignored (${JSON.stringify(ok)})`); await p.close() }

  check(!errs.length, `no page errors (${errs.slice(0, 3).join(" | ")})`);
  await b.close(); console.log(fails ? `\n${fails} failed` : "\nall good"); process.exit(fails ? 1 : 0);
})();
