/* Scroll check (Price check tab): the game window shared with the page (getDisplayMedia, nothing leaves the browser), read
   4 times a second. Scrolls of one tier share one picture (Lesser / Intermediate / Greater / Chaos, 52 each in the OSMS
   export), so the inventory grid alone can't tell them apart: the player rests the mouse on each one and its tooltip is
   read with the game's message font (readers.js readTextLines), then matched against that kind's names and descriptions
   (D.items n, d). Letters the font table doesn't have yet are learned from tooltips that matched anyway (saved per viewer).
   Each scanned slot feeds the Price check table as the live Use tab read (INVP.live in 54-invprice.js). */
const SCAN = (() => {
const R = window.GrindReaders;
// scroll id -> its tooltip text, spaces dropped (the font's spaces are a guess from glyph gaps)
const SCROLLS = Object.keys(D.items).filter(id => D.items[id].c === "Scroll");
const TEXT = Object.fromEntries(SCROLLS.map(id => [id, [D.items[id].n, ...(D.items[id].d || "").split("\n")].map(t => t.replace(/\s+/g, "")).filter(Boolean)]));
const lineRe = t => new RegExp("^" + [...t].map(c => c === "?" ? ".{1,2}" : "ilI1|".includes(c) ? "[ilI1|]" : c.replace(/[.*+^${}()|[\]\\]/g, "\\$&")).join("") + "$");
/* tooltip lines -> {id, score, name: the line that is the name, hits: the lines that matched} or null. A read line counts when 4+ of its letters were read
   and it fits one of a scroll's lines whole ("?" = 1-2 unread letters); the name counts double. One clear winner only. */
function match(lines, ids = SCROLLS){
  const reads = lines.map(l => ({l, t: l.text.replace(/ /g, "")})).filter(r => r.t.replace(/\?/g, "").length >= 4).map(r => ({...r, re: lineRe(r.t)}));
  if (!reads.length) return null;
  let best = null, tie = false;
  for (const id of ids){
    const T = TEXT[id], hits = []; let sc = 0, name = null;
    for (const r of reads){ const k = T.findIndex(c => r.re.test(c)); if (k < 0) continue; sc += k ? 1 : 2; if (!k) name = r.l; hits.push(r.l) }
    if (!sc) continue;
    if (!best || sc > best.score){ best = {id, score: sc, name, hits}; tie = false } else if (sc === best.score) tie = true;
  }
  return best && !tie && best.score >= 2 ? best : null;
}
// letters this viewer's tooltips taught the reader (the name line of a scroll that matched, letter for letter)
let LEARNT = []; try { LEARNT = JSON.parse(localStorage.getItem("scanglyphs") || "[]"); if (!Array.isArray(LEARNT)) LEARNT = [] } catch(e) {}
R.addGlyphs(LEARNT);
function learn(lines, m){
  const name = D.items[m.id].n.replace(/ /g, ""), top = m.name || lines[0];
  if (!top || top.chars.length !== name.length || !top.chars.every(c => c.length === 1) || !top.chars.includes("?")) return;
  if (top.chars.some((c, i) => c !== "?" && c !== name[i] && !("ilI1".includes(c) && "ilI1".includes(name[i])))) return;
  const add = R.addGlyphs(top.chars.map((c, i) => c === "?" ? {ch: name[i], w: top.glyphs[i].w, h: top.glyphs[i].h, bits: top.glyphs[i].bits} : null).filter(Boolean));
  if (!add.length) return;
  LEARNT = LEARNT.concat(add).slice(-400);
  try { localStorage.setItem("scanglyphs", JSON.stringify(LEARNT)) } catch(e) {}
}
// tooltip text: light, with the tooltip's dark fill right next to it (the inventory's beige is never this light)
const tipInk = (r, g, b) => Math.min(r, g, b) >= 228 && Math.max(r, g, b) - Math.min(r, g, b) <= 40;
const dark = (img, x, y) => { if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false; const i = (y * img.w + x) * 4; return Math.max(img.d[i], img.d[i + 1], img.d[i + 2]) < 110 };
// the tooltip's top corners: from the topmost read line, walk out through the dark fill just above the text
function corners(img, top){
  const y = Math.max(0, top.y - 2), run = (x, dx) => { let k = 0; while (k < 400 && (dark(img, x + dx, y) || dark(img, x + 2 * dx, y))) { x += dx; k++ } return x };
  const x0 = run(top.x, -1), x1 = run(top.x1, 1);
  let y0 = y; while (y0 > 0 && y - y0 < 120 && (dark(img, x0 + 4, y0 - 1) || dark(img, x0 + 4, y0 - 2))) y0--;
  return {x0, x1, y0};
}
/* which slot the mouse is on: the tooltip opens next to the pointer, so the slot nearest its top left corner (or top right,
   when it opened to the left near the screen edge) among the slots holding that scroll's picture */
function hovered(img, inv, slots, id, lines){   // lines: the tooltip's own (match().hits)
  const top = lines.reduce((a, l) => l.y < a.y ? l : a), c = corners(img, top);
  let best = null, bd = 70;
  for (const s of slots){
    if (!s.ids.includes(id)) continue;
    const sx = inv.x + 5 + 36 * (s.i % 5) + 16, sy = inv.y + 37 + 34 * Math.floor(s.i / 5) - 13;
    const dd = Math.min(Math.hypot(sx - c.x0, sy - c.y0), Math.hypot(sx - c.x1, sy - c.y0));
    if (dd < bd){ bd = dd; best = s }
  }
  return best;
}
// one frame -> {inv, read, lines, hit: {slot, id} | null}
function readFrame(img, C, cache, near){
  let inv = near && R.findInventory(img, {x0: near.x - 12, x1: near.x + 230, y0: near.y - 3, y1: near.y + 4}) || R.findInventory(img);
  if (!inv) return {inv: null};
  if (!inv.tab && near?.tab) inv = {...inv, tab: near.tab};   // the pointer on the open tab hides its colour
  if (inv.tab !== "use") return {inv};
  const read = R.readInventory(img, inv, C.use, cache), filled = INVP.filled(img, inv);
  const lines = R.readTextLines(img, {x0: inv.x - 320, x1: inv.x + 560, y0: inv.y - 40, y1: inv.y + 440}, tipInk)
    .filter(l => l.glyphs.some((g, k) => { const x = l.x + g.x - l.glyphs[0].x; return dark(img, x - 1, l.y + 3) || dark(img, x - 2, l.y + 3) }));
  const m = lines.length ? match(lines) : null;
  const slot = m && hovered(img, inv, read.slots, m.id, m.hits);
  if (m && slot) learn(lines, m);
  return {inv, read, filled, lines, m, hit: slot ? {slot, id: m.id} : null};
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
  S = {stream, video, canvas: document.createElement("canvas"), cache: new Map(), grid: [], counts: [], names: {}, last: null, inv: null, hov: null, lastKey: "", busy: false, seen: 0};
  stream.getVideoTracks()[0].addEventListener("ended", stop);
  $s("ssgo").hidden = true; $s("ssstop").hidden = false; $s("sslive").hidden = false;
  st.textContent = "Loading item pictures…"; st.className = "pill";
  S.C = await INVP.cands();
  if (!S) return;
  S.timer = setInterval(tick, 250); tick();
}
function stop(){
  if (!S) return;
  clearInterval(S.timer); S.stream.getTracks().forEach(t => t.stop());
  S = null;
  $s("ssgo").hidden = false; $s("ssstop").hidden = true;
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
  if (off === null && f.lines.length && S.grid.length) return;
  const o = off ?? S.grid.length;
  if (o < 0){ S.grid.unshift(...Array(-o).fill(null).map(() => ["", "", "", "", ""])); S.counts.unshift(...Array(-o * 5).fill(null)); const n = {}; for (const [k, v] of Object.entries(S.names)) n[+k - o * 5] = v; S.names = n }
  const base = Math.max(0, o);
  rows.forEach((row, k) => { const g = S.grid[base + k]; S.grid[base + k] = g ? row.map((v, c) => v === "?" ? g[c] : v) : row });
  for (const s of f.read.slots) S.counts[base * 5 + s.i] = s;
  // a slot whose item changed loses its scan
  for (const [k, v] of Object.entries(S.names)){ const t = S.grid[Math.floor(k / 5)]?.[k % 5]; if (t !== "?" && t !== v.tok) delete S.names[k] }
  // a tooltip on the same slot twice in a row counts (the first frame may catch the mouse moving)
  S.hov = null;
  if (f.hit){
    const at = base * 5 + f.hit.slot.i, key = at + ":" + f.hit.id;
    S.hov = at;
    if (S.last === key && S.names[at]?.id !== f.hit.id){ S.names[at] = {id: f.hit.id, tok: tok(f.hit.slot), t: ++S.seen} }
    S.last = key;
  } else S.last = null;
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
    const sc = s && s.ids.length > 1 && s.ids.some(id => D.items[id].c === "Scroll") && t !== "";
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
    if (!!c.name !== el.classList.contains("ok")) el.classList.toggle("ok", !!c.name);
    el.title = c.name ? D.items[c.name.id].n : c.sc ? "Rest the mouse on this scroll in the game" : c.s ? D.items[c.s.ids[0]].n : "";
  }
  // scanned list, newest first
  const list = $s("sslist"), have = new Set([...list.children].map(li => li.dataset.k));
  const items = done.slice().sort((a, b) => b.name.t - a.name.t);
  for (const c of items){ const k = c.i + ":" + c.name.id; if (have.has(k)) continue;
    const id = c.name.id, a = INVP.advice(id), li = document.createElement("li"); li.dataset.k = k;
    li.innerHTML = `<span class="ri" data-item="${id}"><img src="data:image/png;base64,${D.iicons[id] || ""}" alt=""></span><span class="itname" data-item="${id}" tabindex="0">${esc(D.items[id].n)}</span>${c.s?.n > 1 ? ` <span class="sub">×${c.s.n}</span>` : ""}<span class="ssp">${a.each ? fmt(a.each) + " each" : "no sales"}</span>`;
    list.prepend(li) }
  const keep = new Set(items.map(c => c.i + ":" + c.name.id)); [...list.children].forEach(li => { if (!keep.has(li.dataset.k)) li.remove() });
  // the table: the whole tab as one read, scanned slots named
  const slots = [], filled = [];
  cells.forEach(c => { if (!c.s) { if (S.grid[Math.floor(c.i / 5)][c.i % 5] === "?") filled.push(c.i); return } filled.push(c.i); slots.push({i: c.i, ids: c.s.ids, n: c.s.n, ...(c.name ? {id: c.name.id} : {})}) });
  const lk = JSON.stringify(slots);
  if (lk !== S.liveKey){ S.liveKey = lk; INVP.live({tab: "use", slots, filled, unknown: 0, mesos: null}) }
}
$s("ssgo").addEventListener("click", start);
$s("ssstop").addEventListener("click", stop);
if (!navigator.mediaDevices?.getDisplayMedia){ $s("ssgo").disabled = true; $s("ssst").textContent = "Needs a desktop browser"; }
return {match, readFrame, place, frameRows, start, stop, step, get S(){ return S }};
})();
