/* Scroll check (Price check tab): the game window shared with the page (getDisplayMedia, nothing leaves the browser), read
   4 times a second. Scrolls of one tier share one picture (Lesser / Intermediate / Greater / Chaos, 52 each in the OSMS
   export), so the inventory grid alone can't tell them apart: the player rests the mouse on each one and its tooltip is
   read, then matched against the scrolls' names and descriptions (D.items n, d). Letters not in the tables yet are learned
   from tooltips that matched anyway (saved per viewer). Each scanned slot feeds the Price check table as the live Use tab
   read (INVP.live in 54-invprice.js).
   The tooltip (Danny's frames 2026-10-20, tests/fixtures/tip-*.png): translucent navy box, a light blue bullet (85,204,255)
   before the name, the name in a smooth bold font (white, soft edges), the scroll's picture in a light box under it, and the
   description to its right in the game's chat font (readers.js MSG_FONT), wrapped onto 2-3 lines. */
const SCAN = (() => {
const R = window.GrindReaders;
const SCROLLS = Object.keys(D.items).filter(id => D.items[id].c === "Scroll");
// scroll id -> [name, description], spaces dropped (spaces read from glyph gaps are a guess; wrapped lines join up)
const TEXT = Object.fromEntries(SCROLLS.map(id => [id, [D.items[id].n, D.items[id].d || ""].map(t => t.replace(/\s+/g, ""))]));
// the name font, copied from Danny's frames (w,h,ink levels 0-2 per pixel; a letter's soft edge shifts a little with its
// place on screen, so a letter may have several copies), and the chat font's letters the tracker's table lacked
const NAMEFONT = {"H":["8,10,22000022220000222200002222000022222222222222222222000022220000222200002222000022"],"a":["6,8,012210122221000022000122020022120022122212012102","7,8,01221001222210000022000112200210220220022012222200121021","6,8,012210122221000022001122021022220022122212012102"],"t":["5,10,00100022002222222222022000220002200022000122000121"],"A":["9,10,000222000000222000001212100002202200002101200002000210012222210022222220020000021120000021"],"c":["6,8,002210022220120021220000220000120022022221002200","6,8,001200022220120021220000220000120021022220001200","6,8,002210022220120021220000220000120022022221001210","6,8,002210022220120021220000220000120022022221002210"],"u":["7,8,22000222200022220002222000222200022220002212222220121022"],"r":["5,8,2202122221221002200022000220002200022000","5,8,2201122220220002200022000220002200022000"],"y":["7,11,12000210200020021012002101200120210002120000222000022200001210000120000211000"],"S":["7,10,0012200022222022000221200000022220000122200000022120002202222210012100","7,10,0012100022222022000211200000022220000122200000022120002202222200012100"],"o":["7,8,00121000222220120002122000222200022120002102222200012100"],"l":["2,10,22222222222222222222"],":":["2,8,2222000000002222"],"L":["7,10,2200000220000022000002200000220000022000002200000220000022222222222222"],"e":["7,8,00121000222220120002122222212222222120000002222210012100","7,8,00121000222220120002122222222222222120000002222210012210","7,8,00121000222220120002022222212222222120000002222210012100"],"s":["6,8,012210122221220000022100001121000022122221012210","6,8,012210122221220000022100001121000022122221002200"],"E":["7,10,2222222222222222000002200000222222222222222200000220000022222222222222"],"i":["2,10,22002222222222222222"],"n":["7,8,22012102222221220002222000222200022220002222000222200022","7,8,22012102222221221002222000222200022220002222000222200022"],"g":["7,11,00110220222122120002222000222200022120002202221220011022220002102222200022100"],"T":["8,10,22222222222222220002200000022000000220000002200000022000000220000002200000022000"],"R":["8,10,22222200222222202200002222000021222222202222210022001200220002202200002122000012"],"I":["2,10,22222222222222222222"],"m":["10,8,22011002102222212221220022002222002200222200220022220022002222002200222200220022"],"d":["7,10,0000022000002200110220222222120002222000222200022120002202222220011022"]};
const DESCMORE = {"0":"5,9,011101000110001100011000110001100011000101110","1":"3,9,001011101001001001001001001","2":"5,9,011101000100001000010001000010001000100011111","6":"5,9,011101000110000101101100110001100011000101110","I":"1,9,111111111","m":"9,7,101100110110011001100010001100010001100010001100010001100010001","p":"5,9,101101100110001100011000111001101101000010000","r":"3,7,101110100100100100100","o":"5,7,01110100011000110001100011000101110","v":"5,7,10001100010101001010010100010000100","e":"5,7,01110100011000111111100001000101110","s":"5,7,01110100011000001110000011000101110","A":"7,9,000100000101000010100001010001000100111110010001010000011000001","c":"4,7,0110100110001000100010010110","u":"5,7,10001100011000110001100011000101111","a":"5,7,01110100010000101111100011001101101","y":"5,9,100011000101010010100101000100001000010001000","n":"5,7,10110110011000110001100011000110001","h":"5,9,100001000010110110011000110001100011000110001","t":"3,9,010010111010010010010010011",".":"1,1,1","S":"6,9,011110100001100001100000011110000001100001100001011110",":":"1,7,1000001","%":"9,9,011000100100101000100101000100110000011010110000011001000101001000101001001000110",",":"1,3,111","+":"5,5,0010000100111110010000100","g":"5,9,011011001110001100011000110011011010000111110","i":"1,9,101111111","T":"7,9,111111100010000001000000100000010000001000000100000010000001000","R":"7,9,111111010000011000001100000111111101000100100001010000101000001"};
const glyph = (ch, s, lv) => { const [w, h, bits] = s.split(","); return {ch, w: +w, h: +h, bits: lv ? bits : bits.replace(/1/g, "2")} };
let LEARNT = []; try { LEARNT = JSON.parse(localStorage.getItem("scanglyphs2") || "[]"); if (!Array.isArray(LEARNT)) LEARNT = [] } catch(e) {}
LEARNT = LEARNT.filter(g => g && typeof g.ch === "string" && g.ch.length === 1 && /^[012]+$/.test(g.bits || "") && g.bits.length === g.w * g.h);
const FONT = [...Object.entries(NAMEFONT).flatMap(([ch, v]) => v.map(s => glyph(ch, s, true))),
  ...Object.entries(DESCMORE).map(([ch, s]) => glyph(ch, s, false)),
  ...R.msgGlyphs().filter(g => g.ch.length === 1).map(g => ({...g, bits: g.bits.replace(/1/g, "2")})), ...LEARNT];
const esc1 = c => "ilI1|".includes(c) ? "[ilI1|]" : c.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
/* read lines -> regex source; "?" = an unread glyph: 1-3 letters (touching letters read as one: tt, At). strict: a glyph no
   wider than one wide letter (bold name font 10 px for m, chat font 9 for m and %) is one letter, used to break ties
   ("?o?" fits Bow and Gloves). Without glyphs (a plain text line) "?" is always 1-3. Spaces are dropped (gaps make them). */
const linePat = (lines, strict) => lines.map(l => l.glyphs ? l.chars.map((c, k) => c !== "?" ? [...c].map(esc1).join("")
    : strict && l.glyphs[k].w <= (/1/.test(l.glyphs[k].bits) ? 10 : 9) ? "." : ".{1,3}").join("")
  : [...l.text.replace(/ /g, "")].map(c => c === "?" ? ".{1,3}" : esc1(c)).join("")).join("");
const known = lines => lines.reduce((a, l) => a + (l.chars ? l.chars.filter(c => c !== "?").length : l.text.replace(/[?\s]/g, "").length), 0);
/* {name: line, desc: [lines]} -> {id, score} or null. The name counts 2 when it fits a scroll's name whole, the description
   1 when the lines joined fit its start (the last line may run past the frame); a tie goes to the one that also fits with
   the strict widths. Clear winner only: a description alone names most scrolls. */
function match(tip, ids = SCROLLS){
  const nl = tip.name ? [tip.name] : [], kn = known(nl) >= 4, kd = known(tip.desc) >= 8;
  if (!kn && !kd) return null;
  const re = strict => [kn && new RegExp("^" + linePat(nl, strict) + "$"), kd && new RegExp("^" + linePat(tip.desc, strict))];
  const [nre, dre] = re(false), [nst, dst] = re(true);
  let best = null, tie = false;
  for (const id of ids){
    const [N, Dd] = TEXT[id], sc = (nre && nre.test(N) ? 2 : 0) + (dre && dre.test(Dd) ? 1 : 0);
    if (!sc) continue;
    const st = (nst && nst.test(N) ? 2 : 0) + (dst && dst.test(Dd) ? 1 : 0);
    if (!best || sc > best.score || sc === best.score && st > best.st){ best = {id, score: sc, st}; tie = false }
    else if (sc === best.score && st === best.st) tie = true;
  }
  return best && !tie ? best : null;
}
// unread letters of a matched tooltip, letter for letter where the line's glyphs and the text line up one to one
function learn(tip, m){
  const add = [], take = (chars, glyphs, text) => {
    if (chars.length !== text.length || !chars.every(c => c.length === 1)) return;
    if (chars.some((c, i) => c !== "?" && c !== text[i] && !("ilI1".includes(c) && "ilI1".includes(text[i])))) return;
    chars.forEach((c, i) => { if (c === "?") add.push({ch: text[i], w: glyphs[i].w, h: glyphs[i].h, bits: glyphs[i].bits}) }) };
  const [N, Dd] = TEXT[m.id];
  if (tip.name) take(tip.name.chars, tip.name.glyphs, N);
  take(tip.desc.flatMap(l => l.chars), tip.desc.flatMap(l => l.glyphs), Dd.slice(0, tip.desc.reduce((a, l) => a + l.chars.length, 0)));
  const fresh = add.filter(g => !FONT.some(f => f.w === g.w && f.h === g.h && f.bits === g.bits));
  if (!fresh.length) return;
  FONT.push(...fresh); LEARNT = LEARNT.concat(fresh).slice(-400);
  try { localStorage.setItem("scanglyphs2", JSON.stringify(LEARNT)) } catch(e) {}
}
// ink levels: 2 = the letters' white, 1 = their soft edge (the navy fill and the world behind it stay darker)
const LV = (r, g, b) => { const v = Math.min(r, g, b); return v >= 200 ? 2 : v >= 130 ? 1 : 0 };
// tooltip bullets: light blue dots, 2-8 px across, in the box around the inventory (other light blue things too: the caller
// keeps the one with a name beside it)
function bullet(img, box){
  const {w, d} = img, X0 = Math.max(0, box.x0), X1 = Math.min(w - 1, box.x1), Y0 = Math.max(0, box.y0), Y1 = Math.min(img.h - 1, box.y1);
  const out = [], is = (x, y) => { const i = (y * w + x) * 4; return Math.abs(d[i] - 85) < 35 && Math.abs(d[i + 1] - 204) < 35 && d[i + 2] > 220 };
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++){
    if (!is(x, y)) continue;
    let x1 = x; while (x1 < X1 && is(x1 + 1, y)) x1++;
    let y1 = y; while (y1 < Y1 && is(x, y1 + 1)) y1++;
    const bw = x1 - x + 1;
    if (bw >= 2 && bw <= 8 && y1 - y <= 8){ const cx = x + (bw >> 1); let yy = y; while (yy < Y1 && is(cx, yy + 1)) yy++;
      if (!out.some(o => Math.abs(o.x - cx) < 10 && Math.abs(o.y - y) < 10)) out.push({x: cx, y: Math.round((y + yy) / 2)});
      if (out.length >= 12) return out }
    x = x1;
  }
  return out;
}
// a tooltip at bullet b: the name line through it, the description lines right of the picture box under it
function readTip(img, b){
  const lines = R.readTextLines(img, {x0: b.x + 2, x1: b.x + 470, y0: b.y - 12, y1: b.y + 110}, LV, {font: FONT, minH: 5, maxH: 15, space: 3});
  const name = lines.find(l => l.y <= b.y + 2 && l.y + 12 >= b.y && l.x <= b.x + 12);
  if (!name) return null;
  const desc = [];
  for (const l of lines.filter(l => l.y > name.y + 10 && l.x >= name.x + 30 && l.x <= name.x + 110).sort((a, c) => a.y - c.y)){
    if (desc.length && (l.y - desc.at(-1).y > 24 || Math.abs(l.x - desc[0].x) > 3)) break;
    if (!desc.length && l.y - name.y > 40) break;
    desc.push(l);
  }
  return {name, desc};
}
/* which slot the mouse is on. The tooltip box starts 10 px left of its bullet, and the pointer's tip sits 6 px left of the box:
   x = bullet - 16 in both of Danny's frames with the glove in view. Normally the box opens under the pointer (tip 43 px above
   the bullet: hover-blunt-greater); near the bottom of the screen it is pushed up and the pointer ends up 38 px below the
   bullet (tip-1h-sword-attack-intermediate): pushed up when its text ends near the bottom of the screen (img.h), else the
   pushed-up point is only a fallback. The slot under the point that holds this scroll's picture.
   slots: [{i (0-29 on screen), ids}], from the whole tab seen so far: the tooltip itself often covers the slot under the pointer */
function hovered(inv, slots, id, b, tip = null, h = Infinity){
  const px = b.x - 16, at = (x, y, any) => slots.find(s => { if (!(any ? s.unk : s.ids.includes(id))) return false;
    const sx = inv.x + 5 + 36 * (s.i % 5), top = inv.y + 37 + 34 * Math.floor(s.i / 5) - 30;
    return x >= sx - 2 && x < sx + 34 && y >= top - 2 && y < top + 34 });
  const low = tip ? Math.max(tip.name.y, ...tip.desc.map(l => l.y)) + 30 >= h : false;
  const [p, q] = low ? [b.y + 38, b.y - 43] : [b.y - 43, b.y + 38];
  // a slot the glove or tooltip has covered since the start has no picture yet: the one under the mouse is taken
  return at(px, p) || at(px, q) || at(px, p, 1) || null;
}
// a tooltip anywhere in a frame -> {b, tip, m} (also run on the fixtures)
function tooltip(img, box = {x0: 0, x1: img.w, y0: 0, y1: img.h}){
  let b = null, tip = null;
  for (const c of bullet(img, box)){ const t = readTip(img, c); if (t && (!tip || known([t.name]) > known([tip.name]))){ b = c; tip = t } }
  if (!tip) return null;
  const m = match(tip);
  if (m) learn(tip, m);
  return {b, tip, m};
}
// one frame -> {inv, read, filled, tip}
function readFrame(img, C, cache, near){
  let inv = near && R.findInventory(img, {x0: near.x - 12, x1: near.x + 230, y0: near.y - 3, y1: near.y + 4}) || R.findInventory(img);
  // a tooltip over the top row's scrolls covers the window's red line: the window is still where it was
  if (!inv && near?.tab === "use"){ const t = tooltip(img, {x0: near.x - 40, x1: near.x + 260, y0: near.y - 30, y1: near.y + 260}); if (t?.m) inv = near }
  if (!inv) return {inv: null};
  if (!inv.tab && near?.tab) inv = {...inv, tab: near.tab};   // the pointer on the open tab hides its colour
  if (inv.tab !== "use") return {inv};
  const read = R.readInventory(img, inv, C.use, cache), filled = INVP.filled(img, inv);
  return {inv, read, filled, h: img.h, tip: tooltip(img, {x0: inv.x - 40, x1: inv.x + 260, y0: inv.y - 30, y1: inv.y + 260})};
}

/* ---- the whole Use tab across scrolling: rows of 5 tokens ("id x n", "" empty, "?" filled but covered or not matched),
   a new frame placed where every shared row agrees (the tooltip covers slots, so "?" fits anything) ---- */
const tok = s => s.ids[0] + "x" + s.n;
function frameRows(read, filled){
  const by = Object.fromEntries(read.slots.map(s => [s.i, tok(s)])), out = [];
  for (let r = 0; r < 6; r++) out.push([0, 1, 2, 3, 4].map(c => by[r * 5 + c] || (filled.includes(r * 5 + c) ? "?" : "")));
  return out;
}
const fits = (a, b) => a.every((v, c) => v === b[c] || v === "?" || b[c] === "?");
function place(grid, rows){
  if (!grid.length) return 0;
  let best = null;
  for (let off = -5; off < grid.length; off++){
    let hit = 0, ok = true;
    rows.forEach((row, k) => { const g = grid[off + k]; if (!ok || !g) return; if (!fits(row, g)) ok = false; else hit += row.filter(v => v && v !== "?").length });
    if (ok && hit && (!best || hit > best.hit)) best = {off, hit};
  }
  return best ? best.off : null;
}

/* ---- the live session ---- */
let S = null;
const $s = id => document.getElementById(id);
async function start(){
  const st = $s("ssst");
  if (!navigator.mediaDevices?.getDisplayMedia){ st.textContent = "Needs a desktop browser (Chrome, Edge, Firefox)"; st.className = "pill p-warn"; return }
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 10}, audio: false}) }
  catch(e){ st.textContent = e.name === "NotAllowedError" ? "Sharing cancelled" : "This page can't share your screen here: open the site in your browser"; st.className = "pill p-warn"; return }
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream;
  try { await video.play() } catch(e) {}
  S = {stream, video, canvas: document.createElement("canvas"), cache: new Map(), grid: [], counts: [], names: {}, last: null, inv: null, hov: null, lastKey: "", busy: false, seen: 0, unread: 0};
  stream.getVideoTracks()[0].addEventListener("ended", stop);
  $s("ssgo").hidden = true; $s("ssstop").hidden = false; $s("ssreset").hidden = false; $s("sslive").hidden = false;
  st.textContent = "Loading item pictures…"; st.className = "pill";
  S.C = await INVP.cands();
  if (!S) return;
  S.timer = setInterval(tick, 250); tick();
}
function stop(){
  if (!S) return;
  clearInterval(S.timer); S.stream.getTracks().forEach(t => t.stop());
  S = null;
  $s("ssgo").hidden = false; $s("ssstop").hidden = true; $s("ssreset").hidden = true; $s("sshint").className = "sshint";
  $s("ssst").textContent = "Stopped: scanned scrolls stay in the table below"; $s("ssst").className = "pill";
  steps(null);
}
function grab(){
  const v = S.video, c = S.canvas; if (!v.videoWidth) return null;
  if (c.width !== v.videoWidth || c.height !== v.videoHeight){ c.width = v.videoWidth; c.height = v.videoHeight }
  const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(v, 0, 0);
  return {w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data};
}
function tick(){
  if (!S || S.busy) return;
  S.busy = true;
  try { const raw = grab(); if (raw) step(R.native(raw, true)) } finally { if (S) S.busy = false }
}
// one native frame into the session (also called by tests with a picture)
function step(img){
  const f = readFrame(img, S.C, S.cache, S.inv);
  if (!f.inv){ S.miss = (S.miss || 0) + 1; if (S.miss > 3) steps("tab", "Open your inventory"); return }
  S.miss = 0; S.inv = f.inv;
  if (f.inv.tab !== "use"){ steps("tab", "Switch your inventory to the Use tab"); return }
  const rows = frameRows(f.read, f.filled), off = place(S.grid, rows);
  // nothing known on screen (all covered), or no overlap while a tooltip covers part of it: wait for a better frame.
  // No overlap on a clean frame: another page of the tab, below the ones seen
  if (!rows.some(r => r.some(v => v && v !== "?"))) return;
  if (off === null && f.tip?.b && S.grid.length) return;
  const o = off ?? S.grid.length;
  if (o < 0){ S.grid.unshift(...Array(-o).fill(null).map(() => ["", "", "", "", ""])); S.counts.unshift(...Array(-o * 5).fill(null)); const n = {}; for (const [k, v] of Object.entries(S.names)) n[+k - o * 5] = v; S.names = n }
  const base = Math.max(0, o);
  rows.forEach((row, k) => { const g = S.grid[base + k]; S.grid[base + k] = g ? row.map((v, c) => v === "?" ? g[c] : v) : row });
  for (const s of f.read.slots) S.counts[base * 5 + s.i] = s;
  // a slot whose item changed loses its scan
  for (const [k, v] of Object.entries(S.names)){ const t = S.grid[Math.floor(k / 5)]?.[k % 5]; if (t === "?" || t === v.tok) continue;
    // a guessed slot, seen clean at last: kept when it shows that scroll
    if (v.tok === null && S.counts[k]?.ids.includes(v.id)) v.tok = t; else delete S.names[k] }
  // a tooltip on the same slot twice in a row counts (the first frame may catch the mouse moving)
  S.hov = null;
  const m = f.tip?.m, slot = m && hovered(f.inv, [...Array(30).keys()].map(i => ({i, ids: S.counts[base * 5 + i]?.ids || [], unk: !S.counts[base * 5 + i] && S.grid[base + Math.floor(i / 5)]?.[i % 5] === "?"})), m.id, f.tip.b, f.tip.tip, f.h);
  if (slot){
    const at = base * 5 + slot.i, key = at + ":" + m.id;
    S.hov = at;
    if (slot.unk) S.counts[at] = {i: slot.i, ids: [m.id], n: 1, guess: 1};
    if (S.last === key && S.names[at]?.id !== m.id){ S.names[at] = {id: m.id, tok: S.counts[at].guess ? null : tok(S.counts[at]), t: ++S.seen} }
    S.last = key;
  } else S.last = null;
  // what the tooltip under the mouse says, live; one that stays unread for a second gets a hint
  const hint = $s("sshint");
  if (m){ S.unread = 0; hint.textContent = slot ? "Reading: " + D.items[m.id].n : D.items[m.id].n + ": move onto the scroll's slot"; hint.className = "sshint on" }
  else if (f.tip?.tip){ if (++S.unread >= 4){ hint.textContent = "Can't read this tooltip yet: pick that scroll in the table below"; hint.className = "sshint warn" } }
  else { S.unread = 0; hint.className = "sshint" }
  draw();
}

/* ---- view: the tab drawn as a grid, scroll slots waiting (dashed) or scanned (green tick), the hovered one lit ---- */
function steps(at, msg){
  const order = ["share", "tab", "hover"], k = at ? order.indexOf(at) : -1;
  document.querySelectorAll("#sssteps li").forEach((li, i) => { li.className = k < 0 ? "" : i < k ? "done" : i === k ? "now" : "" });
  if (msg){ $s("ssst").textContent = msg; $s("ssst").className = "pill" }
}
function draw(){
  const cells = [];
  S.grid.forEach((row, r) => row.forEach((t, c) => { const i = r * 5 + c, s = S.counts[i];
    const sc = s && (s.guess || s.ids.length > 1) && s.ids.some(id => D.items[id].c === "Scroll") && t !== "";
    cells.push({i, s: t === "" ? null : s, sc, name: S.names[i]}) }));
  const todo = cells.filter(c => c.sc), done = todo.filter(c => c.name);
  steps(todo.length && done.length === todo.length ? null : "hover");
  const st = $s("ssst");
  if (!todo.length){ st.textContent = "No scrolls on this page of the Use tab"; st.className = "pill" }
  else if (done.length === todo.length){ st.textContent = `All ${todo.length} scroll${todo.length > 1 ? "s" : ""} scanned`; st.className = "pill p-good" }
  else { st.textContent = `Rest the mouse on each scroll · ${done.length} of ${todo.length}`; st.className = "pill" }
  $s("sscount").textContent = `${done.length} of ${todo.length}`;
  $s("ssbar").style.width = (todo.length ? 100 * done.length / todo.length : 0) + "%";
  const grid = $s("ssgrid"), key = cells.map(c => c.s ? tok(c.s) : "").join("|");
  if (key !== S.lastKey){
    S.lastKey = key;
    grid.innerHTML = cells.map(c => `<div class="sscell${c.s ? "" : " empty"}" data-i="${c.i}">${c.s ? `<img src="data:image/png;base64,${D.iicons[c.s.ids[0]] || ""}" alt="">${c.s.n > 1 ? `<span class="ssn">${c.s.n}</span>` : ""}<span class="ssok" aria-hidden="true">✓</span>` : ""}</div>`).join("");
  }
  for (const c of cells){
    const el = grid.children[c.i]; if (!el) continue;
    el.classList.toggle("sc", !!c.sc); el.classList.toggle("dim", !!c.s && !c.sc);
    el.classList.toggle("hov", S.hov === c.i);
    // the hovered slot kept in view inside the grid (never scrolls the page)
    if (S.hov === c.i && S.shown !== c.i){ S.shown = c.i; const t = el.offsetTop, pad = 9;
      if (t < grid.scrollTop + pad || t + 40 > grid.scrollTop + grid.clientHeight - pad) grid.scrollTop = t - (grid.clientHeight - 40) / 2 }
    if (!!c.name !== el.classList.contains("ok")) el.classList.toggle("ok", !!c.name);
    el.title = c.name ? D.items[c.name.id].n : c.sc ? "Rest the mouse on this scroll in the game" : c.s ? D.items[c.s.ids[0]].n : "";
  }
  // scanned list, one row per scroll (slots of the same scroll added up), newest first
  const list = $s("sslist"), by = new Map();
  for (const c of done.slice().sort((a, b) => b.name.t - a.name.t)){ const o = by.get(c.name.id) || {id: c.name.id, n: 0}; o.n += c.s?.n || 1; by.set(c.name.id, o) }
  const items = [...by.values()];
  items.forEach((o, k) => {
    let li = list.querySelector(`li[data-k="${o.id}"]`);
    if (!li){ const a = INVP.advice(o.id); li = document.createElement("li"); li.dataset.k = o.id;
      li.innerHTML = `<span class="ri" data-item="${o.id}"><img src="data:image/png;base64,${D.iicons[o.id] || ""}" alt=""></span><span class="itname" data-item="${o.id}" tabindex="0">${esc(D.items[o.id].n)}</span> <span class="sub ssx"></span><span class="ssp">${a.each ? fmt(a.each) + " each" : "no sales"}</span>` }
    li.querySelector(".ssx").textContent = o.n > 1 ? "×" + fmt(o.n) : "";
    if (list.children[k] !== li) list.insertBefore(li, list.children[k] || null);
  });
  const keep = new Set(items.map(o => o.id)); [...list.children].forEach(li => { if (!keep.has(li.dataset.k)) li.remove() });
  const worth = items.reduce((a, o) => a + INVP.advice(o.id).each * o.n, 0);
  $s("sssum").innerHTML = done.length ? `<b>${done.length} scanned</b> · worth ~${fmt(worth)} mesos at usual prices` : "Scanned scrolls show up here.";
  // the table: the tab's scrolls only (other items are priced by the picture check), scanned slots named
  const slots = [], filled = [];
  cells.forEach(c => { if (!c.sc) return; filled.push(c.i); slots.push({i: c.i, ids: c.s.ids, n: c.s.n, ...(c.name ? {id: c.name.id} : {})}) });
  const lk = JSON.stringify(slots);
  if (lk !== S.liveKey){ S.liveKey = lk; INVP.live({tab: "use", slots, filled, unknown: 0, mesos: null}) }
}
$s("ssgo").addEventListener("click", start);
$s("ssstop").addEventListener("click", stop);
$s("ssreset").addEventListener("click", () => { if (!S) return; S.names = {}; S.grid = []; S.counts = []; S.lastKey = ""; $s("sslist").innerHTML = ""; draw() });
if (!navigator.mediaDevices?.getDisplayMedia){ $s("ssgo").disabled = true; $s("ssst").textContent = "Needs a desktop browser"; }
return {FONT, hovered, match, tooltip, readTip, readFrame, place, frameRows, start, stop, step, get S(){ return S }};
})();
