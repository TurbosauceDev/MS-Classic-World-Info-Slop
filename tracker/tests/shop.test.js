// node tests/shop.test.js — shop window reader (core/shopread.js). Fixture: Danny's own shop window, 2x UI, 2026-10-31
// (tests/frames-shop/own-shop.png, see docs/ai/fixtures.md). The OCR is stubbed with what Tesseract returned on this very
// picture (recorded 2026-10-31: name, then price read from two cuts, per row) so CI needs no OCR install; the geometry,
// sold detection, price parsing, agreement rule and name matching run for real.
const assert = require("assert"), path = require("path"), S = require("../core/shopread.js"), readPng = require("./cv_util.js");
const img = readPng(path.join(__dirname, "frames-shop", "own-shop.png"));
const G = JSON.parse(require("fs").readFileSync(path.join(__dirname, "../app/gamedata.json"), "utf8"));
const NAMES = Object.entries(G.items).map(([id, it]) => [id, it.n]);

(async () => {
  // geometry: six rows, 80 px apart, found from the separator chain (window borders share the colour and are ignored)
  const rows = S.findRows(img, 2);
  assert.deepStrictEqual(rows.map(r => r.top), [355, 435, 515, 595, 675, 755]);
  assert.ok(rows.every(r => r.x0 === 140 && r.x1 === 442));

  const REC = ["Yaulter 2000", "1 for 34,000 mesos", "1 for 34 000 mesos", "Red Viper", "1 for 14,067 mesos", "1 for 14 067 mesos",
    "Black lkknucklevest", "1 for 9,001 mesos", "1 for 9,001 mesos", "Cutlus", "1 for 9,001 mesos", "1 for 9,001 mesos",
    "Mithril Pale Arm", "1 for 15,067 mesos", "1 for 15 067 mesos", "Star Earrings", "1 for 4 067 mesos", "1 for 4 067 mesos"];
  let n = 0;
  const stub = async c => { assert.ok(c.w > 100 && c.h > 40 && c.d.length === c.w * c.h * 4); return REC[n++ % 18] };
  const list = await S.readShop(img, stub, {k: 2});   // the raw frame, UI doubled
  assert.strictEqual(n, 18);
  // the same picture the way the tracker holds it (readers.native: one pixel per game pixel) reads the same rows
  const nat = require("../app/readers.js").native(img);
  assert.deepStrictEqual((await S.readShop(nat, stub)).map(r => [r.name, r.price, r.sold, r.sure]), list.map(r => [r.name, r.price, r.sold, r.sure]));
  // prices as Danny's screenshot shows them; the greyed rows are the sold ones
  assert.deepStrictEqual(list.map(r => [r.price, r.sold, r.sure]), [[34000, true, true], [14067, false, true], [9001, true, true], [9001, false, true], [15067, false, true], [4067, true, true]]);
  // OCR slips in the names land on the right items
  const who = list.map(r => (S.matchName(r.name, NAMES).items[0] || {}).name);
  assert.deepStrictEqual(who, ["Vaulter 2000", "Red Viper", "Black Knucklevest", "Cutlus", "Mithril Pole Arm", "Star Earrings"]);

  // the two cuts disagreeing (one read 9,001 as 8,001 on this fixture) makes the row unsure, not wrong
  let m = 0;
  const bad = await S.readShop(img, async () => ["Cutlus", "1 for 8,001 mesos", "1 for 9,001 mesos"][m++ % 3], {k: 2});
  assert.ok(bad.every(r => !r.sure && r.price === 8001));

  // price parsing
  const P = S.parseOffer;
  assert.deepStrictEqual(P("1 for 14,067 mesos"), {qty: 1, price: 14067});
  assert.deepStrictEqual(P("100 for 5,000 mesos ||"), {qty: 100, price: 5000});
  assert.deepStrictEqual(P("1 f0r 1O,OOO rnesos"), null);   // too mangled: no guess
  assert.deepStrictEqual(P("1 for 34 000 mesos"), {qty: 1, price: 34000});
  assert.strictEqual(P("Please be aware that a 3% fee"), null);
  assert.strictEqual(P("1 for 0 mesos"), null);

  // name matching: slips, truncation, ambiguity
  const M = (t, names = NAMES) => S.matchName(t, names).items.map(i => i.name);
  assert.deepStrictEqual(M("Red Viper"), ["Red Viper"]);
  assert.deepStrictEqual(M("Cutlus |"), ["Cutlus"]);
  assert.deepStrictEqual(M("Xyzzy Quux"), []);
  assert.deepStrictEqual(M("Re"), []);   // too short to say anything
  const T = [["1", "Hat Accuracy Scroll: Inter"], ["2", "Hat Accuracy Scroll: Intermediate"], ["3", "Hat Defense Scroll 60%"], ["4", "Red Potion"], ["5", "Red Potion"]];
  assert.deepStrictEqual(M("Hat Accuracy Scr...", T), ["Hat Accuracy Scroll: Inter", "Hat Accuracy Scroll: Intermediate"]);   // cut name: prefix of both, kept as 2 candidates
  assert.deepStrictEqual(M("Hat Accuracy Scr", T), []);   // not cut (no dots): whole-name rule only
  assert.deepStrictEqual(M("Red...", T), []);   // under 8 letters left: no prefix match
  assert.deepStrictEqual(M("Red Potion", T), ["Red Potion"]);   // the same name twice in the game data: one answer
  assert.deepStrictEqual(M("Hat Accuracy Scroll: Intermediate", T), ["Hat Accuracy Scroll: Intermediate"]);   // whole-name 95+ beats the prefix rule
  assert.strictEqual(S.matchName("Hat Accuracy Scr...", T).truncated, true);

  // the shop window's title bar, "<owner IGN> : <shop title>" (0.3.30, Turbozo: shop uploads name the shop).
  // parseTitle on what the fixture's band shows ("swagmart : i like channel 4 fm 10", seen on own-shop.png)
  assert.deepStrictEqual(S.parseTitle("swagmart : i like channel 4 fm 10"), {seller: "swagmart", title: "i like channel 4 fm 10"});
  assert.deepStrictEqual(S.parseTitle("|| Turbow : scrolls cheap"), {seller: "Turbow", title: "scrolls cheap"});
  assert.deepStrictEqual(S.parseTitle("nice prices here"), {seller: null, title: "nice prices here"});   // no colon: the whole thing is the title
  assert.deepStrictEqual(S.parseTitle("my:way:too:many:colons"), {seller: null, title: "my:way:too:many:colons"});   // owner part not a name shape
  assert.deepStrictEqual(S.parseTitle("Ab : x"), {seller: null, title: "Ab : x"});   // under 4 letters: not a Classic name, all title text
  assert.deepStrictEqual(S.parseTitle("Buy: 30k each"), {seller: null, title: "Buy: 30k each"});   // "Buy:" is title text, not a seller
  assert.strictEqual(S.parseTitle("  || "), null);
  assert.strictEqual(S.parseTitle(""), null);
  // readTitle: the geometry lands on the title band (dark ink present) and the stubbed text parses. The band's expected
  // box on the fixture at 2x UI: x 100..632, y 65..93 (first row top 355, measured 2026-11-01)
  { let saw = null, ink = 0;
    const ti = await S.readTitle(img, async c => { saw = c; for (let i = 0; i < c.d.length; i += 4) if (c.d[i] < 120) ink++; return "swagmart : i like channel 4 fm 10" }, {k: 2});
    assert.deepStrictEqual(ti, {seller: "swagmart", title: "i like channel 4 fm 10"});
    assert.ok(saw.w === 532 * 2 + 24 && saw.h === 28 * 2 + 24, "title cut is the band, upscaled 2x, plus its margin, got " + saw.w + "x" + saw.h);
    assert.ok(ink > 200, "the title band holds dark text ink, got " + ink);
    // a native-size frame (readers.native, .k set) reads the same title
    ink = 0;
    const ti2 = await S.readTitle(nat, async () => "swagmart : i like channel 4 fm 10");
    assert.deepStrictEqual(ti2, ti, "native frame: same title"); }

  console.log("shop tests passed");
})().catch(e => { console.error(e); process.exit(1) });
