/* ---------------- keep or sell ---------------- */
(() => {
// every item a launch quest (incl. Citizenship) or a crafting recipe asks for: how many quests want, from which level, a
// verdict, what an NPC pays, and where another comes from (quest data's monster, meowdb player drop reports, crafting
// sources, shops, quest rewards, recipes that make it). "Have" counts are per viewer (localStorage keephave).
const ID = {}; for (const [id, it] of Object.entries(D.items)) if (!(it.n in ID)) ID[it.n] = id;
const K = new Map();
// items a quest hands you at its start ("Maria's Letter x1") aren't yours to keep or sell
const GIVEN = new Set([...D.quests, ...D.citq].flatMap(r => (r.info?.start || []).map(x => x.replace(/ x\d+$/, ""))));
const row = (name, id) => { const k = id || ID[name] || name; if (!K.has(k)) K.set(k, {k, id: id || ID[name], name: D.items[id || ID[name]]?.n || name, quests: [], recipes: new Set(), mobs: new Set()}); return K.get(k) };
for (const [src, list] of [["q", QLAUNCH.filter(r => r.region !== "Event")], ["cit", D.citq]]) for (const r of list) for (const [name, n, mob] of r.il || []){
  const o = row(name); o.quests.push([src, r, n]); if (mob) o.mobs.add(String(mob));
}
const MADE = {}; for (const r of D.craft.rec) (MADE[r[3]] = MADE[r[3]] || []).push(r);
for (const r of D.craft.rec) for (const [id] of r[7]) row(null, id).recipes.add(r);
for (const o of K.values()) for (const m of D.craft.src[o.id]?.mob || []) o.mobs.add(m);
const DISC = D.craft.disc.map(d => d[0]);
const REW = {}; for (const [src, list] of [["q", QLAUNCH], ["cit", D.citq]]) for (const r of list) for (const g of r.ri || []) for (const [id] of g.it) (REW[id] = REW[id] || []).push([src, r]);
const launchMob = m => D.mobs[m] && !D.latermobs.includes(m);
const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;
const qkey = ([src, r]) => src === "q" ? "q" + r.id : null;   // Path Planner done keys (citizenship quests aren't in the planner)
const tierOf = ([src, r]) => src === "q" ? VALUE[r.id]?.[0] || 9 : 9;

// sources that don't change: shop, crafted, monsters (quest data, crafting guess/guide, player reports), quest rewards
for (const o of K.values()){
  o.shop = D.craft.src[o.id]?.shop || (D.shopsell?.[o.id] ? [[D.shopsell[o.id][0], "", D.shopsell[o.id][1], D.shopsell[o.id][2]]] : []);
  o.made = MADE[o.id] || [];
  o.rep = Object.fromEntries((D.drops?.[o.id] || []).filter(([m]) => launchMob(m)));
  o.mobList = [...new Set([...o.mobs].filter(launchMob).concat(Object.keys(o.rep)))]
    .sort((a, b) => (o.rep[b] || 0) - (o.rep[a] || 0) || D.mobs[a][1] - D.mobs[b][1]);
  o.rew = REW[o.id] || [];
  o.none = !o.shop.length && !o.made.length && !o.mobList.length && !o.rew.length;
  o.discs = [...new Set([...o.recipes].map(r => DISC[r[0]]))];
  o.per = [...o.recipes].map(r => r[7].find(x => x[0] === o.id)[1]);
  o.price = D.items[o.id]?.p || 0;
}
const LIST = [...K.values()].filter(o => o.recipes.size || (o.price && !GIVEN.has(o.name)));
$("#kdisc").innerHTML += [...new Set(LIST.flatMap(o => o.discs))].sort().map(d => `<option>${esc(d)}</option>`).join("");

let S = {q: "", by: "", disc: "", sort: "", need: false, only: false, done: true};
try { Object.assign(S, JSON.parse(localStorage.getItem("keep") || "{}"), {q: ""}) } catch(e) {}
let HAVE = {}; try { HAVE = JSON.parse(localStorage.getItem("keephave") || "{}") || {} } catch(e) {}
const save = () => { try { localStorage.setItem("keep", JSON.stringify(S)); localStorage.setItem("keephave", JSON.stringify(HAVE)) } catch(e) {} };
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")) } catch(e) { return new Set() } };

// verdict: [label, pill class, priority (lower = show first)]
function judge(o, DONE){
  const open = o.quests.filter(x => !(S.done && DONE.has(qkey(x))));
  const n = open.filter(x => !x[1].rep).reduce((a, x) => a + x[2], 0), rep = open.filter(x => x[1].rep).reduce((a, x) => a + x[2], 0);
  const have = +HAVE[o.k] || 0, need = Math.max(0, n - have), top = Math.min(9, ...open.map(tierOf));
  const v = o.none && (n || rep || o.recipes.size) ? ["Keep all", "p-bad", 0, "nothing known drops or sells it"]
    : need ? [`Keep ${fmt(need)}`, "p-hot", top <= 2 ? 1 : 2, top <= 2 ? `a ${VTIER[top][0]} quest wants it` : ""]
    : rep ? ["Repeatable", "p-warn", 3, `weekly quests want ${fmt(rep)} each time`]
    : n ? ["Enough", "p-good", 5, "sell extras unless you craft"]
    : o.recipes.size ? ["If you craft", "p-warn", 4, o.discs.join(", ")]
    : ["Sell", "p-good", 6, open.length < o.quests.length ? "the quests that want it are done" : ""];
  return {open, n, rep, have, need, v};
}
function rowHtml(o, j){
  const {open, n, rep, have, v} = j;
  const mobs = o.mobList.slice(0, 4).map(m => `${mobLink(m)} <span class="sub">Lv ${D.mobs[m][1]}${o.rep[m] ? ` · ${o.rep[m]} player${o.rep[m] === 1 ? "" : "s"}` : ""}</span>`).join(", ");
  const where = [mobs ? `Drops from ${mobs}${o.mobList.length > 4 ? ` +${o.mobList.length - 4} more` : ""}` : "",
    o.shop.length ? `Shop: ${npcLink(o.shop[0][0])} (${fmt(o.shop[0][3])} mesos)` : "",
    o.rew.length ? `Quest reward: ${o.rew.slice(0, 2).map(qn).join(", ")}${o.rew.length > 2 ? ` +${o.rew.length - 2} more` : ""}` : "",
    o.made.length ? `Craft: ${[...new Set(o.made.map(r => `${DISC[r[0]]} Lv ${r[2]}`))].join(", ")}` : ""].filter(Boolean).join("<br>");
  const qs = open.slice().sort((a, b) => tierOf(a) - tierOf(b) || a[1].lvl - b[1].lvl);
  const qline = x => `${qn(x)} (Lv ${x[1].lvl || 1} · ×${fmt(x[2])}${x[1].rep ? " weekly" : ""})${tierOf(x) <= 3 ? ` <span class="pill ${VTIER[tierOf(x)][1]}">${VTIER[tierOf(x)][0]}</span>` : ""}`;
  const lo = Math.min(Infinity, ...open.map(x => x[1].lvl || 1)), lo2 = Math.min(Infinity, ...[...o.recipes].map(r => r[2]));
  const rng = a => Math.min(...a) === Math.max(...a) ? Math.min(...a) : `${Math.min(...a)}-${Math.max(...a)}`;
  return `<td><span class="ing">${o.id ? itemIcon(o.id, 1) : ""}<span><b>${esc(o.name)}</b>${D.items[o.id]?.s && D.items[o.id].s !== "Etc" ? `<div class="sub">${esc(D.items[o.id].s)}</div>` : ""}</span></span></td>
    <td><span class="pill ${v[1]}">${v[0]}</span>${v[3] ? `<div class="sub">${esc(v[3])}</div>` : ""}</td>
    <td class="num"><input class="khave" type="number" min="0" inputmode="numeric" value="${have || ""}" placeholder="0" aria-label="How many ${esc(o.name)} you have"><div class="sub">${n ? `quests want ${fmt(n)}` : ""}${rep ? `${n ? "<br>" : ""}+${fmt(rep)} weekly` : ""}</div></td>
    <td class="sub">${qs.slice(0, 3).map(qline).join("<br>")}${qs.length > 3 ? `<br>+${qs.length - 3} more quests` : ""}${o.quests.length > open.length ? `${qs.length ? "<br>" : ""}${o.quests.length - open.length} done` : ""}${o.recipes.size ? `${o.quests.length ? "<br>" : ""}${o.recipes.size} recipe${o.recipes.size === 1 ? "" : "s"} (${o.discs.map(esc).join(", ")}), ${rng(o.per)} per craft` : ""}</td>
    <td class="num">${lo < Infinity ? lo : lo2 < Infinity ? `<span class="sub">craft Lv ${lo2}</span>` : "–"}</td>
    <td class="num">${o.price ? fmt(o.price) : "–"}</td><td class="sub">${where || `<span class="na">no known source yet</span>`}</td>`;
}
let shown = [];
function render(){
  const q = S.q.trim().toLowerCase(), DONE = doneSet();
  shown = LIST.map(o => ({o, j: judge(o, DONE)})).filter(({o, j}) =>
    (!q || o.name.toLowerCase().includes(q)) && (!S.only || o.none) && (!S.need || j.need > 0 || j.v[2] === 0)
    && (S.by !== "q" || o.quests.length) && (S.by !== "c" || o.recipes.size) && (!S.disc || o.discs.includes(S.disc)))
    .sort((a, b) => S.sort === "name" ? a.o.name.localeCompare(b.o.name)
      : S.sort === "price" ? b.o.price - a.o.price || a.o.name.localeCompare(b.o.name)
      : S.sort === "lvl" ? Math.min(999, ...a.o.quests.map(x => x[1].lvl || 1)) - Math.min(999, ...b.o.quests.map(x => x[1].lvl || 1)) || a.o.name.localeCompare(b.o.name)
      : a.j.v[2] - b.j.v[2] || Math.min(999, ...a.j.open.map(x => x[1].lvl || 1)) - Math.min(999, ...b.j.open.map(x => x[1].lvl || 1)) || a.o.name.localeCompare(b.o.name));
  const keepN = shown.filter(x => x.j.v[2] <= 2).length;
  $("#kcount").textContent = `${shown.length} items · ${keepN} to keep`;
  $("#krows").innerHTML = shown.map(({o, j}, i) => `<tr data-i="${i}">${rowHtml(o, j)}</tr>`).join("") || `<tr><td colspan="7" class="empty">Nothing matches.</td></tr>`;
}
// typing a count updates that row in place (keeps focus); the list re-sorts on the next filter change
$("#krows").addEventListener("input", e => { if (!e.target.classList.contains("khave")) return;
  const tr = e.target.closest("tr"), x = shown[+tr.dataset.i], v = Math.max(0, Math.floor(+e.target.value || 0));
  if (v) HAVE[x.o.k] = v; else delete HAVE[x.o.k]; save();
  x.j = judge(x.o, doneSet());
  const cells = tr.children; const tmp = document.createElement("tr"); tmp.innerHTML = rowHtml(x.o, x.j);
  cells[1].innerHTML = tmp.children[1].innerHTML; cells[2].querySelector(".sub").innerHTML = tmp.children[2].querySelector(".sub").innerHTML;
});
const set = (k, v) => { S[k] = v; save(); render() };
$("#ksearch").addEventListener("input", e => set("q", e.target.value));
for (const [id, k] of [["#kby", "by"], ["#kdisc", "disc"], ["#ksort", "sort"]]){ $(id).value = S[k]; $(id).addEventListener("change", e => set(k, e.target.value)) }
for (const [id, k] of [["#kneed", "need"], ["#konly", "only"], ["#kdone", "done"]]){ $(id).setAttribute("aria-pressed", S[k]);
  $(id).addEventListener("click", e => { e.currentTarget.setAttribute("aria-pressed", !S[k]); set(k, !S[k]) }) }
// ticking quests done in the Path Planner changes what's still wanted: refresh when this tab opens
$("#t-keep").addEventListener("click", render);
render();
})();
