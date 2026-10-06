const D = __DATA__;
const $ = s => document.querySelector(s);
// level cap is 100 at launch (Nexon's Founder's Access notes, via meowdb). The EXP table we embed stops at 70; meowdb's EXP
// guide gives the rest: every level from 51 costs 5.48% more than the one before (historical reference; confirmed to 49).
const EXP_SURE = 49, MAX_LEVEL = 100;
for (let l = 71; l < MAX_LEVEL; l++) if (D.exp[l] == null) D.exp[l] = Math.trunc(D.exp[l - 1] * 1.0548);
const fmt = n => n == null ? "–" : Math.round(n).toLocaleString();
// map name with the minimap hover card (card itself is built in 20-quests.js)
const mapLink = (id, name) => `<span class="name mname" tabindex="0" data-map="${id}">${esc(name)}</span>`;
// NPC and monster names with their hover cards (cards in 20-quests.js)
const npcLink = name => D.npcid[name] ? `<span class="nname" tabindex="0" data-npc="${D.npcid[name]}">${esc(name)}</span>` : esc(name || "");
const MOBID = {};   // name -> id, preferring a monster that's at launch
for (const [id, m] of Object.entries(D.mobs)) if (!(m[0] in MOBID) || (D.latermobs.includes(MOBID[m[0]]) && !D.latermobs.includes(id))) MOBID[m[0]] = id;
const mobLink = idOrName => { const id = D.mobs[idOrName] ? String(idOrName) : MOBID[idOrName];
  return id ? `<span class="mobname" tabindex="0" data-mob="${id}">${esc(D.mobs[id][0])}</span>` : esc(idOrName) };
const mobList = names => names.split(", ").map(mobLink).join(", ");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* tabs */
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.setAttribute("aria-selected", x === b));
  ["plan","path","maps","quests","cit","craft"].forEach(id => $("#" + id).hidden = id !== b.dataset.tab);
  try { localStorage.setItem("tab", b.dataset.tab) } catch(e) {}
}));
try { const t = localStorage.getItem("tab"); if (t) document.querySelector(`[data-tab="${t}"]`)?.click() } catch(e) {}

