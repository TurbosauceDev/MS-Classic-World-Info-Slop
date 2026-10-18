/* ---------------- search everything (Ctrl K) + the share links for Where to train and the Quest Database ---------------- */
(() => {
// one box for monsters, items, maps, quests and skills. Every typed word must start a word of the name, in any order
// ("or mu cap" -> Orange Mushroom Cap); a plain substring of the name still counts, ranked lower. "@mob" etc. narrows
// the kinds; "@drop <item>" lists the monsters players reported dropping it (meowdb reports, as on the monster pages).
const norm = s => String(s).toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
const ROWS = [];
const add = (kind, key, name, sub) => { const n = norm(name); ROWS.push({kind, key, name, sub, n, w: n.split(" ")}) };
for (const [id, m] of Object.entries(D.mobdb)) add("mob", id, m.name, `Lv ${m.level}`);
const ICAT = {Equipment: "Equip", Consumable: "Use", Etc: "Etc", Setup: "Setup", Scroll: "Scroll"};
for (const [id, it] of Object.entries(D.items)) add("item", id, it.n, it.c === "Equipment" ? (it.s === "Weapon" ? it.wt || "Weapon" : it.s) : ICAT[it.c] || it.c);
// maps: one row per name (several maps share one, e.g. Mushroom Town), preferring one with monsters
const MAPN = {}; for (const [id, m] of Object.entries(D.maps)) if (m[0] && (!(m[0] in MAPN) || (!D.maps[MAPN[m[0]]][2]?.length && m[2]?.length))) MAPN[m[0]] = id;
for (const [id, n] of Object.entries(D.mapnames)) if (!(n in MAPN)) MAPN[n] = id;
for (const [n, id] of Object.entries(MAPN)) add("map", id, n, D.maps[id]?.[2]?.length ? "Hunting map" : "Map");
QLAUNCH.forEach((r, i) => add("quest", i, r.name, `Lv ${r.lvl} · ${r.npc}`));
for (const [job, list] of Object.entries(D.skills)) for (const s of list) add("skill", job + "|" + s.id, s.n, job);
const DROPBY = {}; for (const [mid, m] of Object.entries(D.mobdb)) for (const [iid, , v] of m.dr || []) (DROPBY[iid] = DROPBY[iid] || []).push([mid, v]);
const KINDS = {mob: "mob", mobs: "mob", monster: "mob", monsters: "mob", item: "item", items: "item", map: "map", maps: "map",
  quest: "quest", quests: "quest", skill: "skill", skills: "skill", drop: "drop", drops: "drop"};
const LABEL = {mob: ["Monster", "p-bad"], item: ["Item", "p-good"], map: ["Map", "p-warn"], quest: ["Quest", "p-hot"], skill: ["Skill", "p-hot"]};

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
  q = norm(q); if (!q) return [];
  const toks = q.split(" "), hits = [];
  for (const r of ROWS){ if (kind && kind !== "drop" && r.kind !== kind) continue; if (kind === "drop" && (r.kind !== "item" || !DROPBY[r.key])) continue;
    const s = score(r, q, toks); if (s != null) hits.push([s, r]) }
  hits.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || ORDER[a[1].kind] - ORDER[b[1].kind] || a[1].name.localeCompare(b[1].name));
  if (kind !== "drop") return hits.slice(0, 40).map(h => h[1]);
  // @drop: every monster reported dropping the best-matching items, confirmed reports first
  const out = [];
  for (const [, it] of hits.slice(0, 8)) for (const [mid, v] of DROPBY[it.key].slice().sort((a, b) => b[1] - a[1]))
    out.push({kind: "mob", key: mid, name: D.mobdb[mid].name, sub: `Lv ${D.mobdb[mid].level} · drops ${it.name}${v >= 1 ? "" : " (not confirmed yet)"}`, item: it.key});
  return out.slice(0, 60);
}

const box = $("#srch"), inp = $("#srchq"), list = $("#srchres");
let res = [], sel = 0;
const icon = r => r.kind === "item" ? itemIcon(r.key, 1, true) : r.kind === "mob" && D.mobimg[r.key] ? `<img class="srchimg" src="data:image/png;base64,${D.mobimg[r.key]}" alt="">` : "";
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
  close();
  if (r.kind === "mob") clickAs("mobname", "mob", r.key);
  else if (r.kind === "item") clickAs("itname", "item", r.key);
  else if (r.kind === "map") clickAs("mname", "map", r.key);
  else if (r.kind === "skill") openSkillPage(r.key);
  else if (r.kind === "quest") openQuests({s: QLAUNCH[r.key].name});
}
function open(){ box.hidden = false; inp.select(); draw(); inp.focus() }
function close(){ box.hidden = true }
$("#srchopen").addEventListener("click", open);
inp.addEventListener("input", () => { sel = 0; draw() });
inp.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); if (res.length){ sel = (sel + (e.key === "ArrowDown" ? 1 : res.length - 1)) % res.length; mark() } }
  else if (e.key === "Enter"){ e.preventDefault(); if (res[sel]) go(res[sel]) }
  else if (e.key === "Escape"){ e.preventDefault(); close() } });
list.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) go(res[+li.dataset.i]) });
box.addEventListener("click", e => { if (e.target === box) close() });
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k"){ e.preventDefault(); box.hidden ? open() : close(); return }
  if (e.key === "/" && box.hidden && !e.ctrlKey && !e.metaKey && !e.target.closest?.("input, textarea, select, [contenteditable]")){ e.preventDefault(); open() }
  if (e.key === "Escape" && !box.hidden) close() });

// Quest Database: open with a search (also the #q share link); clears the questline view and the level/toggle filters
function openQuests(o){
  $("#t-quests").click(); QCHAIN = null;
  $("#qsearch").value = o.s || ""; $("#qmin").value = o.lo ?? 0; $("#qmax").value = o.hi ?? 100;
  if (o.s) ["#qeq", "#qval"].forEach(b => $(b).setAttribute("aria-pressed", "false"));
  renderQuests(); $("#quests").scrollIntoView({block: "start"});
}
$("#qshare").addEventListener("click", () => copyShare($("#qshare"), shareUrl("q", {s: $("#qsearch").value.trim(), lo: +$("#qmin").value || 0, hi: +$("#qmax").value || 100})));
if (HASH.q) openQuests(HASH.q);

// Where to train: every setting in the link (#t)
const TRAIN = ["cls", "lvl", "party", "tmode", "aoe", "hitsh", "lootr", "lootp", "atk", "umag", "uint", "uacc", "uavo", "uhp", "uwdef"];
$("#tshare").addEventListener("click", () => copyShare($("#tshare"), shareUrl("t", Object.fromEntries(TRAIN.map(k => [k, $("#" + k).value]).filter(([, v]) => v !== "")))));
if (HASH.t){ for (const k of TRAIN) if (HASH.t[k] != null && [...($("#" + k).options || [{value: HASH.t[k]}])].some(o => o.value === String(HASH.t[k]))) $("#" + k).value = HASH.t[k];
  rankMaps() }
})();
