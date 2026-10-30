/* ---------------- search everything (Ctrl K) + the share links for Where to train and the Quest Database ---------------- */
(() => {
// one box for monsters, items, maps, quests and skills. Every typed word must start a word of the name, in any order
// ("or mu cap" -> Orange Mushroom Cap); a plain substring of the name still counts, ranked lower. "@mob" etc. narrows
// the kinds; "@drop <item>" lists the monsters players reported dropping it (meowdb reports, as on the monster pages).
const norm = s => String(s).toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
const ROWS = [];
// low = ranked after everything else that matches as well (Setup items: the letter and number chairs, 'Red "A"', crowded out
// Red Snail / Red Potion for "red")
const add = (kind, key, name, sub, low = 0) => { const n = norm(name); ROWS.push({kind, key, name, sub, n, w: n.split(" "), low}) };
for (const [id, m] of Object.entries(D.mobdb)) add("mob", id, m.name, `Lv ${m.level}`);
const ICAT = {Equipment: "Equip", Consumable: "Use", Etc: "Etc", Setup: "Setup", Scroll: "Scroll"};
// 36 names belong to more than one item (Red Potion 2000000 and 2000007): those rows show the item ID to tell them apart
const NAMEN = {}; for (const it of Object.values(D.items)) NAMEN[it.n] = (NAMEN[it.n] || 0) + 1;
for (const [id, it] of Object.entries(D.items)) add("item", id, it.n, (it.c === "Equipment" ? (it.s === "Weapon" ? it.wt || "Weapon" : it.s) : ICAT[it.c] || it.c) + (NAMEN[it.n] > 1 ? ` · ID ${id}` : ""), +(it.c === "Setup"));
// maps: one row per name (several maps share one, e.g. Mushroom Town), preferring one with monsters
const MAPN = {}; for (const [id, m] of Object.entries(D.maps)) if (m[0] && (!(m[0] in MAPN) || (!D.maps[MAPN[m[0]]][2]?.length && m[2]?.length))) MAPN[m[0]] = id;
for (const [id, n] of Object.entries(D.mapnames)) if (!(n in MAPN)) MAPN[n] = id;
for (const [n, id] of Object.entries(MAPN)) add("map", id, n, D.maps[id]?.[2]?.length ? "Hunting map" : "Map");
QLAUNCH.forEach((r, i) => add("quest", i, r.name, `Lv ${r.lvl} · ${r.npc}`));
for (const [job, list] of Object.entries(D.skills)) for (const s of list) add("skill", job + "|" + s.id, s.n, job);
const DROPBY = {}; for (const [mid, m] of Object.entries(D.mobdb)) for (const [iid, , v] of m.dr || []) (DROPBY[iid] = DROPBY[iid] || []).push([mid, v]);
// @deal <name>: items where the cheapest live ask is below the cross-source median by >= 10% (mirrors 56-mci.js's
// deal = ask.v / mid). Surfaces the MCI's "X% under" deals in Ctrl+K, ranked by deal depth. Cached for 5 min so
// typing doesn't recompute listings for every item on each keystroke.
const DEAL_MIN = 0.9;
const DEAL_SRC = [
  id => { const p = PW[id]; return p?.[0] > 0 ? [p[0], p[3]] : null },          // meso.watch
  id => { const m = MI[id]; return m?.[0] > 0 && m[3] ? [m[0], m[3]] : null },     // mesoindex
  id => { const m = MA[id]; return m?.[0] > 0 && m[1] ? [m[0], m[1]] : null },     // mesoarbitrage
  id => { const k = CMP[id]; return k?.[0] > 0 ? [k[0], k[3]] : null },           // classicmarket
  id => { const m = MDB[id]; return m?.[0] > 0 ? [m[0], m[2]] : null },           // meowdb
];
let DEALS = null, DEALS_AT = 0;
function dealsIndex(){
  if (DEALS && Date.now() - DEALS_AT < 5 * 60000) return DEALS;
  DEALS = []; DEALS_AT = Date.now();
  // only items that have ANY live listing (meso.watch now, meowdb, mesoindex) — a much smaller
  // set than all D.items, and the only ones that can be a "deal"
  const ids = [...new Set([...Object.keys(PWNOW || {}), ...Object.keys(MDBL || {}), ...Object.keys(MILS || {})])];
  for (const id of ids) {
    const it = D.items[id]; if (!it || it.c === "Equipment") continue;   // equips: any roll, no "% under" (matches MCI)
    const vs = DEAL_SRC.map(f => f(id)).filter(Boolean).map(x => x[0]); if (vs.length < 2) continue;
    const mid = median(vs);
    const ask = listingsOf(id).filter(x => !x.buy && Date.now() / 6e4 - (x.t || Date.now() / 6e4) < 1440).sort((a, b) => a.v - b.v)[0];
    if (!ask) continue;
    const deal = ask.v / mid;
    if (deal >= DEAL_MIN) continue;
    DEALS.push({id, name: it.n, n: norm(it.n), deal, ask: ask.v, mid, ago: ask.ago, src: ask.src});
  }
  DEALS.sort((a, b) => a.deal - b.deal);
  return DEALS;
}
function findDeals(raw){
  const deals = dealsIndex(), q = norm(raw), toks = q ? q.split(" ") : [];
  const out = [];
  for (const d of deals) {
    if (q && !(d.n.includes(q) || toks.every(t => d.n.includes(t)))) continue;
    out.push({kind: "item", key: d.id, name: d.name,
      sub: `${Math.round((1 - d.deal) * 100)}% under usual · cheapest ${fmt(d.ask)} (median ${fmt(d.mid)})${d.ago ? " · " + d.ago : ""}`});
    if (out.length >= 40) break;
  }
  return out;
}
const KINDS = {mob: "mob", mobs: "mob", monster: "mob", monsters: "mob", item: "item", items: "item", map: "map", maps: "map",
  quest: "quest", quests: "quest", skill: "skill", skills: "skill", drop: "drop", drops: "drop", deal: "deal", deals: "deal", char: "char", ign: "char"};
const LABEL = {mob: ["Monster", "p-bad"], item: ["Item", "p-good"], map: ["Map", "p-warn"], quest: ["Quest", "p-hot"], skill: ["Skill", "p-hot"], char: ["Character", "p-good"]};

// 0 exact, 1 starts with the query, 2 words matched in order, 3 any order, 4 substring; null = no match
function score(r, q, toks){
  if (r.n === q) return 0;
  if (r.n.startsWith(q)) return 1;
  const used = new Set(); let inOrder = true, last = -1;
  for (const t of toks){ const j = r.w.findIndex((w, k) => !used.has(k) && w.startsWith(t)); if (j < 0){ inOrder = null; break }
    used.add(j); if (j < last) inOrder = false; last = j }
  if (inOrder !== null) return inOrder ? 2 : 3;
  return r.n.includes(q) ? 4 : null;
}
const ORDER = {mob: 0, item: 1, map: 2, quest: 3, skill: 4};
function find(raw){
  let q = raw.trim(), kind = null; const m = q.match(/^@(\w+)\s*/);
  if (m && KINDS[m[1].toLowerCase()]){ kind = KINDS[m[1].toLowerCase()]; q = q.slice(m[0].length) }
  if (kind === "char") return charRow(q.trim());
  if (kind === "deal") return findDeals(q.trim());
  q = norm(q); if (!q) return [];
  const toks = q.split(" "), hits = [];
  for (const r of ROWS){ if (kind && kind !== "drop" && r.kind !== kind) continue; if (kind === "drop" && (r.kind !== "item" || !DROPBY[r.key])) continue;
    const s = score(r, q, toks); if (s != null) hits.push([s, r]) }
  hits.sort((a, b) => a[1].low - b[1].low || a[0] - b[0] || ORDER[a[1].kind] - ORDER[b[1].kind] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  if (kind !== "drop") return hits.slice(0, 40).map(h => h[1]);
  // @drop: every monster reported dropping the best-matching items, confirmed reports first
  const out = [];
  for (const [, it] of hits.slice(0, 8)) for (const [mid, v] of DROPBY[it.key].slice().sort((a, b) => b[1] - a[1]))
    out.push({kind: "mob", key: mid, name: D.mobdb[mid].name, sub: `Lv ${D.mobdb[mid].level} · drops ${it.name}${v >= 1 ? "" : " (not confirmed yet)"}`, item: it.key});
  return out.slice(0, 60);
}

// @char <name>: one character from classicrank.com (59-crlookup.js), asked 300 ms after typing stops; Enter loads it into
// Where to train when that page is open, else the Character Builder
const CHAR = {}; let charT = 0;
function charRow(name){
  if (!name) return [{kind: "char", key: "", name: "Type a character name", sub: "Looks it up on classicrank.com"}];
  const k = name.toLowerCase(); let v = CHAR[k];
  if (v && !v.wait && Date.now() - v.t > 6e4) v = null;   // answers age out after a minute (busy / offline ones too)
  if (!v){ for (const x in CHAR) if (CHAR[x].wait) delete CHAR[x];   // a name typed past is never asked
    CHAR[k] = {wait: true}; clearTimeout(charT); charT = setTimeout(() => CRL.lookup(name).then(r => { CHAR[k] = {...r, t: Date.now()}; if (!box.hidden) draw() }), 300) }
  if (!v || v.wait) return [{kind: "char", key: "", name, sub: "Looking up on classicrank.com…"}];
  if (!v.c) return [{kind: "char", key: "", name, sub: v.note}];
  const c = v.c;
  return [{kind: "char", key: c.name, c, name: c.display, sub: `Lv ${c.level ?? "?"} ${c.job || ""}${c.rank ? " · Overall #" + fmt(c.rank) : ""}${c.jrank ? " · job #" + fmt(c.jrank) : ""} · Enter loads it into ${$("#maps").hidden ? "Character Builder" : "Where to train"}`}];
}
const box = $("#srch"), inp = $("#srchq"), list = $("#srchres");
let res = [], sel = 0;
const icon = r => r.kind === "char" ? (r.c?.photo ? `<img class="srchimg" src="${esc(r.c.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "") : r.kind === "item" ? itemIcon(r.key, 1, true) : r.kind === "mob" && D.mobimg[r.key] ? `<img class="srchimg" src="data:image/png;base64,${D.mobimg[r.key]}" alt="">` : "";
function draw(){
  res = find(inp.value); sel = Math.min(sel, Math.max(0, res.length - 1));
  list.innerHTML = res.length ? res.map((r, i) => `<li role="option" id="srch${i}" data-i="${i}" aria-selected="${i === sel}"><span class="pill ${LABEL[r.kind][1]}">${LABEL[r.kind][0]}</span>${icon(r)}<span class="srchtxt"><b>${esc(r.name)}</b><span class="sub">${esc(r.sub || "")}</span></span></li>`).join("")
    : inp.value.trim() ? `<li class="none">No match. Try fewer letters, or another word of the name.</li>` : "";
  inp.setAttribute("aria-activedescendant", res.length ? "srch" + sel : "");
}
const mark = () => { list.querySelectorAll("li[data-i]").forEach(li => li.setAttribute("aria-selected", +li.dataset.i === sel)); list.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({block: "nearest"}) };
// open things the way a click on their name anywhere on the page does (those listeners live in each tab's file)
const clickAs = (cls, attr, v) => { const el = document.createElement("span"); el.className = cls; el.dataset[attr] = v; el.hidden = true; document.body.append(el); el.click(); el.remove() };
function go(r){
  if (r.kind === "char" && !r.c) return;   // still looking up / not found: keep the box open
  close();
  if (r.kind === "mob") clickAs("mobname", "mob", r.key);
  else if (r.kind === "item") clickAs("itname", "item", r.key);
  else if (r.kind === "map") clickAs("mname", "map", r.key);
  else if (r.kind === "skill") openSkillPage(r.key);
  else if (r.kind === "quest") openQuest("q", r.key);
  else if (r.kind === "char" && r.c){ const w = $("#maps").hidden ? "plan" : "maps"; $("#t-" + w).click(); CRL.use(w, r.c) }
}
// closing without picking (Esc, Ctrl K, a click outside) puts focus back where it was, so keyboard users don't land on a hidden box
let back = null;
function open(){ back = document.activeElement; box.hidden = false; inp.select(); draw(); inp.focus() }
function close(refocus){ box.hidden = true; if (refocus === true){ const b = back?.isConnected && back.offsetParent ? back : $("#srchopen"); b.focus({preventScroll: true}) } }
$("#srchopen").addEventListener("click", open);
inp.addEventListener("input", () => { sel = 0; draw() });
inp.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); if (res.length){ sel = (sel + (e.key === "ArrowDown" ? 1 : res.length - 1)) % res.length; mark() } }
  else if (e.key === "Enter"){ e.preventDefault(); if (res[sel]) go(res[sel]) }
  else if (e.key === "Escape"){ e.preventDefault(); close(true) } });
list.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) go(res[+li.dataset.i]) });
box.addEventListener("click", e => { if (e.target === box) close(true) });
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k"){ e.preventDefault(); box.hidden ? open() : close(true); return }
  if (e.key === "/" && box.hidden && !e.ctrlKey && !e.metaKey && !e.target.closest?.("input, textarea, select, [contenteditable]")){ e.preventDefault(); open() }
  if (e.key === "Escape" && !box.hidden) close(true) });

// Quest Database: open with a search (also the #q share link); clears the questline view, the detail page and the level/toggle filters
function openQuests(o){
  $("#t-quests").click(); QCHAIN = null; QOPEN = null;
  $("#qsearch").value = o.s || ""; $("#qmin").value = o.lo ?? 0; $("#qmax").value = o.hi ?? 100;
  if (o.s) ["#qeq", "#qval"].forEach(b => $(b).setAttribute("aria-pressed", "false"));
  showQuests(); $("#quests").scrollIntoView({block: "start"});
}
$("#qshare").addEventListener("click", () => copyShare($("#qshare"), shareUrl("q", {s: $("#qsearch").value.trim(), lo: +$("#qmin").value || 0, hi: +$("#qmax").value || 100})));
if (HASH.q) openQuests(HASH.q);

// Where to train: every setting in the link (#t)
loadTrain();   // saved settings first (10-maps.js); a #t link overrides them
$("#tshare").addEventListener("click", () => copyShare($("#tshare"), shareUrl("t", Object.fromEntries(TRAIN.map(k => [k, $("#" + k).value]).filter(([, v]) => v !== "")))));
if (HASH.t){ ACC_FROM_BUILDER = AOE_FROM_BUILDER = DEF_FROM_BUILDER = COST_FROM_BUILDER = DPS_FROM_BUILDER = FORM_FROM_BUILDER = null;   // a link is someone else's character
  for (const k of TRAIN) if (HASH.t[k] != null && [...($("#" + k).options || [{value: HASH.t[k]}])].some(o => o.value === String(HASH.t[k]))) $("#" + k).value = HASH.t[k];
  rankMaps() }
// Where to train: nothing filled the table on load (it sat empty until a setting changed), so rank on first open
const firstRank = () => { if (!$("#maprows").children.length) rankMaps() };
$("#t-maps").addEventListener("click", firstRank); if (!$("#maps").hidden) firstRank();
})();
