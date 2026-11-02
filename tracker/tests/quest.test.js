// node tests/quest.test.js — the Quests card (P1-7): core/questlog.js state merges and the QSL1 sync-code round
// trip run in Node; the shared reading core (app/questread.js) reads the site's quest fixtures in Chromium and must
// find exactly what the site's own suite (tests/questlog.js) finds on them. Needs playwright for that half.
const assert = require("assert"), path = require("path"), QL = require("../core/questlog.js"), QR = require("../app/questread.js");
const G = JSON.parse(require("fs").readFileSync(path.join(__dirname, "../app/gamedata.json"), "utf8"));

// ---- Node: the QSL1 code (the tracker's copy button -> the site's Quest log paste box) ----
{ const code = QR.syncCode(["1002"], {"1009": "Roger's Apple"}), p = QR.parseSync(code);
  assert.ok(code.startsWith("QSL1."), "code prefix");
  assert.deepStrictEqual(p, {done: ["1002"], prog: {1009: "Roger's Apple"}}, "round trip");
  // non-ASCII names survive (quest names carry accents)
  const u = QR.parseSync(QR.syncCode([], {"9999": "François' Errand"}));
  assert.strictEqual(u.prog[9999], "François' Errand", "unicode round trip");
  assert.strictEqual(QR.parseSync("nope"), null, "no prefix, no parse");
  assert.strictEqual(QR.parseSync("QSL1." + Buffer.from("not json").toString("base64")), null, "bad json refused");
  assert.strictEqual(QR.parseSync("QSL1." + Buffer.from(JSON.stringify({v: 2, done: [], prog: {}})).toString("base64")), null, "wrong version refused");
  assert.strictEqual(QR.parseSync("QSL1." + Buffer.from(JSON.stringify({v: 1, done: "x", prog: {}})).toString("base64")), null, "bad shape refused"); }

// ---- Node: state merges (in progress replaces, done accumulates, unsure is capped) ----
{ const st = QL.createState();
  let r = QL.apply({at: "t1", done: ["1002"], prog: {1009: "Roger's Apple"}, unsure: [{tab: "prog", cat: "Maple Island", opts: ["A", "B"], why: "narrow"}]}, st);
  assert.deepStrictEqual([r.progN, r.doneN, r.added], [1, 1, 1]);
  // a second read with one quest gone: in progress follows the window, done stays
  r = QL.apply({at: "t2", done: [], prog: {1010: "Olaf's Training"}, unsure: []}, st);
  assert.deepStrictEqual([r.progN, r.doneN, r.added], [1, 1, 0]);
  assert.deepStrictEqual(st.prog, {1010: "Olaf's Training"}, "in progress follows the window");
  assert.deepStrictEqual(st.done, ["1002"], "done accumulates");
  assert.strictEqual(st.at, "t2");
  // unsure is capped at 8 so a wild read can't flood the card
  QL.apply({at: "t3", unsure: Array.from({length: 20}, (_, i) => ({tab: "prog", cat: "x", opts: [String(i)], why: "narrow"}))}, st);
  assert.strictEqual(st.unsure.length, 8, "unsure capped"); }

// ---- Chromium: the shared core reads the site's fixtures exactly like the site's suite expects ----
const {chromium} = require("playwright");
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent("<!doctype html><title>questread</title>");
  await page.addScriptTag({path: path.join(__dirname, "../app/gamedata.js")});
  await page.addScriptTag({path: path.join(__dirname, "../app/questread.js")});
  const read = async fx => page.evaluate(async b64 => {
    const img = new Image; img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const cc = cv.getContext("2d", {willReadFrequently: true}); cc.drawImage(img, 0, 0);
    const QG = GAMEDATA, fr = QuestRead.create([...QG.quests.map(r => ["q", r]), ...QG.citq.map(r => ["cit", r])], {cls: () => ""});
    const rd = fr.reader(); rd.add(fr.readFrame(cc.getImageData(0, 0, cv.width, cv.height)));
    return fr.settle(rd, 1, 1);
  }, require("fs").readFileSync(path.join(__dirname, "frames-quest", fx)).toString("base64"));
  // fixture 1 (In Progress): the same 8 quests the site's suite reads, none done
  const r1 = await read("questlog-progress.png");
  const LNOF = q => q && (q.ln || q.chain || q.name), ALL = G.quests.concat(G.citq);
  const got1 = Object.keys(r1.prog).map(id => LNOF(ALL.find(q => String(q.id) === id)));
  const PROG = ["Donating to Henesys", "A Carpenter in My Own Right!", "Vicious in Need of Help", "Maya and the Weird Medicine", "Pia and the Blue Mushroom", "Icarus's Dream", "Mystery of Niora Hospital", "[Forest of Patience] Sabitrama and the Diet Medicine"];
  console.log("GOT1:", got1.join(" | ")); console.log("UNSURE1:", JSON.stringify(r1.unsure)); console.log("CATS1:", JSON.stringify(r1.cats));
  assert.strictEqual(got1.length, 8, "fixture 1: 8 in progress, got " + got1.join(" | "));
  for (const n of PROG) assert.ok(got1.includes(n), "fixture 1 reads " + n);
  assert.strictEqual(r1.done.length, 0, "fixture 1: nothing done");
  // fixture 2 (Danny's 10-22 shot, selected row + cut name): the same 8, all in progress
  const r2 = await read("questlog-progress2.png");
  const got2 = Object.keys(r2.prog).map(id => LNOF(ALL.find(q => String(q.id) === id)));
  const WANT2 = ["Asking After Maya, the Town Resident", "A Carpenter in My Own Right!", "Arwen and the Glass Shoe", "Maya and the Weird Medicine", "Pia and the Blue Mushroom", "Icarus's Dream", "Mystery of Niora Hospital", "[Forest of Patience] Sabitrama and the Diet Medicine"];
  assert.strictEqual(got2.length, 8, "fixture 2: 8 in progress, got " + got2.join(" | "));
  for (const n of WANT2) assert.ok(got2.includes(n), "fixture 2 reads " + n);
  assert.strictEqual(r2.done.length, 0, "fixture 2: nothing done");
  assert.strictEqual(errors.length, 0, errors.join(" ; ") || "no page errors");
  await browser.close();
  console.log("quest.test: state merges, sync code, and both fixtures read clean");
})().catch(e => { console.error(e); process.exit(1) });
