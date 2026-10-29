// node tests/chat.test.js — Chat windows (core/chatlines.js): colour classes, megaphone rows left out, scroll-proof new-line diff, parsing.
// Fixtures: Danny's chat screenshots 2026-10-29 (tests/frames-chat, see docs/ai/fixtures.md).
const assert = require("assert"), path = require("path"), C = require("../core/chatlines.js"), readPng = require("./cv_util.js");
const fx = n => readPng(path.join(__dirname, "frames-chat", n + ".png")), ALL = {x: 0, y: 0, w: 1, h: 1};
const kinds = (img, a = ALL) => C.scan(img, a).groups.map(g => g.mega ? "mega:" + g.mega : g.cls);
const rows = (img, y0, y1) => ({w: img.w, h: y1 - y0, d: img.d.slice(y0 * img.w * 4, y1 * img.w * 4)});   // a band of the picture
const blank = (w, h) => ({w, h, d: new Uint8ClampedArray(w * h * 4).map((_, i) => i % 4 === 3 ? 255 : 0)});
const stack = (...p) => { const w = p[0].w, h = p.reduce((a, q) => a + q.h, 0), o = new Uint8ClampedArray(w * h * 4); let y = 0; for (const q of p){ o.set(q.d, y * w * 4); y += q.h } return {w, h, d: o} };
(async () => {
  // every channel by its colour; each megaphone (gold, teal, pink, red crate alert, local blue) is left out whatever its text colour
  const mixed = fx("mixed");
  assert.deepStrictEqual(kinds(mixed), ["buddy", "mega:gold", "mega:teal", "buddy", "mega:pink", "buddy", "buddy", "mega:pink", "notice"]);
  assert.deepStrictEqual(kinds(fx("whisper")), ["mega:teal", "whisper", "buddy", "whisper", "whisper", "mega:pink", "whisper", "buddy", "mega:mega"]);   // last: the white chat input bar
  assert.deepStrictEqual(kinds(fx("party")), ["party", "party"]);
  assert.deepStrictEqual(kinds(fx("partysys")), ["partysys"]);   // "'nivisr' have left the party." is (255,175,175), not party pink
  assert.deepStrictEqual(kinds(fx("crate-red")), ["mega:red"]);   // white text on a red row: not all chat
  assert.deepStrictEqual(kinds(fx("local-blue")), []);
  assert.deepStrictEqual(kinds(fx("notice")), ["notice", "notice"]);
  // wrapped lines (indented, no stamp) belong to the message above: "Ghettomama<< hi i just need ... fon / t for my" is one whisper
  const w = C.scan(fx("whisper"), ALL).groups.filter(g => !g.mega);
  assert.deepStrictEqual(w.map(g => g.bands.length), [2, 1, 1, 1, 1, 1]);
  // scrolling keeps fingerprints: the same screen two lines higher has nothing new, and a new line at the bottom is exactly one
  const wi = fx("whisper"), a = C.scan(wi, ALL), first = C.newGroups(null, a.groups);
  assert.strictEqual(first.out.length, 0, "first look: nothing is new");
  assert.strictEqual(C.newGroups(first.now, C.scan(wi, ALL).groups).out.length, 0, "same frame: nothing new");
  const up = stack(rows(wi, 64, wi.h), blank(wi.w, 64));
  assert.strictEqual(C.newGroups(first.now, C.scan(up, ALL).groups).out.length, 0, "scrolled up two lines: nothing new");
  const half = stack(rows(wi, 0, 349), blank(wi.w, wi.h - 349)), before = C.newGroups(null, C.scan(half, ALL).groups).now;   // last line (the buddy one) not there yet
  const grown = C.newGroups(before, C.scan(wi, ALL).groups).out;
  assert.deepStrictEqual(grown.map(g => g.cls), ["buddy"], "one new line at the bottom");
  // the same text twice is two lines (a repeated "ok" must not vanish)
  const p = fx("party"), one = rows(p, 0, 39), two = stack(one, one), pOne = C.newGroups(null, C.scan(one, ALL).groups).now;
  assert.strictEqual(C.newGroups(pOne, C.scan(two, ALL).groups).out.length, 1, "repeat counts");
  // the OCR picture: only the channel colour is ink, enlarged when the game text is small, and small
  const g = C.scan(p, ALL), cr = C.cropFor(p, g.groups[0], g);
  assert.ok(cr.d.length === cr.w * cr.h * 4 && cr.w > 40);
  let ink = 0; for (let i = 0; i < cr.d.length; i += 4) if (cr.d[i] === 0) ink++;
  assert.ok(ink > 200 && ink < cr.w * cr.h * 0.5, "black text on white: " + ink);
  assert.ok(cr.w * cr.h * 4 < 600e3, "one line's crop stays small");
  // speed: a whole screen of chat in a few ms
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 10; i++) C.scan(mixed, ALL); const ms = Number(process.hrtime.bigint() - t0) / 1e7;
  assert.ok(ms < 40, "scan " + ms.toFixed(1) + " ms");
  // the reader's own entry point: first look learns, the next look hands back only the new line with its picture
  const R = require("../app/readers.js"); global.GrindChat = C;
  const rd = R.createReaders(require("../app/gamedata.json"), null), fr = img => ({...img, k: 1});
  assert.deepStrictEqual(rd.chatScan(fr(half), ALL).items, []);
  const out = rd.chatScan(fr(wi), ALL);
  assert.deepStrictEqual(out.items.map(i => i.cls), ["buddy"]); assert.ok(out.items[0].crop.d.byteLength > 0);
  assert.strictEqual(rd.chatScan(fr(wi), ALL).items.length, 0, "unchanged: nothing");
  // parsing OCR text as Tesseract really returns it (see the garbled stamps and the copyright sign for ":")
  assert.deepStrictEqual(C.parse("[18:49] Turbow : one moment", "party"), {who: "Turbow", text: "one moment"});
  assert.deepStrictEqual(C.parse("[Ta:42] Turbow \u00a9 sorry about that", "party"), {who: "Turbow", text: "sorry about that"});
  assert.deepStrictEqual(C.parse("[Ta:42] Unclelan() \u00a9 morgenavond maak Ik nieuwe char", "buddy"), {who: "Unclelan", text: "morgenavond maak Ik nieuwe char"});
  assert.deepStrictEqual(C.parse("[15:45] Ghettomama<< hi | Just need\nt for my", "whisper"), {who: "Ghettomama", dir: "from", text: "hi | Just need t for my"});
  assert.deepStrictEqual(C.parse("[18:48] Ghettomama[Windia-39]>> omg tracker tool!", "whisper"), {who: "Ghettomama", dir: "to", text: "omg tracker tool!"});
  assert.deepStrictEqual(C.parse("[Ta:49] 'nivisr have [eft the party.", "partysys"), {who: "", text: "'nivisr have [eft the party."});
  assert.deepStrictEqual(C.parse("garbled line with no stamp", "all"), {who: "", text: "garbled line with no stamp"});
  console.log("chat ok");
})().catch(e => { console.error(e); process.exit(1) });
