/* Inventory price check: screenshots of the item inventory (Equip / Use / Etc tabs) -> every item and count, priced with
   meso.watch player-shop sales (PW, 10-maps.js), NPC sell price as the fallback. The reading is the grind tracker's own
   (tracker/app/readers.js, inlined below at build time): the window is found by its red line and pink open tab, each slot's
   picture matched against the item icons, counts read with the game's count digits. */
/*@READERS*/
(() => {
const R = window.GrindReaders;
const TABOF = {Equipment: "equip", Consumable: "use", Scroll: "use", Etc: "etc"};
let CANDS = null;   // tab -> icon candidates (loaded on the first screenshot)
async function cands(){
  if (CANDS) return CANDS;
  const map = Object.fromEntries(Object.entries(D.iicons).filter(([id]) => TABOF[D.items[id]?.c]));
  CANDS = {};
  for (const ic of await R.loadIcons(null, map)){ const tb = TABOF[D.items[ic.id].c]; (CANDS[tb] = CANDS[tb] || []).push(ic) }
  return CANDS;
}
let READS = [], PICK = {};   // PICK: same-picture group (ids joined) -> the item the player picked   // [{name, tab, slots: [{i, ids, n}], unknown, mesos}]
const st = $("#ivst");
async function handle(files){
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  st.textContent = "Reading…"; st.className = "pill";
  const C = await cands(); let bad = 0;
  for (const f of imgs){
    const raw = await shotLoad(f), img = R.native(raw), inv = R.findInventory(img);
    if (!inv || !C[inv.tab]){ bad++; continue }
    const r = R.readInventory(img, inv, C[inv.tab]), mesos = R.readMesoTotal(img);
    const key = JSON.stringify([r.tab, r.slots, r.unknown]);
    if (READS.some(x => x.key === key)) continue;   // the same page pasted twice
    READS.push({name: f.name && f.name !== "image.png" ? f.name : "Pasted " + inv.tab, tab: r.tab, slots: r.slots, unknown: r.unknown, mesos, key});
  }
  st.textContent = bad ? `${bad} screenshot${bad > 1 ? "s" : ""} had no Equip, Use or Etc tab open` : "Read";
  st.className = "pill " + (bad ? "p-warn" : "p-good");
  render();
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
const TABNAME = {equip: "Equip", use: "Use", etc: "Etc"};
function render(){
  const list = $("#ivreads");
  list.innerHTML = READS.map((r, k) => `<span class="pill">${esc(TABNAME[r.tab])}: ${r.slots.length} slot${r.slots.length === 1 ? "" : "s"}${r.unknown ? `, ${r.unknown} not read` : ""}
    <button class="linkbtn" data-ivdel="${k}" title="Remove">✕</button></span>`).join(" ") + (READS.length ? ` <button id="ivclear">Clear all</button>` : "");
  const rows = {};   // item id -> {n, alt, tab}
  let unknown = 0, mesos = null;
  for (const r of READS){
    unknown += r.unknown; if (r.mesos != null) mesos = r.mesos;
    for (const s of r.slots){
      // one picture, several differently named items (scrolls): a choice, defaulting to the one players sell most
      const names = new Set(s.ids.map(i => D.items[i].n)), g = names.size > 1 ? s.ids.join(",") : "";
      const id = g ? PICK[g] || s.ids.reduce((a, b) => (PW[b]?.[3] || 0) > (PW[a]?.[3] || 0) ? b : a) : s.ids[0];
      const o = rows[id] || (rows[id] = {id, n: 0, g, tab: r.tab, noN: 0});
      if (s.n == null) o.noN++; else o.n += s.n;
    }
  }
  const all = Object.values(rows).map(o => Object.assign(o, advice(o.id), {npc: D.items[o.id].p || 0}));
  all.forEach(o => { o.qty = o.n || (o.noN ? 1 : 0); o.tot = o.each * o.qty });
  all.sort((a, b) => b.tot - a.tot || D.items[a.id].n.localeCompare(D.items[b.id].n));
  const fm = all.reduce((a, o) => a + o.tot, 0), npc = all.reduce((a, o) => a + o.npc * o.qty, 0);
  $("#ivsum").innerHTML = all.length ? `<p><b>${fmt(fm)} mesos</b> if you sell everything at these prices <span class="sub">(NPCs alone: ${fmt(npc)}${mesos != null ? ` · mesos in your inventory: ${fmt(mesos)}` : ""})</span>.${unknown ? ` <span class="pill p-warn">${unknown} slot${unknown > 1 ? "s" : ""} not read</span>` : ""}</p>` : "";
  $("#ivbody").innerHTML = all.map(o => { const it = D.items[o.id];
    return `<tr><td><span class="ri" tabindex="0" data-item="${o.id}" data-n="${o.qty}">${D.iicons[o.id] ? `<img src="data:image/png;base64,${D.iicons[o.id]}" alt="">` : "<i></i>"}</span>
      ${o.g ? `<select data-ivg="${o.g}" title="Several items share this picture: pick yours">${[...new Map(o.g.split(",").map(i => [D.items[i].n, i])).values()]
        .sort((a, b) => D.items[a].n.localeCompare(D.items[b].n)).map(i => `<option value="${i}"${i === o.id ? " selected" : ""}>${esc(D.items[i].n)}</option>`).join("")}</select>`
        : `<span class="itname" data-item="${o.id}" tabindex="0">${esc(it.n)}</span>`}</td>
      <td>${esc(TABNAME[o.tab])}</td><td class="num">${o.n ? fmt(o.n) : o.noN ? "?" : "–"}</td><td class="num">${o.npc ? fmt(o.npc) : "–"}</td>
      <td class="${o.cls}">${o.how}</td><td class="num">${o.tot ? fmt(o.tot) : "–"}</td></tr>` }).join("");
  $("#ivtbl").hidden = !all.length;
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
$("#ivbody").addEventListener("change", e => { const g = e.target.dataset.ivg; if (g){ PICK[g] = e.target.value; render() } });
$("#ivdate").textContent = D.pw.read;
})();
