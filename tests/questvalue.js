// Quests + Citizenship market value (turn-in items vs reward at player prices, NPC floor) and "Stack with" rows.
// Prices move every meso.watch poll, so the maths runs on a fake quest with prices set by the test. Run: node tests/questvalue.js
const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html");
let fails = 0;
const check = (ok, msg) => { if (ok) console.log("ok  " + msg); else { fails++; console.log("FAILED: " + msg) } };

(async () => {
  const b = await chromium.launch(), p = await b.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  await p.goto(URL);
  const r = await p.evaluate(() => {
    // build data: every turn-in item carries its item id (il[3]) and has a D.items row
    const all = [...D.quests, ...D.citq], il = all.flatMap(q => q.il);
    const ids = il.every(x => x.length === 4 && /^\d+$/.test(x[3])), rows = il.every(x => D.items[x[3]]);
    // fake prices: 2 turn-in items (one 403xxxx quest item, which never counts), get / pick 1 / random / class-only groups
    const set = (id, v) => { PW[id] = [v, 0, 0, 10, 0]; delete CM[id]; delete CMP[id]; delete MDB[id]; delete MA[id]; delete MW[id]; delete MI[id] };
    const A = "4000000", B = "4000001", C = "2000000", E = "2000001", F = "2000002", G = "2000003", H = "2000006";
    [[A, 100], [B, 50], [C, 10], [E, 30], [F, 70], [G, 5], [H, 1000]].forEach(([id, v]) => set(id, v));
    const q = {name: "Test quest", lvl: 20, mesos: 500, kl: [], il: [["a", 10, null, A], ["b", 4, null, B], ["q", 1, null, "4031000"]],
      ri: [{k: "get", it: [[C, 3]]}, {k: "pick", it: [[E, 1], [F, 1]]}, {k: "rand", it: [[G, 2, 50], [C, 1, 50]]},
           {k: "pick", job: "Warrior", it: [[H, 1]]}, {k: "pick", job: "Magician", it: [[G, 1]]}]};
    const m = questMarket(q);
    delete PW[B]; delete CMP[B]; delete MDB[B]; delete MA[B]; delete MW[B]; delete MI[B]; const part = questMarket(q), cell = marketCell(q);
    // stacking: Pia and the Blue Mushroom (kills Blue Mushroom) stacks with Jane and the Mushroom (needs Blue Mushroom Caps)
    const jane = D.quests.find(x => x.name === "Jane and the Mushroom"), st = stackWith(jane), far = st.some(([, x]) => Math.abs(x.lvl - jane.lvl) > 10);
    return {ids, rows, m, part, cell, pia: st.some(([, x]) => x.name === "Pia and the Blue Mushroom"), self: st.some(([, x]) => x === jane), far};
  });
  check(r.ids && r.rows, "every quest turn-in item has an item id and a D.items row");
  // turn-in: 10x100 + 4x50; reward: 500 mesos + 3x10 + best pick 70 + random (2x5 + 10)/2 = 10 + best class 1000
  check(r.m.cost === 1200 && r.m.ctot === 2 && r.m.cok === 2, `turn-in 1,200 from 2 tradeable items, quest item skipped (${r.m.cost}, ${r.m.ctot})`);
  check(r.m.rew === 500 + 30 + 70 + 10 + 1000, `reward = mesos + get + best pick + expected random + best class (${r.m.rew})`);
  check(r.m.all && r.m.src["meso.watch"]?.n > 0, "all priced, meso.watch source counted");
  check(!r.part.all && r.part.cok === 1 && /\d+\/\d+ priced/.test(r.cell) && !/net /.test(r.cell), "unpriced turn-in: shows x/y priced, no net badge");
  check(/NPC floor/.test(r.cell), "NPC floor shown next to market value");
  check(r.pia && !r.self && !r.far, "Stack with: shared monster within 10 levels, not itself");
  // pages render the new rows without errors
  await p.evaluate(() => document.querySelector("#t-quests")?.click());
  check(await p.locator("#qrows .qmkt").count() > 0 && await p.locator("#qrows .qstack").count() > 0, "Quests table shows market + stack rows");
  check(!errs.length, "no page errors " + errs.join(" | "));
  await b.close();
  console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
})();
