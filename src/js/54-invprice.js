/* Inventory price check: screenshots of the item inventory (Equip / Use / Etc tabs) -> every item and count, priced with
   meso.watch player-shop sales (PW, 10-maps.js), NPC sell price as the fallback. The reading is the grind tracker's own
   (tracker/app/readers.js, inlined below at build time): the window is found by its red line and pink open tab, each slot's
   picture matched against the item icons, counts read with the game's count digits. */
/*@READERS*/
(() => {
const R = window.GrindReaders;
const TABOF = {Equipment: "equip", Consumable: "use", Scroll: "use", Etc: "etc"};
// tab -> icon candidates. Decoding every icon takes ~5 s, so it starts in the background when the page opens (one shared
// promise, so a screenshot dropped meanwhile waits for the full set instead of matching against half of it)
let CANDS = null;
const cands = () => CANDS || (CANDS = (async () => {
  await ASSETS;   // Pages: the item icons arrive in a second file (00-core.js)
  const map = Object.fromEntries(Object.entries(D.iicons).filter(([id]) => TABOF[D.items[id]?.c])), out = {};
  for (const ic of await R.loadIcons(null, map)){ const tb = TABOF[D.items[ic.id].c]; (out[tb] = out[tb] || []).push(ic) }
  return out;
})());
const warm = () => setTimeout(() => (window.requestIdleCallback || setTimeout)(() => cands()), 400);
$("#t-inv").addEventListener("click", warm); if (!$("#inv").hidden) warm();
let READS = [], PICK = {};   // READS: [{name, tab, slots: [{i, ids, n}], filled: [slot numbers], mesos, key}]; PICK: same-picture group (ids joined) -> the item the player picked
let ALL = null;   // every item picture (the bank holds any kind of item)
const st = $("#ivst");
/* The bank (storage) window, Danny's screenshots 2026-10-18 (game pixels): the same red line as the inventory (3 rows, ~205 px)
   with one pink "All" tab over its left end and plain grey (208,209,210) where the inventory has its other tabs. Slots: 5
   columns 36 px apart, 6 rows 34 px apart, 3 px lower than the inventory's. When the bank is open, the inventory beside
   it is left out. */
function findBank(img){
  const {w, h, d} = img, px = (x, y) => (y * w + x) * 4;
  const red = (x, y) => { const i = px(x, y); return d[i] > 125 && d[i + 1] < 45 && d[i + 2] < 45 };
  const pinkish = (x, y) => { const i = px(x, y); return d[i] >= 200 && d[i] - d[i + 1] >= 60 && d[i + 2] >= 100 && d[i] - d[i + 2] >= 40 };
  const grey = (x, y) => { const i = px(x, y); return Math.abs(d[i] - 208) + Math.abs(d[i + 1] - 209) + Math.abs(d[i + 2] - 210) <= 12 };
  for (let y = 16; y < h - 3; y++) for (let x = 0; x + 191 < w; x++){
    if (!red(x, y) || x && red(x - 1, y) || red(x + 5, y - 1) || !red(x + 5, y + 1) || !red(x + 5, y + 2) || !red(x + 190, y)) continue;
    let tab = false; for (let yy = y - 12; yy < y - 3 && !tab; yy++) for (let xx = x + 6; xx < x + 28 && !tab; xx++) tab = pinkish(xx, yy);
    if (!tab) continue;
    let plain = true; for (let yy = y - 13; yy < y - 2 && plain; yy += 2) for (let xx = x + 40; xx < x + 160 && plain; xx += 3) plain = grey(xx, yy);
    if (plain) return {x, y: y + 3, tab: "bank", line: y};
  }
  return null;
}
// slots with something in them (the reader's own empty test), to tell an empty slot from one it couldn't match
function filled(img, inv){
  const {w, d} = img, out = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++){
    const sx = inv.x + 5 + 36 * c, cy = inv.y + 37 + 34 * r; if (cy + 4 >= img.h || sx + 32 >= w) continue;
    let off = 0;
    for (let y = cy - 28; y <= cy; y++) for (let x = sx + 1; x < sx + 31; x++){ const i = (y * w + x) * 4; if (Math.abs(d[i] - 225) + Math.abs(d[i + 1] - 223) + Math.abs(d[i + 2] - 213) > 40) off++ }
    if (off >= 30) out.push(r * 5 + c);
  }
  return out;
}
async function handle(files){
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  st.textContent = "Reading…"; st.className = "pill";
  const C = await cands(); let bad = 0, broken = 0;
  for (const f of imgs){
    // a file that won't decode (renamed, cut-off download) or is too small to hold a window: count it, keep going
    let img, bank, inv; try { img = R.native(await shotLoad(f)); bank = findBank(img); inv = bank || R.findInventory(img) } catch(e) { broken++; continue }
    if (!inv || !bank && !C[inv.tab]){ bad++; continue }
    if (bank && !ALL) ALL = Object.values(C).flat();
    const r = R.readInventory(img, inv, bank ? ALL : C[inv.tab]);
    // the bank shows no count on equips: 1 each
    if (bank) for (const s of r.slots) if (s.n == null && D.items[s.ids[0]].c === "Equipment") s.n = 1;
    const mesos = bank ? R.readMesoTotal(img, {x0: inv.x, x1: inv.x + 210, y0: inv.y + 205, y1: inv.y + 260}) : R.readMesoTotal(img);
    const key = JSON.stringify([r.tab, r.slots, r.unknown]);
    if (READS.some(x => x.key === key)) continue;   // the same page pasted twice
    READS.push({name: f.name && f.name !== "image.png" ? f.name : "Pasted " + inv.tab, tab: r.tab, slots: r.slots, unknown: r.unknown, filled: filled(img, inv), mesos, key});
  }
  st.textContent = [broken ? `${broken} file${broken > 1 ? "s" : ""} couldn't be opened as a picture` : "",
    bad ? `${bad} screenshot${bad > 1 ? "s" : ""} had no bank, or no Equip, Use or Etc tab open` : ""].filter(Boolean).join(" · ") || "Read";
  st.className = "pill " + (bad || broken ? "p-warn" : "p-good");
  render();
}
/* Screenshots of one tab scrolled to different places overlap: line them up by their rows and count each slot once.
   A row is its 5 slots (item + count, "" empty, "?" not matched); two reads overlap where every shared row agrees.
   Reads that share no row are taken as different pages, one after the other. Returns [{read, slots: [{i (in the whole tab), ...}]}] */
function lineUp(reads){
  const rows = r => { const by = Object.fromEntries(r.slots.map(s => [s.i, s.ids[0] + "x" + s.n])), out = [];
    const nr = Math.max(6, Math.ceil((Math.max(-1, ...r.slots.map(s => s.i), ...r.filled) + 1) / 5));   // the scroll check's live read holds the whole tab
    for (let k = 0; k < nr; k++) out.push([0, 1, 2, 3, 4].map(c => by[k * 5 + c] || (r.filled.includes(k * 5 + c) ? "?" : "")));
    while (out.length && out.at(-1).every(v => !v)) out.pop();
    return out };
  const same = (a, b) => a.every((v, c) => v === b[c] || v === "?" && b[c] || b[c] === "?" && v);
  const grid = [], placed = [], todo = reads.map(r => ({r, rows: rows(r)})).filter(x => x.rows.length);
  while (todo.length){
    let best = null;
    for (const t of todo) for (let off = -t.rows.length + 1; off < grid.length; off++){
      let hit = 0, ok = true;
      t.rows.forEach((row, k) => { const g = grid[off + k]; if (!g || !ok) return; if (!same(row, g)) ok = false; else if (row.some(v => v)) hit++ });
      if (ok && hit && (!best || hit > best.hit)) best = {t, off, hit};
    }
    if (!best) best = {t: todo[0], off: grid.length};   // no overlap: the next page
    const {t, off} = best;
    if (off < 0){ grid.unshift(...Array(-off).fill(null)); placed.forEach(p => p.off -= off) }
    const o = Math.max(0, off);
    t.rows.forEach((row, k) => { const g = grid[o + k]; grid[o + k] = g ? row.map((v, c) => v === "?" ? g[c] : v) : row });
    placed.push({t, off: o}); todo.splice(todo.indexOf(t), 1);
  }
  // each whole-tab slot once: the read that placed it first
  const seen = new Set(), out = [];
  let unknown = 0;
  for (const {t, off} of placed){
    const got = new Set(t.r.slots.map(s => s.i));
    for (const s of t.r.slots){ const i = off * 5 + s.i; if (!seen.has(i)){ seen.add(i); out.push({...s, i}) } }
    for (const i0 of t.r.filled) if (!got.has(i0)){ const i = off * 5 + i0; if (!seen.has(i)){ seen.add(i); unknown++ } }
  }
  return {slots: out, unknown};
}
// per item: what to ask for in a player shop, and why
function advice(id){
  const it = D.items[id], npc = it.p || 0, p = PW[id];
  if (!npc && (!p || !p[0])) return {each: 0, how: "Worth next to nothing.", cls: "na"};
  if (!p) return {each: npc, how: npc ? `No player sales seen. NPC pays ${fmt(npc)}.` : "No player sales seen, NPC buys it for nothing.", cls: "na"};
  const per = p[4] & 2 ? " per set" : "", low = p[4] & 1;
  if (npc >= p[0]) return {each: npc, how: `Sell to an NPC: it pays ${fmt(npc)}, players ~${fmt(p[0])}${per}.`, cls: ""};
  return {each: p[0], how: `List at ~<b>${fmt(p[0])}</b>${per} (half sold for ${fmt(p[1])}-${fmt(p[2])}).${low ? ` <span class="pill p-warn" title="Fewer than 5 sales seen: rough">few sales</span>` : ""}`, cls: ""};
}
const TABNAME = {equip: "Equip", use: "Use", etc: "Etc", bank: "Bank"};
// every item read, once ({id, n, g, tabs, noN}), slots not read and the meso totals; the Craft planner reads it too
function tally(){
  const rows = {};   // item id -> {n, g, tabs, noN}
  let unknown = 0, mesos = null, bankMesos = null;
  for (const r of READS) if (r.mesos != null){ if (r.tab === "bank") bankMesos = r.mesos; else mesos = r.mesos }
  for (const tab of ["equip", "use", "etc", "bank"]){
    const tr = READS.filter(r => r.tab === tab); if (!tr.length) continue;
    const lu = lineUp(tr); unknown += lu.unknown;
    for (const s of lu.slots){
      // one picture, several differently named items (scrolls): a choice, defaulting to the one players sell most
      // s.id: the scroll check read this slot's tooltip
      const names = new Set(s.ids.map(i => D.items[i].n)), g = !s.id && names.size > 1 ? s.ids.join(",") : "";
      const id = s.id || g ? s.id || PICK[g] || s.ids.reduce((a, b) => (PW[b]?.[3] || 0) > (PW[a]?.[3] || 0) ? b : a) : s.ids[0];
      const o = rows[id] || (rows[id] = {id, n: 0, g, tabs: new Set(), noN: 0});
      o.tabs.add(tab);
      if (s.n == null) o.noN++; else o.n += s.n;
    }
  }
  return {rows: Object.values(rows), unknown, mesos, bankMesos};
}
function render(){
  const list = $("#ivreads");
  list.innerHTML = READS.map((r, k) => `<span class="pill">${r.live ? "Scroll check" : esc(TABNAME[r.tab])}: ${r.slots.length} slot${r.slots.length === 1 ? "" : "s"}${r.unknown ? `, ${r.unknown} not read` : ""}
    <button class="linkbtn" data-ivdel="${k}" title="Remove">✕</button></span>`).join(" ") + (READS.length ? ` <button class="btn sm" id="ivclear">Clear all</button>` : "");
  const {rows, unknown, mesos, bankMesos} = tally();
  const all = rows.map(o => Object.assign(o, advice(o.id), {npc: D.items[o.id].p || 0}));
  all.forEach(o => { o.qty = o.n || (o.noN ? 1 : 0); o.tot = o.each * o.qty; o.ks = KEEPSELL?.(o.id, o.qty) || null });
  all.sort((a, b) => b.tot - a.tot || D.items[a.id].n.localeCompare(D.items[b.id].n));
  const fm = all.reduce((a, o) => a + o.tot, 0), npc = all.reduce((a, o) => a + o.npc * o.qty, 0);
  // Keep or sell rules on what you carry: "sell now" = the sell part of each row at the suggested price
  const sells = all.filter(o => o.ks?.sell > 0), sellNow = sells.reduce((a, o) => a + o.each * o.ks.sell, 0), keeps = all.filter(o => o.ks?.keep > 0).length;
  $("#ivsum").innerHTML = all.length ? `<p><b>${fmt(fm)} mesos</b> if you sell everything at these prices · ${invPeek(Object.fromEntries(all.filter(o => o.qty).map(o => [o.id, o.qty])))} <span class="sub">(NPCs alone: ${fmt(npc)}${mesos != null ? ` · mesos in your inventory: ${fmt(mesos)}` : ""}${bankMesos != null ? ` · in the bank: ${fmt(bankMesos)}` : ""})</span>.${unknown ? ` <span class="pill p-warn">${unknown} slot${unknown > 1 ? "s" : ""} not read</span>` : ""}</p>
    <p id="ivsell"><b>Sell now: ${fmt(sellNow)} mesos</b> for ${sells.length} item${sells.length === 1 ? "" : "s"} no open quest needs (<a href="#" id="ivkeep">Keep or sell</a> rules); keep ${keeps}. <span class="sub">Equips and potions nothing wants are your call. Counts come from the screenshots; quests ticked done in the Path Planner don't count.</span></p>` : "";
  $("#ivbody").innerHTML = all.map(o => { const it = D.items[o.id];
    return `<tr><td><span class="ri" tabindex="0" data-item="${o.id}" data-n="${o.qty}">${D.iicons[o.id] ? `<img src="data:image/png;base64,${D.iicons[o.id]}" alt="">` : "<i></i>"}</span>
      ${o.g ? `<select data-ivg="${o.g}" title="Several items share this picture: pick yours">${[...new Map(o.g.split(",").map(i => [D.items[i].n, i])).values()]
        .sort((a, b) => D.items[a].n.localeCompare(D.items[b].n)).map(i => `<option value="${i}"${i === o.id ? " selected" : ""}>${esc(D.items[i].n)}</option>`).join("")}</select>`
        : `<span class="itname" data-item="${o.id}" tabindex="0">${esc(it.n)}</span>`}</td>
      <td>${[...o.tabs].map(t => TABNAME[t]).join(", ")}</td><td class="num">${o.n ? fmt(o.n) : o.noN ? "?" : "–"}</td><td class="num">${o.npc ? fmt(o.npc) : "–"}</td>
      <td class="${o.cls}">${o.how}</td><td class="num">${o.tot ? fmt(o.tot) : "–"}</td>
      <td>${o.ks ? `<span class="pill ${o.ks.cls}">${esc(o.ks.v)}</span><div class="sub">${esc(o.ks.why)}</div>` : `<span class="sub">your call</span>`}</td></tr>` }).join("");
  $("#ivtbl").hidden = !all.length;
  document.dispatchEvent(new Event("invupdate"));   // the Craft planner (58-craftplan.js) uses the same screenshots
}
const drop = $("#ivdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files) });
$("#ivfile").addEventListener("change", e => { handle(e.target.files); e.target.value = "" });
document.addEventListener("paste", e => { if ($("#inv").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); handle(f) } });
$("#ivreads").addEventListener("click", e => {
  if (e.target.id === "ivclear") READS = [];
  else if (e.target.dataset.ivdel) READS.splice(+e.target.dataset.ivdel, 1);
  else return;
  render();
});
$("#ivsum").addEventListener("click", e => { if (e.target.id !== "ivkeep") return; e.preventDefault(); $("#t-keep").click() });
$("#ivbody").addEventListener("change", e => { const g = e.target.dataset.ivg; if (g){ PICK[g] = e.target.value; render() } });
$("#ivdate").textContent = D.pw.read;
// for the scroll check (57-scrollscan.js): the icon set, the empty-slot test, and its live Use tab read in the table
// counts(): item id -> how many (a slot with no count read is 1); handle(files): read screenshots dropped on another page
window.INVP = {cands, filled, advice, handle, reads: () => READS.length,
  counts: () => Object.fromEntries(tally().rows.map(o => [o.id, o.n || (o.noN ? 1 : 0)]).filter(x => x[1] > 0)),
  clear(){ READS = []; render() }, live(read){
  const k = READS.findIndex(r => r.live);
  if (!read){ if (k >= 0){ READS.splice(k, 1); render() } return }
  read.live = true; read.name = "Scroll check"; read.key = "live";
  if (k >= 0) READS[k] = read; else READS.push(read);
  render();
}};
})();
