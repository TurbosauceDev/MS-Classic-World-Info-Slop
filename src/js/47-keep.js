/* ---------------- keep or sell ---------------- */
(() => {
// every item a launch quest (incl. Citizenship) or a crafting recipe asks for: how many quests want, from which level, what an
// NPC pays, and where another comes from (quest data's monster, crafting sources, recipes that make it)
const ID = {}; for (const [id, it] of Object.entries(D.items)) if (!(it.n in ID)) ID[it.n] = id;
const K = new Map();
// items a quest hands you at its start ("Maria's Letter x1") aren't yours to keep or sell
const GIVEN = new Set([...D.quests, ...D.citq].flatMap(r => (r.info?.start || []).map(x => x.replace(/ x\d+$/, ""))));
const row = (name, id) => { const k = id || ID[name] || name; if (!K.has(k)) K.set(k, {id: id || ID[name], name: D.items[id || ID[name]]?.n || name, n: 0, rep: 0, quests: [], recipes: new Set(), lvl: 999, mobs: new Set()}); return K.get(k) };
for (const [src, list] of [["q", QLAUNCH.filter(r => !["Event"].includes(r.region))], ["cit", D.citq]]) for (const r of list) for (const [name, n, mob] of r.il || []){
  const o = row(name); o.quests.push([src, r, n]); if (r.rep) o.rep += n; else o.n += n; o.lvl = Math.min(o.lvl, r.lvl || 1); if (mob) o.mobs.add(String(mob));
}
const MADE = {}; for (const r of D.craft.rec) (MADE[r[3]] = MADE[r[3]] || []).push(r);
for (const r of D.craft.rec) for (const [id] of r[7]){ const o = row(null, id); o.recipes.add(r); o.lvl = Math.min(o.lvl, 10) }
for (const o of K.values()) for (const m of D.craft.src[o.id]?.mob || []) o.mobs.add(m);
const DISC = D.craft.disc.map(d => d[0]);
const REW = {}; for (const [src, list] of [["q", QLAUNCH], ["cit", D.citq]]) for (const r of list) for (const g of r.ri || []) for (const [id] of g.it) (REW[id] = REW[id] || []).push([src, r]);
const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;
const S = {q: "", only: false};
function render(){
  const q = S.q.trim().toLowerCase();
  const rows = [...K.values()].map(o => {
    const shop = D.craft.src[o.id]?.shop || (D.shopsell?.[o.id] ? [[D.shopsell[o.id][0], "", D.shopsell[o.id][1], D.shopsell[o.id][2]]] : []), made = MADE[o.id] || [], mobs = [...o.mobs].filter(m => D.mobs[m] && !D.latermobs.includes(m));
    const rew = REW[o.id] || [];
    return {...o, shop, made, mobs, rew, none: !shop.length && !made.length && !mobs.length && !rew.length};
  }).filter(o => (o.recipes.size || (D.items[o.id]?.p && !GIVEN.has(o.name))) && (!S.only || o.none) && (!q || o.name.toLowerCase().includes(q)))
    .sort((a, b) => b.none - a.none || a.lvl - b.lvl || a.name.localeCompare(b.name));
  $("#kcount").textContent = `${rows.length} items`;
  $("#krows").innerHTML = rows.map(o => {
    const discs = [...new Set([...o.recipes].map(r => DISC[r[0]]))];
    const get = o.mobs.slice(0, 4).map(m => mobLink(m)).join(", ");
    const where = [get ? `Drops from ${get}` : "", o.shop.length ? `Shop: ${esc(o.shop[0][0])} (${fmt(o.shop[0][3])} mesos)` : "",
      o.rew.length ? `Quest reward: ${o.rew.slice(0, 2).map(qn).join(", ")}${o.rew.length > 2 ? ` +${o.rew.length - 2} more` : ""}` : "",
      o.made.length ? `Craft: ${[...new Set(o.made.map(r => `${DISC[r[0]]} Lv ${r[2]}`))].join(", ")}` : ""].filter(Boolean).join("<br>");
    return `<tr><td><span class="ing">${o.id ? itemIcon(o.id, 1) : ""}<span><b>${esc(o.name)}</b>${o.none ? ` <span class="pill p-warn">no known source</span>` : ""}</span></span></td>
      <td class="num">${o.n ? fmt(o.n) : "–"}${o.rep ? `<div class="sub">+${fmt(o.rep)} repeatable</div>` : ""}</td>
      <td class="sub">${o.quests.slice(0, 3).map(x => `${qn(x)} (Lv ${x[1].lvl}, ${x[2]})`).join("<br>")}${o.quests.length > 3 ? `<br>+${o.quests.length - 3} more quests` : ""}${o.recipes.size ? `${o.quests.length ? "<br>" : ""}${o.recipes.size} recipe${o.recipes.size === 1 ? "" : "s"} (${discs.map(esc).join(", ")})` : ""}</td>
      <td class="num">${o.lvl < 999 && o.quests.length ? Math.min(...o.quests.map(x => x[1].lvl || 1)) : "craft"}</td>
      <td class="num">${o.id && D.items[o.id]?.p ? fmt(D.items[o.id].p) : "–"}</td><td class="sub">${where || `<span class="na">not in the game files</span>`}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">Nothing matches.</td></tr>`;
}
$("#ksearch").addEventListener("input", e => { S.q = e.target.value; render() });
$("#konly").addEventListener("click", e => { S.only = !S.only; e.target.setAttribute("aria-pressed", S.only); render() });
render();
})();
